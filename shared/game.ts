import scenarioJson from "@/spec/trusted-path-v2/trusted-path.v2.json";

export type MeterState = { continuity: number; trust: number; truth: number };
export type DebtState = { exposure: number; trust: number; evidence: number; alignment: number };
export type Participant = { id: string; accessKey?: string; name: string; ready: boolean; vote?: string; commitment?: string };
export type Judgment = { decision: boolean; priority: boolean; tradeoff: boolean; trigger: boolean; owner: boolean };
export type ChairDecisionInput = { optionKey: string; priority: string; tradeoff: string; trigger: string; owner: string };
export type TendencyKey = "continuity-first" | "control-first" | "truth-forward" | "assurance-first" | "deliberation-first" | "managed-exposure" | "bounded-response" | "authority-escalation";
export type DecisionRecord = {
  callId: string;
  callTitle: string;
  optionKey: string;
  action: string;
  priority: string;
  tradeoff: string;
  trigger: string;
  owner: string;
  statement: string;
  movement: MeterState;
  visibleBefore: MeterState;
  visibleAfter: MeterState;
  consequence: string;
  carriedForward: string;
  tendencySignals: TendencyKey[];
  voteDistribution: Record<string, number>;
};

export type GameSession = {
  code: string;
  hostKey: string;
  status: "lobby" | "running" | "closed";
  phase: "lobby" | "briefing" | "fact" | "voting" | "split" | "pressure" | "chair" | "outcome" | "monday" | "final";
  callIndex: number;
  visible: MeterState;
  debt: DebtState;
  flags: Record<string, boolean>;
  vendorConnection: string;
  participants: Participant[];
  votesCast?: number;
  voteSummary?: Record<string, number>;
  chairId?: string;
  selectedOption?: string;
  exactStatement?: string;
  judgment?: Judgment;
  movement?: MeterState;
  consequence?: string;
  screenId: string;
  countdownEndsAt?: number;
  hesitationEvents: number;
  mondaySelected: string[];
  decisionTrail: DecisionRecord[];
  eventLog: Array<{ sequence: number; at: string; type: string; detail: string }>;
  updatedAt: string;
};

type Condition = { all?: Condition[]; any?: Condition[]; path?: string; op?: string; value?: unknown };
type Operation = { op: string; path: string; value: unknown; condition?: Condition };

export const scenario = scenarioJson as unknown as {
  package: { title: string; scenario_version: string };
  calls: Array<{
    call_id: string;
    title: string;
    facts: string;
    knowns: string[];
    unknowns: string[];
    pressure_voices: Array<{ role: string; text: string }>;
    screen_ids: Record<string, string>;
    on_enter?: Operation[];
    options: Array<{
      option_key: string;
      authorized_decision: string;
      movement: MeterState;
      narrative: string;
      operations: Operation[];
      required_inputs: string[];
    }>;
  }>;
  monday_after: {
    candidate_limit: number;
    candidates: Array<{
      candidate_id: string;
      priority: number;
      condition: Condition;
      movement: MeterState;
      narrative: string;
      question_id: string;
    }>;
    questions: Record<string, string>;
  };
  close: { transition_72_hour: string; statements: string[] };
};

export const chairGuidance: Array<{ priorities: string[]; tradeoffs: string[]; triggers: string[]; owners: string[] }> = [
  {
    priorities: ["transaction integrity", "continuity of order processing", "control of privileged access"],
    tradeoffs: ["delayed orders and a growing backlog", "operating with residual exposure", "reduced evidence while service continues"],
    triggers: ["privileged identities are independently revalidated", "the vendor connection is proven clean", "new evidence confirms manipulation or broader impact"],
    owners: ["CISO", "COO", "CEO", "Incident Commander"],
  },
  {
    priorities: ["containment integrity", "shipment continuity", "clear decision authority"],
    tradeoffs: ["missing the shipment window", "restricted processing under heightened monitoring", "temporary business interruption"],
    triggers: ["restored identities are independently validated", "the shipment window closes", "any new anomalous transaction appears"],
    owners: ["CISO", "COO", "CEO", "Incident Commander"],
  },
  {
    priorities: ["customer trust", "transaction integrity", "continuity for legitimate orders"],
    tradeoffs: ["public uncertainty while validation continues", "a pause affecting legitimate transactions", "limited processing with manual review"],
    triggers: ["joint customer validation establishes scope", "all affected transactions since 2:41 a.m. are reviewed", "evidence confirms or rules out manipulation"],
    owners: ["CISO", "COO", "CEO", "Incident Commander"],
  },
  {
    priorities: ["truthful board communication", "continued restricted processing", "a defensible containment assurance"],
    tradeoffs: ["unresolved impact while investigation continues", "a broader operational pause", "reputational exposure if the assurance proves wrong"],
    triggers: ["scope and impact are independently validated", "any evidence contradicts the containment claim", "the board chair requests a revised recommendation"],
    owners: ["CISO", "COO", "CEO", "Incident Commander"],
  },
];

