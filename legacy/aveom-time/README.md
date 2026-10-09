# AVEOM TIME

Offline-first web app for logging part-time site-crew hours in the UAE, with a
management console for approvals, corrections, and payroll-ready Excel reports.

See the build spec: <https://claude.ai/code/artifact/623d186e-9ae7-4c20-9559-063ec77fc125>

## Layout

```
shared/            Domain module — types, wage/rounding maths, validation.
                   Imported as source by the web app and bundled into functions.
apps/web/          React + Vite PWA. Employee app at "/", manager console at "/admin".
functions/         Firebase Cloud Functions (asia-south1): registration, approvals,
                   projects, shift edits, OCR trigger, reports, scheduled ID purge.
firestore.rules    Security rules (roles held in the auth token).
storage.rules      Emirates ID images + report files.
```

## Local development

Prerequisites: Node 20+, a JDK (for the Firestore/Storage emulators), and the
Firebase CLI (`npm i -g firebase-tools`).

```bash
npm run install:all          # installs apps/web + functions
npm --prefix functions run build

# terminal 1 — emulator suite (Auth, Firestore, Functions, Storage, UI on :4000)
npm run emulators

# terminal 2 — seed managers + registration code + sample projects
npm run seed

# terminal 3 — the web app (http://localhost:5173)
npm run dev
```

Seeded manager logins (password `password123`): `ops@aveom.test`,
`founder@aveom.test`, `accountant@aveom.test`. Registration code: `424242`.

For the Emirates ID OCR to run locally, copy `functions/.secret.local.example`
to `functions/.secret.local` and add your `OPENAI_API_KEY`.

## Build status

| Area | State |
|---|---|
| Scaffold, auth, roles, security rules | ✅ Phase 0–1 |
| Registration + 6-digit code + approvals | ✅ |
| Employee onboarding + profile lock/unlock | ✅ |
| Projects + registration-code rotation | ✅ |
| Admin: employees, shift table + edit/delete, audit log | ✅ |
| Emirates ID OCR (OpenAI vision model) | ✅ Phase 2 |
| Offline outbox + auto-sync + conflict/flag handling | ✅ Phase 3 |
| Excel report generation (per-employee + summary sheets) | ✅ Phase 4 |
| PWA raster icons, retention monitoring, backup, deploy | ⏳ Phase 5 |
| End-to-end testing (needs JDK for emulators) | ⏳ |

See `SETUP.md` for the Firebase project + deployment steps.
