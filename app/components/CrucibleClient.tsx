"use client";

/* eslint-disable react-hooks/set-state-in-effect -- These effects hydrate browser-only room credentials and begin network polling after mount. */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { apiSecurityHeaders, subscribeToPublicSession } from "@/lib/firebase/client";
import {
  buildChairStatement,
  ChairDecisionInput,
  chairGuidance,
  createSession,
  DecisionRecord,
  GameSession,
  Judgment,
  latestDecisionRecord,
  MeterState,
  resolveDecision,
  roomTendencies,
  scenario,
  voteDistribution,
} from "@/shared/game";
import testJson from "@/spec/trusted-path-v2/trusted-path.tests.json";

type Surface = "landing" | "host" | "room" | "play" | "simulator";

const defaultJudgment: Judgment = { decision: false, priority: false, tradeoff: false, trigger: false, owner: false };

function useQueryCode() {
  const [code, setCode] = useState("");
  useEffect(() => setCode(new URLSearchParams(window.location.search).get("code")?.toUpperCase() ?? ""), []);
  return [code, setCode] as const;
}

async function api(body: Record<string, unknown>) {
  const security = await apiSecurityHeaders();
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json", ...security },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json() as { session?: GameSession; error?: string; participantId?: string; participantKey?: string; storage?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function mergeRealtimeSession(current: GameSession | null, incoming: GameSession, hostKey: string) {
  if (!hostKey || !current?.hostKey) return incoming;
  return {
    ...current,
    ...incoming,
    hostKey: current.hostKey,
    debt: current.debt,
    flags: current.flags,
    vendorConnection: current.vendorConnection,
    eventLog: current.eventLog,
    participants: incoming.participants.map((participant) => {
      const existing = current.participants.find((item) => item.id === participant.id);
      return existing?.commitment ? { ...participant, commitment: existing.commitment } : participant;
    }),
  };
}

function usePolling(code: string, hostKey = "") {
  const [session, setSession] = useState<GameSession | null>(null);
  const [error, setError] = useState("");
  const [transport, setTransport] = useState<"realtime" | "fallback">("fallback");
  const load = useCallback(async () => {
    if (!code) return;
    try {
      const query = new URLSearchParams({ code });
      if (hostKey) query.set("hostKey", hostKey);
      const security = await apiSecurityHeaders();
      const response = await fetch(`/api/session?${query}`, { cache: "no-store", headers: security });
      const data = await response.json() as { session?: GameSession; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Session unavailable");
      if (data.session) setSession((current) => mergeRealtimeSession(current, data.session!, hostKey));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Connection interrupted");
    }
  }, [code, hostKey]);

  useEffect(() => {
    if (!code) return;
    let active = true;
    let unsubscribe: (() => void) | null = null;
    let fallbackTimer: number | null = null;
    let hostRefreshTimer: number | null = null;

    const start = async () => {
      await load();
      if (!active) return;
      const realtime = await subscribeToPublicSession(
        code,
        (incoming) => {
          if (!active || !incoming) return;
          setSession((current) => mergeRealtimeSession(current, incoming, hostKey));
          setError("");
        },
        (message) => setError(message),
      );
      if (!active) { realtime?.(); return; }
      if (realtime) {
        unsubscribe = realtime;
        setTransport("realtime");
        // The host gets secret-free realtime state, plus a slow private refresh
        // for facilitator-only event/debt/commitment details.
        if (hostKey) hostRefreshTimer = window.setInterval(load, 5000);
      } else {
        setTransport("fallback");
        fallbackTimer = window.setInterval(load, 900);
      }
    };
    void start();
    return () => {
      active = false;
      unsubscribe?.();
      if (fallbackTimer) window.clearInterval(fallbackTimer);
      if (hostRefreshTimer) window.clearInterval(hostRefreshTimer);
    };
  }, [code, hostKey, load]);
  return { session, setSession, error, reload: load, transport };
}

function JoinQR({ code, compact = false }: { code: string; compact?: boolean }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  if (!origin) return <div className={`qr-placeholder ${compact ? "compact" : ""}`} aria-hidden="true" />;
  return <div className={`join-qr ${compact ? "compact" : ""}`}><QRCodeSVG value={`${origin}/play?code=${code}`} size={compact ? 104 : 168} level="M" marginSize={1} /><span>SCAN TO JOIN</span></div>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <div className="ronin-mark" aria-hidden="true"><i /><i /><b /></div>
      <div className="brand-lockup">
        <span className="brand-product">THE JUDGMENT CRUCIBLE</span>
        <span className="brand-master">A CYBER RONIN EXPERIENCE</span>
        {!compact && <span className="brand-discipline">DISCIPLINE UNDER PRESSURE</span>}
      </div>
    </div>
  );
}

function Meter({ label, value, delta }: { label: string; value: number; delta?: number }) {
  const type = label.toLowerCase();
  const prior = Math.max(0, Math.min(10, value - (delta ?? 0)));
  return (
    <div className={`meter meter-${type}`} aria-label={`${label} ${value} out of 10`}>
      <div className="meter-top"><span>{label}</span><strong>{value}</strong></div>
      <div className="resource-track" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => {
          const level = index + 1;
          const recentLoss = Boolean(delta && delta < 0 && level > value && level <= prior);
          const recentGain = Boolean(delta && delta > 0 && level <= value && level > prior);
          return <i key={index} className={`${level <= value ? "active" : "spent"} ${recentLoss ? "recent-loss" : ""} ${recentGain ? "recent-gain" : ""}`} />;
        })}
      </div>
      <small>{delta === undefined ? "UNCHANGED" : `${delta > 0 ? "+" : ""}${delta} · ${delta < 0 ? "SPENT" : delta > 0 ? "RECOVERED" : "HELD"}`}</small>
    </div>
  );
}

