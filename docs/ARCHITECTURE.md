# Judgment Crucible Architecture

## Objective

Judgment Crucible needs Jackbox-style immediacy without giving every browser authoritative access to the game. The architecture therefore separates command, identity, authoritative state, and realtime presentation.

## Trust zones

### 1. Authoritative server

All state-changing game actions go through `app/api/session/route.ts`:

- session creation,
- join,
- ready state,
- vote submission,
- facilitator advancement,
- Chair assignment,
- Chair commitment,
- facilitator manual vote input,
- final participant commitment.

The API loads private state, applies deterministic game rules, and persists the result. A browser never writes directly to private game state.

### 2. Private session state

`privateSessions/{roomCode}` contains the authoritative `GameSession`. It can include state that must not reach general participants: host credential, participant access material in local fallback mode, individual votes, internal flags, debt, event detail, and private commitments.

Realtime Database rules do not expose this path to browser clients.

### 3. Public realtime projection

After every persisted mutation, `lib/session-store.ts` derives a sanitized projection using `publicSession()` and atomically writes it to `publicSessions/{roomCode}`.

Production browsers subscribe to that path for room-level realtime changes. This is intentionally a projection, not a second source of truth.

The public projection never contains:

- participant access keys,
- vote attribution,
- private commitments,
- host key,
- internal rule flags,
- raw event log,
- hidden debt,
- hidden vendor-connection state.

Vote totals are exposed only in phases where the room is meant to see the split.

### 4. Facilitator projection

The facilitator fetches `hostSession()` through the authenticated host API. It contains controls and facilitator-useful internal state, but still strips individual participant vote choices. There is no operational need for the facilitator UI to know who voted for which option.

### 5. Participant-local choice state

A participant's current vote is held locally on their phone so the interface can show “your choice” without requiring vote attribution in the public room projection.

In production, participant authorization uses the Firebase anonymous UID. In local fallback mode, a high-entropy per-participant key provides equivalent development semantics.

## Realtime transport

Production clients attempt Firebase Realtime Database subscription first. If Firebase is unavailable — for example during a zero-config local demo — the UI falls back to the Next.js session API polling transport. The product surfaces the active transport in the facilitator and participant UI for diagnostics.

The realtime database improves presentation latency; it does not change authorization. Commands still go through the server.

## Authentication

The client signs in with Firebase Anonymous Authentication. The ID token is passed to the Next.js API as a Bearer token. `lib/firebase/admin.ts` verifies it server-side.

This gives each phone a stable session identity without requiring email, password, or a registration flow during a live workshop.

When `REQUIRE_APP_CHECK=true`, the API also verifies the Firebase App Check token. The browser can initialize reCAPTCHA Enterprise App Check from `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY`.

## Local development mode

If Firebase managed-runtime configuration is absent, `lib/session-store.ts` uses atomic local JSON files under `.local-data/sessions`. This is deliberate:

- contributors can run the complete experience without cloud setup,
- deterministic tests remain easy to execute,
- the same server privacy projections are exercised locally,
- the UI fallback transport remains covered.

Local mode is not intended as a horizontally scaled production store.

## State machine

The scenario moves through a controlled state machine:

```text
lobby
  → briefing
  → voting
  → split
  → pressure
  → chair
  → outcome
  → (next call / monday)
  → monday
  → final
  → closed
```

The facilitator controls pacing; the Chair controls only the decision payload during the Chair phase. Server-side action validation prevents clients from skipping arbitrary state transitions.

## Scenario engine

`shared/game.ts` is the reusable deterministic engine. `spec/trusted-path-v2/trusted-path.v2.json` supplies content and rule data.

The separation matters commercially: scenario IP can evolve independently of the multiplayer shell, and every new scenario can be shipped with deterministic fixtures that prove expected consequences.

## Scaling model

The intended room size is small and interaction-heavy, typically 6–15 participants. Firebase Realtime Database fan-out is therefore focused on low-latency room state rather than high-volume broadcast traffic.

Next.js API instances remain stateless in production because authoritative persistence lives in Firebase. Firebase App Hosting can scale the server independently of the room clients.

## Failure behavior

- A participant reload can recover their Firebase anonymous identity and room state.
- The shared display is read-only and can be refreshed without mutating the scenario.
- If a public realtime subscription fails, the client falls back to API refresh behavior.
- Mutations are server-authorized and saved before public state is republished.
- Scenario consequences are deterministic; no external LLM is required to finish a live game.

That final point is intentional. A conference-room exercise should not become unavailable because an AI provider is slow or down.
