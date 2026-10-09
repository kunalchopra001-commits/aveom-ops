/**
 * AVEOM OPS — shared domain module.
 * Imported as source by the web app (Vite alias `@shared`) and bundled into the
 * Cloud Functions build (tsup). Keep it dependency-free and side-effect-free.
 */

export const APP_NAME = "AVEOM OPS";

/* ------------------------------------------------------------------ *
 * Collections + constants
 * ------------------------------------------------------------------ */

export const COL = {
  users: "users",
  projects: "projects",
  shifts: "shifts",
  transfers: "pcTransfers",
  bills: "pcBills",
  scans: "pcScans",
  logAccess: "logs_access",
  logAck: "logs_ack",
  logActivity: "logs_activity",
} as const;

/** Flat wage rate, AED per hour. Copied onto every shift at creation. */
export const WAGE_RATE_AED = 25;

/** Shifts longer than this (in hours) get a soft `long_shift` flag. */
export const LONG_SHIFT_HOURS = 16;

/** Hard upper bound on a single shift — anything longer is a typo. */
export const MAX_SHIFT_HOURS = 72;

/** Reporting / display timezone. Storage is always UTC epoch ms. */
export const TZ = "Asia/Dubai";

/**
 * Usernames are mapped onto Firebase Auth email addresses under a reserved
 * domain (RFC 2606 `.invalid`), so no mail is ever deliverable to them.
 */
export const USERNAME_DOMAIN = "users.aveom-ops.invalid";

export const MIN_PASSWORD_LENGTH = 8;

/** Bill attachments: photos or PDFs, up to this many files of this size each. */
export const MAX_BILL_FILES = 5;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/* ------------------------------------------------------------------ *
 * Roles + permissions
 * ------------------------------------------------------------------ */

/**
 * admin      — Production Manager: creates users, grants access, approves bills, sees logs.
 * owner      — Inaye: sees all reports, the only one who sends petty cash.
 * accountant — sees all reports, read-only.
 * member     — crew / staff; uses whichever modules they are permitted.
 */
export type Role = "admin" | "owner" | "accountant" | "member";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Production Manager",
  owner: "Owner",
  accountant: "Accountant",
  member: "Team member",
};

/** Roles that can see every report and the shift / petty cash ledgers. */
export const VIEWER_ROLES: Role[] = ["admin", "owner", "accountant"];

/** Roles the admin may assign when creating or editing a user. */
export const ASSIGNABLE_ROLES: Role[] = ["owner", "accountant", "member"];

export interface Perms {
  shifts: boolean;
  petty: boolean;
}

/** Custom claims carried in every ID token. */
export interface Claims {
  role: Role;
  shifts: boolean;
  petty: boolean;
}

export function isViewer(role: Role | undefined | null): boolean {
  return !!role && VIEWER_ROLES.includes(role);
}

/** The owner pays petty cash out, so cannot also hold a petty cash balance. */
export function canHoldPetty(role: Role): boolean {
  return role !== "owner";
}

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

