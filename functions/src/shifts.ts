import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { db, nowMs } from "./firebase";
import { bad, requireAdmin, str } from "./guards";
import { logActivity } from "./logs";
import {
  COL,
  LONG_SHIFT_HOURS,
  MAX_SHIFT_HOURS,
  WAGE_RATE_AED,
  computeShiftHours,
  computeWage,
  formatDubaiDateTime,
  formatHours,
  type Project,
  type Shift,
  type UserProfile,
} from "./shared";

/** Shifts are written by the crew's phones (offline outbox); log each one as it lands. */
export const onShiftCreated = onDocumentCreated(`${COL.shifts}/{id}`, async (event) => {
  const s = event.data?.data() as Shift | undefined;
  if (!s) return;
  const u = await db.collection(COL.users).doc(s.userUid).get();
  const user = u.exists ? (u.data() as UserProfile) : null;
  await logActivity({
    action: "shift.create",
    actor: { uid: s.userUid, name: s.userName, role: user?.role ?? "member" },
    targetId: s.id,
    summary:
      `Logged ${formatHours(s.totalHours)} h on ${s.projectName} ` +
      `(${formatDubaiDateTime(s.startAt)} → ${formatDubaiDateTime(s.endAt)})` +
      (s.flags.length ? ` · flags: ${s.flags.map((f) => f.type).join(", ")}` : ""),
  });
});

export const editShift = onCall(async (req) => {
  const caller = await requireAdmin(req);
  const id = str(req.data?.id, "id", 64);
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
  if (!(nextEnd > nextStart)) bad("The shift must end after it starts.");
  if ((nextEnd - nextStart) / 3600000 > MAX_SHIFT_HOURS) bad(`A shift can't exceed ${MAX_SHIFT_HOURS} hours.`);

  let projectName = before.projectName;
  const nextProjectId = projectId || before.projectId;
  if (nextProjectId !== before.projectId) {
    const p = await db.collection(COL.projects).doc(nextProjectId).get();
    if (!p.exists) throw new HttpsError("not-found", "Project not found.");
    projectName = (p.data() as Project).name;
  }

  const { rawMinutes, totalHours } = computeShiftHours(nextStart, nextEnd);
  const wageAmount = computeWage(totalHours, WAGE_RATE_AED);
  const flags = before.flags.filter((f) => f.type !== "long_shift");
  if (totalHours > LONG_SHIFT_HOURS) flags.push({ type: "long_shift" });

  const at = nowMs();
  const beforeSnap = {
    startAt: before.startAt,
    endAt: before.endAt,
    projectId: before.projectId,
    totalHours: before.totalHours,
    wageAmount: before.wageAmount,
  };
  const afterSnap = { startAt: nextStart, endAt: nextEnd, projectId: nextProjectId, totalHours, wageAmount };

  await ref.update({
    startAt: nextStart,
    endAt: nextEnd,
    projectId: nextProjectId,
    projectName,
    rawMinutes,
    totalHours,
    wageRate: WAGE_RATE_AED,
    wageAmount,
    flags,
    editedBy: caller.uid,
    editedAt: at,
    editHistory: [
      ...(before.editHistory ?? []),
      { by: caller.uid, byName: caller.name, at, before: beforeSnap, after: afterSnap },
    ],
  });

  await logActivity({
    action: "shift.edit",
    actor: caller,
    targetId: id,
    summary:
      `Edited ${before.userName}'s shift: ${formatHours(before.totalHours)} h → ${formatHours(totalHours)} h` +
      (projectName !== before.projectName ? `, ${before.projectName} → ${projectName}` : ""),
    before: beforeSnap,
    after: afterSnap,
  });
  return { ok: true as const };
});

export const deleteShift = onCall(async (req) => {
  const caller = await requireAdmin(req);
  const id = str(req.data?.id, "id", 64);
  const ref = db.collection(COL.shifts).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Shift not found.");
  const s = snap.data() as Shift;
  if (s.deleted) return { ok: true as const };

  await ref.update({ deleted: true, deletedBy: caller.uid, deletedAt: nowMs() });
  await logActivity({
    action: "shift.delete",
    actor: caller,
    targetId: id,
    summary: `Deleted ${s.userName}'s shift of ${formatHours(s.totalHours)} h on ${formatDubaiDateTime(s.startAt)}`,
    before: { startAt: s.startAt, endAt: s.endAt, totalHours: s.totalHours, wageAmount: s.wageAmount },
  });
  return { ok: true as const };
});
