import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, nowMs, randomId } from "./firebase";
import { requireAdmin, assertString } from "./guards";
import { writeAudit } from "./audit";
import { COL, type Project } from "./shared";

export const createProject = onCall(async (req) => {
  const caller = requireAdmin(req);
  const name = assertString(req.data?.name, "Project name");
  const code = typeof req.data?.code === "string" ? req.data.code.trim() : undefined;

  const dup = await db
    .collection(COL.projects)
    .where("name", "==", name)
    .limit(1)
    .get();
  if (!dup.empty) {
    throw new HttpsError("already-exists", "A project with that name already exists.");
  }

  const id = randomId("prj_");
  const project: Project = {
    id,
    name,
    code: code || undefined,
    locked: false,
    createdBy: caller.uid,
    createdAt: nowMs(),
  };
  await db.collection(COL.projects).doc(id).set(project);

  await writeAudit({
    action: "project.create",
    actor: caller,
    targetType: "project",
    targetId: id,
    after: { name },
  });
  return { ok: true, id };
});

export const setProjectLocked = onCall(async (req) => {
  const caller = requireAdmin(req);
  const id = assertString(req.data?.id, "id");
  const locked = req.data?.locked === true;

  const ref = db.collection(COL.projects).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Project not found.");

  await ref.update({
    locked,
    lockedBy: locked ? caller.uid : null,
    lockedAt: locked ? nowMs() : null,
  });

  await writeAudit({
    action: locked ? "project.lock" : "project.unlock",
    actor: caller,
    targetType: "project",
    targetId: id,
  });
  return { ok: true };
});

export const renameProject = onCall(async (req) => {
  const caller = requireAdmin(req);
  const id = assertString(req.data?.id, "id");
  const name = assertString(req.data?.name, "Project name");

  const ref = db.collection(COL.projects).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Project not found.");
  const before = snap.data() as Project;

  await ref.update({ name });

  await writeAudit({
    action: "project.rename",
    actor: caller,
    targetType: "project",
    targetId: id,
    before: { name: before.name },
    after: { name },
  });
  return { ok: true };
});
