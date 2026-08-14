# Implementation Notes

## Production migration completed in this branch

The supplied prototype had a strong deterministic scenario engine and mature visual direction but used Cloudflare/D1 storage with periodic browser polling. The production build preserves the core game content while moving the deployment and synchronization model to Firebase-ready Next.js.

### Preserved

- Host, room, phone, and simulator surfaces
- Trusted Path four-call scenario
- Continuity / Trust / Truth model
- hidden debt and conditional consequences
- Monday After and executive debrief
- five-part Chair decision record
- existing Cyber Ronin/Judgment Crucible visual asset library

### Replaced / hardened

- Cloudflare/Vinext runtime → native Next.js runtime
- D1 session persistence → Firebase Realtime Database in production
- unauthenticated participant model → Firebase anonymous identity in production
- 900ms-only polling → Firebase realtime subscription with local fallback
- text join link → real QR join flow
- public session serialization that could expose participant votes → strict public/host projections with vote attribution removed
- manual-only validation → GitHub Actions, unit/security tests, scenario fixtures, production build, Playwright multiplayer validation, CI screenshots

## Current commercial boundaries

- One complete scenario ships today: The Trusted Path.
- The product intentionally does not produce an opaque individual CISO score.
- Firebase deployment requires the selling organization to supply/configure its Firebase project and custom domain.
- Formal company privacy terms, support contacts, telemetry policy, retention policy, and asset licensing should be finalized by the commercial owner before broad external launch.
