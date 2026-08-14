# Security and Privacy

Judgment Crucible is a leadership simulation about cyber risk. Its own multiplayer privacy model therefore needs to be explicit and testable.

## Security invariants

The following are release requirements, not UI preferences:

1. An ordinary participant must never receive another participant's access credential.
2. Public room state must never contain a `participant → vote` mapping.
3. The facilitator must not receive vote attribution merely because they control the room.
4. Aggregate vote distribution is not revealed before the scenario reaches the reveal phase.
5. Browsers cannot write directly to authoritative Firebase game state.
6. Facilitator actions require the session host credential.
7. Participant actions require the participant's production Firebase UID (or the development fallback key in local mode).
8. A Chair decision can be submitted only by the active Chair during the Chair phase.
9. Scenario state transitions are validated server-side.
10. Private participant commitments are not placed in public realtime state.

`tests/product.test.mjs`, `tests/firebase.test.mjs`, and the Playwright multiplayer test enforce these boundaries.

## Firebase security model

`database.rules.json` denies access by default.

Browser clients may read only `publicSessions/{room}` and only while authenticated. All browser writes to session state are denied. The Next.js server uses Firebase Admin credentials to read/write authoritative state.

For production, enable anonymous Firebase Authentication and set:

```bash
REQUIRE_APP_CHECK=true
NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY=<site-key>
```

App Check is defense-in-depth against automated abuse; it does not replace Authentication or server authorization.

## Vote privacy

A private vote is not private if the server sends it to every browser and CSS merely hides it.

Judgment Crucible sanitizes at serialization time:

- authoritative private session: may contain the vote,
- host projection: vote removed,
- public projection: vote removed,
- participant UI: remembers its own choice locally.

When the vote closes, a separate aggregate `voteSummary` can be revealed. The aggregate contains counts per option, not participant attribution.

## Sensitive data expectations

The product is designed to operate without collecting sensitive corporate incident data. Scenarios should use fictionalized or intentionally prepared training content.

Participant display names may be personally identifying. Organizations with stricter privacy requirements can instruct participants to use first names, initials, or assigned aliases.

Do not place secrets, production incident evidence, credentials, PHI, PCI data, or confidential customer information in scenario text or participant commitments unless the deployment has been separately reviewed for that use.

## Secrets

Never commit:

- service-account JSON,
- Firebase Admin private keys,
- production API credentials,
- custom-domain DNS credentials.

Firebase App Hosting should use application-default server credentials. Public Firebase browser configuration is not a server secret; authorization must remain enforced by rules and server validation.

## Headers

`next.config.ts` sets baseline browser security headers including frame denial, MIME sniffing prevention, referrer policy, permissions policy, and cross-origin opener policy.

A deployment behind additional CDN/WAF controls may add a Content Security Policy after confirming Firebase and App Check endpoints required by the production configuration.

## Reporting a vulnerability

Until a dedicated security contact is configured, do not publish exploit details in a public issue. Contact the repository owner privately and include reproduction steps, affected routes, and the smallest proof needed to demonstrate impact.
