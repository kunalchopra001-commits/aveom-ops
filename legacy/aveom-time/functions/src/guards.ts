import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { ADMIN_ROLES, MANAGER_ROLES, type Role } from "./shared";

export interface Caller {
  uid: string;
  role: Role;
  name?: string;
  email?: string;
}

export function requireAuth(req: CallableRequest): Caller {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Please sign in.");
  }
  const token = req.auth.token as Record<string, unknown>;
  const role = (token.role as Role) ?? "employee";
  return {
    uid: req.auth.uid,
    role,
    email: typeof token.email === "string" ? token.email : undefined,
    name: typeof token.name === "string" ? token.name : undefined,
  };
}

export function requireManager(req: CallableRequest): Caller {
  const caller = requireAuth(req);
  if (!MANAGER_ROLES.includes(caller.role)) {
    throw new HttpsError("permission-denied", "This action is for managers only.");
  }
  return caller;
}

export function requireAdmin(req: CallableRequest): Caller {
  const caller = requireAuth(req);
  if (!ADMIN_ROLES.includes(caller.role)) {
    throw new HttpsError(
      "permission-denied",
      "This action is limited to the Operations Manager and Founder.",
    );
  }
  return caller;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new HttpsError("invalid-argument", message);
  }
}

export function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  return value.trim();
}
