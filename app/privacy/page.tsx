import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <header className="legal-header"><Link href="/" className="legal-brand">THE JUDGMENT CRUCIBLE</Link><Link href="/host" className="button secondary small">Run a session</Link></header>
      <article className="legal-card">
        <div className="eyebrow">DATA & FACILITATION PRINCIPLES</div>
        <h1>Private votes stay private.</h1>
        <p>The Judgment Crucible is designed for leadership development, not employee scoring. Participant vote attribution, access credentials, hidden scenario debt, and the authoritative event record are excluded from the public realtime session feed.</p>
        <h2>What the room sees</h2>
        <p>The shared display receives the scenario state, participant seat names/readiness, vote count, and—only after voting closes—the aggregate option distribution. It does not receive a mapping of people to votes.</p>
        <h2>What the facilitator sees</h2>
        <p>The facilitator receives the run-of-show state, aggregate vote split, hidden scenario pressure/debt, consequence history, and post-session development commitments. The facilitator experience does not expose individual vote attribution.</p>
        <h2>What is stored</h2>
        <p>Production sessions are stored in Firebase Realtime Database behind server-admin access. A sanitized public session projection is readable only to authenticated game clients. The supplied Firebase rules deny client writes and deny all access to authoritative private sessions.</p>
        <h2>Training boundary</h2>
        <p>No total “CISO score” or personality label is produced. The debrief separates consequences, decision process, repeated room tendencies, and a participant-chosen development transfer.</p>
      </article>
    </main>
  );
}
