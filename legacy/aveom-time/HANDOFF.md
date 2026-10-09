# AVEOM TIME — Project Handoff

Single-document summary of everything decided, built, deployed, and tested so far, so a new
Claude chat can pick up development with just this file and the repo folder.

> **Folder:** `C:\aveom time 2` (note: spaces, not underscores — it is NOT `c:/aveom_time_2`).
> **Git:** clean tree, 9 commits, latest `2c02080`. **Live:** https://aveom-time-2.web.app
> **Last session ended:** 2026-09-07. Everything below was true at that point.

---

## 1. What this is

**AVEOM TIME** — an offline-first web app (PWA) for an operations manager in the UAE to record
**part-time, non-contracted site crew's work hours** across projects, and to produce payroll-ready
Excel reports. Crew often have no Wi-Fi/mobile data on site, so shift entry must work fully offline
and sync later.

- Employees: install via browser link ("Add to Home Screen"), register, onboard once (contact,
  Emirates ID photos, bank details), then log shifts.
- Managers (3 people): approve registrations, manage projects, view/edit/delete shifts, unlock or
  block employee profiles, generate reports.
- **Not a WPS system** (temporary part-timers; no labour card, no SIF file). Crew size 1–35.
- Distribution is private (shared link + 6-digit code), not an app store.

## 2. Locked product decisions (from the requirements conversation)

| Area | Decision |
|---|---|
| Platform | **Web only** (React PWA). No native app. Android installs the PWA; iPhone uses Safari → Add to Home Screen. |
| Offline | **True offline shift entry** with a local queue (IndexedDB outbox) and conflict handling. Onboarding/profile edits are online-only by design. |
| Managers | 3 logins: **Ops Manager** and **Founder** = full access; **Accountant** = view & export only (can also approve registrations and generate/download reports; cannot edit/delete shifts, unlock/block, or change projects). |
| Registration | Employees self-register via link + a **fixed 6-digit code** (rotatable by managers). **Every signup needs manager approval** (any of the 3). |
| Auth | Email + password. Password reset = Firebase email-reset link. Employees can change their password later. |
| Onboarding fields | Working contact number; Emirates ID **front + back photos**; bank details = **account holder name, bank name, account number (optional), IBAN (required, UAE, checksum-validated)**. |
| OCR | Extract **official name, Emirates ID number, issue date, expiry date** from the ID photos. **Human in the loop**: employee confirms/corrects, manager verifies; manual fallback if unreadable. |
| Profile lock | Profile **auto-locks** once contact + both ID photos + name/ID no./issue/expiry + bank/IBAN are complete. Employee can't edit afterwards. A manager (ops/founder) grants a **one-time unlock**: employee gets one save, then it re-locks (grant expires after 48h unused). |
| Blocking | Manager can block (= terminate) an employee; login is disabled. **Emirates ID images + OCR text are auto-deleted after a 7-day grace** (hourly scheduled job). Shift/wage history is kept. |
| Wage | **Flat AED 25.00/hour**, no overtime multiplier. Rate is copied onto each shift at creation. Any special cases are handled by editing the downloaded Excel. |
| Rounding | Each shift's worked time is **rounded UP to the next half hour**: 1–29 min → 30, 31–59 min → 60. Formula `ceil(minutes/30)×30÷60`. (Raw minutes also stored.) |
| Shifts | Fields: start date, start time, end date, end time, project (dropdown of unlocked projects). Overnight shifts allowed. Soft flags (accepted, not blocked): `overlap`, `long_shift` (>16h), `locked_project` (project locked before sync), `entered_after_block`. All submitted shifts **count immediately**; managers may edit/delete (soft-delete). Employees can't edit a synced shift (they can discard/edit un-synced outbox items). |
| Projects | Name + optional code. **Lock** hides a project from employee dropdowns but keeps history; can be unlocked; never hard-deleted; renaming allowed (shifts reference project by ID). |
| Reports | One **.xlsx**: a **Summary sheet** (Table 1 by employee: name/hours/wage + grand total; Table 2 by project: project/hours/wage + grand total — both totals tie) + **one sheet per employee** with columns: shift start date, start time, shift end date, end time, total hours, wage rate, wage amount, project; and a grand-total row. **No bank details in reports.** Shifts are included by their **start date**; only employees/projects with shifts in range appear; soft-deleted excluded. Reports are stamped with generation time; edits after a download only appear in newly generated reports. Filename: `AVEOM-TIME_Timesheet_<start>_to_<end>_generated<YYYYMMDD-HHmm>.xlsx`. |
| Timezone/currency/language | Asia/Dubai (UTC+4, fixed offset), AED, English only. |
| Audit | Every manager action (approve/reject/block/unblock/unlock/correct/project changes/shift edit+delete/report generation/reg-code change) is written to an audit log. |
| ID-expiry watch | Employees list banner flags IDs expired/expiring within 30 days. Duplicate Emirates ID numbers are flagged on the OCR record. |
| UI names | App name **AVEOM TIME**; icon = deep-teal tile with a minimal clock whose ring gap forms an "A" chevron (SVG). Design: teal `#1f6f5c` accent on warm sand `#f5f2ec`; Archivo (display) + Source Serif 4 (body) + IBM Plex Mono (data); light + dark themes. |

