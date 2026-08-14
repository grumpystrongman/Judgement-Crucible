# Production Deployment — Firebase App Hosting

## Target platform

Judgment Crucible is designed for Firebase App Hosting with:

- Next.js server/runtime,
- Firebase Anonymous Authentication,
- Firebase Realtime Database,
- optional reCAPTCHA Enterprise-backed Firebase App Check.

## Firebase project setup

1. Create a Firebase project for the intended environment.
2. Enable Authentication → Sign-in method → Anonymous.
3. Create a Realtime Database.
4. Install the Firebase CLI and deploy `database.rules.json`.
5. In Firebase App Hosting, create a backend connected to `grumpystrongman/Judgement-Crucible`.
6. Select `main` as the live branch after CI is green.
7. Configure the custom domain.

## Environment variables

App Hosting automatically supplies its managed Firebase runtime configuration. The application can also be run in a manually configured environment using `.env.example`.

For production, set:

```text
REQUIRE_APP_CHECK=true
NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY=<your-key>
NEXT_PUBLIC_SITE_URL=https://<your-production-domain>
```

If App Check is not yet configured, rehearse with it disabled, then enable it before broad external access.

## Database rules

Deploy:

```bash
firebase deploy --only database
```

Expected policy:

- `publicSessions`: authenticated read, no browser write
- `privateSessions`: no browser read or write
- everything else: denied unless explicitly added later

## Release gate

A release candidate is not ready until GitHub Actions has passed:

- ESLint,
- TypeScript,
- deterministic unit/security tests,
- scenario validation,
- Next.js production build,
- Chromium Playwright multiplayer path.

Do not bypass the privacy assertions to make a deployment green.

## Live-session rehearsal checklist

- [ ] Production domain resolves over HTTPS.
- [ ] Anonymous Auth succeeds from a fresh/incognito browser.
- [ ] Room can be created from the facilitator device.
- [ ] QR opens the correct production `/play?code=` URL.
- [ ] Two phones can join from different networks.
- [ ] Both phones receive realtime phase changes.
- [ ] Public state never exposes individual votes.
- [ ] Aggregate split appears only after voting closes.
- [ ] Chair can commit from a phone.
- [ ] Room display receives the committed consequence.
- [ ] Refreshing the room display does not mutate the game.
- [ ] Full four-call path reaches Monday After and final debrief.
- [ ] Projector layout is readable at the room's actual resolution.
- [ ] App Check is enabled and verified before public launch.

## Operational recommendation

For paid workshops, create a fresh room per cohort rather than reusing a session. Session history can later be exported into a dedicated reporting model, but the live game store should remain optimized for active facilitation rather than becoming the system of record for executive assessments.
