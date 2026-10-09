/**
 * One-time setup for a LIVE Firebase project:
 *   - ensures the three manager accounts exist and gives them their role claims
 *   - sets the initial 6-digit registration code
 *   - creates a starter project list (optional)
 *
 * Requires a service account key:
 *   Firebase console -> Project settings -> Service accounts -> Generate new private key
 *   save it as  functions/serviceAccountKey.json  (already gitignored)
 *
 * Usage (from the functions/ folder):
 *   node scripts/bootstrap-prod.mjs ops@you.com founder@you.com accountant@you.com
 *
 * Any account that does not exist yet is created with a random temporary password
 * (printed once). Each manager should then use "Forgot password" on the sign-in
 * screen to set their own.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const [opsEmail, founderEmail, accountantEmail] = process.argv.slice(2);
if (!opsEmail || !founderEmail || !accountantEmail) {
  console.error(
    "usage: node scripts/bootstrap-prod.mjs <ops-email> <founder-email> <accountant-email>",
  );
  process.exit(1);
}

const key = JSON.parse(readFileSync(new URL("../serviceAccountKey.json", import.meta.url)));

const { initializeApp, cert } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore } = await import("firebase-admin/firestore");

initializeApp({ credential: cert(key), projectId: key.project_id });
const auth = getAuth();
const db = getFirestore();

const tempPw = () => randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "") + "9a";

const MANAGERS = [
  { email: opsEmail, role: "ops", name: "Operations Manager" },
  { email: founderEmail, role: "founder", name: "Founder" },
  { email: accountantEmail, role: "accountant", name: "Accountant" },
];

console.log(`\nProject: ${key.project_id}\n`);

for (const m of MANAGERS) {
  let user;
  try {
    user = await auth.getUserByEmail(m.email);
    console.log(`exists   ${m.email}`);
  } catch {
    const password = tempPw();
    user = await auth.createUser({
      email: m.email,
      password,
      displayName: m.name,
      emailVerified: true,
    });
    console.log(`created  ${m.email}   temp password: ${password}`);
  }
  await auth.setCustomUserClaims(user.uid, { role: m.role });
  await auth.revokeRefreshTokens(user.uid);
  console.log(`         -> role=${m.role}`);
}

const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
await db.collection("config").doc("registration").set({
  code,
  updatedAt: Date.now(),
  updatedBy: "bootstrap",
});
console.log(`\nregistration code: ${code}  (rotate any time from the console -> Projects)`);

const STARTER_PROJECTS = process.env.PROJECTS
  ? process.env.PROJECTS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];
for (const name of STARTER_PROJECTS) {
  const dup = await db.collection("projects").where("name", "==", name).limit(1).get();
  if (!dup.empty) continue;
  const id = "prj_" + Math.random().toString(36).slice(2, 10);
  await db.collection("projects").doc(id).set({
    id,
    name,
    locked: false,
    createdBy: "bootstrap",
    createdAt: Date.now(),
  });
  console.log(`project  ${name}`);
}

console.log("\nDone. Managers: sign in, then use 'Forgot password' to set your own password.");
console.log("Delete functions/serviceAccountKey.json when you no longer need it.\n");
process.exit(0);
