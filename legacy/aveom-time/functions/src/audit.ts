import { db, nowMs, randomId } from "./firebase";
import { COL, type AuditAction, type AuditEntry } from "./shared";
import type { Caller } from "./guards";

interface AuditInput {
  action: AuditAction;
  actor: Caller;
  targetType: AuditEntry["targetType"];
  targetId: string;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  const id = randomId("aud_");
  const entry: AuditEntry = {
    id,
    action: input.action,
    actorUid: input.actor.uid,
    actorName: input.actor.name ?? input.actor.email,
    actorRole: input.actor.role,
    targetType: input.targetType,
    targetId: input.targetId,
    before: input.before ?? null,
    after: input.after ?? null,
    at: nowMs(),
  };
  await db.collection(COL.auditLog).doc(id).set(entry);
}
