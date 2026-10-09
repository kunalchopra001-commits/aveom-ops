import { onCall } from "firebase-functions/v2/https";
import type ExcelJS from "exceljs";
import { db, nowMs } from "./firebase";
import { bad, requireAdmin, requireViewer, type Caller } from "./guards";
import { logActivity } from "./logs";
import {
  APP_NAME,
  COL,
  METHOD_LABEL,
  ROLE_LABEL,
  TZ,
  computeStatement,
  dubaiDayRange,
  epochMsToDubaiParts,
  formatDubaiDate,
  formatDubaiDateTime,
  formatIsoDate,
  isIsoDate,
  round2,
  type AccessLog,
  type AckLog,
  type ActivityLog,
  type ActivityAction,
  type Bill,
  type Shift,
  type Transfer,
  type UserProfile,
} from "./shared";

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

interface Period {
  start: string;
  end: string;
  startMs: number;
  endMs: number;
  label: string;
}

function readPeriod(data: unknown): Period {
  const d = (data ?? {}) as Record<string, unknown>;
  const start = d.periodStart as string;
  const end = d.periodEnd as string;
  if (!isIsoDate(start) || !isIsoDate(end)) bad("Choose a start and end date.");
  if (end < start) bad("The end date must not be before the start date.");
  const [startMs, endMs] = dubaiDayRange(start, end);
  return { start, end, startMs, endMs, label: `${formatIsoDate(start)} to ${formatIsoDate(end)}` };
}

function stamp(ms: number): { label: string; file: string } {
  const p = epochMsToDubaiParts(ms);
  return { label: `${p.date} ${p.time} (${TZ})`, file: `${p.date.replace(/-/g, "")}-${p.time.replace(":", "")}` };
}

// exceljs is heavy: load it on first use so function discovery/cold starts stay fast.
async function newBook(): Promise<ExcelJS.Workbook> {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  wb.creator = APP_NAME;
  wb.created = new Date();
  return wb;
}

function header(ws: ExcelJS.Worksheet, title: string, period: string, generated: string, by: string) {
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([`Period: ${period}`]);
  ws.addRow([`Generated: ${generated} by ${by}`]);
  ws.addRow([]);
}

function table(ws: ExcelJS.Worksheet, headers: string[], widths: number[]) {
  const row = ws.addRow(headers);
  row.font = { bold: true };
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEBE6" } };
    c.border = { bottom: { style: "thin", color: { argb: "FF9A968C" } } };
  });
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: row.number }];
}

function totalRow(ws: ExcelJS.Worksheet, values: unknown[]) {
  const row = ws.addRow(values);
  row.font = { bold: true };
  row.eachCell((c) => (c.border = { top: { style: "thin" } }));
}

function money(ws: ExcelJS.Worksheet, ...cols: number[]) {
  cols.forEach((c) => (ws.getColumn(c).numFmt = "#,##0.00"));
}

