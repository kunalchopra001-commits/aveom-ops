#!/usr/bin/env node
/**
 * Fill a DEMO project with a realistic month of sample data for reviewers.
 *
 *   node functions/scripts/seed-demo.mjs <demo-project-id>
 *
 * Credentials: functions/serviceAccountKey.json for the DEMO project (delete it after),
 * or the emulators when FIRESTORE_EMULATOR_HOST etc. are set.
 *
 * Safety: refuses to run against the live project, and refuses if the database
 * already has users (run it once, on an empty demo project).
 *
 * Every demo login gets the same password, which you choose at the prompt.
 */
import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const LIVE_PROJECT = "aveom-ops";
const DOMAIN = "users.aveom-ops.invalid"; // keep in sync with shared/index.ts
const projectId = process.argv[2];
if (!projectId) {
  console.error("Usage: node functions/scripts/seed-demo.mjs <demo-project-id>");
  process.exit(1);
}
if (projectId === LIVE_PROJECT) {
  console.error(`Refusing: "${LIVE_PROJECT}" is the live project. This script is for the demo copy only.`);
  process.exit(1);
}

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const keyPath = new URL("../serviceAccountKey.json", import.meta.url);
let credential;
if (!emulator) {
  credential = existsSync(keyPath) ? cert(JSON.parse(readFileSync(keyPath, "utf8"))) : applicationDefault();
  if (existsSync(keyPath)) {
    const keyProject = JSON.parse(readFileSync(keyPath, "utf8")).project_id;
    if (keyProject !== projectId) {
      console.error(`The key file is for "${keyProject}", not "${projectId}". Download the key from the DEMO project.`);
      process.exit(1);
    }
  }
}
const bucketName = process.env.DEMO_BUCKET || `${projectId}.firebasestorage.app`;
initializeApp({ ...(credential ? { credential } : {}), projectId, storageBucket: bucketName });
const auth = getAuth();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const bucket = getStorage().bucket();

if (!(await db.collection("users").limit(1).get()).empty) {
  console.error("This project already has users. The demo seed only runs on an empty project.");
  process.exit(1);
}

