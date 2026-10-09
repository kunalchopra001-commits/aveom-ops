/**
 * Seed the local emulator suite with the three manager accounts, a registration
 * code, and a few sample projects.
 *
 * Run with the emulators already running:
 *   npm run seed         (from the repo root)
 *
 * Manager logins created (password: password123):
 *   ops@aveom.test         role: ops
 *   founder@aveom.test     role: founder
 *   accountant@aveom.test  role: accountant
 */
process.env.GCLOUD_PROJECT ||= "aveom-time-dev";
process.env.GOOGLE_CLOUD_PROJECT ||= "aveom-time-dev";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= "127.0.0.1:9199";

const { initializeApp } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore } = await import("firebase-admin/firestore");

initializeApp({ projectId: "aveom-time-dev" });
const auth = getAuth();
const db = getFirestore();

const MANAGERS = [
  { email: "ops@aveom.test", role: "ops", name: "Ops Manager" },
  { email: "founder@aveom.test", role: "founder", name: "Founder" },
  { email: "accountant@aveom.test", role: "accountant", name: "Accountant" },
];

for (const m of MANAGERS) {
  let user;
  try {
    user = await auth.getUserByEmail(m.email);
  } catch {
    user = await auth.createUser({
      email: m.email,
      password: "password123",
      displayName: m.name,
      emailVerified: true,
    });
  }
  await auth.setCustomUserClaims(user.uid, { role: m.role });
  console.log(`manager  ${m.email.padEnd(24)} role=${m.role}  uid=${user.uid}`);
}

await db.collection("config").doc("registration").set({
  code: "424242",
  updatedAt: Date.now(),
  updatedBy: "seed",
});
console.log("registration code: 424242");

const PROJECTS = ["Marina Tower Fit-out", "DIFC Lobby Refurb", "Yas Mall Kiosk"];
for (const name of PROJECTS) {
  const existing = await db.collection("projects").where("name", "==", name).limit(1).get();
  if (!existing.empty) continue;
  const id = "prj_" + Math.random().toString(36).slice(2, 10);
  await db.collection("projects").doc(id).set({
    id,
    name,
    locked: false,
    createdBy: "seed",
    createdAt: Date.now(),
  });
  console.log(`project  ${name}`);
}

console.log("\nSeed complete.");
process.exit(0);