export interface BankDetails {
  accountHolderName?: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
}

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  role: Role;
  perms: Perms;
  active: boolean;

  contactNumber?: string;
  bank?: BankDetails;
  notes?: string;

  /** Bumped whenever role/perms/active change, so clients refresh their token. */
  claimsVersion: number;

  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidUsername(input: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(normalizeUsername(input));
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${USERNAME_DOMAIN}`;
}

export function emailToUsername(email: string | null | undefined): string {
  if (!email) return "";
  return email.endsWith(`@${USERNAME_DOMAIN}`) ? email.slice(0, -USERNAME_DOMAIN.length - 1) : email;
}

/* ------------------------------------------------------------------ *
 * Wage + hours maths
 * ------------------------------------------------------------------ */

/** Round worked minutes UP to the next half hour (1–30 → 30, 31–60 → 60). */
export function roundMinutesToHalfHour(workedMinutes: number): number {
  if (!Number.isFinite(workedMinutes) || workedMinutes <= 0) return 0;
  return Math.ceil(workedMinutes / 30) * 30;
}

export interface ShiftHours {
  rawMinutes: number;
  totalHours: number;
}

export function computeShiftHours(startAtMs: number, endAtMs: number): ShiftHours {
  const rawMinutes = Math.max(0, Math.round((endAtMs - startAtMs) / 60000));
  return { rawMinutes, totalHours: roundMinutesToHalfHour(rawMinutes) / 60 };
}

/** Wage amount for a shift, rounded to fils (2 dp). */
export function computeWage(totalHours: number, rate: number = WAGE_RATE_AED): number {
  return Math.round(totalHours * rate * 100) / 100;
}

/* ------------------------------------------------------------------ *
 * Projects + shifts
 * ------------------------------------------------------------------ */

export interface Project {
  id: string;
  name: string;
  code?: string;
  locked: boolean;
  createdBy: string;
  createdAt: number;
}

export type ShiftFlagType = "overlap" | "long_shift" | "locked_project";

export interface ShiftFlag {
  type: ShiftFlagType;
  note?: string;
}

export const FLAG_LABEL: Record<ShiftFlagType, string> = {
  overlap: "Overlap",
  long_shift: "Long shift",
  locked_project: "Locked project",
};

export interface ShiftEdit {
  by: string;
  byName?: string;
  at: number;
  before: Partial<Shift>;
  after: Partial<Shift>;
}

export interface Shift {
  /** client-generated UUID; also the Firestore doc id (idempotent offline sync). */
  id: string;
  userUid: string;
  userName: string;
  projectId: string;
  projectName: string;

  startAt: number;
  endAt: number;
  rawMinutes: number;
  totalHours: number;
  wageRate: number;
  wageAmount: number;

  flags: ShiftFlag[];

  enteredAt: number; // device clock at submit time
  createdAt: number; // device clock at first sync
  editedBy?: string;
  editedAt?: number;
  editHistory?: ShiftEdit[];

  deleted: boolean;
  deletedBy?: string;
  deletedAt?: number;
}

export interface ShiftInput {
  startDate: string; // yyyy-mm-dd (Asia/Dubai wall time)
  startTime: string; // HH:mm
  endDate: string;
  endTime: string;
}

/** Fixed +04:00 offset for Asia/Dubai (no DST). */
export function dubaiWallTimeToEpochMs(date: string, time: string): number {
  const ms = Date.parse(`${date}T${time}:00+04:00`);
  return Number.isNaN(ms) ? NaN : ms;
}

export function epochMsToDubaiParts(ms: number): { date: string; time: string } {
  const iso = new Date(ms + 4 * 60 * 60 * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function todayDubai(): string {
  return epochMsToDubaiParts(Date.now()).date;
}

/** Inclusive Dubai-day range → [startMs, endMs]. */
export function dubaiDayRange(startDate: string, endDate: string): [number, number] {
  return [Date.parse(`${startDate}T00:00:00+04:00`), Date.parse(`${endDate}T23:59:59.999+04:00`)];
}

/* ---- fortnights: 1st–15th and 16th–end of month (the pay periods) ---- */

export type DateRange = [start: string, end: string]; // inclusive yyyy-mm-dd

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based here
}

/** The fortnight containing `date` (defaults to today in Dubai). */
export function fortnightOf(date: string = todayDubai()): DateRange {
  const [y, m, d] = date.split("-").map(Number);
  const ym = `${y}-${pad2(m)}`;
  return d <= 15 ? [`${ym}-01`, `${ym}-15`] : [`${ym}-16`, `${ym}-${pad2(lastDayOfMonth(y, m))}`];
}

/** Step a fortnight back (-1) or forward (+1). */
export function shiftFortnight(range: DateRange, step: -1 | 1): DateRange {
  const [y, m, d] = range[0].split("-").map(Number);
  if (step === 1) {
    if (d === 1) return fortnightOf(`${y}-${pad2(m)}-16`);
    const next = new Date(Date.UTC(y, m, 1)); // first of next month
    return fortnightOf(next.toISOString().slice(0, 10));
  }
  if (d === 16) return fortnightOf(`${y}-${pad2(m)}-01`);
  const prev = new Date(Date.UTC(y, m - 1, 0)); // last day of previous month
  return fortnightOf(prev.toISOString().slice(0, 10));
}

export function isFortnight(range: DateRange): boolean {
  const f = fortnightOf(range[0]);
  return f[0] === range[0] && f[1] === range[1];
}

/** "1–15 Oct 2026", "16–31 Oct 2026", or "28 Sep – 3 Oct 2026". */
export function formatRange([a, b]: DateRange): string {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  if (ay === by && am === bm) return `${ad}–${bd} ${MONTHS[bm - 1]} ${by}`;
  if (ay === by) return `${ad} ${MONTHS[am - 1]} – ${bd} ${MONTHS[bm - 1]} ${by}`;
  return `${formatIsoDate(a)} – ${formatIsoDate(b)}`;
}

export function validateShiftInput(input: ShiftInput): string[] {
  const problems: string[] = [];
  const start = dubaiWallTimeToEpochMs(input.startDate, input.startTime);
  const end = dubaiWallTimeToEpochMs(input.endDate, input.endTime);
  if (Number.isNaN(start)) problems.push("Enter a valid start date and time.");
  if (Number.isNaN(end)) problems.push("Enter a valid end date and time.");
  if (!Number.isNaN(start) && !Number.isNaN(end)) {
    if (end <= start) problems.push("The shift must end after it starts.");
    else if ((end - start) / 3600000 > MAX_SHIFT_HOURS)
      problems.push(`A shift can't be longer than ${MAX_SHIFT_HOURS} hours — check the dates.`);
    if (start > Date.now() + 24 * 3600000) problems.push("That shift starts in the future.");
  }
  return problems;
}

