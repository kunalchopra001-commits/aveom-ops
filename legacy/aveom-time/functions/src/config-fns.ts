import { onCall } from "firebase-functions/v2/https";
import { db, nowMs } from "./firebase";
import { requireAdmin, assert } from "./guards";
import { writeAudit } from "./audit";
import { COL, CONFIG_DOC, REGISTRATION_CODE_LENGTH } from "./shared";

export const setRegistrationCode = onCall(async (req) => {
  const caller = requireAdmin(req);
  const raw = req.data?.code;
  let code: string;

  if (raw === "generate" || raw === undefined || raw === null) {
    code = String(Math.floor(Math.random() * 10 ** REGISTRATION_CODE_LENGTH)).padStart(
      REGISTRATION_CODE_LENGTH,
      "0",
    );
  } else {
    code = String(raw).trim();
    assert(
      code.length === REGISTRATION_CODE_LENGTH && /^\d+$/.test(code),
      `The code must be exactly ${REGISTRATION_CODE_LENGTH} digits.`,
    );
  }

  await db.collection(COL.config).doc(CONFIG_DOC.registration).set({
    code,
    updatedBy: caller.uid,
    updatedAt: nowMs(),
  });

  await writeAudit({
    action: "config.registration_code",
    actor: caller,
    targetType: "config",
    targetId: CONFIG_DOC.registration,
  });
  return { ok: true, code };
});
