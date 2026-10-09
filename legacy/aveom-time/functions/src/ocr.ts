import { onObjectFinalized } from "firebase-functions/v2/storage";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import OpenAI from "openai";
import { db, storageAdmin, nowMs } from "./firebase";
import { COL, isIsoDate, type EmployeeProfile, type OcrExtract, type OcrResult } from "./shared";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const OCR_MODEL = process.env.OCR_MODEL || "gpt-4o";

/**
 * Storage trigger: fires when an employee uploads  eid/{uid}/front  or  eid/{uid}/back.
 * Once BOTH images are present it asks an OpenAI vision model to read the card and
 * pre-fills the four ID fields (leaving anything the employee already confirmed alone).
 * The result is always marked `needsReview` so a manager verifies against the images.
 */
export const onEidUpload = onObjectFinalized(
  { region: "asia-south1", memory: "512MiB", timeoutSeconds: 120, secrets: [OPENAI_API_KEY] },
  async (event) => {
    const name = event.data.name ?? "";
    const match = name.match(/^eid\/([^/]+)\/(front|back)$/);
    if (!match) return;
    const uid = match[1];

    const ref = db.collection(COL.employees).doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      logger.warn(`onEidUpload: no employee ${uid}`);
      return;
    }
    const profile = snap.data() as EmployeeProfile;

    const bucket = storageAdmin.bucket(event.bucket);
    const frontFile = bucket.file(`eid/${uid}/front`);
    const backFile = bucket.file(`eid/${uid}/back`);
    const [frontExists, backExists] = await Promise.all([
      frontFile.exists().then((r) => r[0]),
      backFile.exists().then((r) => r[0]),
    ]);
    if (!frontExists || !backExists) {
      logger.info(`onEidUpload: ${uid} waiting for the other side`);
      return;
    }

    let extract: OcrExtract = {};
    let mrzFound = false;
    let confidence = 0;
    let rawText = "";

    try {
      const [frontBuf, backBuf] = await Promise.all([
        frontFile.download().then((r) => r[0]),
        backFile.download().then((r) => r[0]),
      ]);
      const [frontMeta, backMeta] = await Promise.all([
        frontFile.getMetadata().then((r) => r[0]),
        backFile.getMetadata().then((r) => r[0]),
      ]);

      const result = await readEmiratesId(
        { buf: frontBuf, contentType: frontMeta.contentType || "image/jpeg" },
        { buf: backBuf, contentType: backMeta.contentType || "image/jpeg" },
      );
      extract = {
        officialName: clean(result.officialName),
        eidNumber: normalizeEidNumber(result.eidNumber),
        eidIssueDate: isIsoDate(result.issueDate ?? undefined) ? result.issueDate! : undefined,
        eidExpiryDate: isIsoDate(result.expiryDate ?? undefined) ? result.expiryDate! : undefined,
      };
      mrzFound = !!result.mrzFound;
      confidence = typeof result.confidence === "number" ? result.confidence : 0;
      rawText = result.rawText ?? "";
    } catch (err) {
      logger.error(`onEidUpload: extraction failed for ${uid}`, err);
    }

    const ocr: OcrResult = {
      extract,
      mrzFound,
      confidence,
      extractedAt: nowMs(),
      needsReview: true,
      rawTextBack: rawText || undefined,
    };

    const patch: Record<string, unknown> = { ocr, updatedAt: nowMs() };
    // Only pre-fill fields the employee has not already set.
    if (!profile.officialName && extract.officialName) patch.officialName = extract.officialName;
    if (!profile.eidNumber && extract.eidNumber) patch.eidNumber = extract.eidNumber;
    if (!isIsoDate(profile.eidIssueDate) && extract.eidIssueDate) patch.eidIssueDate = extract.eidIssueDate;
    if (!isIsoDate(profile.eidExpiryDate) && extract.eidExpiryDate) patch.eidExpiryDate = extract.eidExpiryDate;

    await ref.update(patch);

    // Flag a duplicate Emirates ID number for the managers.
    if (extract.eidNumber) {
      const dup = await db
        .collection(COL.employees)
        .where("eidNumber", "==", extract.eidNumber)
        .get();
      const others = dup.docs.map((d) => d.id).filter((id) => id !== uid);
      if (others.length > 0) {
        logger.warn(`onEidUpload: duplicate EID ${extract.eidNumber} — ${uid} and ${others.join(", ")}`);
        await ref.update({ "ocr.duplicateOf": others });
      }
    }

    logger.info(`onEidUpload: extracted for ${uid} (confidence ${confidence})`);
  },
);

interface IdReadResult {
  officialName: string | null;
  eidNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  mrzFound: boolean;
  confidence: number;
  rawText: string;
}

async function readEmiratesId(
  front: { buf: Buffer; contentType: string },
  back: { buf: Buffer; contentType: string },
): Promise<IdReadResult> {
  const client = new OpenAI({ apiKey: OPENAI_API_KEY.value() });

  const dataUrl = (i: { buf: Buffer; contentType: string }) =>
    `data:${i.contentType};base64,${i.buf.toString("base64")}`;

  const completion = await client.chat.completions.create({
    model: OCR_MODEL,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "emirates_id",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            officialName: {
              type: ["string", "null"],
              description: "Full name in Latin letters exactly as printed on the front of the card.",
            },
            eidNumber: {
              type: ["string", "null"],
              description: "The 15-digit Emirates ID / IDN number, format 784-YYYY-NNNNNNN-N.",
            },
            issueDate: { type: ["string", "null"], description: "Issuing/issue date as ISO yyyy-mm-dd." },
            expiryDate: { type: ["string", "null"], description: "Expiry date as ISO yyyy-mm-dd." },
            mrzFound: { type: "boolean", description: "Whether a machine-readable zone was visible on the back." },
            confidence: { type: "number", description: "Your confidence 0..1 that the fields are correct." },
            rawText: { type: "string", description: "All text you can read from both sides, for reference." },
          },
          required: [
            "officialName",
            "eidNumber",
            "issueDate",
            "expiryDate",
            "mrzFound",
            "confidence",
            "rawText",
          ],
        },
      },
    },
    messages: [
      {
        role: "system",
        content:
          "You extract structured data from photographs of a United Arab Emirates Emirates ID card. " +
          "Use the printed fields on the front for the name and the ID number. Prefer the machine-readable " +
          "zone (MRZ) on the back for dates when it is legible. Return dates as ISO yyyy-mm-dd. " +
          "If a field is not legible, return null for it. Never guess.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Front of the Emirates ID:" },
          { type: "image_url", image_url: { url: dataUrl(front), detail: "high" } },
          { type: "text", text: "Back of the Emirates ID:" },
          { type: "image_url", image_url: { url: dataUrl(back), detail: "high" } },
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as Partial<IdReadResult>;
  return {
    officialName: parsed.officialName ?? null,
    eidNumber: parsed.eidNumber ?? null,
    issueDate: parsed.issueDate ?? null,
    expiryDate: parsed.expiryDate ?? null,
    mrzFound: parsed.mrzFound ?? false,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    rawText: parsed.rawText ?? "",
  };
}

function clean(s: string | null | undefined): string | undefined {
  const v = (s ?? "").trim().replace(/\s+/g, " ");
  return v.length >= 3 ? v : undefined;
}

function normalizeEidNumber(s: string | null | undefined): string | undefined {
  const digits = (s ?? "").replace(/\D/g, "");
  if (digits.length !== 15) return undefined;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 14)}-${digits.slice(14)}`;
}