Parked/low-priority questions (defaults were chosen, can be revisited): contact-number format edge
cases (UAE mobile preferred, international E.164 accepted as fallback); whether "request a
correction" should also email managers (currently no such feature — employees are told to ask the
ops manager to unlock); Arabic UI; account number mandatory vs optional (currently optional).

## 3. Architecture & stack

```
shared/            Domain module (types, wage + rounding maths, IBAN/contact validation,
                   shift helpers, formatting). Imported as SOURCE by the web app (Vite alias
                   `@shared`) and bundled into Functions (tsup) via functions/src/shared.ts.
apps/web/          React 18 + Vite 6 + TypeScript PWA (vite-plugin-pwa). ONE app:
                   employee UI at "/", manager console at "/admin/*" (role-routed).
functions/         Firebase Cloud Functions v2 (firebase-functions 6, Node 22), bundled by tsup.
firestore.rules / storage.rules / firestore.indexes.json / firebase.json
```

- **Firebase project: `aveom-time-2`** (Blaze plan), owner account kunalchopra001@gmail.com.
- **Everything is in `asia-south1` (Mumbai)** — the project's Firestore + default Storage bucket
  defaulted there (the original spec said asia-east1/Taiwan; Mumbai is closer to the UAE). A
  Storage-triggered function must match its bucket's region, which is why all functions are here.
  Data is **not UAE-resident** (the user accepted this).
- Web app ID: `1:307085111687:web:8716d2b83be7f0f615e322`; storage bucket
  `aveom-time-2.firebasestorage.app`. Web config lives in the gitignored
  `apps/web/.env.production` (public values; recreate with `firebase apps:sdkconfig WEB <appId>`).
- **OCR = OpenAI vision** (model `gpt-4o`, override with `OCR_MODEL` env), called from the
  `onEidUpload` Storage trigger. The key is the Firebase secret **`OPENAI_API_KEY`** (set by the
  user; Claude never saw it). Local emulator reads it from `functions/.secret.local` (gitignored).
  (Originally planned Google Vision; the user chose OpenAI.)
- Roles are **Firebase Auth custom claims** `role: ops | founder | accountant | employee`, enforced in
  Firestore/Storage rules and in every callable function.

