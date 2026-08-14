#!/usr/bin/env python3
import copy
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def load(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def get_path(root, path):
    value = root
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def set_path(root, path, value):
    parts = path.split(".")
    target = root
    for part in parts[:-1]:
        target = target[part]
    target[parts[-1]] = value


def evaluate(condition, context):
    if "all" in condition:
        return all(evaluate(item, context) for item in condition["all"])
    if "any" in condition:
        return any(evaluate(item, context) for item in condition["any"])
    actual = get_path(context, condition["path"])
    expected = condition.get("value")
    return {
        "eq": actual == expected,
        "ne": actual != expected,
        "lt": actual is not None and actual < expected,
        "lte": actual is not None and actual <= expected,
        "gt": actual is not None and actual > expected,
        "gte": actual is not None and actual >= expected,
    }[condition["op"]]


def clamp_state(state):
    for meter in state["visible"]:
        state["visible"][meter] = max(0, min(10, state["visible"][meter]))
    for debt in state["hidden"]["debt"]:
        state["hidden"]["debt"][debt] = max(0, min(2, state["hidden"]["debt"][debt]))


def apply_movement(state, movement):
    for meter, delta in movement.items():
        state["visible"][meter] += delta


def apply_operation(state, operation, context):
    if operation["op"] == "set":
        set_path(state, operation["path"], operation["value"])
    elif operation["op"] == "add":
        current = get_path(state, operation["path"])
        set_path(state, operation["path"], current + operation["value"])
    elif operation["op"] == "add_if" and evaluate(operation["condition"], context):
        current = get_path(state, operation["path"])
        set_path(state, operation["path"], current + operation["value"])
    clamp_state(state)


def initial_state(config):
    model = config["state_model"]
    return {
        "visible": {name: data["start"] for name, data in model["visible"].items()},
        "hidden": {
            "debt": {name: data["start"] for name, data in model["hidden"]["debt"].items()},
            "state": copy.deepcopy(model["hidden"]["state"]),
            "flags": copy.deepcopy(model["hidden"]["flags"]),
        },
        "hesitation_events": 0,
    }


def apply_zero_states(config, state):
    for meter, rule in config["zero_states"].items():
        flag = rule["flag"]
        if state["visible"][meter] == 0 and not state["hidden"]["flags"][flag]:
            state["hidden"]["flags"][flag] = True


def run_step(config, state, step):
    call = next(item for item in config["calls"] if item["call_id"] == step["call_id"])
    for operation in call.get("on_enter", []):
        apply_operation(state, operation, {"pre": state, "post": state, "inputs": step.get("inputs", {})})

    pre = copy.deepcopy(state)
    option = next(item for item in call["options"] if item["option_key"] == step["option"])
    inputs = step.get("inputs", {})

    apply_movement(state, option["movement"])
    if step.get("hesitation", False):
        apply_movement(state, config["hesitation"]["movement"])
        state["hesitation_events"] += 1

    for operation in option["operations"]:
        context = {"pre": pre, "post": state, "inputs": inputs}
        apply_operation(state, operation, context)

    event = config["global_events"]["repeated_exposure"]
    context = {"pre": pre, "post": state, "inputs": inputs}
    if evaluate(event["condition"], context):
        apply_movement(state, event["movement"])
        state["hidden"]["flags"].update(event["set_flags"])

    clamp_state(state)
    apply_zero_states(config, state)


def run_monday(config, state):
    eligible = []
    for candidate in config["monday_after"]["candidates"]:
        if evaluate(candidate["condition"], state):
            eligible.append(candidate)
    eligible.sort(key=lambda item: item["priority"])
    selected = eligible[: config["monday_after"]["candidate_limit"]]
    for candidate in selected:
        apply_movement(state, candidate["movement"])
    clamp_state(state)
    apply_zero_states(config, state)
    return [item["candidate_id"] for item in selected]


def assert_subset(actual, expected, path="root"):
    for key, value in expected.items():
        current_path = f"{path}.{key}"
        if key not in actual:
            raise AssertionError(f"Missing {current_path}")
        if isinstance(value, dict):
            assert_subset(actual[key], value, current_path)
        elif actual[key] != value:
            raise AssertionError(f"{current_path}: expected {value!r}, got {actual[key]!r}")


def structural_checks(config, tokens, tests, schema):
    assert config["package"]["scenario_version"] == tests["version"]
    assert config["package"]["deterministic"] is True
    assert [call["call_id"] for call in config["calls"]] == ["C1", "C2", "C3", "C4"]
    for call in config["calls"]:
        assert len(call["options"]) == 4
        assert len({item["option_key"] for item in call["options"]}) == 4
    assert config["monday_after"]["candidate_limit"] == 2
    assert [item["priority"] for item in config["monday_after"]["candidates"]] == [1, 2, 3, 4, 5, 6]
    assert tokens["theme"] == "judgment-chamber"
    assert tokens["color"]["signal_cyan"] == "#00C8F8"
    assert tokens["color"]["consequence_ember"] == "#E56A3D"
    assert tokens["balance"]["controlled_dark_surfaces_percent"] >= 70
    assert len(tests["rules_fixtures"]) == 5
    assert len(tests["experience_fixtures"]) == 8
    assert schema["properties"]["calls"]["minItems"] == 4


def main():
    config = load("trusted-path.v2.json")
    tokens = load("cyber-ronin.tokens.json")
    tests = load("trusted-path.tests.json")
    schema = load("trusted-path.schema.json")
    structural_checks(config, tokens, tests, schema)

    passed = []
    for fixture in tests["rules_fixtures"]:
        state = initial_state(config)
        for step in fixture["steps"]:
            run_step(config, state, step)
        result_view = {
            "visible": state["visible"],
            "debt": state["hidden"]["debt"],
            "flags": state["hidden"]["flags"],
            "hesitation_events": state["hesitation_events"],
        }
        assert_subset(result_view, fixture["expected_after_call4"], fixture["test_id"] + ".after_call4")
        selected = run_monday(config, state)
        if selected != fixture["expected_monday"]["selected"]:
            raise AssertionError(f"{fixture['test_id']}.monday.selected: expected {fixture['expected_monday']['selected']}, got {selected}")
        assert_subset(state["visible"], fixture["expected_monday"]["final_visible"], fixture["test_id"] + ".monday.final_visible")
        passed.append(fixture["test_id"])

    print("STRUCTURE PASS")
    print("RULE FIXTURES PASS: " + ", ".join(passed))
    print("EXPERIENCE FIXTURES PRESENT: " + ", ".join(item["test_id"] for item in tests["experience_fixtures"]))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"VALIDATION FAILED: {exc}", file=sys.stderr)
        raise
