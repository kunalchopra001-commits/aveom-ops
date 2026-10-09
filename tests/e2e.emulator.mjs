#!/usr/bin/env node
/**
 * End-to-end access-control test against the LOCAL EMULATORS (seeded by
 * functions/scripts/seed-emulator.mjs). Signs in as every role and checks what
 * each one can and can't do — through the real security rules and functions.
 *
 *   EMU_AUTH=9098 EMU_FS=8085 EMU_ST=9198 EMU_FN=5003 node tests/e2e.emulator.mjs
 */
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc,
} from "firebase/firestore";
import { getStorage, connectStorageEmulator, ref, uploadBytes } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const P = {
  auth: process.env.EMU_AUTH ?? "9099",
  fs: Number(process.env.EMU_FS ?? 8080),
  st: Number(process.env.EMU_ST ?? 9199),
  fn: Number(process.env.EMU_FN ?? 5001),
};
const DOMAIN = "users.aveom-ops.invalid";
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

let pass = 0;
let fail = 0;
const ok = (name) => (pass++, console.log(`  ✔ ${name}`));
const bad = (name, e) => (fail++, console.log(`  ✘ ${name}${e ? ` — ${e.code ?? ""} ${e.message ?? e}` : ""}`));
async function expectOk(name, fn) {
  try { const r = await fn(); ok(name); return r; } catch (e) { bad(name, e); }
}
async function expectDenied(name, fn) {
  try { await fn(); bad(`${name} (was allowed!)`); } catch (e) {
    const c = String(e.code ?? "");
    if (/permission|unauthorized|denied|failed-precondition/.test(c)) ok(name); else bad(name, e);
  }
}

async function as(username) {
  const app = initializeApp({ apiKey: "demo", projectId: "demo-aveom-ops", storageBucket: "demo-aveom-ops.appspot.com" }, username + Math.random());
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${P.auth}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", P.fs);
  const st = getStorage(app);
  connectStorageEmulator(st, "127.0.0.1", P.st);
  const fns = getFunctions(app, "asia-south1");
  connectFunctionsEmulator(fns, "127.0.0.1", P.fn);
  const cred = await signInWithEmailAndPassword(auth, `${username}@${DOMAIN}`, "password123");
  const call = (name, data) => httpsCallable(fns, name)(data).then((r) => r.data);
  return { app, db, st, call, uid: cred.user.uid };
}

const today = new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
const uuid = () => crypto.randomUUID();

const kunal = await as("kunal");
const inaye = await as("inaye");
const acct = await as("accounts");
const nawaz = await as("nawaz");
const daniel = await as("daniel");
const philip = await as("philip");

console.log("\nShifts");
const startAt = Date.parse(`${today}T07:00:00+04:00`) - 86400e3;
const goodShift = (u, name, id) => ({
  id, userUid: u.uid, userName: name, projectId: "prj_seed1", projectName: "DWTC Conference",
  startAt, endAt: startAt + 580 * 60e3, rawMinutes: 580, totalHours: 10, wageRate: 25, wageAmount: 250,
  flags: [], enteredAt: Date.now(), createdAt: Date.now(), deleted: false,
});
const sid = uuid();
await expectOk("Daniel (shifts) logs a 07:00–16:40 shift = 10 h / AED 250", () => setDoc(doc(daniel.db, "shifts", sid), goodShift(daniel, "Daniel", sid)));
// Every rounding case must be accepted with the right hours, and rejected with the wrong ones.
for (const [mins, hours] of [[1, 0.5], [29, 0.5], [30, 0.5], [31, 1], [575, 10], [600, 10], [601, 10.5], [1439, 24]]) {
  const at = startAt - mins * 7 * 86400e3 / 60; // spread out so they don't overlap
  const shape = (h) => {
    const id = uuid();
    return [id, { ...goodShift(daniel, "Daniel", id), startAt: at, endAt: at + mins * 60e3, rawMinutes: mins, totalHours: h, wageAmount: h * 25 }];
  };
  const [gid, good] = shape(hours);
  await expectOk(`${mins} min rounds up to ${hours} h`, () => setDoc(doc(daniel.db, "shifts", gid), good));
  const [wid, wrong] = shape(hours + 0.5);
  await expectDenied(`${mins} min can't claim ${hours + 0.5} h`, () => setDoc(doc(daniel.db, "shifts", wid), wrong));
}
const forged = uuid();
await expectDenied("Daniel can't inflate his wage", () => setDoc(doc(daniel.db, "shifts", forged), { ...goodShift(daniel, "Daniel", forged), wageAmount: 2500 }));
await expectDenied("Daniel can't fake hours", () => setDoc(doc(daniel.db, "shifts", forged), { ...goodShift(daniel, "Daniel", forged), totalHours: 20, wageAmount: 500 }));
await expectDenied("Daniel can't log a shift as Nawaz", () => setDoc(doc(daniel.db, "shifts", forged), { ...goodShift(nawaz, "Nawaz", forged) }));
await expectDenied("Daniel can't edit his shift after syncing", () => updateDoc(doc(daniel.db, "shifts", sid), { totalHours: 12 }));
const p2 = uuid();
await expectDenied("Philip (petty only) can't log shifts", () => setDoc(doc(philip.db, "shifts", p2), goodShift(philip, "Philip", p2)));
await expectDenied("Daniel can't read Nawaz's shifts", () => getDocs(query(collection(daniel.db, "shifts"), where("userUid", "==", nawaz.uid))));
await expectOk("Accountant can read all shifts", () => getDocs(query(collection(acct.db, "shifts"), where("deleted", "==", false))));
await expectDenied("Accountant can't edit a shift", () => acct.call("editShift", { id: sid, endAt: startAt + 3600e3 }));
await expectOk("Kunal edits Daniel's shift", () => kunal.call("editShift", { id: sid, endAt: startAt + 8 * 3600e3 }));
const edited = (await getDoc(doc(kunal.db, "shifts", sid))).data();
edited?.totalHours === 8 && edited?.wageAmount === 200 ? ok("Edit recalculated 8 h / AED 200") : bad(`Edit recalculation (${edited?.totalHours} h)`);