function MeterRail({ session }: { session: GameSession }) {
  return (
    <div className="meter-rail">
      <Meter label="CONTINUITY" value={session.visible.continuity} delta={session.movement?.continuity} />
      <Meter label="TRUST" value={session.visible.trust} delta={session.movement?.trust} />
      <Meter label="TRUTH" value={session.visible.truth} delta={session.movement?.truth} />
    </div>
  );
}

function Connection({ error }: { error?: string }) {
  return <span className={`connection ${error ? "connection-error" : ""}`}>{error ? "RECOVERING" : "LIVE"}</span>;
}

function Landing() {
  return (
    <main className="landing-shell">
      <div className="ambient-grid" />
      <header><Brand /><span className="classified-mark">BOARDROOM EXPERIENCE · 30 MIN</span></header>
      <section className="hero hero-cinematic">
        <div className="hero-copy">
          <div className="eyebrow"><i className="live-pulse" /> ENTER THE JUDGMENT CHAMBER</div>
          <h1>The call you<br />don’t want to get.</h1>
          <div className="chamber-oath">YOU HAVE ENTERED A ROOM WHERE YOUR JUDGMENT WILL LEAVE A MARK.</div>
          <p>Incomplete facts. Immediate consequences. Four calls that spend continuity, trust, or truth—and one Monday After that remembers exactly what you said.</p>
          <div className="hero-actions">
            <Link href="/host" className="button primary">Take the Chair <span>→</span></Link>
            <a href="#judgment-trace" className="button secondary">How judgment is traced</a>
          </div>
          <div className="experience-proof"><span><b>04</b> calls</span><span><b>20</b> seconds</span><span><b>03</b> competing truths</span></div>
        </div>
        <div className="hero-visual" aria-label="A luminous executive boardroom with an illuminated Chair">
          <div className="hero-scene">
            <div className="hero-image" />
            <div className="target-rings"><i /><i /><i /></div>
            <div className="visual-caption"><span>THE CHAIR IS OPEN</span><b>EVERY DECISION LEAVES A MARK</b></div>
          </div>
          <div className="incoming-card"><small>SECURE LINE · 06:42</small><strong>THE BUSINESS IS ALREADY IMPACTED.</strong><span>Answer before certainty arrives.</span></div>
        </div>
      </section>
      <section className="surface-grid">
        <Link href="/host" className="surface-card"><span>01</span><h2>Host</h2><p>Run the pressure, select the Chair, and hold the room.</p></Link>
        <Link href="/room" className="surface-card"><span>02</span><h2>Room</h2><p>Project the shared facts, split, clocks, and state.</p></Link>
        <Link href="/play" className="surface-card"><span>03</span><h2>Participant</h2><p>Commit privately, then look up and own the room.</p></Link>
      </section>
      <section id="judgment-trace" className="method-section">
        <div className="method-heading"><div className="eyebrow">THE ROOM JUDGMENT TRACE</div><h2>Consequences are not scores.</h2><p>The experience keeps four kinds of evidence separate so the room can see what happened, how it decided, which patterns repeated, and what to practice next.</p></div>
        <div className="method-grid">
          <article><span>01</span><h3>Decision state</h3><p>What the choices did to continuity, trust, truth, and accumulated pressure.</p></article>
          <article><span>02</span><h3>Judgment process</h3><p>How clearly the room named its action, priority, tradeoff, trigger, and owner.</p></article>
          <article><span>03</span><h3>Room tendencies</h3><p>Patterns supported by repeated session evidence—not fixed labels or personality types.</p></article>
          <article><span>04</span><h3>Development transfer</h3><p>One concrete practice each executive carries into the next pressured decision.</p></article>
        </div>
      </section>
      <section className="market-section">
        <div className="market-copy">
          <div className="eyebrow">NOT ANOTHER TABLETOP</div>
          <h2>Train the decision, not the trivia.</h2>
          <p>Traditional exercises often reward the person who knows the playbook. The Crucible trains a different muscle: making a defensible executive call when the facts are incomplete, the business is moving, and every option spends something important.</p>
        </div>
        <div className="market-proof-grid">
          <article><span>01</span><strong>Commit before discussion</strong><p>Private voting captures instinct before hierarchy or consensus changes the room.</p></article>
          <article><span>02</span><strong>Expose real pressure</strong><p>Competing executive voices force the Chair to name the tradeoff instead of hiding behind “alignment.”</p></article>
          <article><span>03</span><strong>Make accountability portable</strong><p>The five-part executive record turns a pressured choice into something leaders can defend, revisit, and practice.</p></article>
        </div>
      </section>
      <section className="buyer-section">
        <div><div className="eyebrow">BUILT FOR LEADERSHIP ROOMS</div><h2>One screen. Every phone. No install.</h2></div>
        <div className="buyer-tags"><span>CISO OFFSITES</span><span>EXECUTIVE DEVELOPMENT</span><span>INCIDENT PREPAREDNESS</span><span>BOARD READINESS</span><span>SECURITY LEADERSHIP PROGRAMS</span></div>
        <div className="buyer-actions"><Link href="/host" className="button primary">Run The Trusted Path</Link><Link href="/simulator" className="button secondary">Inspect the decision engine</Link><Link href="/privacy" className="text-link">How private voting works →</Link></div>
      </section>
      <footer><span>THE TRUSTED PATH · VERSION 2.1</span><span>DISCIPLINED JUDGMENT UNDER PRESSURE</span></footer>
    </main>
  );
}

