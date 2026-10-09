/**
 * Delete test data created while trying the app out, so the project is clean
 * before real use. Needs functions/serviceAccountKey.json.
 *
 *   node scripts/cleanup-test-data.mjs           # dry run — lists what it would delete
 *   node scripts/cleanup-test-data.mjs --commit  # actually delete
 *
 * Removes: projects whose name starts with "TEST -", employees whose email ends
 * with "@example.com" (and their shifts + Storage ID images + Auth user), and
 * every generated report. The three manager accounts are left untouched.
 */
import { readFileSync } from "node:fs";

const commit = process.argv.includes("--commit");
const key = JSON.parse(readFileSync(new URL("../serviceAccountKey.json", import.meta.url)));

const { initializeApp, cert } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore } = await import("firebase-admin/firestore");
const { getStorage } = await import("firebase-admin/storage");

initializeApp({ credential: cert(key), projectId: key.project_id, storageBucket: `${key.project_id}.firebasestorage.app` });
const db = getFirestore();
const auth = getAuth();
const bucket = getStorage().bucket();

const plan = [];

const projects = await db.collection("projects").get();
for (const d of projects.docs) {
  if (String(d.data().name).startsWith("TEST -")) plan.push({ kind: "project", ref: d.ref, label: d.data().name });
}

const employees = await db.collection("employees").get();
for (const d of employees.docs) {
  if (String(d.data().email || "").endsWith("@example.com")) {
    plan.push({ kind: "employee", ref: d.ref, uid: d.id, label: d.data().email });
    const shifts = await db.collection("shifts").where("employeeUid", "==", d.id).get();
    for (const s of shifts.docs) plan.push({ kind: "shift", ref: s.ref, label: `${d.data().email} ${s.data().startAt}` });
  }
}

const reports = await db.collection("reports").get();
for (const d of reports.docs) plan.push({ kind: "report", ref: d.ref, path: d.data().storagePath, label: d.data().fileName });

const audit = await db.collection("auditLog").get();
for (const d of audit.docs) plan.push({ kind: "audit", ref: d.ref, label: d.data().action });

console.log(`\n${commit ? "DELETING" : "DRY RUN — would delete"} ${plan.length} item(s):\n`);
for (const p of plan) console.log(`  ${p.kind.padEnd(9)} ${p.label}`);

if (!commit) {
  console.log("\nRe-run with --commit to delete.\n");
  process.exit(0);
}

for (const p of plan) {
  await p.ref.delete();
  if (p.kind === "employee") {
    await auth.deleteUser(p.uid).catch(() => {});
    await bucket.file(`eid/${p.uid}/front`).delete({ ignoreNotFound: true }).catch(() => {});
    await bucket.file(`eid/${p.uid}/back`).delete({ ignoreNotFound: true }).catch(() => {});
  }
  if (p.kind === "report" && p.path) {
    await bucket.file(p.path).delete({ ignoreNotFound: true }).catch(() => {});
  }
}
console.log("\nDone.\n");
process.exit(0);