const optionLearning: Record<string, { carriedForward: string; tendencies: TendencyKey[] }> = {
  "C1-A": { carriedForward: "Operational backlog and reauthentication pressure move into the next call.", tendencies: ["control-first", "truth-forward"] },
  "C1-B": { carriedForward: "Unvalidated privileged access remains active while the business continues.", tendencies: ["continuity-first", "managed-exposure"] },
  "C1-C": { carriedForward: "Reduced capacity and coordination pressure move forward.", tendencies: ["bounded-response", "continuity-first"] },
  "C1-D": { carriedForward: "Exposure remains open while stronger evidence is awaited.", tendencies: ["deliberation-first", "truth-forward"] },
  "C2-A": { carriedForward: "Shipment pressure and local resistance move forward.", tendencies: ["control-first"] },
  "C2-B": { carriedForward: "An incompletely validated path remains active under a deadline.", tendencies: ["continuity-first", "managed-exposure"] },
  "C2-C": { carriedForward: "Restricted capacity and identity-validation burden move forward.", tendencies: ["bounded-response", "truth-forward"] },
  "C2-D": { carriedForward: "Authority is escalated while the live exposure remains unresolved.", tendencies: ["authority-escalation", "deliberation-first"] },
  "C3-A": { carriedForward: "Public uncertainty and customer scrutiny move forward with a shared fact-finding process.", tendencies: ["truth-forward"] },
  "C3-B": { carriedForward: "Credibility is borrowed until external language catches up with the evidence.", tendencies: ["assurance-first", "continuity-first"] },
  "C3-C": { carriedForward: "Operational backlog moves forward while evidence quality improves.", tendencies: ["control-first", "truth-forward"] },
  "C3-D": { carriedForward: "Residual exposure and manual-review burden move forward.", tendencies: ["bounded-response", "continuity-first"] },
  "C4-A": { carriedForward: "Containment language will be tested against the final incident record.", tendencies: ["assurance-first", "continuity-first"] },
  "C4-B": { carriedForward: "Operational disruption is accepted to preserve warranted assurance.", tendencies: ["truth-forward", "control-first"] },
  "C4-C": { carriedForward: "A narrow assurance will be compared with later evidence.", tendencies: ["assurance-first", "continuity-first"] },
  "C4-D": { carriedForward: "The board's need for assurance remains unresolved while evidence develops.", tendencies: ["deliberation-first", "truth-forward"] },
};

const tendencyDefinitions: Record<TendencyKey, { label: string; interpretation: string }> = {
  "continuity-first": { label: "Continuity-first", interpretation: "The room repeatedly protected operating flow while allowing another pressure to remain active." },
  "control-first": { label: "Control-first", interpretation: "The room repeatedly reduced ambiguity through restriction, centralization, or a broader pause." },
  "truth-forward": { label: "Truth-forward", interpretation: "The room repeatedly protected evidence quality or warranted language, even when doing so carried an operating cost." },
  "assurance-first": { label: "Assurance-first", interpretation: "The room repeatedly favored stabilizing language before the full evidence and impact picture had settled." },
  "deliberation-first": { label: "Deliberation-first", interpretation: "The room repeatedly preserved time for confirmation or higher-authority review before changing posture." },
  "managed-exposure": { label: "Managed exposure", interpretation: "The room repeatedly kept service active while attempting to bound rather than eliminate exposure." },
  "bounded-response": { label: "Bounded response", interpretation: "The room repeatedly chose a constrained middle path instead of a full stop or unrestricted continuation." },
  "authority-escalation": { label: "Authority escalation", interpretation: "The room moved a consequential risk decision upward rather than resolving it at the current decision level." },
};

