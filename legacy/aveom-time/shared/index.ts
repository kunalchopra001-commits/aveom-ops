/**
 * AVEOM TIME — shared domain module.
 * Imported as source by the web app (Vite alias `@shared`) and bundled into
 * the Cloud Functions build (tsup). Keep it dependency-free and side-effect-free.
 */

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

export const COL = {
  employees: "employees",
  shifts: "shifts",
  projects: "projects",
  auditLog: "auditLog",
  reports: "reports",
  config: "config",
} as const;

export const CONFIG_DOC = {
  registration: "registration",
} as const;

/** Flat wage rate, AED per hour. Copied onto every shift at creation. */
export const WAGE_RATE_AED = 25.0;

/** Shifts longer than this (in hours) get a soft `long_shift` flag. */
export const LONG_SHIFT_HOURS = 16;

/** Length of the shared registration code the managers hand out. */
export const REGISTRATION_CODE_LENGTH = 6;

/** Grace window (ms) before a one-time profile unlock expires unused. */
export const UNLOCK_GRANT_TTL_MS = 48 * 60 * 60 * 1000;

/** Grace window (ms) after an employee is blocked before their ID images are purged. */
export const ID_PURGE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** Reporting / display timezone. Not used for storage (everything is UTC epoch ms). */
export const TZ = "Asia/Dubai";

/* ------------------------------------------------------------------ *
 * Wage + hours maths
 * ------------------------------------------------------------------ */

/**
 * Round worked minutes UP to the next half hour.
 *   1–29  -> 30
 *   30    -> 30
 *   31–59 -> 60
 */
export function roundMinutesToHalfHour(workedMinutes: number): number {
  if (!Number.isFinite(workedMinutes) || workedMinutes <= 0) return 0;
  return Math.ceil(workedMinutes / 30) * 30;
}

export interface ShiftHours {
  rawMinutes: number;
  totalHours: number;
}

/** Compute raw + rounded hours for a shift from epoch-ms bounds. */
export function computeShiftHours(startAtMs: number, endAtMs: number): ShiftHours {
  const rawMinutes = Math.max(0, Math.round((endAtMs - startAtMs) / 60000));
  const roundedMinutes = roundMinutesToHalfHour(rawMinutes);
  return { rawMinutes, totalHours: roundedMinutes / 60 };
}

/** Wage amount for a shift, rounded to fils (2 dp). */
export function computeWage(totalHours: number, rate: number = WAGE_RATE_AED): number {
  return Math.round(totalHours * rate * 100) / 100;
}

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type Role = "ops" | "founder" | "accountant" | "employee";
export type EmployeeStatus = "pending" | "approved" | "blocked";

export const MANAGER_ROLES: Role[] = ["ops", "founder", "accountant"];
export const ADMIN_ROLES: Role[] = ["ops", "founder"];

export interface BankDetails {
  accountHolderName: string;
  bankName: string;
  accountNumber?: string;
  iban: string;
}

export interface OcrExtract {
  officialName?: string;
  eidNumber?: string;
  eidIssueDate?: string; // ISO yyyy-mm-dd
  eidExpiryDate?: string;
}

export interface OcrResult {
  extract: OcrExtract;
  rawTextFront?: string;
  rawTextBack?: string;
  mrzFound: boolean;
  confidence: number; // 0..1, best-effort
  extractedAt: number;
  needsReview: boolean;
  /** uids of other employees found with the same Emirates ID number. */
  duplicateOf?: string[];
}

export interface UnlockGrant {
  grantedBy: string;
  grantedByName?: string;
  grantedAt: number;
  expiresAt: number;
  used: boolean;
}

export interface EmployeeProfile {
  uid: string;
  email: string;
  status: EmployeeStatus;

  contactNumber?: string;
  officialName?: string;
  eidNumber?: string;
  eidIssueDate?: string;
  eidExpiryDate?: string;
  eidFrontPath?: string;
  eidBackPath?: string;
  ocr?: OcrResult;
  bank?: BankDetails;

