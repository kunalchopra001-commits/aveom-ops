import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { authAdmin, db, nowMs } from "./firebase";
import { bad, optStr, requireAdmin, str } from "./guards";
import { logActivity } from "./logs";
import {
  ASSIGNABLE_ROLES,
  COL,
  MIN_PASSWORD_LENGTH,
  ROLE_LABEL,
  canHoldPetty,
  isValidUaeIban,
  isValidUsername,
  normalizeContactNumber,
  normalizeIban,
  normalizeUsername,
  usernameToEmail,
  type BankDetails,
  type Claims,
  type Perms,
  type Role,
  type UserProfile,
} from "./shared";

function readPerms(value: unknown, role: Role): Perms {
  const v = (value ?? {}) as Partial<Perms>;
  return { shifts: v.shifts === true, petty: v.petty === true && canHoldPetty(role) };
}

function readPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) {
    bad(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (value.length > 128) bad("The password is too long.");
  return value;
}

function readContact(value: unknown): string | undefined {
  const raw = optStr(value, "Contact number", 30);
  if (!raw) return undefined;
  const n = normalizeContactNumber(raw);
  if (!n) bad("Enter a valid contact number (e.g. 050 123 4567).");
  return n;
}

function readBank(value: unknown): BankDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const bank: BankDetails = {
    accountHolderName: optStr(v.accountHolderName, "Account holder name", 100),
    bankName: optStr(v.bankName, "Bank name", 100),
    accountNumber: optStr(v.accountNumber, "Account number", 40),
    iban: optStr(v.iban, "IBAN", 40),
  };
  if (bank.iban) {
    bank.iban = normalizeIban(bank.iban);
    if (!isValidUaeIban(bank.iban)) bad("That IBAN isn't a valid UAE IBAN (AE + 21 digits).");
  }
  return Object.values(bank).some(Boolean) ? bank : undefined;
}

async function applyClaims(uid: string, role: Role, perms: Perms): Promise<void> {
  const claims: Claims = { role, shifts: perms.shifts, petty: perms.petty };
  await authAdmin.setCustomUserClaims(uid, claims);
}

function permsText(p: Perms): string {
  const parts = [p.shifts && "Shifts", p.petty && "Petty cash"].filter(Boolean);
  return parts.length ? parts.join(" + ") : "no modules";
}

/* ------------------------------------------------------------------ */

export const createUser = onCall(async (req) => {
  const caller = await requireAdmin(req);
  const d = req.data ?? {};

  const username = normalizeUsername(str(d.username, "Username", 30));
  if (!isValidUsername(username)) {
    bad("Usernames are 3–30 characters: letters, numbers, dot, dash or underscore.");
  }
  const displayName = str(d.displayName, "Full name", 80);
  const password = readPassword(d.password);
  const role = d.role as Role;
  if (!ASSIGNABLE_ROLES.includes(role)) bad("Choose a valid role.");
  const perms = readPerms(d.perms, role);

  let uid: string;
  try {
    const rec = await authAdmin.createUser({ email: usernameToEmail(username), password, displayName });
    uid = rec.uid;
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", `The username “${username}” is already taken.`);
    }
    throw e;
  }

  await applyClaims(uid, role, perms);
  const now = nowMs();
  const profile: UserProfile = {
    uid,
    username,
    displayName,
    role,
    perms,
    active: true,
    contactNumber: readContact(d.contactNumber),
    bank: readBank(d.bank),
    notes: optStr(d.notes, "Notes", 500),
    claimsVersion: 1,
    createdAt: now,
    createdBy: caller.uid,
    updatedAt: now,
  };
  await db.collection(COL.users).doc(uid).set(profile);

  await logActivity({
    action: "user.create",
    actor: caller,
    targetId: uid,
    summary: `Created ${displayName} (@${username}) as ${ROLE_LABEL[role]} with ${permsText(perms)}`,
    after: { username, displayName, role, perms },
  });
  return { ok: true as const, uid };
});