console.log("\nPetty cash — sending money");
const t1 = uuid();
await expectOk("Inaye sends Nawaz AED 1,000 cash", () => inaye.call("sendPettyCash", { id: t1, toUid: nawaz.uid, amount: 1000, method: "cash", paidOn: today }));
await expectDenied("Kunal can't send money", () => kunal.call("sendPettyCash", { id: uuid(), toUid: nawaz.uid, amount: 50, method: "cash", paidOn: today }));
await expectDenied("Accountant can't send money", () => acct.call("sendPettyCash", { id: uuid(), toUid: nawaz.uid, amount: 50, method: "cash", paidOn: today }));
await expectDenied("Nawaz can't send money", () => nawaz.call("sendPettyCash", { id: uuid(), toUid: nawaz.uid, amount: 50, method: "cash", paidOn: today }));
await expectDenied("Inaye can't send to Daniel (no petty access)", () => inaye.call("sendPettyCash", { id: uuid(), toUid: daniel.uid, amount: 50, method: "cash", paidOn: today }).catch((e) => { throw { code: /petty/.test(e.message) ? "denied" : e.code, message: e.message }; }));
await expectDenied("Nobody writes payments directly", () => setDoc(doc(nawaz.db, "pcTransfers", uuid()), { toUid: nawaz.uid, amount: 1e6, status: "acknowledged" }));
const t2 = uuid();
await expectOk("Inaye sends Kunal AED 300 by transfer", () => inaye.call("sendPettyCash", { id: t2, toUid: kunal.uid, amount: 300, method: "transfer", paidOn: today, reference: "FT123" }));

console.log("\nPetty cash — acknowledging");
await expectDenied("Philip can't confirm Nawaz's payment", () => philip.call("respondToTransfer", { id: t1, response: "received" }));
await expectDenied("Philip can't read Nawaz's payments", () => getDoc(doc(philip.db, "pcTransfers", t1)));
await expectOk("Nawaz confirms he received it", () => nawaz.call("respondToTransfer", { id: t1, response: "received" }));
await expectDenied("…and can't confirm it twice", () => nawaz.call("respondToTransfer", { id: t1, response: "received" }));
await expectOk("Kunal disputes his transfer", () => kunal.call("respondToTransfer", { id: t2, response: "disputed", note: "Only 250 arrived" }));
await expectOk("Inaye cancels the disputed transfer", () => inaye.call("cancelTransfer", { id: t2, reason: "Re-sending correct amount" }));
await expectDenied("Inaye can't cancel a confirmed payment", () => inaye.call("cancelTransfer", { id: t1, reason: "x" }));

console.log("\nPetty cash — bills");
const b1 = uuid();
await expectOk("Nawaz uploads a bill photo", () => uploadBytes(ref(nawaz.st, `bills/${nawaz.uid}/${b1}/1-receipt.png`), PNG, { contentType: "image/png" }));
await expectDenied("Nawaz can't upload into Philip's folder", () => uploadBytes(ref(nawaz.st, `bills/${philip.uid}/${b1}/x.png`), PNG, { contentType: "image/png" }));
await expectDenied("Daniel (no petty) can't upload bills", () => uploadBytes(ref(daniel.st, `bills/${daniel.uid}/${b1}/x.png`), PNG, { contentType: "image/png" }));
await expectDenied("Only photos/PDFs allowed", () => uploadBytes(ref(nawaz.st, `bills/${nawaz.uid}/${uuid()}/x.exe`), PNG, { contentType: "application/x-msdownload" }));
await expectOk("Nawaz submits AED 120.50 bill", () => nawaz.call("submitBill", { id: b1, amount: 120.5, spentOn: today, description: "Cable ties", files: [`bills/${nawaz.uid}/${b1}/1-receipt.png`] }));
await expectDenied("Bill must reference his own uploaded files", () => nawaz.call("submitBill", { id: uuid(), amount: 5, spentOn: today, description: "Fake", files: [`bills/${philip.uid}/x/y.png`] }).catch((e) => { throw { code: "denied", message: e.message }; }));
await expectDenied("Accountant can't approve bills", () => acct.call("reviewBill", { id: b1, approve: true }));
await expectDenied("Inaye can't approve a member's bill", () => inaye.call("reviewBill", { id: b1, approve: true }));
await expectOk("Kunal approves Nawaz's bill", () => kunal.call("reviewBill", { id: b1, approve: true }));

