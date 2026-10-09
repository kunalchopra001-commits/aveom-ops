import type { CallableRequest } from "firebase-functions/v2/https";
import { db, nowMs, randomId } from "./firebase";
import {
  COL,
  type AccessLog,
  type AckLog,
  type ActivityAction,
  type ActivityLog,
  type Role,
} from "./shared";
import type { Caller } from "./guards";

/**
 * Three separate, append-only logs — readable by the Production Manager only:
 *   logs_access    sign-ins, failed sign-ins, sign-outs
 *   logs_ack       petty cash receipt confirmations / disputes
 *   logs_activity  every other change anyone makes
 */

export async function logAccess(entry: Omit<AccessLog, "id" | "at">): Promise<void> {
  const id = randomId("acc_");
  await db.collection(COL.logAccess).doc(id).set({ id, at: nowMs(), ...entry });
}

export async function logAck(entry: Omit<AckLog, "id" | "at">): Promise<void> {
  const id = randomId("ack_");
  await db.collection(COL.logAck).doc(id).set({ id, at: nowMs(), ...entry });
}

interface ActivityInput {
  action: ActivityAction;
  actor: Caller | { uid: string; name: string; role: Role };
  targetId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}

export async function logActivity(input: ActivityInput): Promise<void> {
  const id = randomId("act_");
  const entry: ActivityLog = {
    id,
    at: nowMs(),
    action: input.action,
    actorUid: input.actor.uid,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    targetId: input.targetId,
    summary: input.summary,
    before: input.before ?? null,
    after: input.after ?? null,
  };
  await db.collection(COL.logActivity).doc(id).set(entry);
}

export function userAgentOf(req: CallableRequest): string | undefined {
  const ua = req.rawRequest?.headers?.["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 300) : undefined;
}
