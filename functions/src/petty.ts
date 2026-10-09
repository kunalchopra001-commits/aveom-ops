import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, nowMs, randomId, storageAdmin } from "./firebase";
import { bad, money, optStr, requireRole, requireUser, str } from "./guards";
import { logAck, logActivity } from "./logs";
import {
  COL,
  MAX_BILL_FILES,
  MAX_UPLOAD_BYTES,
  METHOD_LABEL,
  canHoldPetty,
  formatAed,
  isIsoDate,
  todayDubai,
  type Bill,
  type BillFile,
  type BillScan,
  type Project,
  type Transfer,
  type TransferMethod,
  type UserProfile,
} from "./shared";

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function readId(value: unknown): string {
  if (typeof value === "string" && ID_RE.test(value)) return value;
  return randomId("pc_");
}

function readDate(value: unknown, field: string): string {
  if (!isIsoDate(value as string)) bad(`${field} must be a date.`);
  if ((value as string) > todayDubai()) bad(`${field} can't be in the future.`);
  return value as string;
}

/** Inspect an uploaded file server-side; never trust the client's size/type claims. */
async function checkUpload(path: string, prefix: string): Promise<BillFile> {
  if (typeof path !== "string" || !path.startsWith(prefix) || path.includes("..")) {
    bad("An attachment is in the wrong place — please re-upload it.");
  }
  const file = storageAdmin.bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) bad("An attachment didn't finish uploading — please try again.");
  const [meta] = await file.getMetadata();
  const contentType = String(meta.contentType ?? "");
  const size = Number(meta.size ?? 0);
  if (!/^image\/|^application\/pdf$/.test(contentType)) bad("Attachments must be photos or PDFs.");
  if (size > MAX_UPLOAD_BYTES) bad("Each attachment must be under 10 MB.");
  return { path, name: path.slice(prefix.length), contentType, size };
}

/* ------------------------------------------------------------------ *
 * Owner → person
 * ------------------------------------------------------------------ */

export const sendPettyCash = onCall(async (req) => {
  const caller = await requireRole(req, "owner");
  const d = req.data ?? {};

  const id = readId(d.id);
  const toUid = str(d.toUid, "Recipient", 128);
  const amount = money(d.amount);
  const method = d.method as TransferMethod;
  if (method !== "transfer" && method !== "cash") bad("Choose bank transfer or cash.");
  const paidOn = readDate(d.paidOn, "Payment date");
  const reference = optStr(d.reference, "Reference", 80);
  const note = optStr(d.note, "Note", 300);

  const recipientSnap = await db.collection(COL.users).doc(toUid).get();
  if (!recipientSnap.exists) throw new HttpsError("not-found", "Recipient not found.");
  const recipient = recipientSnap.data() as UserProfile;
  if (!recipient.active || !recipient.perms.petty || !canHoldPetty(recipient.role)) {
    bad(`${recipient.displayName} doesn't have petty cash access.`);
  }

  let proofPath: string | undefined;
  if (d.proofPath) proofPath = (await checkUpload(d.proofPath, `transfers/${id}/`)).path;

  const ref = db.collection(COL.transfers).doc(id);
  if ((await ref.get()).exists) throw new HttpsError("already-exists", "This payment was already sent.");

  const transfer: Transfer = {
    id,
    toUid,
    toName: recipient.displayName,
    amount,
    method,
    reference,
    note,
    proofPath,
    paidOn,
    sentBy: caller.uid,
    sentByName: caller.name,
    sentAt: nowMs(),
    status: "sent",
  };
  await ref.set(transfer);

  await logActivity({
    action: "petty.send",
    actor: caller,
    targetId: id,
    summary: `Sent AED ${formatAed(amount)} by ${METHOD_LABEL[method].toLowerCase()} to ${recipient.displayName}`,
    after: { toUid, amount, method, paidOn, reference },
  });
  return { ok: true as const, id };
});

export const cancelTransfer = onCall(async (req) => {
  const caller = await requireRole(req, "owner");
  const id = str(req.data?.id, "id", 64);
  const reason = str(req.data?.reason, "Reason", 300);

  const ref = db.collection(COL.transfers).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Payment not found.");
  const t = snap.data() as Transfer;
  if (t.status === "acknowledged") {
    throw new HttpsError("failed-precondition", "This payment was already confirmed by the recipient.");
  }
  if (t.status === "cancelled") return { ok: true as const };

  await ref.update({ status: "cancelled", cancelledAt: nowMs(), cancelReason: reason });
  await logActivity({
    action: "petty.cancel",
    actor: caller,
    targetId: id,
    summary: `Cancelled AED ${formatAed(t.amount)} to ${t.toName}: ${reason}`,
  });
  return { ok: true as const };
});

/* ------------------------------------------------------------------ *
 * Recipient confirms (or disputes) a payment
 * ------------------------------------------------------------------ */