const kb = uuid();
await uploadBytes(ref(kunal.st, `bills/${kunal.uid}/${kb}/1-r.png`), PNG, { contentType: "image/png" });
await expectOk("Kunal submits his own bill", () => kunal.call("submitBill", { id: kb, amount: 40, spentOn: today, description: "Parking", files: [`bills/${kunal.uid}/${kb}/1-r.png`] }));
await expectDenied("Kunal can't approve his own bill", () => kunal.call("reviewBill", { id: kb, approve: true }));
await expectOk("Inaye rejects Kunal's bill with a reason", () => inaye.call("reviewBill", { id: kb, approve: false, reason: "Not a work expense" }));

console.log("\nLogs + reports (Production Manager only)");
await new Promise((r) => setTimeout(r, 1500)); // let the shift trigger write its log entry
for (const [col, label] of [["logs_access", "sign-in"], ["logs_ack", "acknowledgement"], ["logs_activity", "activity"]]) {
  const snap = await expectOk(`Kunal reads the ${label} log`, () => getDocs(collection(kunal.db, col)));
  if (snap) snap.size > 0 ? ok(`  …${label} log has ${snap.size} entries`) : bad(`${label} log is empty`);
  await expectDenied(`Inaye can't read the ${label} log`, () => getDocs(collection(inaye.db, col)));
  await expectDenied(`Accountant can't read the ${label} log`, () => getDocs(collection(acct.db, col)));
}
const acts = (await getDocs(collection(kunal.db, "logs_activity"))).docs.map((d) => d.data().action);
acts.includes("shift.create") ? ok("Shift sync was logged by the trigger") : bad("shift.create not logged");
const acks = (await getDocs(collection(kunal.db, "logs_ack"))).docs.map((d) => d.data());
acks.some((a) => a.transferId === t1 && a.response === "received") && acks.some((a) => a.transferId === t2 && a.response === "disputed")
  ? ok("Ack log has this run's receipt and dispute")
  : bad("Ack log is missing this run's entries");

const period = { periodStart: today.slice(0, 8) + "01", periodEnd: today };
for (const [who, u] of [["Kunal", kunal], ["Inaye", inaye], ["Accountant", acct]]) {
  const r = await expectOk(`${who} downloads the petty cash report`, () => u.call("pettyReport", period));
  if (r && !(r.base64.length > 1000 && r.fileName.endsWith(".xlsx"))) bad("report payload");
}
await expectOk("Accountant downloads the shift report", () => acct.call("shiftReport", { periodStart: today.slice(0, 8) + "01", periodEnd: today }));
await expectDenied("Nawaz can't download reports", () => nawaz.call("pettyReport", period));
await expectDenied("Inaye can't export logs", () => inaye.call("logsReport", period));
await expectOk("Kunal exports the logs", () => kunal.call("logsReport", period));

console.log("\nUser management");
await expectDenied("Inaye can't create users", () => inaye.call("createUser", { username: "eve", displayName: "Eve", password: "password123", role: "member", perms: { shifts: true, petty: true } }));
await expectDenied("Nobody can make themselves admin", () => kunal.call("createUser", { username: "eve2", displayName: "Eve", password: "password123", role: "admin", perms: {} }).catch((e) => { throw { code: "denied", message: e.message }; }));
const created = await expectOk("Kunal creates a member with shifts only", () => kunal.call("createUser", { username: `test${Date.now() % 1e6}`, displayName: "Test Person", password: "password123", role: "member", perms: { shifts: true, petty: false } }));
if (created) {
  await expectOk("Kunal switches on petty cash for them", () => kunal.call("updateUser", { uid: created.uid, perms: { shifts: true, petty: true } }));
  await expectOk("Kunal deactivates them", () => kunal.call("setUserActive", { uid: created.uid, active: false }));
}
await expectDenied("Kunal can't deactivate himself", () => kunal.call("setUserActive", { uid: kunal.uid, active: false }).catch((e) => { throw { code: "denied", message: e.message }; }));
await expectDenied("Nawaz can't read other users", () => getDoc(doc(nawaz.db, "users", philip.uid)));
await expectDenied("Nawaz can't change his own access", () => updateDoc(doc(nawaz.db, "users", nawaz.uid), { role: "admin" }));

console.log(`\n${pass} passed, ${fail} failed`);
await Promise.all([kunal, inaye, acct, nawaz, daniel, philip].map((u) => deleteApp(u.app)));
process.exit(fail ? 1 : 0);