export interface ShiftComputation extends ShiftHours {
  startAt: number;
  endAt: number;
  wageRate: number;
  wageAmount: number;
  isLong: boolean;
}

export function computeShiftFromInput(input: ShiftInput): ShiftComputation {
  const startAt = dubaiWallTimeToEpochMs(input.startDate, input.startTime);
  const endAt = dubaiWallTimeToEpochMs(input.endDate, input.endTime);
  const { rawMinutes, totalHours } = computeShiftHours(startAt, endAt);
  return {
    startAt,
    endAt,
    rawMinutes,
    totalHours,
    wageRate: WAGE_RATE_AED,
    wageAmount: computeWage(totalHours),
    isLong: totalHours > LONG_SHIFT_HOURS,
  };
}

export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/* ------------------------------------------------------------------ *
 * Petty cash
 * ------------------------------------------------------------------ */

export type TransferMethod = "transfer" | "cash";
export type TransferStatus = "sent" | "acknowledged" | "disputed" | "cancelled";

export const METHOD_LABEL: Record<TransferMethod, string> = {
  transfer: "Bank transfer",
  cash: "Cash",
};

/** Money the owner sends to a person. Created only by the `sendPettyCash` function. */
export interface Transfer {
  id: string;
  toUid: string;
  toName: string;
  amount: number;
  method: TransferMethod;
  reference?: string;
  note?: string;
  proofPath?: string;
  /** The Dubai calendar date the money changed hands. */
  paidOn: string;

  sentBy: string;
  sentByName: string;
  sentAt: number;

  status: TransferStatus;
  respondedAt?: number;
  responseNote?: string;
  cancelledAt?: number;
  cancelReason?: string;
}

export type BillStatus = "pending" | "approved" | "rejected";

export interface BillFile {
  path: string;
  name: string;
  contentType: string;
  size: number;
}

/** What the AI read off a bill. Fields it couldn't read are null. */
export interface BillScanFields {
  amount: number | null;
  currency: string | null;
  spentOn: string | null;
  vendor: string | null;
  description: string | null;
}

