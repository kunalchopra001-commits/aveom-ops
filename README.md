# AVEOM OPS

**Live:** https://aveom-ops.web.app · **Case study:** [capstone/case-study.html](capstone/case-study.html)

One app for the AVEOM team: **shift hours** (works offline on site) and **petty cash**
(payments, receipts, bills and statements), with access controlled per person by the
Production Manager.

Built for the 100xEngineers C7 capstone. It combines two earlier prototypes — AVEOM TIME
(shift logging) and the Petty Cash Agent — into a single product with new access controls,
a new database and a new interface. The originals are kept in [`legacy/`](legacy/).

## Who can do what

| | Production Manager | Owner (Inaye) | Accountant | Team member |
|---|:-:|:-:|:-:|:-:|
| Create users, set passwords, grant access | ✅ | | | |
| Log own shifts (offline) | if switched on | | | if switched on |
| Receive petty cash, confirm receipt, upload bills, see own statement | if switched on | | | if switched on |
| **Send petty cash** (transfer or cash) | | ✅ | | |
| Approve / reject bills | ✅ (not own) | PM's bills only | | |
| Edit / delete shifts, manage projects | ✅ | | | |
| See all shifts, balances, payments, bills; download reports | ✅ | ✅ | ✅ | |
| **Logs** — sign-ins, acknowledgements, all activity | ✅ only | | | |

Rules are enforced on the server (Firestore/Storage security rules + Cloud Functions), not
just hidden in the UI. `tests/e2e.emulator.mjs` checks all of it (88 checks).

## How petty cash works

1. Inaye records a payment (bank transfer or cash, optional proof) to a person.
2. The person taps **"Yes, I received it"** — or **"Something's wrong"** with a note.
3. They spend it and upload the bill (photos or PDF).
4. The Production Manager approves or rejects each bill (Inaye reviews the PM's own bills).
5. **Balance = confirmed payments − approved bills.** Unconfirmed payments and pending bills
   are shown but don't move the balance.

## How shifts work

Same rules as AVEOM TIME: AED 25/hour flat, each shift rounded **up** to the next half hour,
overnight shifts allowed, soft flags for overlaps / long shifts / locked projects. Shifts are
saved on the phone first (IndexedDB outbox) and sync automatically when there's signal.

## Layout

```
shared/        Domain rules (wage maths, statements, validation) — used by app and server
apps/web/      React + Vite PWA (one app; screens depend on role + access)
functions/     Firebase Cloud Functions: users, petty cash, shifts, reports, logs
firestore.rules / storage.rules   Server-side access control
tests/         End-to-end access-control test (runs against local emulators)
legacy/        The two original apps, for reference
capstone/      Capstone case study
```

## Development

Needs Node 22+, the Firebase CLI, and a JDK 21 for the local emulators.

```bash
npm run install:all
npm test                                   # unit tests for the money + hours maths
npm --prefix functions run build
firebase emulators:start --project demo-aveom-ops
npm run seed                               # test users, password: password123
npm run dev:emu                            # http://localhost:5173 against the emulators
npm run e2e                                # 88 access-control checks
```

Going live: see [SETUP.md](SETUP.md).
