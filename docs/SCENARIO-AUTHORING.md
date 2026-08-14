# Scenario Authoring

## Design goal

A Judgment Crucible scenario should create defensible disagreement. If one answer is obviously correct from the facts on screen, the content is closer to a quiz than an executive judgment simulation.

## Package pattern

The shipping example is `spec/trusted-path-v2/`:

- `trusted-path.v2.json` — scenario content and deterministic effects
- `trusted-path.schema.json` — package shape
- `trusted-path.tests.json` — rule/experience fixtures
- `cyber-ronin.tokens.json` — scenario visual/content tokens
- `validate_package.py` — structural and deterministic validation

## A strong call contains

1. **An irreversible or costly near-term decision.**
2. **Incomplete information.** The uncertainty must matter.
3. **At least two legitimate priorities in conflict.**
4. **Several authorized options that a credible leader could defend.**
5. **A consequence that follows from the choice without pretending hindsight proves incompetence.**
6. **A mechanism for earlier choices to affect later pressure.**

## Decision effects

The current engine models three visible strategic resources:

- Continuity
- Trust
- Truth

It also carries hidden debt and scenario flags. Those hidden values are useful when a short-term “win” should create later operational, governance, or credibility cost.

Do not make every aggressive decision reduce the same meter or every cautious decision increase trust. Predictable moral arithmetic destroys the tension.

## Chair guidance

Every call needs coherent choice sets for:

- authorized action,
- protected priority,
- accepted tradeoff,
- reconsideration trigger,
- accountable owner.

These should assemble into a sentence a real executive could plausibly say aloud.

## Tests before shipping a scenario

Create deterministic fixtures that cover:

- a representative baseline path,
- each conditional consequence branch,
- debt accumulation or forgiveness,
- hesitation behavior if applicable,
- repeat-pattern logic,
- Monday-after/final synthesis,
- malformed/missing package data.

Then use `/simulator` to examine the path visually and run at least one live facilitated pilot. Mechanical correctness is necessary but not sufficient; executive ambiguity has to work in the room.
