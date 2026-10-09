import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, nowMs, randomId } from "./firebase";
import { optStr, requireAdmin, str } from "./guards";
import { logActivity } from "./logs";
import { COL, type Project } from "./shared";

export const createProject = onCall(async (req) => {
  const caller = await requireAdmin(req);
  const name = str(req.data?.name, "Project name", 80);
  const code = optStr(req.data?.code, "Code", 20);

  const dupe = await db.collection(COL.projects).where("name", "==", name).limit(1).get();
  if (!dupe.empty) throw new HttpsError("already-exists", "A project with that name already exists.");

  const id = randomId("prj_");
  const project: Project = { id, name, code, locked: false, createdBy: caller.uid, createdAt: nowMs() };
  await db.collection(COL.projects).doc(id).set(project);
  await logActivity({ action: "project.create", actor: caller, targetId: id, summary: `Created project ${name}` });
  return { ok: true as const, id };
});

export const renameProject = onCall(async (req) => {
  const caller = await requireAdmin(req);
  const id = str(req.data?.id, "id", 64);
  const name = str(req.data?.name, "Project name", 80);
  const ref = db.collection(COL.projects).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Project not found.");
  const before = snap.data() as Project;
  await ref.update({ name });
  await logActivity({
    action: "project.rename",
    actor: caller,
    targetId: id,
    summary: `Renamed project ${before.name} → ${name}`,
  });
  return { ok: true as const };
});

export const setProjectLocked = onCall(async (req) => {
  const caller = await requireAdmin(req);
  const id = str(req.data?.id, "id", 64);
  const locked = req.data?.locked === true;
  const ref = db.collection(COL.projects).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Project not found.");
  const p = snap.data() as Project;
  await ref.update({ locked });
  await logActivity({
    action: locked ? "project.lock" : "project.unlock",
    actor: caller,
    targetId: id,
    summary: `${locked ? "Locked" : "Unlocked"} project ${p.name}`,
  });
  return { ok: true as const };
});