export const updateUser = onCall(async (req) => {
  const caller = await requireAdmin(req);
  const d = req.data ?? {};
  const uid = str(d.uid, "uid", 128);

  const ref = db.collection(COL.users).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "User not found.");
  const before = snap.data() as UserProfile;

  // The Production Manager's own role is fixed; nobody else can become admin.
  let role = before.role;
  if (d.role !== undefined && before.role !== "admin") {
    if (!ASSIGNABLE_ROLES.includes(d.role)) bad("Choose a valid role.");
    role = d.role as Role;
  }
  const perms = d.perms !== undefined ? readPerms(d.perms, role) : readPerms(before.perms, role);

  const patch: Partial<UserProfile> = {
    displayName: d.displayName !== undefined ? str(d.displayName, "Full name", 80) : before.displayName,
    role,
    perms,
    contactNumber: d.contactNumber !== undefined ? readContact(d.contactNumber) : before.contactNumber,
    bank: d.bank !== undefined ? readBank(d.bank) : before.bank,
    notes: d.notes !== undefined ? optStr(d.notes, "Notes", 500) : before.notes,
    updatedAt: nowMs(),
  };

  const accessChanged =
    role !== before.role || perms.shifts !== before.perms.shifts || perms.petty !== before.perms.petty;
  if (accessChanged) {
    await applyClaims(uid, role, perms);
    patch.claimsVersion = (before.claimsVersion ?? 0) + 1;
  }
  if (patch.displayName !== before.displayName) {
    await authAdmin.updateUser(uid, { displayName: patch.displayName });
  }
  // Firestore drops `undefined` (ignoreUndefinedProperties), so clear removed fields explicitly.
  const write: Record<string, unknown> = { ...patch };
  for (const k of ["contactNumber", "bank", "notes"] as const) {
    if (patch[k] === undefined && before[k] !== undefined) write[k] = FieldValue.delete();
  }
  await ref.update(write);

  const changes: string[] = [];
  if (role !== before.role) changes.push(`role ${ROLE_LABEL[before.role]} → ${ROLE_LABEL[role]}`);
  if (perms.shifts !== before.perms.shifts || perms.petty !== before.perms.petty) {
    changes.push(`access ${permsText(before.perms)} → ${permsText(perms)}`);
  }
  if (patch.displayName !== before.displayName) changes.push(`name → ${patch.displayName}`);
  if (changes.length === 0) changes.push("details updated");

  await logActivity({
    action: "user.update",
    actor: caller,
    targetId: uid,
    summary: `${before.displayName}: ${changes.join("; ")}`,
    before: { displayName: before.displayName, role: before.role, perms: before.perms },
    after: { displayName: patch.displayName, role, perms },
  });
  return { ok: true as const };
});

export const resetUserPassword = onCall(async (req) => {
  const caller = await requireAdmin(req);
  const uid = str(req.data?.uid, "uid", 128);
  const password = readPassword(req.data?.password);

  const snap = await db.collection(COL.users).doc(uid).get();
  if (!snap.exists) throw new HttpsError("not-found", "User not found.");
  const user = snap.data() as UserProfile;

  await authAdmin.updateUser(uid, { password });
  await authAdmin.revokeRefreshTokens(uid);

  await logActivity({
    action: "user.password_reset",
    actor: caller,
    targetId: uid,
    summary: `Set a new password for ${user.displayName} (@${user.username})`,
  });
  return { ok: true as const };
});

export const setUserActive = onCall(async (req) => {
  const caller = await requireAdmin(req);
  const uid = str(req.data?.uid, "uid", 128);
  const active = req.data?.active === true;
  if (uid === caller.uid) bad("You can't deactivate your own account.");

  const ref = db.collection(COL.users).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "User not found.");
  const user = snap.data() as UserProfile;

  await authAdmin.updateUser(uid, { disabled: !active });
  if (!active) await authAdmin.revokeRefreshTokens(uid);
  await ref.update({ active, claimsVersion: (user.claimsVersion ?? 0) + 1, updatedAt: nowMs() });

  await logActivity({
    action: active ? "user.reactivate" : "user.deactivate",
    actor: caller,
    targetId: uid,
    summary: `${active ? "Reactivated" : "Deactivated"} ${user.displayName} (@${user.username})`,
  });
  return { ok: true as const };
});