export function roomTendencies(session: GameSession) {
  const evidence = new Map<TendencyKey, DecisionRecord[]>();
  for (const record of session.decisionTrail ?? []) {
    for (const tendency of record.tendencySignals) evidence.set(tendency, [...(evidence.get(tendency) ?? []), record]);
  }
  return [...evidence.entries()]
    .filter(([, records]) => records.length >= 2)
    .map(([key, records]) => ({
      key,
      ...tendencyDefinitions[key],
      count: records.length,
      evidence: records.map((record) => `${record.callId}: ${record.action}`),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 3);
}

export function latestDecisionRecord(session: GameSession) {
  return (session.decisionTrail ?? []).at(-1);
}

export function buildChairStatement(callIndex: number, input: ChairDecisionInput) {
  const call = scenario.calls[callIndex];
  const guidance = chairGuidance[callIndex];
  const option = call?.options.find((item) => item.option_key === input.optionKey);
  if (!call || !guidance || !option) throw new Error("Select a governing action");
  if (!guidance.priorities.includes(input.priority)) throw new Error("Select what the decision protects");
  if (!guidance.tradeoffs.includes(input.tradeoff)) throw new Error("Select the accepted cost");
  if (!guidance.triggers.includes(input.trigger)) throw new Error("Select a reconsideration trigger");
  if (!guidance.owners.includes(input.owner)) throw new Error("Select the accountable owner");
  const action = option.authorized_decision.replace(/[.]$/, "");
  return `We will ${action.charAt(0).toLowerCase()}${action.slice(1)} to protect ${input.priority}. We accept ${input.tradeoff} until ${input.trigger}. The ${input.owner} owns the risk.`;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function getPath(root: unknown, path = "") {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) return (value as Record<string, unknown>)[key];
    return undefined;
  }, root);
}

function setPath(root: unknown, path: string, value: unknown) {
  const parts = path.split(".");
  let target = root as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
  target[parts.at(-1)!] = value;
}

function evaluate(condition: Condition, context: Record<string, unknown>): boolean {
  if (condition.all) return condition.all.every((item) => evaluate(item, context));
  if (condition.any) return condition.any.some((item) => evaluate(item, context));
  const actual = getPath(context, condition.path);
  switch (condition.op) {
    case "eq": return actual === condition.value;
    case "ne": return actual !== condition.value;
    case "lt": return typeof actual === "number" && actual < (condition.value as number);
    case "lte": return typeof actual === "number" && actual <= (condition.value as number);
    case "gt": return typeof actual === "number" && actual > (condition.value as number);
    case "gte": return typeof actual === "number" && actual >= (condition.value as number);
    default: return false;
  }
}

function engineShape(session: GameSession) {
  return {
    visible: session.visible,
    hidden: {
      debt: session.debt,
      state: { vendor_connection: session.vendorConnection },
      flags: session.flags,
    },
  };
}

function applyMovement(session: GameSession, movement: MeterState) {
  session.visible.continuity = clamp(session.visible.continuity + movement.continuity, 0, 10);
  session.visible.trust = clamp(session.visible.trust + movement.trust, 0, 10);
  session.visible.truth = clamp(session.visible.truth + movement.truth, 0, 10);
}

function applyOperation(session: GameSession, operation: Operation, context: Record<string, unknown>) {
  if (operation.op === "add_if" && (!operation.condition || !evaluate(operation.condition, context))) return;
  const state = engineShape(session);
  if (operation.op === "set") setPath(state, operation.path, operation.value);
  if (operation.op === "add" || operation.op === "add_if") {
    const current = Number(getPath(state, operation.path) ?? 0);
    setPath(state, operation.path, clamp(current + Number(operation.value), 0, 2));
  }
  session.vendorConnection = state.hidden.state.vendor_connection;
}

function addEvent(session: GameSession, type: string, detail: string) {
  session.eventLog.push({ sequence: session.eventLog.length + 1, at: new Date().toISOString(), type, detail });
}

export function createSession(code: string, hostKey: string): GameSession {
  const now = new Date().toISOString();
  return {
    code,
    hostKey,
    status: "lobby",
    phase: "lobby",
    callIndex: 0,
    visible: { continuity: 8, trust: 7, truth: 5 },
    debt: { exposure: 0, trust: 0, evidence: 0, alignment: 0 },
    flags: {
      EXPOSURE_INCIDENT_APPLIED: false,
      CONTINUITY_ZERO_APPLIED: false,
      TRUST_ZERO_APPLIED: false,
      TRUTH_ZERO_APPLIED: false,
    },
    vendorConnection: "UNKNOWN",
    participants: [],
    votesCast: 0,
    voteSummary: {},
    screenId: "R-LOBBY",
    hesitationEvents: 0,
    mondaySelected: [],
    decisionTrail: [],
    eventLog: [{ sequence: 1, at: now, type: "SESSION_CREATED", detail: `Room ${code} created` }],
    updatedAt: now,
  };
}

