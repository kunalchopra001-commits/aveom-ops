#!/usr/bin/env node
/**
 * Seed the LOCAL EMULATORS with test users + projects. Never touches a real project.
 *   (emulators running)  node functions/scripts/seed-emulator.mjs
 * Every test login uses the password `password123`.
 */
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";

const { initializeApp } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore } = await import("firebase-admin/firestore");

initializeApp({ projectId: "demo-aveom-ops" });
const auth = getAuth();
const db = getFirestore();

const PASSWORD = "password123";
const DOMAIN = "users.aveom-ops.invalid";
const people = [
  { username: "kunal", displayName: "Kunal Chopra", role: "admin", perms: { shifts: false, petty: true } },
  { username: "inaye", displayName: "Inaye", role: "owner", perms: { shifts: false, petty: false } },
  { username: "accounts", displayName: "Accountant", role: "accountant", perms: { shifts: false, petty: false } },
  { username: "nawaz", displayName: "Nawaz", role: "member", perms: { shifts: true, petty: true } },
  { username: "daniel", displayName: "Daniel", role: "member", perms: { shifts: true, petty: false } },
  { username: "philip", displayName: "Philip", role: "member", perms: { shifts: false, petty: true } },
];

for (const p of people) {
  const email = `${p.username}@${DOMAIN}`;
  const existing = await auth.getUserByEmail(email).catch(() => null);
  const rec = existing ?? (await auth.createUser({ email, password: PASSWORD, displayName: p.displayName }));
  await auth.setCustomUserClaims(rec.uid, { role: p.role, ...p.perms });
  const now = Date.now();
  await db.collection("users").doc(rec.uid).set({
    uid: rec.uid, ...p, active: true, claimsVersion: 1, createdAt: now, createdBy: "seed", updatedAt: now,
  });
  console.log(`  ${p.username.padEnd(9)} ${p.role}`);
}

for (const [i, name] of ["Expo City Gala", "DWTC Conference", "Yas Island Launch"].entries()) {
  const id = `prj_seed${i}`;
  await db.collection("projects").doc(id).set({ id, name, locked: false, createdBy: "seed", createdAt: Date.now() });
}
console.log(`Seeded ${people.length} users (password: ${PASSWORD}) and 3 projects.`);
process.exit(0);