const password = process.env.DEMO_PASSWORD || (await askHidden("Choose ONE password for all demo logins (min 8 characters): "));
if (password.length < 8) {
  console.error("Password too short.");
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
let seed = 20261009;
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const id = (p) => `${p}${Math.floor(rnd() * 1e9).toString(36)}${Math.floor(rnd() * 1e9).toString(36)}`;
const DAY = 86400000;
const dubaiDate = (ms) => new Date(ms + 4 * 3600000).toISOString().slice(0, 10);
const at = (date, hh, mm = 0) => Date.parse(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+04:00`);
const today = dubaiDate(Date.now());
const daysAgo = (n) => dubaiDate(Date.now() - n * DAY);
const round2 = (n) => Math.round(n * 100) / 100;

const batchWrites = [];
const put = (col, docId, data) => batchWrites.push([col, docId, data]);
async function flush() {
  for (let i = 0; i < batchWrites.length; i += 400) {
    const b = db.batch();
    for (const [col, docId, data] of batchWrites.slice(i, i + 400)) b.set(db.collection(col).doc(docId), data);
    await b.commit();
  }
}

/* ------------------------------------------------------------------ */
/* people                                                              */
/* ------------------------------------------------------------------ */
const PEOPLE = [
  { username: "demo.manager", displayName: "Demo Production Manager", role: "admin", perms: { shifts: false, petty: true } },
  { username: "demo.owner", displayName: "Demo Owner", role: "owner", perms: { shifts: false, petty: false } },
  { username: "demo.accountant", displayName: "Demo Accountant", role: "accountant", perms: { shifts: false, petty: false } },
  { username: "demo.crew", displayName: "Ravi Menon", role: "member", perms: { shifts: true, petty: true }, contact: "+971501110001" },
  { username: "demo.ali", displayName: "Ali Hassan", role: "member", perms: { shifts: true, petty: false }, contact: "+971501110002" },
  { username: "demo.maria", displayName: "Maria Santos", role: "member", perms: { shifts: true, petty: true }, contact: "+971501110003" },
  { username: "demo.sam", displayName: "Sam D'Souza", role: "member", perms: { shifts: true, petty: false }, contact: "+971501110004" },
];
const U = {};
const created = Date.now() - 32 * DAY;
for (const p of PEOPLE) {
  const rec = await auth.createUser({ email: `${p.username}@${DOMAIN}`, password, displayName: p.displayName });
  await auth.setCustomUserClaims(rec.uid, { role: p.role, ...p.perms });
  U[p.username] = { ...p, uid: rec.uid };
  put("users", rec.uid, {
    uid: rec.uid,
    username: p.username,
    displayName: p.displayName,
    role: p.role,
    perms: p.perms,
    active: true,
    contactNumber: p.contact,
    notes: "Demo account — sample data only.",
    claimsVersion: 1,
    createdAt: created,
    createdBy: p.role === "admin" ? "setup-script" : "demo-seed",
    updatedAt: created,
  });
}
const mgr = U["demo.manager"], owner = U["demo.owner"];
const actor = (u) => ({ actorUid: u.uid, actorName: u.displayName, actorRole: u.role });
const activity = (u, when, action, targetId, summary) =>
  put("logs_activity", id("act_"), { id: undefined, at: when, action, ...actor(u), targetId, summary, before: null, after: null });

for (const p of PEOPLE.slice(1)) {
  activity(mgr, created + 3600000, "user.create", U[p.username].uid,
    `Created ${p.displayName} (@${p.username}) as ${{ owner: "Owner", accountant: "Accountant", member: "Team member" }[p.role]}`);
}

/* ------------------------------------------------------------------ */
/* projects                                                            */
/* ------------------------------------------------------------------ */
const PROJECTS = [
  { id: "prj_expo", name: "Expo City Gala", code: "EXP-14" },
  { id: "prj_dwtc", name: "DWTC Tech Week", code: "DW-22" },
  { id: "prj_yas", name: "Yas Island Launch", code: "YAS-03" },
  { id: "prj_wed", name: "Al Habtoor Wedding", code: "AHW-09", locked: true },
];
for (const p of PROJECTS) {
  put("projects", p.id, { id: p.id, name: p.name, code: p.code, locked: !!p.locked, createdBy: mgr.uid, createdAt: created + 7200000 });
  activity(mgr, created + 7200000, "project.create", p.id, `Created project ${p.name}`);
}

/* ------------------------------------------------------------------ */
/* shifts: ~30 days, 4 crew                                            */
/* ------------------------------------------------------------------ */
const crew = ["demo.crew", "demo.ali", "demo.maria", "demo.sam"].map((k) => U[k]);
let shiftCount = 0;
for (const c of crew) {
  for (let d = 28; d >= 0; d -= 1) {
    if (rnd() < 0.62) continue; // not every day
    const date = daysAgo(d);
    const startH = 6 + Math.floor(rnd() * 5);
    const startM = pick([0, 0, 15, 30, 45]);
    let mins = 6 * 60 + Math.floor(rnd() * 6 * 60);
    const flags = [];
    if (c.username === "demo.sam" && d === 9) { mins = 17 * 60 + 20; flags.push({ type: "long_shift" }); }
    const startAt = at(date, startH, startM);
    const endAt = startAt + mins * 60000;
    const rawMinutes = mins;
    const totalHours = Math.ceil(rawMinutes / 30) * 30 / 60;
    const proj = pick(PROJECTS.slice(0, 3));
    const sid = id("shf_");
    const shift = {
      id: sid, userUid: c.uid, userName: c.displayName, projectId: proj.id, projectName: proj.name,
      startAt, endAt, rawMinutes, totalHours, wageRate: 25, wageAmount: totalHours * 25,
      flags, enteredAt: endAt + 600000, createdAt: endAt + (d === 3 ? 30 * 3600000 : 900000), deleted: false,
    };
    if (c.username === "demo.ali" && d === 6) {
      // the manager corrected an end time
      const before = { startAt, endAt: endAt + 3600000, totalHours: totalHours + 1, wageAmount: (totalHours + 1) * 25 };
      shift.editedBy = mgr.uid;
      shift.editedAt = endAt + DAY;
      shift.editHistory = [{ by: mgr.uid, byName: mgr.displayName, at: endAt + DAY, before, after: { startAt, endAt, totalHours, wageAmount: totalHours * 25 } }];
      activity(mgr, endAt + DAY, "shift.edit", sid, `Edited ${c.displayName}'s shift: ${(totalHours + 1).toFixed(2)} h → ${totalHours.toFixed(2)} h`);
    }
    put("shifts", sid, shift);
    activity(c, shift.createdAt, "shift.create", sid,
      `Logged ${totalHours.toFixed(2)} h on ${proj.name}` + (flags.length ? ` · flags: ${flags.map((f) => f.type).join(", ")}` : ""));
    shiftCount++;
  }
}
// one overlapping pair for Maria
{
  const c = U["demo.maria"], date = daysAgo(4), p = PROJECTS[1];
  for (const [h1, h2] of [[9, 15], [14, 19]]) {
    const sid = id("shf_");
    const startAt = at(date, h1), endAt = at(date, h2), mins = (h2 - h1) * 60;
    put("shifts", sid, {
      id: sid, userUid: c.uid, userName: c.displayName, projectId: p.id, projectName: p.name, startAt, endAt,
      rawMinutes: mins, totalHours: mins / 60, wageRate: 25, wageAmount: (mins / 60) * 25,
      flags: h1 === 14 ? [{ type: "overlap", note: "Overlaps another shift you logged." }] : [],
      enteredAt: endAt + 600000, createdAt: endAt + 900000, deleted: false,
    });
    shiftCount++;
  }
}