  /** true once all required onboarding fields are present. */
  profileComplete: boolean;
  /** true = read-only to the employee. */
  profileLocked: boolean;
  unlockGrant: UnlockGrant | null;

  approvedBy?: string;
  approvedAt?: number;
  rejectedBy?: string;
  rejectedAt?: number;
  blockedBy?: string;
  blockedAt?: number;
  /** epoch ms after which the ID images are deleted; null when not scheduled. */
  idPurgeAt?: number | null;
  idPurgedAt?: number;

  createdAt: number;
  updatedAt: number;
}

export type ShiftFlagType =
  | "overlap"
  | "long_shift"
  | "locked_project"
  | "entered_after_block";

export interface ShiftFlag {
  type: ShiftFlagType;
  note?: string;
}

export interface ShiftEdit {
  by: string;
  byName?: string;
  at: number;
  before: Partial<Shift>;
  after: Partial<Shift>;
}

export interface Shift {
  /** client-generated UUID; also the Firestore doc id. */
  id: string;
  employeeUid: string;
  employeeName: string;
  projectId: string;
  projectName: string;

  startAt: number; // epoch ms, UTC
  endAt: number;
  rawMinutes: number;
  totalHours: number;
  wageRate: number;
  wageAmount: number;

  flags: ShiftFlag[];

  enteredAt: number; // device clock at submit time
  createdAt: number; // server clock at first write
  editedBy?: string;
  editedAt?: number;
  editHistory?: ShiftEdit[];

  deleted: boolean;
  deletedBy?: string;
  deletedAt?: number;
}

export interface Project {
  id: string;
  name: string;
  code?: string;
  locked: boolean;
  createdBy: string;
  createdAt: number;
  lockedBy?: string;
  lockedAt?: number;
}

export type AuditAction =
  | "employee.approve"
  | "employee.reject"
  | "employee.block"
  | "employee.unblock"
  | "employee.unlock"
  | "employee.correct"
  | "employee.id_purged"
  | "project.create"
  | "project.lock"
  | "project.unlock"
  | "project.rename"
  | "shift.edit"
  | "shift.delete"
  | "report.generate"
  | "config.registration_code";

export interface AuditEntry {
  id: string;
  action: AuditAction;
  actorUid: string;
  actorName?: string;
  actorRole: Role;
  targetType: "employee" | "project" | "shift" | "report" | "config";
  targetId: string;
  before?: unknown;
  after?: unknown;
  at: number;
}

export interface ReportMeta {
  id: string;
  generatedBy: string;
  generatedByName?: string;
  generatedAt: number;
  periodStart: string; // ISO yyyy-mm-dd
  periodEnd: string;
  employeeFilter: string[] | null;
  projectFilter: string[] | null;
  storagePath: string;
  fileName: string;
  shiftCount: number;
  grandTotalWage: number;
}

/* ------------------------------------------------------------------ *
 * Validation helpers
 * ------------------------------------------------------------------ */

/** UAE IBAN: "AE" + 2 check digits + 3-digit bank + 16-digit account = 23 chars. */
export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

export function isValidUaeIban(input: string): boolean {
  const v = normalizeIban(input);
  if (!/^AE\d{21}$/.test(v)) return false;
  return iso7064Mod97(v) === 1;
}

function iso7064Mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (let i = 0; i < expanded.length; i += 7) {
    const block = String(remainder) + expanded.substring(i, i + 7);
    remainder = Number(block) % 97;
  }
  return remainder;
}

/**
 * Normalise a contact number.
 * Accepts UAE mobiles (`05XXXXXXXX`, `5XXXXXXXX`, `+9715XXXXXXXX`) and returns
 * them as `+9715XXXXXXXX`. Falls back to accepting any E.164 number.
 * Returns null when it cannot be understood.
 */
export function normalizeContactNumber(input: string): string | null {
  const s = input.replace(/[^\d+]/g, "");
  const uae = s.match(/^(?:\+?971)?0?(5\d{8})$/);
  if (uae) return "+971" + uae[1];
  if (/^\+\d{8,15}$/.test(s)) return s;
  return null;
}