function Host() {
  const [roomCode, setRoomCode] = useState("");
  const [hostKey, setHostKey] = useState("");
  const { session, setSession, error, reload, transport } = usePolling(roomCode, hostKey);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const savedCode = localStorage.getItem("crucible-host-code") ?? "";
    const savedKey = localStorage.getItem("crucible-host-key") ?? "";
    setRoomCode(savedCode);
    setHostKey(savedKey);
  }, []);

  async function run(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const data = await api({ code: roomCode, hostKey, ...body });
      if (data.session) setSession(data.session);
      await reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Request failed"); }
    finally { setBusy(false); }
  }

  async function create() {
    setBusy(true);
    try {
      const data = await api({ action: "create" });
      const created = data.session!;
      setRoomCode(created.code); setHostKey(created.hostKey); setSession(created);
      localStorage.setItem("crucible-host-code", created.code);
      localStorage.setItem("crucible-host-key", created.hostKey);
      window.history.replaceState({}, "", `/host?code=${created.code}`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Could not create session"); }
    finally { setBusy(false); }
  }

  const call = session ? scenario.calls[session.callIndex] : null;
  const distribution = session?.voteSummary ?? {};
  const chair = session?.participants.find((item) => item.id === session.chairId);
  const phaseIndex = session?.status === "closed" ? 7 : session?.phase === "briefing" ? 0 : session?.phase === "monday" ? 5 : session?.phase === "final" ? 6 : Math.min(4, (session?.callIndex ?? 0) + 1);

  if (!roomCode || !hostKey || (!session && !error)) {
    return <main className="center-shell"><Brand /><div className="launch-card"><div className="eyebrow">FACILITATOR CONSOLE</div><h1>Open the Crucible.</h1><p>Create a room, connect the boardroom display, and invite the Council.</p><button className="button primary" onClick={create} disabled={busy}>{busy ? "Creating…" : "Create Trusted Path session"}</button>{message && <p className="alert">{message}</p>}</div></main>;
  }

  return (
    <main className={`host-shell phase-${session?.phase ?? "lobby"} call-${(session?.callIndex ?? 0) + 1}`}>
      <header className="app-header"><Brand compact /><div className="header-meta"><Connection error={error} /><span className="transport-tag">{transport === "realtime" ? "FIREBASE REALTIME" : "LOCAL SYNC"}</span><strong>ROOM {roomCode}</strong></div></header>
      <aside className="run-rail">
        <div><div className="eyebrow">RUN OF SHOW</div><h2>{session?.status === "closed" ? "Session complete" : call?.title ?? "Monday After"}</h2><p>Screen <code>{session?.screenId}</code></p></div>
        <ol>{["Briefing", "Call 1", "Call 2", "Call 3", "Call 4", "Monday After", "Close"].map((item, index) => <li key={item} className={index === phaseIndex ? "active" : index < phaseIndex ? "complete" : "future"}>{item}</li>)}</ol>
        <div className="host-join-block"><JoinQR code={roomCode} compact /><div className="room-links"><a href={`/room?code=${roomCode}`} target="_blank">Open room display ↗</a><a href={`/play?code=${roomCode}`} target="_blank">Open participant view ↗</a></div></div>
      </aside>
      <section className="control-canvas">
        <div className="control-heading"><div><div className="eyebrow">DECISION CHAMBER · {session?.status === "closed" ? "CLOSED" : session?.phase.toUpperCase()}</div><h1>{session?.status === "closed" ? "Session complete" : session?.phase === "monday" || session?.phase === "final" ? "Accountability returns" : call?.title}</h1></div><button className="button secondary small" onClick={create}>New room</button></div>
        {message && <div className="alert">{message}</div>}
        {session?.phase === "lobby" && <Panel title="Council assembly"><p>{session.participants.length} participants joined · {session.participants.filter((p) => p.ready).length} ready</p><ParticipantList session={session} onAssign={(id) => run({ action: "assignChair", participantId: id })} /><button className="button primary" onClick={() => run({ action: "advance" })} disabled={busy}>Begin briefing</button></Panel>}
        {session?.phase === "briefing" && <Panel title="Opening contract"><blockquote>This experience does not reward certainty. Make the least-worst call, name what you are spending, and own when you will reconsider.</blockquote><div className="facilitator-note"><strong>WHY THE CHAIR DECIDES</strong><p>The vote captures instinct. The Chair’s structured decision creates the accountability record that will return on Monday After.</p></div><button className="button primary" onClick={() => run({ action: "advance" })}>Reveal Call 1</button></Panel>}
        {session?.phase === "fact" && call && <Panel title="Signal ready"><p>{call.facts}</p><div className="known-grid"><div><strong>KNOWN</strong>{call.knowns.map((x) => <span key={x}>{x}</span>)}</div><div><strong>UNKNOWN</strong>{call.unknowns.map((x) => <span key={x}>{x}</span>)}</div></div><button className="button primary" onClick={() => run({ action: "advance" })}>Open private vote</button></Panel>}
        {session?.phase === "voting" && call && <Panel title="Private commitment"><div className="host-vote-status"><div><p><strong>{session.votesCast ?? 0}</strong> of {session.participants.length} votes received</p><small>Individual choices remain sealed until the split is published.</small></div><DecisionClock resetKey={`${session.callIndex}-${session.phase}`} endsAt={session.countdownEndsAt} duration={15} /></div><VoteBars call={call} distribution={distribution} hidden /><button className="button primary" onClick={() => run({ action: "advance" })}>Close vote now</button></Panel>}
        {session?.phase === "split" && call && <Panel title="Publish the split"><VoteBars call={call} distribution={distribution} /><p>Active Chair: <strong>{chair?.name ?? "Assign a Chair"}</strong></p><ParticipantList session={session} onAssign={(id) => run({ action: "assignChair", participantId: id })} compact /><button className="button primary" onClick={() => run({ action: "advance" })}>Deliver pressure voice</button></Panel>}
        {session?.phase === "pressure" && call && <Panel title="Competing executive pressure"><p>Deliver both voices. Do not resolve the tension for the Chair.</p><PressureVoiceCards voices={call.pressure_voices} /><div className="facilitator-note"><strong>FACILITATOR PROMPT</strong><p>“Both pressures are real. {chair?.name ?? "Chair"}, what is your call?”</p></div><button className="button primary" onClick={() => run({ action: "advance" })}>Put {chair?.name ?? "the Chair"} on the clock · 20 seconds</button></Panel>}
        {session?.phase === "chair" && call && <Panel title={`${chair?.name ?? "The Chair"} is deciding`}><div className="chair-live-status"><DecisionClock resetKey={`${session.callIndex}-${session.phase}`} endsAt={session.countdownEndsAt} /><div><div className="eyebrow">CHAIR DEVICE ACTIVE</div><h3>The decision is in their hands.</h3><p>The Chair is selecting the action, protected priority, accepted cost, reconsideration trigger, and owner on their phone. Their submission will immediately reveal the consequence.</p></div></div><div className="facilitator-note"><strong>FACILITATOR ROLE</strong><p>Hold the room and let the clock create pressure. The decision record and its consequence will be captured automatically.</p></div><p><strong>Need to reassign the Chair?</strong></p><ParticipantList session={session} onAssign={(id) => run({ action: "assignChair", participantId: id })} compact /></Panel>}
        {session?.phase === "outcome" && <Panel title="Consequence committed"><blockquote>{session.consequence}</blockquote><div className="statement-record">“{session.exactStatement}”</div><DecisionLedger record={latestDecisionRecord(session)} /><MeterRail session={session} /><button className="button primary" onClick={() => run({ action: "advance" })}>{session.callIndex === 3 ? "Advance 72 hours" : `Reveal Call ${session.callIndex + 2}`}</button></Panel>}
        {session?.phase === "monday" && <Panel title="The Monday After"><blockquote>{scenario.close.transition_72_hour}</blockquote><p>The engine will select the two highest-priority eligible consequences. Facilitator preference cannot replace them.</p><button className="button primary" onClick={() => run({ action: "advance" })}>Apply Monday After</button></Panel>}
        {session?.phase === "final" && session.status !== "closed" && <Panel title="Accountability"><blockquote>{session.consequence}</blockquote><div className="statement-record">Call 4 record: “{session.exactStatement}”</div><MeterRail session={session} /><p><strong>Applied:</strong> {session.mondaySelected.join(", ") || "No delayed consequence"}</p><div className="facilitator-note"><strong>CLOSE THE RECORD</strong><p>This ends the participant experience and seals the final room state.</p></div><button className="button primary commit-action" onClick={() => run({ action: "advance" })}>End experience and seal record</button></Panel>}
        {session?.status === "closed" && <Panel title="Room Judgment Debrief"><div className="closed-seal"><span>SESSION COMPLETE</span><strong>THE RECORD IS SEALED.</strong><p>Four calls completed with {session.participants.length} executives. Consequence, process, and repeated tendencies remain separate.</p></div><ExecutiveDebrief session={session} /><p className="commitment-count"><strong>{session.participants.filter((person) => person.commitment).length}</strong> of {session.participants.length} transfer commitments sealed.</p><button className="button primary" onClick={create}>Create a new session</button></Panel>}
      </section>
      {session && <aside className="state-rail"><div className="eyebrow">STATE OF THE ROOM</div><MeterRail session={session} /><div className="hidden-state"><span>Exposure <b>{session.debt.exposure}</b></span><span>Trust debt <b>{session.debt.trust}</b></span><span>Evidence <b>{session.debt.evidence}</b></span><span>Alignment <b>{session.debt.alignment}</b></span></div><div className="event-mini"><strong>EVENT LOG</strong>{session.eventLog.slice(-6).reverse().map((event) => <p key={event.sequence}><span>{event.sequence}</span>{event.type}</p>)}</div></aside>}
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <div className="panel"><div className="panel-katana" aria-hidden="true" /><h2>{title}</h2>{children}</div>; }
function PressureVoiceCards({ voices }: { voices: Array<{ role: string; text: string }> }) { return <div className="pressure-voice-grid">{voices.map((voice, index) => <article key={`${voice.role}-${index}`} className="pressure-voice-card"><span>{String(index + 1).padStart(2, "0")} · {voice.role.toUpperCase()}</span><blockquote>“{voice.text}”</blockquote></article>)}</div>; }
function DecisionStandard() { return <div className="decision-standard"><strong>A DEFENSIBLE CALL NAMES</strong><div><span><b>1</b>Action</span><i>→</i><span><b>2</b>Protected priority</span><i>→</i><span><b>3</b>Accepted cost</span><i>→</i><span><b>4</b>Reconsideration trigger</span><i>→</i><span><b>5</b>Accountable owner</span></div></div>; }
function ParticipantList({ session, onAssign, compact = false }: { session: GameSession; onAssign: (id: string) => void; compact?: boolean }) { return <div className={`participant-list ${compact ? "compact" : ""}`}>{session.participants.map((person) => <button key={person.id} onClick={() => onAssign(person.id)} className={session.chairId === person.id ? "chair" : ""}><span>{person.name}</span><small>{person.ready ? "READY" : "JOINED"}</small></button>)}</div>; }
function VoteBars({ call, distribution, hidden = false }: { call: typeof scenario.calls[number]; distribution: Record<string, number>; hidden?: boolean }) { const max = Math.max(1, ...Object.values(distribution)); return <div className="vote-bars">{call.options.map((option) => <div key={option.option_key}><span>{option.option_key}</span><div><i style={{ width: hidden ? "8%" : `${((distribution[option.option_key] ?? 0) / max) * 100}%` }} /></div><b>{hidden ? "•" : distribution[option.option_key] ?? 0}</b></div>)}</div>; }

function DecisionLedger({ record }: { record?: DecisionRecord }) {
  if (!record) return null;
  return <div className="decision-ledger" aria-label={`${record.callId} pressure ledger`}>
    <article><span>PROTECTED</span><strong>{record.priority}</strong></article>
    <article><span>SPENT</span><strong>{record.tradeoff}</strong></article>
    <article><span>CARRIED FORWARD</span><strong>{record.carriedForward}</strong></article>
  </div>;
}

function JudgmentTrace({ session }: { session: GameSession }) {
  const records = session.decisionTrail ?? [];
  const rows: Array<{ label: string; value: (record: DecisionRecord) => string }> = [
    { label: "Action", value: (record) => `${record.optionKey} · ${record.action}` },
    { label: "Protected", value: (record) => record.priority },
    { label: "Tradeoff", value: (record) => record.tradeoff },
    { label: "Trigger", value: (record) => record.trigger },
    { label: "Owner", value: (record) => record.owner },
  ];
  return <div className="judgment-trace-wrap"><div className="debrief-label">HOW THE ROOM DECIDED</div><div className="judgment-trace" role="table" aria-label="Room Judgment Trace">
    <div className="trace-row trace-head" role="row"><strong role="columnheader">EXECUTIVE RECORD</strong>{records.map((record) => <strong role="columnheader" key={record.callId}>{record.callId}</strong>)}</div>
    {rows.map((row) => <div className="trace-row" role="row" key={row.label}><strong role="rowheader">{row.label}</strong>{records.map((record) => <span role="cell" key={`${row.label}-${record.callId}`}>{row.value(record)}</span>)}</div>)}
  </div></div>;
}

function TendencySummary({ session }: { session: GameSession }) {
  const tendencies = roomTendencies(session);
  return <section className="tendency-summary"><div className="debrief-label">TENDENCIES OBSERVED</div><p className="debrief-caveat">Session-level patterns supported by repeated decisions—not an individual assessment.</p><div className="tendency-grid">
    {tendencies.length ? tendencies.map((tendency) => <article key={tendency.key}><span>{tendency.count} SIGNALS</span><h3>{tendency.label}</h3><p>{tendency.interpretation}</p><small>{tendency.evidence.join(" · ")}</small></article>) : <article><span>MORE EVIDENCE NEEDED</span><h3>No repeated pattern yet</h3><p>The room made varied moves. Preserve the decision record and test the pattern in another scenario.</p></article>}
  </div></section>;
}

function PressureMigration({ session }: { session: GameSession }) {
  const records = session.decisionTrail ?? [];
  return <section className="pressure-migration"><div className="debrief-label">WHERE PRESSURE MIGRATED</div><div className="migration-path">
    {records.map((record, index) => <article key={record.callId}><span>{record.callId}</span><strong>{record.priority}</strong><p>{record.carriedForward}</p>{index < records.length - 1 && <i aria-hidden="true">→</i>}</article>)}
  </div></section>;
}

function ExecutiveDebrief({ session, projection = false }: { session: GameSession; projection?: boolean }) {
  return <div className={`executive-debrief ${projection ? "projection" : ""}`}>
    <div className="debrief-intro"><div><div className="debrief-label">ROOM JUDGMENT TRACE</div><h2>What happened is not the same as how you decided.</h2></div><p>The meters show the simulated state. The record below shows the room&apos;s decisions and repeated session signals. No total judgment score is assigned.</p></div>
    <PressureMigration session={session} />
    <JudgmentTrace session={session} />
    <TendencySummary session={session} />
    <div className="transfer-prompt"><span>DEVELOPMENT TRANSFER</span><strong>In the next pressured decision, what must this room make explicit earlier?</strong></div>
  </div>;
}

function DecisionClock({ resetKey, endsAt, duration = 20 }: { resetKey: string; endsAt?: number; duration?: number }) {
  const remaining = useCallback(() => endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : duration, [endsAt, duration]);
  const [seconds, setSeconds] = useState(duration);
  useEffect(() => {
    setSeconds(remaining());
    const timer = window.setInterval(() => setSeconds(remaining()), 250);
    return () => window.clearInterval(timer);
  }, [resetKey, remaining]);
  return <div className={`decision-clock ${seconds <= 5 ? "critical" : ""}`} style={{ "--clock-progress": `${Math.max(0, Math.min(100, (seconds / duration) * 100))}%` } as React.CSSProperties}><div><strong>{String(seconds).padStart(2, "0")}</strong><span>SECONDS</span></div></div>;
}

function ImpactDeltas({ session }: { session: GameSession }) {
  const labels: Array<[keyof MeterState, string]> = [["continuity", "CONTINUITY"], ["trust", "TRUST"], ["truth", "TRUTH"]];
  return <div className="impact-deltas">{labels.map(([key, label]) => { const delta = session.movement?.[key] ?? 0; return <div key={key} className={delta < 0 ? "loss" : delta > 0 ? "gain" : "neutral"}><span>{label}</span><strong>{delta > 0 ? "+" : ""}{delta}</strong><small>{delta < 0 ? "SPENT" : delta > 0 ? "RECOVERED" : "HELD"}</small></div>; })}</div>;
}

function Room() {
  const [code, setCode] = useQueryCode();
  const { session, error, transport } = usePolling(code);
  if (!code) return <JoinCode title="Connect room display" onSubmit={setCode} />;
  if (!session) return <main className="room-shell room-center"><Brand /><Connection error={error || "Connecting"} /><h1>Recovering the room…</h1></main>;
  const call = scenario.calls[session.callIndex];
  const distribution = session.voteSummary ?? {};
  const chair = session.participants.find((p) => p.id === session.chairId);
  return <main className={`room-shell phase-${session.phase}`}>
    <div className="room-atmosphere" /><div className="ambient-grid" /><div className="stage-scan" />
    <header className="room-header"><Brand compact /><span>THE TRUSTED PATH · {session.status === "closed" ? "COMPLETE" : call?.call_id ?? "MONDAY"}</span><div className="room-live-meta"><span>{transport === "realtime" ? "REALTIME" : "SYNC"}</span><Connection error={error} /></div></header>
    <section className="room-stage">
      <div className="stage-index" aria-hidden="true">{call?.call_id?.replace("C", "0") ?? "72H"}</div>
      {session.phase === "lobby" && <><div className="lobby-join-layout"><div className="lobby-join-copy"><div className="ronin-seal"><i /><b>評</b></div><div className="eyebrow">ASSEMBLE THE COUNCIL</div><h1>Enter room <strong>{code}</strong></h1><p>{session.participants.length} executives joined · {session.participants.filter((participant) => participant.ready).length} ready. Private votes stay private; the room only sees the aggregate split.</p><div className="secure-path">PHONE ENTRY <b>/play?code={code}</b></div></div><JoinQR code={code} /></div></>}
      {session.phase === "briefing" && <><div className="ronin-seal"><i /><b>責</b></div><div className="eyebrow">THE CONTRACT</div><h1>Certainty is denied.<br />Responsibility is not.</h1><p>Everyone votes privately. One Chair commits the decision on their device. The executive record returns on Monday After.</p><DecisionStandard /></>}
      {session.phase === "fact" && <><div className="signal-glyph"><i /><i /><i /><b>!</b></div><div className="eyebrow">{call.call_id} · INCOMING SIGNAL</div><h1>{call.title}</h1><p className="room-copy">{call.facts}</p><div className="known-grid room-known"><div><strong>CONFIRMED</strong>{call.knowns.map((x) => <span key={x}>{x}</span>)}</div><div><strong>INTELLIGENCE GAP</strong>{call.unknowns.map((x) => <span key={x}>{x}</span>)}</div></div></>}
      {session.phase === "voting" && <><DecisionClock resetKey={`${session.callIndex}-${session.phase}`} endsAt={session.countdownEndsAt} duration={15} /><div className="eyebrow">PRIVATE COMMITMENT · EYES DOWN</div><h1>Make the call before the room influences you.</h1><p className="vote-progress-copy">{session.votesCast ?? 0} of {session.participants.length} decisions locked</p><div className="room-options">{call.options.map((o) => <div className="blade" key={o.option_key}><b>{o.option_key.split("-")[1]}</b><span>{o.authorized_decision}</span></div>)}</div></>}
      {session.phase === "split" && <><div className="eyebrow">THE SPLIT · COMMITMENT EXPOSED</div><h1>The room is not aligned.</h1><VoteBars call={call} distribution={distribution} /><div className="chair-banner"><span>THE CHAIR</span><strong>{chair?.name ?? "UNASSIGNED"}</strong></div></>}
      {session.phase === "pressure" && <><div className="pressure-visual" aria-hidden="true" /><div className="pressure-content"><div className="eyebrow">COMPETING PRESSURES · BOTH ARE REAL</div><h1>They cannot both<br />get what they want.</h1><PressureVoiceCards voices={call.pressure_voices} /><p className="pressure-note">The Chair must answer the conflict—not satisfy every voice.</p></div></>}
      {session.phase === "chair" && <><DecisionClock resetKey={`${session.callIndex}-${session.phase}`} endsAt={session.countdownEndsAt} /><div className="eyebrow">CHAIR DEVICE ACTIVE · {chair?.name ?? "THE CHAIR"}</div><h1>Decision in progress.</h1><p className="chair-accountability">{chair?.name ?? "The Chair"} is choosing the action, protected priority, accepted cost, reconsideration trigger, and owner on their device. Submission commits the consequence immediately.</p><DecisionStandard /></>}
      {session.phase === "outcome" && <><div className="impact-label">DECISION COMMITTED</div><ImpactDeltas session={session} /><h1 className="consequence-copy">{session.consequence}</h1><DecisionLedger record={latestDecisionRecord(session)} /><div className="statement-record room-record">“{session.exactStatement}”</div></>}
      {session.phase === "monday" && <><div className="monday-time"><span>FRIDAY</span><i /><strong>72 HOURS</strong><i /><span>MONDAY</span></div><div className="eyebrow">ACCOUNTABILITY ARRIVES</div><h1>{scenario.close.transition_72_hour}</h1><p>The facts have settled. The language has not.</p></>}
      {session.phase === "final" && session.status !== "closed" && <><div className="ronin-seal final-seal"><i /><b>責</b></div><div className="eyebrow">THE MONDAY AFTER · ON THE RECORD</div><h1 className="consequence-copy">{session.consequence}</h1><div className="statement-record room-record">“{session.exactStatement}”</div><p>{scenario.monday_after.questions.universal}</p></>}
      {session.status === "closed" && <ExecutiveDebrief session={session} projection />}
    </section>
    <footer className="room-footer"><MeterRail session={session} /><span className="screen-id">{session.screenId}</span></footer>
  </main>;
}

function JoinCode({ title, onSubmit }: { title: string; onSubmit: (code: string) => void }) { const [value, setValue] = useState(""); return <main className="center-shell"><Brand /><div className="launch-card"><div className="eyebrow">THE TRUSTED PATH</div><h1>{title}</h1><label>Room code<input value={value} onChange={(e) => setValue(e.target.value.toUpperCase())} maxLength={4} placeholder="AB12" /></label><button className="button primary" onClick={() => onSubmit(value)} disabled={value.length < 4}>Connect</button></div></main>; }

function ChairChoice({ step, label, choices, value, onChange }: { step: string; label: string; choices: Array<{ value: string; label: string; badge?: string }>; value: string; onChange: (value: string) => void }) {
  return <section className="chair-choice-group"><div className="chair-choice-heading"><b>{step}</b><strong>{label}</strong><span>{value ? "SELECTED" : "CHOOSE ONE"}</span></div><div className="chair-choice-options">{choices.map((choice) => <button type="button" key={choice.value} className={value === choice.value ? "selected" : ""} onClick={() => onChange(choice.value)}>{choice.badge && <b>{choice.badge}</b>}<span>{choice.label}</span></button>)}</div></section>;
}

function ChairDecisionForm({ session, participantId, participantKey, initialOption, reload }: { session: GameSession; participantId: string; participantKey: string; initialOption?: string; reload: () => Promise<void> }) {
  const call = scenario.calls[session.callIndex];
  const guidance = chairGuidance[session.callIndex];
  const [decision, setDecision] = useState<ChairDecisionInput>({ optionKey: initialOption ?? "", priority: "", tradeoff: "", trigger: "", owner: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const complete = Boolean(decision.optionKey && decision.priority && decision.tradeoff && decision.trigger && decision.owner);
  const statement = complete ? buildChairStatement(session.callIndex, decision) : "";
  const choose = (field: keyof ChairDecisionInput) => (value: string) => setDecision((current) => ({ ...current, [field]: value }));

  async function commit() {
    if (!complete) return;
    setBusy(true); setMessage("");
    try {
      await api({ action: "chairDecision", code: session.code, participantId, participantKey, payload: decision });
      setMessage("Decision committed. Look up—the consequence is live.");
      await reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Decision was not accepted"); }
    finally { setBusy(false); }
  }

  return <div className="phone-card chair-decision-card"><div className="chair-phone-header"><div><div className="eyebrow">YOU’RE IN THE CHAIR · {call.call_id}</div><h1>Make the call.</h1><p>Five fast selections create the executive record. Your private vote is preselected—you may change it.</p></div><div className="phone-decision-clock"><DecisionClock resetKey={`${session.callIndex}-${session.phase}`} endsAt={session.countdownEndsAt} /></div></div>
    <ChairChoice step="01" label="Governing action" value={decision.optionKey} onChange={choose("optionKey")} choices={call.options.map((option) => ({ value: option.option_key, label: option.authorized_decision, badge: option.option_key.split("-")[1] }))} />
    <ChairChoice step="02" label="What are you protecting?" value={decision.priority} onChange={choose("priority")} choices={guidance.priorities.map((value) => ({ value, label: value }))} />
    <ChairChoice step="03" label="What cost do you accept?" value={decision.tradeoff} onChange={choose("tradeoff")} choices={guidance.tradeoffs.map((value) => ({ value, label: value }))} />
    <ChairChoice step="04" label="When will you reconsider?" value={decision.trigger} onChange={choose("trigger")} choices={guidance.triggers.map((value) => ({ value, label: value }))} />
    <ChairChoice step="05" label="Who owns the risk?" value={decision.owner} onChange={choose("owner")} choices={guidance.owners.map((value) => ({ value, label: value }))} />
    <section className={`chair-statement-preview ${complete ? "complete" : ""}`}><span>YOUR EXECUTIVE RECORD</span>{complete ? <blockquote>“{statement}”</blockquote> : <p>Complete the five selections to assemble your defensible decision.</p>}</section>
    <button className="button primary full commit-action" onClick={commit} disabled={!complete || busy}>{busy ? "Committing…" : "Commit my decision"}</button><small className="commit-warning">Submission is final and immediately reveals the consequence to the room.</small>{message && <div className="vote-receipt">{message}</div>}
  </div>;
}

function Play() {
  const [code, setCode] = useQueryCode();
  const [participantId, setParticipantId] = useState("");
  const [participantKey, setParticipantKey] = useState("");
  const [name, setName] = useState("");
  const [myVote, setMyVote] = useState("");
  const [commitment, setCommitment] = useState("");
  const [commitmentSealed, setCommitmentSealed] = useState(false);
  const { session, error, reload, transport } = usePolling(code);
  const activeCallIndex = session?.callIndex;
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!code) return;
    setParticipantId(localStorage.getItem(`crucible-participant-${code}`) ?? "");
    setParticipantKey(localStorage.getItem(`crucible-participant-key-${code}`) ?? "");
  }, [code]);

  useEffect(() => {
    if (!code || activeCallIndex === undefined) return;
    setMyVote(localStorage.getItem(`crucible-vote-${code}-${activeCallIndex}`) ?? "");
  }, [code, activeCallIndex]);

  async function join() {
    try {
      setMessage("");
      const data = await api({ action: "join", code, participantId, participantKey, name });
      const id = data.participantId!;
      const key = data.participantKey ?? "";
      setParticipantId(id);
      setParticipantKey(key);
      localStorage.setItem(`crucible-participant-${code}`, id);
      if (key) localStorage.setItem(`crucible-participant-key-${code}`, key);
      else localStorage.removeItem(`crucible-participant-key-${code}`);
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not join");
    }
  }

  async function ready() {
    try {
      await api({ action: "ready", code, participantId, participantKey });
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not update readiness");
    }
  }

  async function vote(optionKey: string) {
    try {
      await api({ action: "vote", code, participantId, participantKey, optionKey });
      setMyVote(optionKey);
      if (session) localStorage.setItem(`crucible-vote-${code}-${session.callIndex}`, optionKey);
      setMessage("Vote locked. Look up—the room is live.");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Vote not accepted");
    }
  }

  async function sealCommitment() {
    try {
      await api({ action: "commitment", code, participantId, participantKey, commitment });
      setCommitmentSealed(true);
      setMessage("Commitment sealed. Return your attention to the room debrief.");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Commitment not accepted");
    }
  }

  if (!code) return <JoinCode title="Enter the Crucible" onSubmit={setCode} />;
  const participant = session?.participants.find((item) => item.id === participantId);
  const call = session ? scenario.calls[session.callIndex] : null;

  if (!participantId || !participant) {
    return <main className="phone-shell">
      <Brand />
      <div className="phone-card join-phone-card">
        <div className="eyebrow">ROOM {code}</div>
        <h1>Take your seat.</h1>
        <p className="phone-privacy-copy">Your vote is private. The shared screen receives only the room’s aggregate split after voting closes.</p>
        <label>First name or seat label<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Seat 7" maxLength={28} autoComplete="nickname" /></label>
        <button className="button primary full" onClick={join} disabled={!name.trim()}>Join the Council</button>
        <div className="phone-transport"><Connection error={error} /><span>{transport === "realtime" ? "SECURE REALTIME" : "LOCAL SESSION"}</span></div>
        {message && <p className="alert">{message}</p>}
      </div>
    </main>;
  }

  if (!participant.ready) {
    return <main className="phone-shell">
      <Brand />
      <div className="phone-card">
        <div className="eyebrow">PRIVATE VOTE · PUBLIC CHAIR</div>
        <h1>Ready to decide before certainty arrives?</h1>
        <p>Keep your eyes on the room. Your phone is only the control surface. No individual vote appears on the projector or facilitator console.</p>
        <button className="button primary full" onClick={ready}>I’m ready</button>
      </div>
    </main>;
  }

  if (session?.phase === "voting" && call) {
    return <main className="phone-shell">
      <Brand />
      <div className="phone-card vote-card">
        <div className="phone-vote-heading">
          <div><div className="eyebrow">{call.call_id} · PRIVATE COMMITMENT</div><h1>Choose your call.</h1></div>
          <DecisionClock resetKey={`${session.callIndex}-${session.phase}`} endsAt={session.countdownEndsAt} duration={15} />
        </div>
        {call.options.map((option) => <button key={option.option_key} className={`phone-option blade ${myVote === option.option_key ? "selected" : ""}`} onClick={() => vote(option.option_key)}><b>{option.option_key.split("-")[1]}</b><span>{option.authorized_decision}</span></button>)}
        <small className="private-vote-note">You can change your vote while the clock is open. Only your latest choice is counted.</small>
        {message && <div className="vote-receipt">{message}</div>}
      </div>
    </main>;
  }

  if (session?.phase === "chair" && session.chairId === participantId) {
    return <main className="phone-shell chair-phone-shell"><Brand /><ChairDecisionForm key={`${session.callIndex}-${participantId}`} session={session} participantId={participantId} participantKey={participantKey} initialOption={myVote} reload={reload} /></main>;
  }

  if (session?.status === "closed") {
    return <main className="phone-shell">
      <Brand />
      <div className="phone-card transfer-card">
        <div className="eyebrow">DEVELOPMENT TRANSFER</div>
        <h1>Carry one practice forward.</h1>
        <p>This is not a score. Name the decision discipline you will make visible the next time pressure arrives.</p>
        <label>In my next pressured decision, I will make…<textarea value={commitment} onChange={(event) => setCommitment(event.target.value)} maxLength={180} placeholder="the accepted tradeoff explicit before we commit" disabled={commitmentSealed} /></label>
        <button className="button primary full" onClick={sealCommitment} disabled={!commitment.trim() || commitmentSealed}>{commitmentSealed ? "Commitment sealed" : "Seal my commitment"}</button>
        {message && <div className="vote-receipt">{message}</div>}
        <small>Private to the facilitator. No individual judgment profile is created.</small>
      </div>
    </main>;
  }

  return <main className="phone-shell">
    <Brand />
    <div className="phone-card waiting">
      <Connection error={error} />
      <div className="energy-mark" />
      <h1>Look up.</h1>
      <p>The room is live. Your next private commitment will appear here.</p>
      <small>{session?.screenId} · {transport === "realtime" ? "REALTIME" : "SYNC"}</small>
    </div>
  </main>;
}

function Simulator() {
  const fixtures = (testJson as { rules_fixtures: Array<{ test_id: string; name: string; steps: Array<{ call_id: string; option: string; inputs: Record<string, unknown>; hesitation?: boolean }>; expected_after_call4: { visible: MeterState }; expected_monday: { final_visible: MeterState } }> }).rules_fixtures;
  const [selected, setSelected] = useState("T2");
  const result = useMemo(() => {
    const fixture = fixtures.find((item) => item.test_id === selected)!;
    let session = createSession("DEMO", "simulator");
    session.status = "running";
    for (const step of fixture.steps) {
      session.callIndex = Number(step.call_id.slice(1)) - 1;
      const judgment = { ...defaultJudgment, ...(step.inputs.judgment as Partial<Judgment> ?? {}) };
      session = resolveDecision(session, { optionKey: step.option, statement: `${step.option}: simulated defensible executive statement.`, judgment, inputs: step.inputs, hesitation: step.hesitation });
    }
    return { fixture, session };
  }, [fixtures, selected]);
  const pass = JSON.stringify(result.session.visible) === JSON.stringify(result.fixture.expected_after_call4.visible);
  return <main className="sim-shell"><header className="app-header"><Brand compact /><Link href="/host" className="button secondary small">Open live console</Link></header><section className="sim-hero"><div><div className="eyebrow">DETERMINISTIC PATH LAB</div><h1>See the engine<br />before the room arrives.</h1><p>Run the five canonical decision trails and compare the calculated state with the approved fixture.</p></div><div className={`status-orb ${pass ? "pass" : "fail"}`}><strong>{pass ? "PASS" : "CHECK"}</strong><span>{selected}</span></div></section><section className="sim-grid"><div className="panel"><h2>Acceptance path</h2><div className="fixture-tabs">{fixtures.map((fixture) => <button key={fixture.test_id} className={selected === fixture.test_id ? "active" : ""} onClick={() => setSelected(fixture.test_id)}>{fixture.test_id}</button>)}</div><h3>{result.fixture.name}</h3>{result.fixture.steps.map((step) => <div className="sim-step" key={step.call_id}><span>{step.call_id}</span><b>{step.option}</b></div>)}</div><div className="panel"><h2>Calculated state after Call 4</h2><MeterRail session={result.session} /><div className="compare"><span>Expected {JSON.stringify(result.fixture.expected_after_call4.visible)}</span><span>Actual {JSON.stringify(result.session.visible)}</span></div></div><div className="panel"><h2>Hidden debt</h2><div className="debt-big"><span>EXPOSURE <b>{result.session.debt.exposure}</b></span><span>TRUST <b>{result.session.debt.trust}</b></span><span>EVIDENCE <b>{result.session.debt.evidence}</b></span><span>ALIGNMENT <b>{result.session.debt.alignment}</b></span></div></div></section></main>;
}

export default function CrucibleClient({ surface }: { surface: Surface }) {
  if (surface === "host") return <Host />;
  if (surface === "room") return <Room />;
  if (surface === "play") return <Play />;
  if (surface === "simulator") return <Simulator />;
  return <Landing />;
}
