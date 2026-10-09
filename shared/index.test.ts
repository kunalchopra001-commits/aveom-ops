import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeShiftFromInput,
  fortnightOf,
  formatRange,
  shiftFortnight,
  computeStatement,
  emailToUsername,
  isValidUaeIban,
  isValidUsername,
  normalizeContactNumber,
  parseAmount,
  resolveBillDate,
  roundMinutesToHalfHour,
  usernameToEmail,
  validateShiftInput,
  type Bill,
  type Transfer,
} from "./index.ts";

test("hours round up to the next half hour", () => {
  assert.equal(roundMinutesToHalfHour(1), 30);
  assert.equal(roundMinutesToHalfHour(30), 30);
  assert.equal(roundMinutesToHalfHour(31), 60);
  assert.equal(roundMinutesToHalfHour(0), 0);
});

test("07:00–16:40 is 10 h and AED 250 (verified on AVEOM TIME)", () => {
  const c = computeShiftFromInput({ startDate: "2026-09-07", startTime: "07:00", endDate: "2026-09-07", endTime: "16:40" });
  assert.equal(c.totalHours, 10);
  assert.equal(c.wageAmount, 250);
});

test("overnight shift across midnight", () => {
  const c = computeShiftFromInput({ startDate: "2026-09-07", startTime: "22:00", endDate: "2026-09-08", endTime: "06:15" });
  assert.equal(c.rawMinutes, 495);
  assert.equal(c.totalHours, 8.5);
  assert.equal(c.wageAmount, 212.5);
});

test("shift validation", () => {
  assert.deepEqual(validateShiftInput({ startDate: "2026-09-07", startTime: "09:00", endDate: "2026-09-07", endTime: "17:00" }), []);
  assert.match(validateShiftInput({ startDate: "2026-09-07", startTime: "17:00", endDate: "2026-09-07", endTime: "09:00" })[0], /end after/);
  assert.match(validateShiftInput({ startDate: "2026-09-01", startTime: "09:00", endDate: "2026-09-07", endTime: "09:00" })[0], /72 hours/);
});

test("usernames map to reserved emails and back", () => {
  assert.equal(usernameToEmail(" Nawaz "), "nawaz@users.aveom-ops.invalid");
  assert.equal(emailToUsername("nawaz@users.aveom-ops.invalid"), "nawaz");
  assert.ok(isValidUsername("inaye"));
  assert.ok(isValidUsername("d.philip_2"));
  assert.ok(!isValidUsername("ab"));
  assert.ok(!isValidUsername("has space"));
});

test("amount parsing", () => {
  assert.equal(parseAmount("1,250.50"), 1250.5);
  assert.equal(parseAmount("0"), null);
  assert.equal(parseAmount("12.345"), null);
  assert.equal(parseAmount("-5"), null);
  assert.equal(parseAmount("abc"), null);
});

test("UAE IBAN + contact numbers", () => {
  assert.ok(isValidUaeIban("AE07 0331 2345 6789 0123 456"));
  assert.ok(!isValidUaeIban("AE08 0331 2345 6789 0123 456"));
  assert.equal(normalizeContactNumber("050 123 4567"), "+971501234567");
  assert.equal(normalizeContactNumber("+44 7700 900123"), "+447700900123");
  assert.equal(normalizeContactNumber("123"), null);
});

const T = (p: Partial<Transfer>): Transfer => ({
  id: Math.random().toString(36),
  toUid: "u1",
  toName: "Nawaz",
  amount: 0,
  method: "cash",
  paidOn: "2026-10-01",
  sentBy: "inaye",
  sentByName: "Inaye",
  sentAt: 1,
  status: "sent",
  ...p,
});
const B = (p: Partial<Bill>): Bill => ({
  id: Math.random().toString(36),
  uid: "u1",
  userName: "Nawaz",
  amount: 0,
  spentOn: "2026-10-02",
  description: "x",
  files: [],
  status: "pending",
  ...p,
  submittedAt: p.submittedAt ?? Date.parse(`${p.spentOn ?? "2026-10-02"}T12:00:00+04:00`),
});