/* ------------------------------------------------------------------ */
/* petty cash: payments                                                */
/* ------------------------------------------------------------------ */
const holders = ["demo.crew", "demo.maria", "demo.manager"].map((k) => U[k]);
const transfers = [];
function transfer(to, amount, method, daysBack, status, extra = {}) {
  const tid = id("pc_");
  const paidOn = daysAgo(daysBack);
  const sentAt = at(paidOn, 10, 30);
  const t = {
    id: tid, toUid: to.uid, toName: to.displayName, amount, method, paidOn,
    reference: method === "transfer" ? `FT${Math.floor(rnd() * 9e8 + 1e8)}` : undefined,
    note: extra.note, sentBy: owner.uid, sentByName: owner.displayName, sentAt, status,
    respondedAt: status === "acknowledged" || status === "disputed" ? sentAt + 5 * 3600000 : undefined,
    responseNote: extra.responseNote, cancelledAt: extra.cancelReason ? sentAt + DAY : undefined, cancelReason: extra.cancelReason,
  };
  put("pcTransfers", tid, t);
  transfers.push(t);
  activity(owner, sentAt, "petty.send", tid, `Sent AED ${amount.toFixed(2)} by ${method === "cash" ? "cash" : "bank transfer"} to ${to.displayName}`);
  if (status === "acknowledged" || status === "disputed") {
    put("logs_ack", id("ack_"), {
      at: t.respondedAt, transferId: tid, uid: to.uid, userName: to.displayName, amount, method,
      sentByName: owner.displayName, response: status === "acknowledged" ? "received" : "disputed", note: extra.responseNote,
    });
  }
  if (extra.cancelReason) activity(owner, t.cancelledAt, "petty.cancel", tid, `Cancelled AED ${amount.toFixed(2)} to ${to.displayName}: ${extra.cancelReason}`);
  return t;
}
transfer(U["demo.crew"], 1000, "transfer", 27, "acknowledged", { note: "Float for Expo setup" });
transfer(U["demo.crew"], 500, "cash", 12, "acknowledged");
transfer(U["demo.crew"], 300, "cash", 1, "sent", { note: "Top-up for Yas Island" });
transfer(U["demo.maria"], 800, "transfer", 20, "acknowledged");
transfer(U["demo.maria"], 400, "cash", 6, "disputed", { responseNote: "Only received AED 300" });
transfer(U["demo.maria"], 250, "cash", 15, "cancelled", { cancelReason: "Recorded twice by mistake" });
transfer(U["demo.manager"], 600, "transfer", 18, "acknowledged");