export function publicSession(session: GameSession): GameSession {
  // Private game debt, host authority, individual votes, participant credentials,
  // commitments, and the event log never cross the public realtime boundary.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hostKey: _hostKey, debt: _debt, flags: _flags, vendorConnection: _vendor, eventLog: _log, ...safe } = session;
  const participants = session.participants.map((participant) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { accessKey: _accessKey, commitment: _commitment, vote: _vote, ...publicParticipant } = participant;
    return publicParticipant;
  });
  const revealVotes = ["split", "pressure", "chair", "outcome", "monday", "final"].includes(session.phase) || session.status === "closed";
  return {
    ...safe,
    hostKey: "",
    debt: { exposure: 0, trust: 0, evidence: 0, alignment: 0 },
    flags: {},
    vendorConnection: "REDACTED",
    eventLog: [],
    participants,
    votesCast: session.participants.filter((participant) => Boolean(participant.vote)).length,
    voteSummary: revealVotes ? voteDistribution(session) : {},
  };
}


export function hostSession(session: GameSession): GameSession {
  const safe = publicSession(session);
  const participants = session.participants.map((participant) => {
    // Host receives readiness and private post-session commitments, never vote attribution or access credentials.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { accessKey: _accessKey, vote: _vote, ...hostParticipant } = participant;
    return hostParticipant;
  });
  return {
    ...safe,
    hostKey: session.hostKey,
    debt: clone(session.debt),
    flags: clone(session.flags),
    vendorConnection: session.vendorConnection,
    eventLog: clone(session.eventLog),
    participants,
  };
}

export function advance(session: GameSession): GameSession {
  const next = clone(session);
  const call = scenario.calls[next.callIndex];
  if (next.phase === "lobby") {
    next.status = "running";
    next.phase = "briefing";
    next.screenId = "R-OPEN";
  } else if (next.phase === "briefing" || next.phase === "outcome") {
    if (next.phase === "outcome" && next.callIndex === scenario.calls.length - 1) {
      next.phase = "monday";
      next.screenId = "R-MON-TRANSITION";
    } else {
      if (next.phase === "outcome") next.callIndex += 1;
      const entered = scenario.calls[next.callIndex];
      for (const op of entered.on_enter ?? []) applyOperation(next, op, { pre: engineShape(next), post: engineShape(next), inputs: {} });
      next.phase = "fact";
      next.screenId = entered.screen_ids.fact;
      next.selectedOption = undefined;
      next.exactStatement = undefined;
      next.movement = undefined;
      next.consequence = undefined;
      next.participants = next.participants.map((p) => ({ ...p, vote: undefined }));
      next.votesCast = 0;
      next.voteSummary = {};
      next.chairId = next.participants[next.callIndex % Math.max(1, next.participants.length)]?.id;
    }
  } else if (next.phase === "fact") {
    next.phase = "voting";
    next.screenId = call.screen_ids.options;
    next.countdownEndsAt = Date.now() + 15_000;
  } else if (next.phase === "voting") {
    next.phase = "split";
    next.screenId = call.screen_ids.split;
    next.countdownEndsAt = undefined;
  } else if (next.phase === "split") {
    next.phase = "pressure";
    next.screenId = call.screen_ids.pressure;
  } else if (next.phase === "pressure") {
    next.phase = "chair";
    next.screenId = call.screen_ids.chair;
    next.countdownEndsAt = Date.now() + 20_000;
  } else if (next.phase === "monday") {
    applyMonday(next);
  } else if (next.phase === "final") {
    next.status = "closed";
  }
  next.updatedAt = new Date().toISOString();
  addEvent(next, "PHASE_ADVANCED", `${next.phase} · ${next.screenId}`);
  return next;
}

