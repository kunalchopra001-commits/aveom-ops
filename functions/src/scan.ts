import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { db, nowMs, storageAdmin } from "./firebase";
import { bad, requireUser } from "./guards";
import { COL, MAX_BILL_FILES, isIsoDate, todayDubai, type BillScan, type BillScanFields } from "./shared";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const MODEL = process.env.OCR_MODEL || "gpt-4o";
// Overridable so the local emulator can point at a stub instead of the real API.
const BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

/**
 * Read an uploaded bill (photos and/or PDF) with an OpenAI vision model and return
 * the fields to pre-fill. The person always reviews them before submitting; the
 * result is kept in pcScans/{billId} so submitBill can record what was changed.
 */
export const scanBill = onCall(
  { secrets: [OPENAI_API_KEY], memory: "512MiB", timeoutSeconds: 90, invoker: "public" },
  async (req) => {
    const caller = await requireUser(req);
    if (!caller.profile.perms.petty) throw new HttpsError("permission-denied", "You don't have petty cash access.");

    const billId = req.data?.billId;
    if (typeof billId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(billId)) bad("Invalid bill.");
    const paths: unknown = req.data?.paths;
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_BILL_FILES) bad("Attach the bill first.");

    const prefix = `bills/${caller.uid}/${billId}/`;
    const parts: unknown[] = [];
    for (const p of paths) {
      if (typeof p !== "string" || !p.startsWith(prefix) || p.includes("..")) bad("An attachment is in the wrong place.");
      const file = storageAdmin.bucket().file(p);
      const [[buf], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
      const type = String(meta.contentType ?? "");
      const data = `data:${type};base64,${buf.toString("base64")}`;
      if (type === "application/pdf") {
        parts.push({ type: "file", file: { filename: p.slice(prefix.length), file_data: data } });
      } else if (type.startsWith("image/")) {
        parts.push({ type: "image_url", image_url: { url: data, detail: "high" } });
      }
    }
    if (parts.length === 0) bad("Attachments must be photos or PDFs.");

    let key = "";
    try {
      key = OPENAI_API_KEY.value();
    } catch {
      /* not configured */
    }
    if (!key) throw new HttpsError("failed-precondition", "Bill scanning isn't set up yet — please fill in the details.");

    let raw: Record<string, unknown>;
    try {
      raw = await readBill(key, parts);
    } catch (e) {
      logger.error("scanBill: model call failed", e);
      throw new HttpsError("unavailable", "Couldn't read the bill right now — please fill in the details.");
    }

    const today = todayDubai();
    const amount = typeof raw.amount === "number" && raw.amount > 0 && raw.amount < 10_000_000 ? Math.round(raw.amount * 100) / 100 : null;
    const date = typeof raw.date === "string" && isIsoDate(raw.date) && raw.date <= today ? raw.date : null;
    const text = (v: unknown, max: number) =>
      typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null;

    const fields: BillScanFields = {
      amount,
      currency: text(raw.currency, 8)?.toUpperCase() ?? null,
      spentOn: date,
      vendor: text(raw.vendor, 100),
      description: text(raw.description, 200),
    };
    const scan: BillScan = {
      ...fields,
      confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0,
      model: MODEL,
      at: nowMs(),
    };
    await db.collection(COL.scans).doc(billId).set({ uid: caller.uid, billId, paths, ...scan });
    logger.info(`scanBill: ${caller.uid}/${billId} read with confidence ${scan.confidence}`);
    return scan;
  },
);

async function readBill(key: string, parts: unknown[]): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "bill",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              amount: { type: ["number", "null"], description: "The final total actually paid, including VAT. Not a subtotal." },
              currency: { type: ["string", "null"], description: "ISO currency code of the total, e.g. AED." },
              date: { type: ["string", "null"], description: "Purchase date as ISO yyyy-mm-dd." },
              vendor: { type: ["string", "null"], description: "Shop or supplier name as printed." },
              description: {
                type: ["string", "null"],
                description: "A short plain-English summary of what was bought, max 8 words, e.g. 'Cable ties and duct tape'.",
              },
              confidence: { type: "number", description: "Your confidence 0..1 that amount and date are correct." },
            },
            required: ["amount", "currency", "date", "vendor", "description", "confidence"],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You read receipts and tax invoices from shops and suppliers in the UAE (English and/or Arabic). " +
            "Return the grand total paid, its currency, the purchase date (receipts may print dd/mm/yyyy — " +
            "convert to yyyy-mm-dd), the vendor name, and a short description of the items. If several pages " +
            "or photos are given they are the same bill. If a field is not legible return null. Never guess.",
        },
        { role: "user", content: [{ type: "text", text: "Read this bill:" }, ...parts] },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
}
