import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, nowMs } from "./firebase";
import { requireAdmin, assertString, assert } from "./guards";
import { writeAudit } from "./audit";
import {
  COL,
  computeShiftHours,
  computeWage,
  LONG_SHIFT_HOURS,
  WAGE_RATE_AED,
  type Shift,
} from "./shared";

/** Admin edits a shift. Accepts new startAt/endAt (epoch ms) and/or projectId. */
export const editShift = onCall(async (req) => {
  const caller = requireAdmin(req);
  const id = assertString(req.data?.id, "id");
  const startAt = req.data?.startAt as number | undefined;
  const endAt = req.data?.endAt as number | undefined;
  const projectId = req.data?.projectId as string | undefined;

  const ref = db.collection(COL.shifts).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Shift not found.");
  const before = snap.data() as Shift;
  if (before.deleted) throw new HttpsError("failed-precondition", "This shift was deleted.");

  const nextStart = typeof startAt === "number" ? startAt : before.startAt;
  const nextEnd = typeof endAt === "number" ? endAt : before.endAt;
  assert(nextEnd > nextStart, "The shift must end after it starts.");

  let projectName = before.projectName;
  if (projectId && projectId !== before.projectId) {
    const p = await db.collection(COL.projects).doc(projectId).get();
    if (!p.exists) throw new HttpsError("not-found", "Project not found.");
    projectName = p.data()?.name as string;
  }

  const { rawMinutes, totalHours } = computeShiftHours(nextStart, nextEnd);
  const wageAmount = computeWage(totalHours, WAGE_RATE_AED);

  const flags = before.flags.filter((f) => f.type !== "long_shift");
  if (totalHours > LONG_SHIFT_HOURS) flags.push({ type: "long_shift" });

  const patch = {
    startAt: nextStart,
    endAt: nextEnd,
    projectId: projectId ?? before.projectId,
    projectName,
    rawMinutes,
    totalHours,
    wageRate: WAGE_RATE_AED,
    wageAmount,
    flags,
    editedBy: caller.uid,
    editedAt: nowMs(),
    editHistory: [
      ...(before.editHistory ?? []),
      {
        by: caller.uid,
        byName: caller.name ?? caller.email,
        at: nowMs(),
        before: {
          startAt: before.startAt,
          endAt: before.endAt,
          projectId: before.projectId,
          totalHours: before.totalHours,
          wageAmount: before.wageAmount,
        },
        after: { startAt: nextStart, endAt: nextEnd, projectId: projectId ?? before.projectId, totalHours, wageAmount },
      },
    ],
  };

  await ref.update(patch);
  await writeAudit({
    action: "shift.edit",
    actor: caller,
    targetType: "shift",
    targetId: id,
    before: { startAt: before.startAt, endAt: before.endAt, totalHours: before.totalHours, wageAmount: before.wageAmount },
    after: { startAt: nextStart, endAt: nextEnd, totalHours, wageAmount },
  });
  return { ok: true };
});

export const deleteShift = onCall(async (req) => {
  const caller = requireAdmin(req);
  const id = assertString(req.data?.id, "id");

  const ref = db.collection(COL.shifts).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Shift not found.");
  const before = snap.data() as Shift;

  await ref.update({
    deleted: true,
    deletedBy: caller.uid,
    deletedAt: nowMs(),
  });

  await writeAudit({
    action: "shift.delete",
    actor: caller,
    targetType: "shift",
    targetId: id,
    before: {
      employeeName: before.employeeName,
      startAt: before.startAt,
      endAt: before.endAt,
      wageAmount: before.wageAmount,
    },
  });
  return { ok: true };
});