function sheetNamer() {
  const used = new Set<string>();
  return (name: string) => {
    const base = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "Sheet";
    let candidate = base;
    let i = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${base.slice(0, 25)} ${i++}`;
    used.add(candidate.toLowerCase());
    return candidate;
  };
}

async function deliver(
  wb: ExcelJS.Workbook,
  fileName: string,
  caller: Caller,
  action: ActivityAction,
  summary: string,
) {
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await logActivity({ action, actor: caller, targetId: fileName, summary });
  return { ok: true as const, fileName, base64: buffer.toString("base64") };
}

/* ------------------------------------------------------------------ *
 * Shifts
 * ------------------------------------------------------------------ */

export const shiftReport = onCall({ memory: "512MiB" }, async (req) => {
  const caller = await requireViewer(req);
  const period = readPeriod(req.data);
  const gen = stamp(nowMs());

  const snap = await db
    .collection(COL.shifts)
    .where("deleted", "==", false)
    .where("startAt", ">=", period.startMs)
    .where("startAt", "<=", period.endMs)
    .orderBy("startAt", "asc")
    .get();
  const shifts = snap.docs.map((d) => d.data() as Shift);

  const wb = await newBook();
  const name = sheetNamer();
  const summary = wb.addWorksheet(name("Summary"));
  header(summary, `${APP_NAME} — Shift hours summary`, period.label, gen.label, caller.name);

  const byPerson = new Map<string, { name: string; rows: Shift[] }>();
  const byProject = new Map<string, { name: string; hours: number; wage: number }>();
  for (const s of shifts) {
    const g = byPerson.get(s.userUid) ?? { name: s.userName, rows: [] };
    g.rows.push(s);
    byPerson.set(s.userUid, g);
    const p = byProject.get(s.projectId) ?? { name: s.projectName, hours: 0, wage: 0 };
    p.hours = round2(p.hours + s.totalHours);
    p.wage = round2(p.wage + s.wageAmount);
    byProject.set(s.projectId, p);
  }
  const people = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name));

  summary.addRow(["By person"]).font = { bold: true, size: 12 };
  table(summary, ["Person", "Shifts", "Total hours", "Total wage (AED)"], [32, 10, 14, 18]);
  let h1 = 0;
  let w1 = 0;
  for (const g of people) {
    const h = round2(g.rows.reduce((a, s) => a + s.totalHours, 0));
    const w = round2(g.rows.reduce((a, s) => a + s.wageAmount, 0));
    h1 = round2(h1 + h);
    w1 = round2(w1 + w);
    summary.addRow([g.name, g.rows.length, h, w]);
  }
  totalRow(summary, ["Grand total", shifts.length, h1, w1]);

  summary.addRow([]);
  summary.addRow(["By project"]).font = { bold: true, size: 12 };
  summary.addRow(["Project", "", "Total hours", "Total wage (AED)"]).font = { bold: true };
  let h2 = 0;
  let w2 = 0;
  for (const p of [...byProject.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    h2 = round2(h2 + p.hours);
    w2 = round2(w2 + p.wage);
    summary.addRow([p.name, "", p.hours, p.wage]);
  }
  totalRow(summary, ["Grand total", "", h2, w2]);
  summary.getColumn(3).numFmt = "0.00";
  money(summary, 4);
  if (shifts.length === 0) summary.addRow(["No shifts in this period."]);

  for (const g of people) {
    const ws = wb.addWorksheet(name(g.name));
    header(ws, `${APP_NAME} — ${g.name}`, period.label, gen.label, caller.name);
    table(
      ws,
      ["Start date", "Start", "End date", "End", "Hours", "Rate (AED)", "Wage (AED)", "Project", "Flags", "Edited"],
      [14, 8, 14, 8, 9, 11, 12, 26, 20, 16],
    );
    let h = 0;
    let w = 0;
    for (const s of g.rows) {
      h = round2(h + s.totalHours);
      w = round2(w + s.wageAmount);
      ws.addRow([
        formatDubaiDate(s.startAt),
        epochMsToDubaiParts(s.startAt).time,
        formatDubaiDate(s.endAt),
        epochMsToDubaiParts(s.endAt).time,
        s.totalHours,
        s.wageRate,
        s.wageAmount,
        s.projectName,
        s.flags.map((f) => f.type.replace("_", " ")).join(", "),
        s.editedAt ? formatDubaiDate(s.editedAt) : "",
      ]);
    }
    totalRow(ws, ["Total", "", "", "", h, "", w, "", "", ""]);
    ws.getColumn(5).numFmt = "0.00";
    money(ws, 6, 7);
  }

  return deliver(
    wb,
    `AVEOM-OPS_Shifts_${period.start}_to_${period.end}_generated${gen.file}.xlsx`,
    caller,
    "report.shifts",
    `Shift report ${period.label}: ${shifts.length} shifts, AED ${w1.toFixed(2)}`,
  );
});

/* ------------------------------------------------------------------ *
 * Petty cash
 * ------------------------------------------------------------------ */

export const pettyReport = onCall({ memory: "512MiB" }, async (req) => {
  const caller = await requireViewer(req);
  const period = readPeriod(req.data);
  const gen = stamp(nowMs());

  const [tSnap, bSnap, uSnap] = await Promise.all([
    db.collection(COL.transfers).get(),
    db.collection(COL.bills).get(),
    db.collection(COL.users).get(),
  ]);
  const transfers = tSnap.docs.map((d) => d.data() as Transfer);
  const bills = bSnap.docs.map((d) => d.data() as Bill);
  const users = new Map(uSnap.docs.map((d) => [d.id, d.data() as UserProfile]));

  const holders = new Set<string>([...transfers.map((t) => t.toUid), ...bills.map((b) => b.uid)]);
  const inPeriod = (date: string) => date >= period.start && date <= period.end;

  const wb = await newBook();
  const name = sheetNamer();
  const summary = wb.addWorksheet(name("Summary"));
  header(summary, `${APP_NAME} — Petty cash summary`, period.label, gen.label, caller.name);
  table(
    summary,
    [
      "Person",
      "Opening balance",
      "Received",
      "Approved bills",
      "Closing balance",
      "Awaiting confirmation",
      "Pending bills",
      "Disputed",
    ],
    [30, 16, 14, 16, 16, 20, 14, 12],
  );

  const sorted = [...holders].sort((a, b) =>
    (users.get(a)?.displayName ?? a).localeCompare(users.get(b)?.displayName ?? b),
  );
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const personSheets: Array<() => void> = [];

  for (const uid of sorted) {
    const person = users.get(uid)?.displayName ?? transfers.find((t) => t.toUid === uid)?.toName ?? uid;
    const st = computeStatement(
      transfers.filter((t) => t.toUid === uid && t.paidOn <= period.end),
      bills.filter((b) => b.uid === uid && b.spentOn <= period.end),
    );
    const before = st.lines.filter((l) => l.date < period.start && l.counts);
    const opening = round2(before.reduce((a, l) => a + l.moneyIn - l.moneyOut, 0));
    const lines = st.lines.filter((l) => inPeriod(l.date));
    const sum = (pred: (l: (typeof lines)[number]) => boolean, f: "moneyIn" | "moneyOut") =>
      round2(lines.filter(pred).reduce((a, l) => a + l[f], 0));
    const received = sum((l) => l.kind === "received" && l.status === "acknowledged", "moneyIn");
    const approved = sum((l) => l.kind === "bill" && l.status === "approved", "moneyOut");
    const awaiting = sum((l) => l.status === "sent", "moneyIn");
    const pending = sum((l) => l.status === "pending", "moneyOut");
    const disputed = sum((l) => l.status === "disputed", "moneyIn");
    const closing = round2(opening + received - approved);

    const row = [opening, received, approved, closing, awaiting, pending, disputed];
    row.forEach((v, i) => (totals[i] = round2(totals[i] + v)));
    summary.addRow([person, ...row]);

    personSheets.push(() => {
      const ws = wb.addWorksheet(name(person));
      header(ws, `${APP_NAME} — Petty cash statement: ${person}`, period.label, gen.label, caller.name);
      table(ws, ["Date", "Type", "Details", "Status", "In (AED)", "Out (AED)", "Balance (AED)"], [14, 12, 44, 22, 12, 12, 14]);
      ws.addRow(["", "", "Opening balance", "", "", "", opening]).font = { italic: true };
      let running = opening;
      for (const l of lines) {
        if (l.counts) running = round2(running + l.moneyIn - l.moneyOut);
        ws.addRow([
          formatIsoDate(l.date),
          l.kind === "received" ? "Received" : "Bill",
          l.description,
          statusLabel(l.status),
          l.moneyIn || "",
          l.moneyOut || "",
          l.counts ? running : "",
        ]);
      }
      totalRow(ws, ["", "", "Closing balance", "", received, approved, closing]);
      ws.addRow([]);
      ws.addRow(["Only confirmed payments and approved bills change the balance."]).font = {
        italic: true,
        color: { argb: "FF6B675E" },
      };
      money(ws, 5, 6, 7);
    });
  }
  totalRow(summary, ["Total", ...totals]);
  money(summary, 2, 3, 4, 5, 6, 7, 8);
  if (sorted.length === 0) summary.addRow(["No petty cash activity yet."]);

  // All payments in the period
  const pay = wb.addWorksheet(name("All payments"));
  header(pay, `${APP_NAME} — Petty cash payments`, period.label, gen.label, caller.name);
  table(pay, ["Paid on", "To", "Amount (AED)", "Method", "Reference", "Note", "Status", "Confirmed / disputed", "Recipient note"], [14, 26, 14, 14, 18, 30, 22, 20, 30]);
  for (const t of transfers.filter((t) => inPeriod(t.paidOn)).sort((a, b) => a.paidOn.localeCompare(b.paidOn))) {
    pay.addRow([
      formatIsoDate(t.paidOn),
      t.toName,
      t.amount,
      METHOD_LABEL[t.method],
      t.reference ?? "",
      t.note ?? "",
      statusLabel(t.status) + (t.cancelReason ? ` — ${t.cancelReason}` : ""),
      t.respondedAt ? formatDubaiDateTime(t.respondedAt) : "",
      t.responseNote ?? "",
    ]);
  }
  money(pay, 3);

  // All bills in the period
  const bl = wb.addWorksheet(name("All bills"));
  header(bl, `${APP_NAME} — Petty cash bills`, period.label, gen.label, caller.name);
  table(bl, ["Bill date", "Person", "Amount (AED)", "Description", "Shop / supplier", "Project", "Files", "Status", "Reviewed by", "Reason"], [14, 26, 14, 34, 22, 22, 8, 12, 20, 30]);
  for (const b of bills.filter((b) => inPeriod(b.spentOn)).sort((a, b) => a.spentOn.localeCompare(b.spentOn))) {
    bl.addRow([
      formatIsoDate(b.spentOn),
      b.userName,
      b.amount,
      b.description,
      b.vendor ?? "",
      b.projectName ?? "",
      b.files.length,
      statusLabel(b.status),
      b.reviewedByName ?? "",
      b.rejectReason ?? "",
    ]);
  }
  money(bl, 3);

  personSheets.forEach((build) => build());

  return deliver(
    wb,
    `AVEOM-OPS_PettyCash_${period.start}_to_${period.end}_generated${gen.file}.xlsx`,
    caller,
    "report.petty",
    `Petty cash report ${period.label}: ${sorted.length} people`,
  );
});

function statusLabel(s: string): string {
  return (
    {
      sent: "Awaiting confirmation",
      acknowledged: "Confirmed",
      disputed: "Disputed",
      cancelled: "Cancelled",
      pending: "Pending review",
      approved: "Approved",
      rejected: "Rejected",
    } as Record<string, string>
  )[s] ?? s;
}

/* ------------------------------------------------------------------ *
 * Logs (Production Manager only) — one sheet per log
 * ------------------------------------------------------------------ */

export const logsReport = onCall({ memory: "512MiB" }, async (req) => {
  const caller = await requireAdmin(req);
  const period = readPeriod(req.data);
  const gen = stamp(nowMs());

  const range = (col: string) =>
    db.collection(col).where("at", ">=", period.startMs).where("at", "<=", period.endMs).orderBy("at", "asc").get();
  const [aSnap, kSnap, vSnap] = await Promise.all([range(COL.logAccess), range(COL.logAck), range(COL.logActivity)]);

  const wb = await newBook();

  const access = wb.addWorksheet("Access log");
  header(access, `${APP_NAME} — Access log`, period.label, gen.label, caller.name);
  table(access, ["When", "Event", "Username", "Person", "Device"], [22, 18, 18, 26, 60]);
  for (const d of aSnap.docs) {
    const l = d.data() as AccessLog;
    access.addRow([
      formatDubaiDateTime(l.at),
      { sign_in: "Signed in", sign_in_failed: "FAILED sign-in", sign_out: "Signed out" }[l.event],
      l.username,
      l.userName ?? "",
      l.userAgent ?? "",
    ]);
  }

  const ack = wb.addWorksheet("Acknowledgements");
  header(ack, `${APP_NAME} — Petty cash acknowledgements`, period.label, gen.label, caller.name);
  table(ack, ["When", "Person", "Response", "Amount (AED)", "Method", "Sent by", "Note", "Payment id"], [22, 26, 14, 14, 14, 20, 36, 26]);
  for (const d of kSnap.docs) {
    const l = d.data() as AckLog;
    ack.addRow([
      formatDubaiDateTime(l.at),
      l.userName,
      l.response === "received" ? "Received" : "Disputed",
      l.amount,
      METHOD_LABEL[l.method],
      l.sentByName,
      l.note ?? "",
      l.transferId,
    ]);
  }
  money(ack, 4);

  const act = wb.addWorksheet("Activity");
  header(act, `${APP_NAME} — Activity log`, period.label, gen.label, caller.name);
  table(act, ["When", "Who", "Role", "Action", "What happened", "Record id"], [22, 24, 18, 18, 70, 26]);
  for (const d of vSnap.docs) {
    const l = d.data() as ActivityLog;
    act.addRow([formatDubaiDateTime(l.at), l.actorName, ROLE_LABEL[l.actorRole], l.action, l.summary, l.targetId]);
  }

  return deliver(
    wb,
    `AVEOM-OPS_Logs_${period.start}_to_${period.end}_generated${gen.file}.xlsx`,
    caller,
    "report.logs",
    `Exported logs ${period.label}`,
  );
});
