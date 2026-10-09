import { onCall } from "firebase-functions/v2/https";
import { db } from "./firebase";
import { logAccess, userAgentOf } from "./logs";
import { COL, emailToUsername, normalizeUsername, type UserProfile } from "./shared";

/** Called by the app right after a successful sign-in. */
export const recordSignIn = onCall(async (req) => {
  if (!req.auth) return { ok: false as const };
  const snap = await db.collection(COL.users).doc(req.auth.uid).get();
  const user = snap.exists ? (snap.data() as UserProfile) : null;
  await logAccess({
    event: "sign_in",
    uid: req.auth.uid,
    username: user?.username ?? emailToUsername(req.auth.token.email),
    userName: user?.displayName,
    userAgent: userAgentOf(req),
  });
  return { ok: true as const };
});

/** Called by the app just before it signs out. */
export const recordSignOut = onCall(async (req) => {
  if (!req.auth) return { ok: false as const };
  const snap = await db.collection(COL.users).doc(req.auth.uid).get();
  const user = snap.exists ? (snap.data() as UserProfile) : null;
  await logAccess({
    event: "sign_out",
    uid: req.auth.uid,
    username: user?.username ?? emailToUsername(req.auth.token.email),
    userName: user?.displayName,
    userAgent: userAgentOf(req),
  });
  return { ok: true as const };
});

/**
 * Called (unauthenticated) when a sign-in attempt fails, so the Production Manager
 * can see wrong-password attempts. Only the typed username is recorded — never the password.
 */
export const recordSignInFailed = onCall(async (req) => {
  const raw = typeof req.data?.username === "string" ? req.data.username : "";
  const username = normalizeUsername(raw).replace(/[^a-z0-9._@-]/g, "").slice(0, 40);
  if (!username) return { ok: false as const };
  const match = await db.collection(COL.users).where("username", "==", username).limit(1).get();
  const user = match.empty ? null : (match.docs[0].data() as UserProfile);
  await logAccess({
    event: "sign_in_failed",
    uid: user?.uid,
    username,
    userName: user?.displayName ?? "(no such user)",
    userAgent: userAgentOf(req),
  });
  return { ok: true as const };
});