### Cloud Functions (15, all asia-south1)
Callables: `requestRegistration` (public; checks the 6-digit code, creates Auth user + `pending`
profile), `approveRegistration`, `rejectRegistration`, `setEmployeeBlocked`, `grantProfileUnlock`,
`correctEmployeeField`, `createProject`, `setProjectLocked`, `renameProject`,
`setRegistrationCode`, `editShift`, `deleteShift`, `generateReport`.
Triggers: `onEidUpload` (Storage finalize on `eid/{uid}/{front|back}` — waits for both images, calls
OpenAI, pre-fills unconfirmed fields, sets `needsReview`, flags duplicate EID), `purgeBlockedIds`
(hourly scheduler, deletes ID images after the 7-day grace).

**Important code gotcha:** `functions/src/index.ts` must keep `import "./options";` as its FIRST
line — it calls `setGlobalOptions({ region })` before any function module is evaluated (otherwise
callables silently deploy to us-central1). `functions/src/firebase.ts` sets
`db.settings({ ignoreUndefinedProperties: true })` and `apps/web/src/firebase.ts` passes
`ignoreUndefinedProperties: true` — needed because optional fields (e.g. blank `code`,
`accountNumber`) are `undefined`.

### Firestore collections (indicative)
- `employees/{uid}`: email, status (`pending|approved|blocked`), contactNumber, officialName,
  eidNumber, eidIssueDate, eidExpiryDate (ISO), eidFrontPath/eidBackPath, `ocr` {extract, confidence,
  mrzFound, needsReview, duplicateOf…}, `bank` {accountHolderName, bankName, accountNumber?, iban},
  profileComplete, profileLocked, `unlockGrant` {grantedBy, grantedAt, expiresAt, used}, approved/
  blocked metadata, idPurgeAt/idPurgedAt, createdAt/updatedAt.
- `shifts/{uuid}` (doc id = client-generated UUID → idempotent sync): employeeUid, employeeName,
  projectId, projectName, startAt/endAt (epoch ms UTC), rawMinutes, totalHours, wageRate, wageAmount,
  flags[], enteredAt (device), createdAt, edit history, soft-delete fields.
- `projects/{id}`, `config/registration` ({code}), `auditLog/{id}`, `reports/{id}` (metadata + storage path).
- Storage: `eid/{uid}/front|back` (employee write own, managers read, delete only by function);
  `reports/{id}/<file>.xlsx` (function write, managers read).

### Offline design (spec §5, implemented)
`apps/web/src/lib/outbox.ts` (IndexedDB via `idb`, BroadcastChannel across tabs) +
`apps/web/src/sync/SyncProvider.tsx`. New shifts are written to the outbox only; the sync engine
flushes when online (triggers: mount, `online` event, tab visible, every 45 s, best-effort
Background Sync). Per entry: skip if the shift already exists server-side; re-check the project
(missing → rejected; locked → accepted + `locked_project` flag); check overlap vs the employee's
server shifts; `setDoc` with a 20 s timeout. `permission-denied` (blocked/unapproved) → entry becomes
**rejected** with a readable reason (Retry / Discard); transient errors stay pending and retry.
Projects dropdown + profile + recent shifts render from Firestore's persistent IndexedDB cache.
Header shows online/offline, "syncing…", last-synced time, pending count.

### Hosting / auto-update
`firebase.json`: `index.html` and everything default to `no-cache`; only `/assets/**` is
`immutable`. Service worker (`registerType: "prompt"`) shows an in-app **"Update now"** bar when a
new build deploys, so crew never clear cache or re-add the link; login persists across updates.
Code-split: firebase + react chunks.

## 4. Current deployment state

- Hosting, Firestore rules + indexes, Storage rules, all 15 functions: **deployed and working**.
- Storage bucket **CORS** was set via `functions/scripts/set-cors.mjs` (needed for report downloads).
- OpenAI secret set + granted to the function's service account.

### ⚠️ Cleanup the user still needs to do
1. **The 3 manager accounts use placeholder emails** — `ops@example.com`, `founder@example.com`,
   `accountant@example.com` — so "Forgot password" cannot work for them. Re-run
   `node scripts/bootstrap-prod.mjs <real ops> <real founder> <real accountant>` (from `functions/`).
   It creates the accounts (temp passwords printed once) and assigns role claims; it also rotates the
   registration code (printed). Remove/disable the placeholder users in the Firebase console after.
