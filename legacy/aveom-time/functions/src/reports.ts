import { onCall, HttpsError } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { db, storageAdmin, nowMs, randomId } from "./firebase";
import { requireManager } from "./guards";
import { writeAudit } from "./audit";
import {
  COL,
  TZ,
  epochMsToDubaiParts,
  formatDubaiDate,
  isIsoDate,
  type ReportMeta,
  type Shift,
} from "./shared";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HEADERS = [
  "Shift start date",
  "Start time",
  "Shift end date",
  "End time",
  "Total hours",
  "Wage rate (AED)",
  "Wage amount (AED)",
  "Project",
];

export const generateReport = onCall(async (req) => {
  const caller = requireManager(req);
  const periodStart = req.data?.periodStart as string;
  const periodEnd = req.data?.periodEnd as string;
  const employeeFilter = (req.data?.employeeFilter as string[] | null) ?? null;
  const projectFilter = (req.data?.projectFilter as string[] | null) ?? null;

  if (!isIsoDate(periodStart) || !isIsoDate(periodEnd)) {
    throw new HttpsError("invalid-argument", "periodStart and periodEnd must be yyyy-mm-dd.");
  }
  const startMs = Date.parse(`${periodStart}T00:00:00+04:00`);
  const endMs = Date.parse(`${periodEnd}T23:59:59.999+04:00`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    throw new HttpsError("invalid-argument", "The end date must not be before the start date.");
  }

  const snap = await db
    .collection(COL.shifts)
    .where("deleted", "==", false)
    .where("startAt", ">=", startMs)
    .where("startAt", "<=", endMs)
    .orderBy("startAt", "asc")
    .get();

  let shifts = snap.docs.map((d) => d.data() as Shift);
  if (employeeFilter?.length) shifts = shifts.filter((s) => employeeFilter.includes(s.employeeUid));
  if (projectFilter?.length) shifts = shifts.filter((s) => projectFilter.includes(s.projectId));

  const generatedAt = nowMs();
  const genParts = epochMsToDubaiParts(generatedAt);
  const stamp = `${genParts.date.replace(/-/g, "")}-${genParts.time.replace(":", "")}`;
  const periodLabel = `${formatDubaiDate(startMs)} to ${formatDubaiDate(endMs)}`;
  const genLabel = `${genParts.date} ${genParts.time} (${TZ})`;

  const wb = new ExcelJS.Workbook();
  wb.creator = "AVEOM TIME";
  wb.created = new Date(generatedAt);

  // ---- group by employee ----
  const byEmp = new Map<string, { name: string; rows: Shift[] }>();
  for (const s of shifts) {
    const g = byEmp.get(s.employeeUid) ?? { name: s.employeeName, rows: [] };
    g.name = s.employeeName || g.name;
    g.rows.push(s);
    byEmp.set(s.employeeUid, g);
  }
  const employees = [...byEmp.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));

  // ---- summary sheet (first) ----
  const summary = wb.addWorksheet("Summary");
  summaryHeader(summary, "AVEOM TIME — Timesheet summary", periodLabel, genLabel);

  summary.addRow([]);
  const t1Title = summary.addRow(["By employee"]);
  t1Title.font = { bold: true, size: 12 };
  const t1Head = summary.addRow(["Employee", "Total hours", "Total wage (AED)"]);
  t1Head.font = { bold: true };
  let empGrandHours = 0;
  let empGrandWage = 0;
  for (const [, g] of employees) {
    const h = round2(g.rows.reduce((a, s) => a + s.totalHours, 0));
    const w = round2(g.rows.reduce((a, s) => a + s.wageAmount, 0));
    empGrandHours = round2(empGrandHours + h);
    empGrandWage = round2(empGrandWage + w);
    summary.addRow([g.name, h, w]);
  }
  const g1 = summary.addRow(["Grand total", empGrandHours, empGrandWage]);
  g1.font = { bold: true };

  summary.addRow([]);
  const t2Title = summary.addRow(["By project"]);
  t2Title.font = { bold: true, size: 12 };
  const t2Head = summary.addRow(["Project", "Total hours", "Total wage (AED)"]);
  t2Head.font = { bold: true };
  const byProj = new Map<string, { name: string; hours: number; wage: number }>();
  for (const s of shifts) {
    const p = byProj.get(s.projectId) ?? { name: s.projectName, hours: 0, wage: 0 };
    p.name = s.projectName || p.name;
    p.hours = round2(p.hours + s.totalHours);
    p.wage = round2(p.wage + s.wageAmount);
    byProj.set(s.projectId, p);
  }
  let projGrandHours = 0;
  let projGrandWage = 0;
  for (const p of [...byProj.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    projGrandHours = round2(projGrandHours + p.hours);
    projGrandWage = round2(projGrandWage + p.wage);
    summary.addRow([p.name, p.hours, p.wage]);
  }
  const g2 = summary.addRow(["Grand total", projGrandHours, projGrandWage]);
  g2.font = { bold: true };

  summary.getColumn(1).width = 34;
  summary.getColumn(2).width = 14;
  summary.getColumn(3).width = 18;
  summary.getColumn(2).numFmt = "0.00";
  summary.getColumn(3).numFmt = "#,##0.00";

  // ---- one sheet per employee ----
  const usedNames = new Set<string>(["Summary"]);
  for (const [, g] of employees) {
    const ws = wb.addWorksheet(uniqueSheetName(g.name, usedNames));
    summaryHeader(ws, `AVEOM TIME — ${g.name}`, periodLabel, genLabel);
    ws.addRow([]);
    const head = ws.addRow(HEADERS);
    head.font = { bold: true };

    let hTotal = 0;
    let wTotal = 0;
    for (const s of g.rows) {
      const sp = epochMsToDubaiParts(s.startAt);
      const ep = epochMsToDubaiParts(s.endAt);
      hTotal = round2(hTotal + s.totalHours);
      wTotal = round2(wTotal + s.wageAmount);
      ws.addRow([
        formatDubaiDate(s.startAt),
        sp.time,
        formatDubaiDate(s.endAt),
        ep.time,
        round2(s.totalHours),
        round2(s.wageRate),
        round2(s.wageAmount),
        s.projectName,
      ]);
    }
    const gr = ws.addRow(["Grand total", "", "", "", hTotal, "", wTotal, ""]);
    gr.font = { bold: true };

    ws.getColumn(5).numFmt = "0.00";
    ws.getColumn(6).numFmt = "0.00";
    ws.getColumn(7).numFmt = "#,##0.00";
    [18, 10, 18, 10, 12, 14, 16, 26].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 5 }];
  }

  if (employees.length === 0) {
    summary.addRow([]);
    summary.addRow(["No shifts fall in this period."]);
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  // ---- store ----
  const id = randomId("rep_");
  const fileName = `AVEOM-TIME_Timesheet_${periodStart}_to_${periodEnd}_generated${stamp}.xlsx`;
  const storagePath = `reports/${id}/${fileName}`;
  const token = randomUUID();
  await storageAdmin
    .bucket()
    .file(storagePath)
    .save(buffer, {
      contentType: XLSX_MIME,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });

  const grandTotalWage = empGrandWage;
  const meta: ReportMeta = {
    id,
    generatedBy: caller.uid,
    generatedByName: caller.name ?? caller.email,
    generatedAt,
    periodStart,
    periodEnd,
    employeeFilter,
    projectFilter,
    storagePath,
    fileName,
    shiftCount: shifts.length,
    grandTotalWage,
  };
  await db.collection(COL.reports).doc(id).set(meta);
  await writeAudit({
    action: "report.generate",
    actor: caller,
    targetType: "report",
    targetId: id,
    after: { periodStart, periodEnd, shiftCount: shifts.length, grandTotalWage },
  });

  return { ok: true as const, storagePath, fileName, shiftCount: shifts.length, grandTotalWage };
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function summaryHeader(ws: ExcelJS.Worksheet, title: string, period: string, generated: string) {
  const t = ws.addRow([title]);
  t.font = { bold: true, size: 14 };
  ws.addRow([`Period: ${period}`]);
  ws.addRow([`Generated: ${generated}`]);
}

function uniqueSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "Employee";
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) candidate = `${base.slice(0, 25)} ${i++}`;
  used.add(candidate);
  return candidate;
}