export interface BillScan extends BillScanFields {
  confidence: number;
  model: string;
  at: number;
  /** Fields the person changed before submitting — how often the AI needed correcting. */
  edited?: (keyof BillScanFields)[];
}

/** A receipt/bill a petty cash holder submits against their balance. */
export interface Bill {
  id: string;
  uid: string;
  userName: string;
  amount: number;
  spentOn: string; // yyyy-mm-dd
  description: string;
  vendor?: string;
  projectId?: string;
  projectName?: string;
  files: BillFile[];
  /** Present when the bill was scanned by AI before submitting. */
  scan?: BillScan;

  submittedAt: number;
  status: BillStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: number;
  rejectReason?: string;
}

export type LedgerKind = "received" | "bill";

export interface LedgerLine {
  id: string;
  kind: LedgerKind;
  /**
   * yyyy-mm-dd used for ordering + period filters: the payment date for money received,
   * and the day a bill was SUBMITTED (it enters petty cash then, whatever the receipt says).
   */
  date: string;
  /** Bills only: the date printed on the receipt. */
  receiptDate?: string;
  at: number;
  description: string;
  status: TransferStatus | BillStatus;
  moneyIn: number;
  moneyOut: number;
  /** Does this line count towards the balance? */
  counts: boolean;
  balance: number;
}

export interface Statement {
  lines: LedgerLine[];
  received: number;
  awaitingConfirmation: number;
  disputed: number;
  approvedBills: number;
  pendingBills: number;
  rejectedBills: number;
  /** Confirmed money received minus approved bills. */
  balance: number;
  /** Balance if every pending bill were approved. */
  balanceAfterPending: number;
}

/**
 * Build a person's petty cash statement. Only acknowledged transfers and approved
 * bills move the balance; everything else is shown but does not count.
 */