/** ISO yyyy-mm-dd sanity check (not a full calendar check). */
export function isIsoDate(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export interface OnboardingValues {
  contactNumber?: string;
  officialName?: string;
  eidNumber?: string;
  eidIssueDate?: string;
  eidExpiryDate?: string;
  eidFrontPath?: string;
  eidBackPath?: string;
  bank?: Partial<BankDetails>;
}

/** Which onboarding fields are still missing / invalid. Empty array = complete. */
export function onboardingProblems(v: OnboardingValues): string[] {
  const p: string[] = [];
  if (!v.contactNumber || !normalizeContactNumber(v.contactNumber))
    p.push("A valid working contact number is required.");
  if (!v.eidFrontPath) p.push("Upload the front of the Emirates ID.");
  if (!v.eidBackPath) p.push("Upload the back of the Emirates ID.");
  if (!v.officialName || v.officialName.trim().length < 3)
    p.push("Confirm the official name from the Emirates ID.");
  if (!isIsoDate(v.eidIssueDate)) p.push("Confirm the Emirates ID issue date.");
  if (!isIsoDate(v.eidExpiryDate)) p.push("Confirm the Emirates ID expiry date.");
  if (!v.bank?.accountHolderName || v.bank.accountHolderName.trim().length < 3)
    p.push("Enter the bank account holder name.");
  if (!v.bank?.bankName || v.bank.bankName.trim().length < 2)
    p.push("Enter the bank name.");
  if (!v.bank?.iban || !isValidUaeIban(v.bank.iban))
    p.push("Enter a valid UAE IBAN (AE followed by 21 digits).");
  return p;
}

export function isProfileComplete(v: OnboardingValues): boolean {
  return onboardingProblems(v).length === 0;
}

/* ------------------------------------------------------------------ *
 * Shift helpers
 * ------------------------------------------------------------------ */

export interface ShiftInput {
  startDate: string; // yyyy-mm-dd (Asia/Dubai wall time)
  startTime: string; // HH:mm
  endDate: string;
  endTime: string;
}

/** Fixed +04:00 offset for Asia/Dubai (no DST). */
export function dubaiWallTimeToEpochMs(date: string, time: string): number {
  // date=yyyy-mm-dd, time=HH:mm -> treat as +04:00
  const ms = Date.parse(`${date}T${time}:00+04:00`);
  return Number.isNaN(ms) ? NaN : ms;
}

export function epochMsToDubaiParts(ms: number): { date: string; time: string } {
  const d = new Date(ms + 4 * 60 * 60 * 1000);
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export interface ShiftDraftProblem {
  field: "range" | "startDate" | "endDate";
  message: string;
}

export function validateShiftInput(input: ShiftInput): ShiftDraftProblem[] {
  const problems: ShiftDraftProblem[] = [];
  const start = dubaiWallTimeToEpochMs(input.startDate, input.startTime);
  const end = dubaiWallTimeToEpochMs(input.endDate, input.endTime);
  if (Number.isNaN(start)) problems.push({ field: "startDate", message: "Enter a valid start date and time." });
  if (Number.isNaN(end)) problems.push({ field: "endDate", message: "Enter a valid end date and time." });
  if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start)
    problems.push({ field: "range", message: "The shift must end after it starts." });
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
  const wageAmount = computeWage(totalHours);
  return {
    startAt,
    endAt,
    rawMinutes,
    totalHours,
    wageRate: WAGE_RATE_AED,
    wageAmount,
    isLong: totalHours > LONG_SHIFT_HOURS,
  };
}

/** Do two [start,end) intervals overlap? */
export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/* ------------------------------------------------------------------ *
 * Formatting (display only)
 * ------------------------------------------------------------------ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDubaiDate(ms: number): string {
  const { date } = epochMsToDubaiParts(ms);
  const [y, m, d] = date.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function formatDubaiTime(ms: number): string {
  return epochMsToDubaiParts(ms).time;
}

export function formatHours(h: number): string {
  return h.toFixed(2);
}

export function formatAed(amount: number): string {
  return amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