test("statement: only confirmed payments and approved bills move the balance", () => {
  const st = computeStatement(
    [
      T({ amount: 1000, status: "acknowledged", paidOn: "2026-10-01" }),
      T({ amount: 500, status: "sent", paidOn: "2026-10-03" }),
      T({ amount: 200, status: "disputed", paidOn: "2026-10-04" }),
      T({ amount: 999, status: "cancelled" }),
    ],
    [
      B({ amount: 120.5, status: "approved", spentOn: "2026-10-02" }),
      B({ amount: 80, status: "pending", spentOn: "2026-10-05" }),
      B({ amount: 40, status: "rejected", spentOn: "2026-10-05" }),
    ],
  );
  assert.equal(st.received, 1000);
  assert.equal(st.approvedBills, 120.5);
  assert.equal(st.balance, 879.5);
  assert.equal(st.awaitingConfirmation, 500);
  assert.equal(st.disputed, 200);
  assert.equal(st.pendingBills, 80);
  assert.equal(st.rejectedBills, 40);
  assert.equal(st.balanceAfterPending, 799.5);
  // cancelled payments are hidden; lines are in date order with a running balance
  assert.equal(st.lines.length, 6);
  assert.deepEqual(
    st.lines.map((l) => l.balance),
    [1000, 879.5, 879.5, 879.5, 879.5, 879.5],
  );
});

test("statement: fils don't drift", () => {
  const st = computeStatement(
    [T({ amount: 0.1, status: "acknowledged" }), T({ amount: 0.2, status: "acknowledged" })],
    [],
  );
  assert.equal(st.balance, 0.3);
});

test("fortnights are 1–15 and 16–end of month", () => {
  assert.deepEqual(fortnightOf("2026-10-09"), ["2026-10-01", "2026-10-15"]);
  assert.deepEqual(fortnightOf("2026-10-15"), ["2026-10-01", "2026-10-15"]);
  assert.deepEqual(fortnightOf("2026-10-16"), ["2026-10-16", "2026-10-31"]);
  assert.deepEqual(fortnightOf("2026-02-20"), ["2026-02-16", "2026-02-28"]);
  assert.deepEqual(fortnightOf("2028-02-29"), ["2028-02-16", "2028-02-29"]);
  assert.deepEqual(fortnightOf("2026-09-30"), ["2026-09-16", "2026-09-30"]);
});

test("stepping between fortnights crosses months and years", () => {
  assert.deepEqual(shiftFortnight(["2026-10-01", "2026-10-15"], -1), ["2026-09-16", "2026-09-30"]);
  assert.deepEqual(shiftFortnight(["2026-10-16", "2026-10-31"], -1), ["2026-10-01", "2026-10-15"]);
  assert.deepEqual(shiftFortnight(["2026-10-16", "2026-10-31"], 1), ["2026-11-01", "2026-11-15"]);
  assert.deepEqual(shiftFortnight(["2026-12-16", "2026-12-31"], 1), ["2027-01-01", "2027-01-15"]);
  assert.deepEqual(shiftFortnight(["2027-01-01", "2027-01-15"], -1), ["2026-12-16", "2026-12-31"]);
  assert.equal(formatRange(["2026-10-01", "2026-10-15"]), "1–15 Oct 2026");
  assert.equal(formatRange(["2026-09-28", "2026-10-03"]), "28 Sep – 3 Oct 2026");
});

test("statement: bills count in the fortnight they were submitted, not the receipt date", () => {
  const st = computeStatement(
    [T({ amount: 500, status: "acknowledged", paidOn: "2026-10-01" })],
    [B({ amount: 50, status: "pending", spentOn: "2023-09-17", submittedAt: Date.parse("2026-10-09T10:00:00+04:00") })],
  );
  const bill = st.lines.find((l) => l.kind === "bill")!;
  assert.equal(bill.date, "2026-10-09");
  assert.equal(bill.receiptDate, "2023-09-17");
  assert.equal(st.lines[0].kind, "received"); // ordered by submission, after the payment
});

test("bill dates without a printed year use the latest past occurrence", () => {
  assert.equal(resolveBillDate("2000-09-16", false, "2026-10-09"), "2026-09-16");
  assert.equal(resolveBillDate("2000-12-20", false, "2026-10-09"), "2025-12-20"); // not in the future
  assert.equal(resolveBillDate("2000-10-09", false, "2026-10-09"), "2026-10-09");
  assert.equal(resolveBillDate("2000-02-29", false, "2026-10-09"), null); // no 29 Feb in 2025/2026
  assert.equal(resolveBillDate("2023-09-16", true, "2026-10-09"), "2023-09-16"); // year printed: trust it
  assert.equal(resolveBillDate("2027-01-01", true, "2026-10-09"), null); // future
  assert.equal(resolveBillDate("16/09", false, "2026-10-09"), null);
});