export const respondToTransfer = onCall(async (req) => {
  const caller = await requireUser(req);
  const id = str(req.data?.id, "id", 64);
  const response = req.data?.response as "received" | "disputed";
  if (response !== "received" && response !== "disputed") bad("Invalid response.");
  const note = optStr(req.data?.note, "Note", 300);
  if (response === "disputed" && !note) bad("Say what's wrong so Inaye can check.");

  const ref = db.collection(COL.transfers).doc(id);
  const t = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Payment not found.");
    const t = snap.data() as Transfer;
    if (t.toUid !== caller.uid) throw new HttpsError("permission-denied", "This payment isn't addressed to you.");
    if (t.status === "acknowledged" || t.status === "cancelled") {
      throw new HttpsError("failed-precondition", "This payment has already been settled.");
    }
    if (t.status === "disputed" && response === "disputed") {
      throw new HttpsError("failed-precondition", "You've already reported a problem with this payment.");
    }
    tx.update(ref, {
      status: response === "received" ? "acknowledged" : "disputed",
      respondedAt: nowMs(),
      responseNote: note ?? null,
    });
    return t;
  });

  await logAck({
    transferId: id,
    uid: caller.uid,
    userName: caller.name,
    amount: t.amount,
    method: t.method,
    sentByName: t.sentByName,
    response,
    note,
  });
  return { ok: true as const };
});

/* ------------------------------------------------------------------ *
 * Bills
 * ------------------------------------------------------------------ */

export const submitBill = onCall(async (req) => {
  const caller = await requireUser(req);
  if (!caller.profile.perms.petty) throw new HttpsError("permission-denied", "You don't have petty cash access.");
  const d = req.data ?? {};

  const id = readId(d.id);
  const amount = money(d.amount);
  const spentOn = readDate(d.spentOn, "Bill date");
  const description = str(d.description, "What was it for", 200);
  const vendor = optStr(d.vendor, "Shop / supplier", 100);

  const paths: unknown = d.files;
  if (!Array.isArray(paths) || paths.length === 0) bad("Attach a photo or PDF of the bill.");
  if (paths.length > MAX_BILL_FILES) bad(`Attach at most ${MAX_BILL_FILES} files.`);
  const prefix = `bills/${caller.uid}/${id}/`;
  const files = await Promise.all(paths.map((p) => checkUpload(p as string, prefix)));

  let projectId: string | undefined;
  let projectName: string | undefined;
  if (typeof d.projectId === "string" && d.projectId) {
    const p = await db.collection(COL.projects).doc(d.projectId).get();
    if (!p.exists) bad("That project no longer exists.");
    projectId = d.projectId;
    projectName = (p.data() as Project).name;
  }

  const ref = db.collection(COL.bills).doc(id);
  if ((await ref.get()).exists) throw new HttpsError("already-exists", "This bill was already submitted.");

  // If the AI read this bill first, keep what it read and which fields the person changed.
  let scan: BillScan | undefined;
  const scanSnap = await db.collection(COL.scans).doc(id).get();
  if (scanSnap.exists && scanSnap.get("uid") === caller.uid) {
    const s = scanSnap.data() as BillScan;
    const edited: BillScan["edited"] = [];
    if (s.amount !== amount) edited.push("amount");
    if (s.spentOn !== spentOn) edited.push("spentOn");
    if ((s.vendor ?? "") !== (vendor ?? "")) edited.push("vendor");
    if ((s.description ?? "") !== description) edited.push("description");
    scan = {
      amount: s.amount,
      currency: s.currency,
      spentOn: s.spentOn,
      vendor: s.vendor,
      description: s.description,
      confidence: s.confidence,
      model: s.model,
      at: s.at,
      edited,
    };
  }

  const bill: Bill = {
    id,
    uid: caller.uid,
    userName: caller.name,
    amount,
    spentOn,
    description,
    vendor,
    projectId,
    projectName,
    files,
    scan,
    submittedAt: nowMs(),
    status: "pending",
  };
  await ref.set(bill);

  await logActivity({
    action: "bill.submit",
    actor: caller,
    targetId: id,
    summary: `Submitted a bill for AED ${formatAed(amount)} — ${description}`,
    after: { amount, spentOn, description, files: files.length, scanned: !!scan, aiFieldsEdited: scan?.edited ?? null },
  });
  return { ok: true as const, id };
});

/**
 * The Production Manager approves or rejects bills. Nobody reviews their own bill:
 * the Production Manager's own bills are reviewed by the Owner instead.
 */
export const reviewBill = onCall(async (req) => {
  const caller = await requireRole(req, "admin", "owner");
  const id = str(req.data?.id, "id", 64);
  const approve = req.data?.approve === true;
  const reason = approve ? undefined : str(req.data?.reason, "Reason for rejecting", 300);

  const ref = db.collection(COL.bills).doc(id);
  const bill = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Bill not found.");
    const b = snap.data() as Bill;
    if (b.status !== "pending") throw new HttpsError("failed-precondition", "This bill was already reviewed.");
    if (b.uid === caller.uid) throw new HttpsError("permission-denied", "You can't review your own bill.");

    const ownerSnap = await tx.get(db.collection(COL.users).doc(b.uid));
    const submitterRole = ownerSnap.exists ? (ownerSnap.data() as UserProfile).role : "member";
    const allowed = caller.role === "admin" || (caller.role === "owner" && submitterRole === "admin");
    if (!allowed) throw new HttpsError("permission-denied", "Bills are reviewed by the Production Manager.");

    tx.update(ref, {
      status: approve ? "approved" : "rejected",
      reviewedBy: caller.uid,
      reviewedByName: caller.name,
      reviewedAt: nowMs(),
      rejectReason: reason ?? null,
    });
    return b;
  });

  await logActivity({
    action: approve ? "bill.approve" : "bill.reject",
    actor: caller,
    targetId: id,
    summary:
      `${approve ? "Approved" : "Rejected"} ${bill.userName}'s bill for AED ${formatAed(bill.amount)}` +
      (reason ? ` — ${reason}` : ""),
  });
  return { ok: true as const };
});
