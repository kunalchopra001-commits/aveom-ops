import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { db } from "./firebase";
import { COL, VIEWER_ROLES, type Role, type UserProfile } from "./shared";

export interface Caller {
  uid: string;
  role: Role;
  name: string;
  profile: UserProfile;
}

/**
 * Signed in AND an active user record. Roles are read from the user document
 * rather than the token so a change takes effect immediately, not on token refresh.
 */
export async function requireUser(req: CallableRequest): Promise<Caller> {
  if (!req.auth) throw new HttpsError("unauthenticated", "Please sign in.");
  const snap = await db.collection(COL.users).doc(req.auth.uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "Your account is not set up.");
  const profile = snap.data() as UserProfile;
  if (!profile.active) throw new HttpsError("permission-denied", "Your account has been deactivated.");
  return { uid: req.auth.uid, role: profile.role, name: profile.displayName, profile };
}

export async function requireRole(req: CallableRequest, ...roles: Role[]): Promise<Caller> {
  const caller = await requireUser(req);
  if (!roles.includes(caller.role)) {
    throw new HttpsError("permission-denied", "You don't have access to do that.");
  }
  return caller;
}

export const requireAdmin = (req: CallableRequest) => requireRole(req, "admin");
export const requireViewer = (req: CallableRequest) => requireRole(req, ...VIEWER_ROLES);

export function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

export function str(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || value.trim() === "") bad(`${field} is required.`);
  const v = value.trim();
  if (v.length > max) bad(`${field} is too long (max ${max} characters).`);
  return v;
}

export function optStr(value: unknown, field: string, max = 200): string | undefined {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    return undefined;
  }
  return str(value, field, max);
}

export function money(value: unknown, field = "Amount"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value >= 10_000_000) {
    bad(`${field} must be a positive number.`);
  }
  if (Math.round(value * 100) / 100 !== value) bad(`${field} can have at most 2 decimals.`);
  return value;
}