/* ------------------------------------------------------------------ */
/* petty cash: bills with receipt images                               */
/* ------------------------------------------------------------------ */
function receiptSvg(vendor, date, lines, total) {
  const rows = lines.map(([n, v], i) => `<text x="24" y="${170 + i * 30}">${esc(n)}</text><text x="296" y="${170 + i * 30}" text-anchor="end">${v.toFixed(2)}</text>`).join("");
  const y = 170 + lines.length * 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${y + 120}" viewBox="0 0 320 ${y + 120}" font-family="Courier New, monospace" font-size="16">
<rect width="100%" height="100%" fill="#fffef8"/><text x="160" y="50" text-anchor="middle" font-size="22" font-weight="700">${esc(vendor)}</text>
<text x="160" y="76" text-anchor="middle">DUBAI · TRN 100234567800003</text><text x="160" y="104" text-anchor="middle">${date}</text>
<line x1="20" y1="130" x2="300" y2="130" stroke="#000" stroke-dasharray="4 4"/>${rows}
<line x1="20" y1="${y}" x2="300" y2="${y}" stroke="#000" stroke-dasharray="4 4"/>
<text x="24" y="${y + 36}" font-size="20" font-weight="700">TOTAL AED</text><text x="296" y="${y + 36}" font-size="20" font-weight="700" text-anchor="end">${total.toFixed(2)}</text>
<text x="160" y="${y + 80}" text-anchor="middle" font-size="13">SAMPLE RECEIPT · DEMO DATA</text></svg>`;
}
function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
const BILLS = [
  { who: "demo.crew", vendor: "ACE Hardware", desc: "Cable ties and duct tape", items: [["Cable ties x4", 22], ["Duct tape x3", 25.5]], days: 25, status: "approved" },
  { who: "demo.crew", vendor: "Careem", desc: "Taxi to Expo City", items: [["Trip", 42]], days: 19, status: "approved" },
  { who: "demo.crew", vendor: "Pulutan House", desc: "Crew lunch", items: [["Meal x3", 55], ["VAT 5%", 2.75], ["Service", 3.75]], days: 10, status: "approved", aiEdited: ["spentOn"], aiDateShift: -7 },
  { who: "demo.crew", vendor: "Emarat Fuel", desc: "Van fuel", items: [["Fuel", 80]], days: 2, status: "pending" },
  { who: "demo.crew", vendor: "Al Fajer Printing", desc: "Signage printing", items: [["A1 posters x6", 90], ["VAT 5%", 4.5]], days: 1, status: "pending" },
  { who: "demo.maria", vendor: "Dragon Mart Store", desc: "Decor props", items: [["Fairy lights x5", 75], ["Hooks", 12]], days: 16, status: "approved" },
  { who: "demo.maria", vendor: "Carrefour", desc: "Water for crew", items: [["Water 24pk x4", 48]], days: 8, status: "rejected", reason: "Water is supplied by the venue — please don't buy it" },
  { who: "demo.maria", vendor: "Office Rock", desc: "Gaffer tape", items: [["Gaffer tape x2", 64]], days: 3, status: "pending", aiEdited: ["amount"], aiAmount: 46 },
  { who: "demo.manager", vendor: "RTA Parking", desc: "Parking at DWTC", items: [["Parking 4h", 40]], days: 9, status: "approved", reviewer: "owner" },
  { who: "demo.manager", vendor: "Costa Coffee", desc: "Client meeting coffee", items: [["Coffee x3", 51]], days: 2, status: "pending" },
];
let billCount = 0;
for (const b of BILLS) {
  const u = U[b.who];
  const billId = id("bill_");
  const spentOn = daysAgo(b.days);
  const amount = round2(b.items.reduce((a, [, v]) => a + v, 0));
  const path = `bills/${u.uid}/${billId}/receipt.svg`;
  const svg = receiptSvg(b.vendor.toUpperCase(), spentOn, b.items, amount);
  await bucket.file(path).save(Buffer.from(svg), { contentType: "image/svg+xml" });
  const submittedAt = at(spentOn, 18, 20) + (b.days > 3 ? DAY : 0);
  const scan = {
    amount: b.aiAmount ?? amount, currency: "AED",
    spentOn: b.aiDateShift ? dubaiDate(Date.parse(spentOn) + b.aiDateShift * DAY) : spentOn,
    vendor: b.vendor, description: b.desc, confidence: b.aiEdited ? 0.71 : 0.94, model: "gpt-4o",
    at: submittedAt - 60000, edited: b.aiEdited ?? [],
  };
  const reviewer = b.reviewer === "owner" ? owner : mgr;
  const reviewedAt = b.status !== "pending" ? submittedAt + 20 * 3600000 : undefined;
  put("pcBills", billId, {
    id: billId, uid: u.uid, userName: u.displayName, amount, spentOn, description: b.desc, vendor: b.vendor,
    files: [{ path, name: "receipt.svg", contentType: "image/svg+xml", size: svg.length }], scan,
    submittedAt, status: b.status,
    reviewedBy: reviewedAt ? reviewer.uid : undefined, reviewedByName: reviewedAt ? reviewer.displayName : undefined,
    reviewedAt, rejectReason: b.reason,
  });
  activity(u, submittedAt, "bill.submit", billId, `Submitted a bill for AED ${amount.toFixed(2)} — ${b.desc}`);
  if (reviewedAt) {
    activity(reviewer, reviewedAt, b.status === "approved" ? "bill.approve" : "bill.reject", billId,
      `${b.status === "approved" ? "Approved" : "Rejected"} ${u.displayName}'s bill for AED ${amount.toFixed(2)}${b.reason ? ` — ${b.reason}` : ""}`);
  }
  billCount++;
}

