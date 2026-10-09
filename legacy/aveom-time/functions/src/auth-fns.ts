import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db, authAdmin, nowMs } from "./firebase";
import { requireAdmin, requireManager, assert, assertString } from "./guards";
import { writeAudit } from "./audit";
import {
  COL,
  CONFIG_DOC,
  REGISTRATION_CODE_LENGTH,
  UNLOCK_GRANT_TTL_MS,
  ID_PURGE_GRACE_MS,
  type EmployeeProfile,
} from "./shared";

const EMPLOYEE_EDITABLE_FIELDS = [
  "contactNumber",
  "officialName",
  "eidNumber",
  "eidIssueDate",
  "eidExpiryDate",
  "bank",
] as const;

/* ------------------------------------------------------------------ *
 * requestRegistration — public, gated by the shared 6-digit code
 * ------------------------------------------------------------------ */

export const requestRegistration = onCall(async (req) => {
  const email = assertString(req.data?.email, "Email").toLowerCase();
  const password = assertString(req.data?.password, "Password");
  const code = assertString(req.data?.code, "Registration code");

  assert(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), "Enter a valid email address.");
  assert(password.length >= 8, "Password must be at least 8 characters.");
  assert(
    code.length === REGISTRATION_CODE_LENGTH && /^\d+$/.test(code),
    `The registration code is ${REGISTRATION_CODE_LENGTH} digits.`,
  );

  const configSnap = await db.collection(COL.config).doc(CONFIG_DOC.registration).get();
  const expected = configSnap.exists ? (configSnap.data()?.code as string | undefined) : undefined;
  if (!expected) {
    throw new HttpsError("failed-precondition", "Registration is not open yet. Contact your manager.");
  }
  if (code !== expected) {
    throw new HttpsError("permission-denied", "That registration code is not correct.");
  }

  let uid: string;
  try {
    const user = await authAdmin.createUser({ email, password, emailVerified: false });
    uid = user.uid;
  } catch (err: unknown) {
    const c = (err as { code?: string }).code;
    if (c === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "An account with this email already exists. Try signing in.");
    }
    logger.error("createUser failed", err);
    throw new HttpsError("internal", "Could not create the account. Try again.");
  }

  await authAdmin.setCustomUserClaims(uid, { role: "employee" });

  const ts = nowMs();
  const profile: EmployeeProfile = {
    uid,
    email,
    status: "pending",
    profileComplete: false,
    profileLocked: false,
    unlockGrant: null,
    idPurgeAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.collection(COL.employees).doc(uid).set(profile);

  return { ok: true };
});

/* ------------------------------------------------------------------ *
 * approveRegistration / rejectRegistration — managers
 * ------------------------------------------------------------------ */

export const approveRegistration = onCall(async (req) => {
  const caller = requireManager(req);
  const uid = assertString(req.data?.uid, "uid");

  const ref = db.collection(COL.employees).doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Employee not found.");
    const data = snap.data() as EmployeeProfile;
    if (data.status === "blocked") {
      throw new HttpsError("failed-precondition", "This account is blocked. Unblock it first.");
    }
    tx.update(ref, {
      status: "approved",
      approvedBy: caller.uid,
      approvedAt: nowMs(),
      updatedAt: nowMs(),
    });
  });

  await writeAudit({
    action: "employee.approve",
    actor: caller,
    targetType: "employee",
    targetId: uid,
  });
  return { ok: true };
});

export const rejectRegistration = onCall(async (req) => {
  const caller = requireManager(req);
  const uid = assertString(req.data?.uid, "uid");

  const ref = db.collection(COL.employees).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Employee not found.");
  const data = snap.data() as EmployeeProfile;
  if (data.status !== "pending") {
    throw new HttpsError("failed-precondition", "Only pending accounts can be rejected.");
  }

  await authAdmin.deleteUser(uid).catch((e) => logger.warn("deleteUser on reject", e));
  await ref.delete();

  await writeAudit({
    action: "employee.reject",
    actor: caller,
    targetType: "employee",
    targetId: uid,
    before: { email: data.email },
  });
  return { ok: true };
});

/* ------------------------------------------------------------------ *
 * setEmployeeBlocked — admins (block == termination)
 * ------------------------------------------------------------------ */

export const setEmployeeBlocked = onCall(async (req) => {
  const caller = requireAdmin(req);
  const uid = assertString(req.data?.uid, "uid");
  const blocked = req.data?.blocked === true;

  const ref = db.collection(COL.employees).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Employee not found.");
  const data = snap.data() as EmployeeProfile;

  await authAdmin.updateUser(uid, { disabled: blocked });
  await authAdmin.revokeRefreshTokens(uid);

  if (blocked) {
    await ref.update({
      status: "blocked",
      blockedBy: caller.uid,
      blockedAt: nowMs(),
      idPurgeAt: nowMs() + ID_PURGE_GRACE_MS,
      updatedAt: nowMs(),
    });
  } else {
    // Unblock. If the ID images were already purged the employee will need a
    // profile unlock to re-upload them; that is surfaced in the console.
    await ref.update({
      status: "approved",
      blockedBy: null,
      blockedAt: null,
      idPurgeAt: null,
      updatedAt: nowMs(),
    });
  }

  await writeAudit({
    action: blocked ? "employee.block" : "employee.unblock",
    actor: caller,
    targetType: "employee",
    targetId: uid,
    before: { status: data.status },
    after: { status: blocked ? "blocked" : "approved" },
  });
  return { ok: true };
});

/* ------------------------------------------------------------------ *
 * grantProfileUnlock — admins, one-time
 * ------------------------------------------------------------------ */

export const grantProfileUnlock = onCall(async (req) => {
  const caller = requireAdmin(req);
  const uid = assertString(req.data?.uid, "uid");

  const ref = db.collection(COL.employees).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Employee not found.");

  await ref.update({
    profileLocked: false,
    unlockGrant: {
      grantedBy: caller.uid,
      grantedByName: caller.name ?? caller.email ?? "manager",
      grantedAt: nowMs(),
      expiresAt: nowMs() + UNLOCK_GRANT_TTL_MS,
      used: false,
    },
    updatedAt: nowMs(),
  });

  await writeAudit({
    action: "employee.unlock",
    actor: caller,
    targetType: "employee",
    targetId: uid,
  });
  return { ok: true };
});

/* ------------------------------------------------------------------ *
 * correctEmployeeField — admins edit a profile field directly
 * ------------------------------------------------------------------ */

export const correctEmployeeField = onCall(async (req) => {
  const caller = requireAdmin(req);
  const uid = assertString(req.data?.uid, "uid");
  const patch = req.data?.patch as Record<string, unknown> | undefined;
  assert(patch && typeof patch === "object", "patch is required.");

  const allowed = new Set<string>(EMPLOYEE_EDITABLE_FIELDS);
  const keys = Object.keys(patch);
  assert(keys.length > 0, "Nothing to update.");
  for (const k of keys) {
    if (!allowed.has(k)) throw new HttpsError("invalid-argument", `Field "${k}" cannot be edited here.`);
  }

  const ref = db.collection(COL.employees).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Employee not found.");
  const before = snap.data() as EmployeeProfile;

  await ref.update({ ...patch, updatedAt: nowMs() });

  await writeAudit({
    action: "employee.correct",
    actor: caller,
    targetType: "employee",
    targetId: uid,
    before: Object.fromEntries(
      keys.map((k) => [k, (before as unknown as Record<string, unknown>)[k] ?? null]),
    ),
    after: patch,
  });
  return { ok: true };
});