2. **Test data exists** in the live project: projects named `TEST - …`, employee
   `testworker1@example.com` with 2 shifts, 1 generated report, audit entries. Remove with
   `node scripts/cleanup-test-data.mjs` (dry run) then `--commit`. **Caution:** it also deletes ALL
   audit log entries and ALL reports, and any employee whose email ends `@example.com`.
3. **Delete `functions/serviceAccountKey.json`** (full admin credential; gitignored) when no longer
   needed. It is required by the scripts in `functions/scripts/`.
4. The registration code in use at test time was a test value — rotate it from the console
   (Projects page → Registration code) before sharing the link with real crew.

## 5. Operations cheat-sheet

```bash
# from C:\aveom time 2
npm run install:all                       # installs apps/web + functions deps
npm run build                             # builds web (dist) + bundles functions (lib)
npm run typecheck
npm run dev                               # vite dev server (points at emulators if VITE_USE_EMULATORS=1)

firebase deploy --only hosting
firebase deploy --only "hosting,functions,firestore:rules,firestore:indexes,storage"
firebase functions:secrets:set OPENAI_API_KEY      # interactive; user does this
firebase functions:log --only <fnName> --project aveom-time-2
```

- **PowerShell:** comma lists must be quoted: `--only "functions,hosting"`.
- In the Claude-Code session, `firebase deploy` of **functions** was blocked by the auto-approval
  classifier (production deploy) — the user ran it in their own terminal. Hosting-only and
  rules/indexes/storage deploys ran fine from the agent shell. Function deploy analysis can
  intermittently time out ("User code failed to load… Timeout after 10000") — just retry.
- **Local emulators need a JDK** (not installed on the machine; user chose to develop/test against the
  live project instead). `npm run seed` / `functions/scripts/seed.mjs` target the emulators.
- Scripts in `functions/scripts/`: `bootstrap-prod.mjs` (managers + reg code + optional `PROJECTS="A,B"`),
  `set-role.mjs`, `set-cors.mjs`, `cleanup-test-data.mjs`, `seed.mjs` (emulator).
- Redeploying the web app after changes: `npm run build` then deploy hosting; crew see the
  "Update now" prompt on next open.

## 6. What was verified (live, 2026-09-07)

Manager sign-in + role routing ✅ · add projects, rotate reg code ✅ · employee register with code →
pending → manager approve ✅ · onboarding with ID upload → OpenAI OCR trigger ran and degraded
gracefully on a junk 1×1 image (key works; **OCR accuracy on real Emirates ID photos is still
untested**) ✅ · profile auto-lock → employee tabs ✅ · shift 07:00–16:40 → 10.00 h → AED 250 ✅ ·
**offline shift queued as "pending" then auto-synced on reconnect** ✅ · admin Shifts table
(filters/totals) ✅ · audit log ✅ · report `.xlsx` (Summary + per-employee sheet; by-employee and
by-project grand totals both = AED 362.50; filename per convention) ✅ · PWA "Update now" prompt ✅.
Bugs found and fixed: undefined Firestore values, bucket CORS, region/Node/option-ordering,
hosting cache headers.

**Not yet tested:** OCR on real ID photos; reject path for a blocked employee's queued shifts;
profile unlock → re-lock round-trip; block → ID purge job; edit/delete shift from the console;
the Accountant's view-only restrictions in the UI; iPhone/Safari PWA install + offline behavior on a
real phone; password-reset email (needs real email addresses).

## 7. Known issues / polish

- My Shifts shows an **"offline copy"** chip for a moment right after a sync (Firestore
  `fromCache` flicker) — cosmetic.
- PWA manifest uses the **SVG icon only** — no rasterised 192/512/maskable PNGs yet (fine on Android,
  acceptable on iOS home screen; produce PNGs for a polished launch).