/* ------------------------------------------------------------------ */
/* sign-in log                                                         */
/* ------------------------------------------------------------------ */
const UA = {
  android: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36",
};
for (let d = 20; d >= 0; d -= 1) {
  for (const p of PEOPLE) {
    if (rnd() < 0.55) continue;
    const u = U[p.username];
    const when = at(daysAgo(d), 7 + Math.floor(rnd() * 12), Math.floor(rnd() * 60));
    const ua = p.role === "member" ? pick([UA.android, UA.iphone]) : UA.windows;
    if (rnd() < 0.08) put("logs_access", id("acc_"), { at: when - 60000, event: "sign_in_failed", username: p.username, uid: u.uid, userName: u.displayName, userAgent: ua });
    put("logs_access", id("acc_"), { at: when, event: "sign_in", username: p.username, uid: u.uid, userName: u.displayName, userAgent: ua });
  }
}
put("logs_access", id("acc_"), { at: Date.now() - 2 * DAY, event: "sign_in_failed", username: "ravi", userName: "(no such user)", userAgent: UA.android });

/* ------------------------------------------------------------------ */
// fill in log ids and write everything
for (const w of batchWrites) if (w[0].startsWith("logs_")) w[2].id = w[1];
await flush();

console.log(`\nDemo data written to ${projectId}${emulator ? " (emulator)" : ""}:`);
console.log(`  ${PEOPLE.length} people, ${PROJECTS.length} projects, ${shiftCount} shifts, ${transfers.length} payments, ${billCount} bills, plus logs.`);
console.log("\nDemo logins (all share the password you chose):");
for (const p of PEOPLE) console.log(`  ${p.username.padEnd(16)} ${p.displayName.padEnd(26)} ${p.role}`);
console.log("\nIf you used a service-account key, delete functions/serviceAccountKey.json now.");
process.exit(0);

function askHidden(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((res) => {
    const write = rl._writeToOutput;
    rl._writeToOutput = (s) => (s.includes(q) ? write.call(rl, s) : write.call(rl, "*"));
    rl.question(q, (a) => {
      rl._writeToOutput = write;
      process.stdout.write("\n");
      rl.close();
      res(a);
    });
  });
}