export function computeStatement(transfers: Transfer[], bills: Bill[]): Statement {
  const raw: Omit<LedgerLine, "balance">[] = [];
  let received = 0;
  let awaitingConfirmation = 0;
  let disputed = 0;
  let approvedBills = 0;
  let pendingBills = 0;
  let rejectedBills = 0;

  for (const t of transfers) {
    if (t.status === "cancelled") continue;
    const counts = t.status === "acknowledged";
    if (counts) received += t.amount;
    else if (t.status === "sent") awaitingConfirmation += t.amount;
    else if (t.status === "disputed") disputed += t.amount;
    raw.push({
      id: t.id,
      kind: "received",
      date: t.paidOn,
      at: t.sentAt,
      description: `${METHOD_LABEL[t.method]} from ${t.sentByName}${t.reference ? ` · ${t.reference}` : ""}`,
      status: t.status,
      moneyIn: t.amount,
      moneyOut: 0,
      counts,
    });
  }
  for (const b of bills) {
    const counts = b.status === "approved";
    if (counts) approvedBills += b.amount;
    else if (b.status === "pending") pendingBills += b.amount;
    else rejectedBills += b.amount;
    raw.push({
      id: b.id,
      kind: "bill",
      date: epochMsToDubaiParts(b.submittedAt).date,
      receiptDate: b.spentOn,
      at: b.submittedAt,
      description: b.vendor ? `${b.description} · ${b.vendor}` : b.description,
      status: b.status,
      moneyIn: 0,
      moneyOut: b.amount,
      counts,
    });
  }

  raw.sort((a, b) => (a.date === b.date ? a.at - b.at : a.date < b.date ? -1 : 1));
  let running = 0;
  const lines = raw.map((l) => {
    if (l.counts) running = round2(running + l.moneyIn - l.moneyOut);
    return { ...l, balance: running };
  });

  const balance = round2(received - approvedBills);
  return {
    lines,
    received: round2(received),
    awaitingConfirmation: round2(awaitingConfirmation),
    disputed: round2(disputed),
    approvedBills: round2(approvedBills),
    pendingBills: round2(pendingBills),
    rejectedBills: round2(rejectedBills),
    balance,
    balanceAfterPending: round2(balance - pendingBills),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The model's date, with the year fixed when the bill doesn't print one: use the most
 * recent occurrence of that day and month that isn't in the future.
 */
export function resolveBillDate(value: unknown, yearPrinted: boolean, today: string): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (yearPrinted) return isIsoDate(value) && value <= today ? value : null;
  const md = value.slice(5);
  const year = Number(today.slice(0, 4));
  for (const y of [year, year - 1]) {
    const candidate = `${y}-${md}`;
    // Date.parse accepts 2026-02-30, so check the day survives the round trip.
    const ok = isIsoDate(candidate) && new Date(`${candidate}T00:00:00Z`).toISOString().slice(0, 10) === candidate;
    if (ok && candidate <= today) return candidate;
  }
  return null;
}

/** Receipts older than this are flagged so an old bill isn't submitted by mistake. */
export const OLD_RECEIPT_DAYS = 60;

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** Parse a user-entered AED amount: positive, at most 2 decimals. */
export function parseAmount(input: string): number | null {
  const s = input.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n < 10_000_000 ? n : null;
}

/* ------------------------------------------------------------------ *
 * Logs (visible to the Production Manager only)
 * ------------------------------------------------------------------ */

export type AccessEvent = "sign_in" | "sign_in_failed" | "sign_out";

export interface AccessLog {
  id: string;
  at: number;
  event: AccessEvent;
  username: string;
  uid?: string;
  userName?: string;
  userAgent?: string;
}

export interface AckLog {
  id: string;
  at: number;
  transferId: string;
  uid: string;
  userName: string;
  amount: number;
  method: TransferMethod;
  sentByName: string;
  response: "received" | "disputed";
  note?: string;
}

export type ActivityAction =
  | "user.create"
  | "user.update"
  | "user.password_reset"
  | "user.deactivate"
  | "user.reactivate"
  | "project.create"
  | "project.rename"
  | "project.lock"
  | "project.unlock"
  | "shift.create"
  | "shift.edit"
  | "shift.delete"
  | "petty.send"
  | "petty.cancel"
  | "bill.submit"
  | "bill.approve"
  | "bill.reject"
  | "report.shifts"
  | "report.petty"
  | "report.logs";

export interface ActivityLog {
  id: string;
  at: number;
  action: ActivityAction;
  actorUid: string;
  actorName: string;
  actorRole: Role;
  targetId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}

/* ------------------------------------------------------------------ *
 * Validation + formatting
 * ------------------------------------------------------------------ */

export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

/** UAE IBAN: "AE" + 2 check digits + 19 digits = 23 chars, mod-97 checksum. */
export function isValidUaeIban(input: string): boolean {
  const v = normalizeIban(input);
  if (!/^AE\d{21}$/.test(v)) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (let i = 0; i < expanded.length; i += 7) {
    remainder = Number(String(remainder) + expanded.substring(i, i + 7)) % 97;
  }
  return remainder === 1;
}

/** UAE mobiles → +9715XXXXXXXX; otherwise any E.164 number; null if unreadable. */
export function normalizeContactNumber(input: string): string | null {
  const s = input.replace(/[^\d+]/g, "");
  const uae = s.match(/^(?:\+?971)?0?(5\d{8})$/);
  if (uae) return "+971" + uae[1];
  if (/^\+\d{8,15}$/.test(s)) return s;
  return null;
}

export function isIsoDate(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function formatDubaiDate(ms: number): string {
  return formatIsoDate(epochMsToDubaiParts(ms).date);
}

export function formatDubaiTime(ms: number): string {
  return epochMsToDubaiParts(ms).time;
}

export function formatDubaiDateTime(ms: number): string {
  return `${formatDubaiDate(ms)}, ${formatDubaiTime(ms)}`;
}

export function formatHours(h: number): string {
  return h.toFixed(2);
}

export function formatAed(amount: number): string {
  return amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