- Node 20 → 22 done; `firebase-functions` is 6.1.x (CLI warns a newer version exists; upgrading may
  have breaking changes).
- Spec artifact still mentions asia-east1 (code/docs use asia-south1).
- Admin console has no "Team"/manager-management UI — new managers are added with the CLI scripts.
- `purgeBlockedIds` health is unmonitored; no scheduled Firestore backup export.
- Employee "request a correction / request changes" button was intentionally NOT built (employees
  are told to ask the ops manager to unlock).
- Report/Shift admin pages load Firestore listeners on mount; first paint can show "Nothing logged
  yet"/empty for ~1–2 s before data arrives.

## 8. Remaining work (suggested order)

1. Do the cleanup in §4 (real manager emails, wipe test data, delete the SA key, rotate reg code).
2. **Test OCR with real Emirates ID front/back photos** and tune the prompt/model if needed
   (`functions/src/ocr.ts`; issue date is often hard to read — manual fallback exists).
3. Test the untested flows in §6 (unlock round-trip, block + rejected sync, accountant restrictions,
   shift edit/delete, a real phone on mobile data/offline).
4. **Phase 5:** rasterised PWA icons; scheduled Firestore backup export; monitoring/alerting on the
   purge job and on function errors; budget alert in GCP billing.
5. Optional features: manager-management UI, correction-request notifications (in-console and/or
   email), Arabic UI, per-employee/per-project report filters in the UI (the function already accepts
   `employeeFilter`/`projectFilter`), PDF report option, custom domain.

## 9. Working notes for the next Claude chat

- The user is an **operations manager, not a developer** — explain steps plainly, give exact
  commands, and ask before anything outward-facing/irreversible. They run interactive/production
  commands themselves in their own terminal.
- **Never handle secrets.** The user pastes their own OpenAI key at the `functions:secrets:set`
  prompt. Don't write keys/passwords into files or chat. The service-account key must stay out of git.
- Prefer testing against the live project (no JDK for emulators). Be careful: the live project is the
  "final" environment — label any test data `TEST -` / `@example.com` so `cleanup-test-data.mjs`
  can remove it.
- **Browser automation quirk** (in-app browser): `form_input` does not reliably fire React
  `onChange`. Set values with the native setter
  (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v)` + dispatch
  `input`/`change`) and submit forms with `form.requestSubmit()`; use `find` + ref clicks for plain
  buttons; wait 1–3 s after navigation before reading Firestore-backed pages. Only one Firebase login
  per browser profile at a time (sign out to switch role).
- Commit trailer used: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (follow whatever
  attribution reminder the new session gives).
- The original build spec was published as a private Claude artifact:
  https://claude.ai/code/artifact/623d186e-9ae7-4c20-9559-063ec77fc125 — this handoff supersedes it
  where they differ (region, Node 22, OpenAI OCR, final rounding rule, bank fields).
- Files worth reading first in a new chat: `HANDOFF.md` (this), `README.md`, `SETUP.md` (step-by-step
  Firebase runbook), `shared/index.ts` (all domain rules), `firestore.rules`,
  `functions/src/index.ts`, `apps/web/src/App.tsx` (routing/state gates),
  `apps/web/src/sync/SyncProvider.tsx` (offline engine).

## 10. Git history (for orientation)

```
2c02080 Storage CORS for report downloads + test-data cleanup script
8cea65b Fix: ignoreUndefinedProperties on both Firestore clients
c70ea32 Hosting cache headers: no-cache everything, immutable only /assets/**
37c9372 Fix functions region (all asia-south1) + Node 22
423211c Move all regions to asia-south1 (Mumbai)
22f2e0c Wire repo to live project aveom-time-2
8f3bbcc Add production Firebase setup: bootstrap script, env plumbing, runbook
9c6683e Phase 2–4: OpenAI ID OCR, offline outbox + sync, Excel reports
62095ef Phase 0–1: scaffold, auth, onboarding, admin console
```
