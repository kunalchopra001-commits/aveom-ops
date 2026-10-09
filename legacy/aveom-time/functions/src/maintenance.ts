import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { db, storageAdmin, nowMs } from "./firebase";
import { writeAudit } from "./audit";
import { COL, type EmployeeProfile } from "./shared";

/**
 * Runs hourly. Permanently deletes the Emirates ID images (and stored OCR text)
 * of employees who were blocked more than the grace window ago.
 */
export const purgeBlockedIds = onSchedule(
  { schedule: "every 60 minutes", region: "asia-south1", timeZone: "Asia/Dubai" },
  async () => {
    const due = await db
      .collection(COL.employees)
      .where("status", "==", "blocked")
      .where("idPurgeAt", "<=", nowMs())
      .get();

    if (due.empty) return;
    const bucket = storageAdmin.bucket();

    for (const doc of due.docs) {
      const p = doc.data() as EmployeeProfile;
      if (p.idPurgedAt) continue;
      try {
        await Promise.all([
          bucket.file(`eid/${p.uid}/front`).delete({ ignoreNotFound: true }),
          bucket.file(`eid/${p.uid}/back`).delete({ ignoreNotFound: true }),
        ]);
        await doc.ref.update({
          eidFrontPath: null,
          eidBackPath: null,
          ocr: null,
          idPurgeAt: null,
          idPurgedAt: nowMs(),
          updatedAt: nowMs(),
        });
        await writeAudit({
          action: "employee.id_purged",
          actor: { uid: "system", role: "ops", name: "AVEOM TIME (scheduled)" },
          targetType: "employee",
          targetId: p.uid,
        });
        logger.info(`purgeBlockedIds: purged ${p.uid}`);
      } catch (err) {
        logger.error(`purgeBlockedIds: failed for ${p.uid}`, err);
      }
    }
  },
);
