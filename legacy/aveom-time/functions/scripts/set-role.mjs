/**
 * Assign a role claim to an existing user — used to set up the three manager
 * accounts against a LIVE Firebase project.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
 *   node scripts/set-role.mjs founder@example.com founder
 *
 * Roles: ops | founder | accountant | employee
 */
const [, , email, role] = process.argv;

if (!email || !["ops", "founder", "accountant", "employee"].includes(role)) {
  console.error("usage: node scripts/set-role.mjs <email> <ops|founder|accountant|employee>");
  process.exit(1);
}

const { initializeApp, applicationDefault } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");

initializeApp({ credential: applicationDefault() });
const auth = getAuth();

const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { role });
await auth.revokeRefreshTokens(user.uid);

console.log(`${email} -> role=${role} (uid ${user.uid}). They must sign out and in again.`);
process.exit(0);
