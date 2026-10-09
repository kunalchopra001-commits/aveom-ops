#!/usr/bin/env node
/**
 * One-time setup: create the Production Manager (admin) account.
 *
 *   cd functions
 *   node scripts/create-admin.mjs
 *
 * Needs a service-account key for the Firebase project, saved as
 * functions/serviceAccountKey.json (gitignored) or pointed to by
 * GOOGLE_APPLICATION_CREDENTIALS. Delete the key file when you're done.
 *
 * Everything else (other users, permissions, passwords) is done in the app.
 */
import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const USERNAME_DOMAIN = "users.aveom-ops.invalid"; // keep in sync with shared/index.ts

const keyPath = new URL("../serviceAccountKey.json", import.meta.url);
const credential = existsSync(keyPath)
  ? cert(JSON.parse(readFileSync(keyPath, "utf8")))
  : applicationDefault();
initializeApp({ credential });

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const ask = (q) => new Promise((res) => rl.question(q, (a) => res(a.trim())));
const askHidden = (q) =>
  new Promise((res) => {
    const write = rl._writeToOutput;
    rl._writeToOutput = (s) => (s.includes(q) ? write.call(rl, s) : write.call(rl, "*"));
    rl.question(q, (a) => {
      rl._writeToOutput = write;
      process.stdout.write("\n");
      res(a);
    });
  });

const db = getFirestore();
const existing = await db.collection("users").where("role", "==", "admin").limit(1).get();
if (!existing.empty) {
  const a = existing.docs[0].data();
  console.log(`An admin already exists: ${a.displayName} (@${a.username}). Nothing to do.`);
  process.exit(0);
}

const username = (await ask("Your username (e.g. kunal): ")).toLowerCase();
if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
  console.error("Usernames are 3–30 characters: letters, numbers, dot, dash or underscore.");
  process.exit(1);
}
const displayName = await ask("Your full name: ");
const password = await askHidden("Choose a password (min 8 characters): ");
if (password.length < 8) {
  console.error("Password too short.");
  process.exit(1);
}
const petty = (await ask("Will you also receive petty cash yourself? (y/n): ")).toLowerCase().startsWith("y");
const shifts = (await ask("Will you also log your own shifts? (y/n): ")).toLowerCase().startsWith("y");
rl.close();

const rec = await getAuth().createUser({
  email: `${username}@${USERNAME_DOMAIN}`,
  password,
  displayName,
});
await getAuth().setCustomUserClaims(rec.uid, { role: "admin", shifts, petty });
const now = Date.now();
await db.collection("users").doc(rec.uid).set({
  uid: rec.uid,
  username,
  displayName,
  role: "admin",
  perms: { shifts, petty },
  active: true,
  claimsVersion: 1,
  createdAt: now,
  createdBy: "setup-script",
  updatedAt: now,
});
await db.collection("logs_activity").doc(`act_setup_${now}`).set({
  id: `act_setup_${now}`,
  at: now,
  action: "user.create",
  actorUid: "setup-script",
  actorName: "Setup script",
  actorRole: "admin",
  targetId: rec.uid,
  summary: `Created Production Manager ${displayName} (@${username})`,
  before: null,
  after: null,
});

console.log(`\nDone. Sign in to the app as “${username}”.`);
console.log("Now delete functions/serviceAccountKey.json — it's a full admin credential.");
process.exit(0);