export function resolveDecision(
  session: GameSession,
  payload: { optionKey: string; statement: string; judgment: Judgment; chairInput?: ChairDecisionInput; inputs?: Record<string, unknown>; hesitation?: boolean },
): GameSession {
  const next = clone(session);
  const call = scenario.calls[next.callIndex];
  const option = call.options.find((item) => item.option_key === payload.optionKey);
  if (!option) throw new Error("Unknown option");
  const pre = clone(engineShape(next));
  const visibleBefore = clone(next.visible);
  const movement = clone(option.movement);
  applyMovement(next, movement);
  if (payload.hesitation) {
    applyMovement(next, { continuity: -1, trust: 0, truth: 0 });
    movement.continuity -= 1;
    next.hesitationEvents += 1;
    addEvent(next, "HESITATION_APPLIED", "Continuity −1");
  }
  const inputs = { ...payload.inputs, judgment: payload.judgment };
  for (const operation of option.operations) {
    applyOperation(next, operation, { pre, post: engineShape(next), inputs });
  }
  if (pre.hidden.debt.exposure < 2 && next.debt.exposure === 2 && !next.flags.EXPOSURE_INCIDENT_APPLIED) {
    applyMovement(next, { continuity: -1, trust: 0, truth: 0 });
    movement.continuity -= 1;
    next.flags.EXPOSURE_INCIDENT_APPLIED = true;
    addEvent(next, "EVT-EXP-01", "Repeated Exposure · Continuity −1");
  }
  for (const meter of ["continuity", "trust", "truth"] as const) {
    const flag = `${meter.toUpperCase()}_ZERO_APPLIED`;
    if (next.visible[meter] === 0 && !next.flags[flag]) next.flags[flag] = true;
  }
  next.phase = "outcome";
  next.screenId = `R-${option.option_key}-OUTCOME`;
  next.selectedOption = option.option_key;
  next.exactStatement = payload.statement;
  next.judgment = payload.judgment;
  next.movement = movement;
  next.consequence = option.narrative;
  const learning = optionLearning[option.option_key] ?? { carriedForward: "The unresolved tradeoff moves into the next decision.", tendencies: [] };
  const chairInput = payload.chairInput;
  const record: DecisionRecord = {
    callId: call.call_id,
    callTitle: call.title,
    optionKey: option.option_key,
    action: option.authorized_decision,
    priority: chairInput?.priority ?? "Priority not captured in this engine path",
    tradeoff: chairInput?.tradeoff ?? "Tradeoff not captured in this engine path",
    trigger: chairInput?.trigger ?? "Trigger not captured in this engine path",
    owner: chairInput?.owner ?? "Owner not captured in this engine path",
    statement: payload.statement,
    movement: clone(movement),
    visibleBefore,
    visibleAfter: clone(next.visible),
    consequence: option.narrative,
    carriedForward: learning.carriedForward,
    tendencySignals: learning.tendencies,
    voteDistribution: voteDistribution(session),
  };
  next.decisionTrail = [...(next.decisionTrail ?? []).filter((item) => item.callId !== call.call_id), record];
  next.countdownEndsAt = undefined;
  next.updatedAt = new Date().toISOString();
  addEvent(next, "DECISION_COMMITTED", `${option.option_key} · ${payload.statement}`);
  return next;
}

export function applyMonday(session: GameSession) {
  const state = engineShape(session);
  const candidates = scenario.monday_after.candidates
    .filter((candidate) => evaluate(candidate.condition, state as unknown as Record<string, unknown>))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, scenario.monday_after.candidate_limit);
  for (const candidate of candidates) applyMovement(session, candidate.movement);
  session.mondaySelected = candidates.map((item) => item.candidate_id);
  session.consequence = candidates.length
    ? candidates.map((item) => item.narrative).join(" ")
    : "No delayed debt consequence was eligible. The decision trail still returns for accountability.";
  session.phase = "final";
  session.screenId = "R-FINAL";
  session.updatedAt = new Date().toISOString();
  addEvent(session, "MONDAY_APPLIED", session.mondaySelected.join(", ") || "none");
}

export function voteDistribution(session: GameSession) {
  return session.participants.reduce<Record<string, number>>((result, participant) => {
    if (participant.vote) result[participant.vote] = (result[participant.vote] ?? 0) + 1;
    return result;
  }, {});
}

export function call4Mismatch(optionKey: string, statement: string) {
  const lower = statement.toLowerCase();
  if (optionKey === "C4-A" && (lower.includes("no evidence") || lower.includes("broader impact"))) return true;
  if (optionKey === "C4-C" && (lower.includes("bounded, not impact") || lower.includes("pause affected"))) return true;
  return false;
}
