import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSync } from "@/sync/SyncProvider";
import { useProjects } from "@/lib/queries";
import { newId } from "@/lib/data";
import { Banner, Field, Loading, PageHead, useOnline } from "@/components/ui";
import {
  LONG_SHIFT_HOURS,
  WAGE_RATE_AED,
  computeShiftFromInput,
  formatAed,
  formatHours,
  todayDubai,
  validateShiftInput,
  type ShiftFlag,
} from "@shared";

export function LogShift() {
  const { enqueue } = useSync();
  const online = useOnline();
  const projects = useProjects(true);
  const today = todayDubai();

  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState(today);
  const [endTime, setEndTime] = useState("17:00");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const list = useMemo(() => [...(projects.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [projects.data]);
  const selected = list.find((p) => p.id === projectId) ?? (list.length === 1 ? list[0] : undefined);

  const input = { startDate, startTime, endDate, endTime };
  const problems = validateShiftInput(input);
  const calc = problems.length === 0 ? computeShiftFromInput(input) : null;

  async function submit() {
    setError("");
    setDone("");
    if (problems.length) return setError(problems[0]);
    if (!selected) return setError("Choose a project.");
    const c = computeShiftFromInput(input);
    const flags: ShiftFlag[] = c.isLong ? [{ type: "long_shift" }] : [];
    await enqueue(newId(), {
      projectId: selected.id,
      projectName: selected.name,
      startAt: c.startAt,
      endAt: c.endAt,
      rawMinutes: c.rawMinutes,
      totalHours: c.totalHours,
      wageRate: WAGE_RATE_AED,
      wageAmount: c.wageAmount,
      flags,
    });
    setDone(
      `Saved ${formatHours(c.totalHours)} h · AED ${formatAed(c.wageAmount)} on ${selected.name} — ` +
        (online ? "syncing now." : "it will sync when you're back online."),
    );
  }

  if (projects.data === null) return <Loading />;

  return (
    <div className="page" style={{ maxWidth: 620 }}>
      <PageHead title="Log a shift" sub="Works offline — your shift is saved on this phone and syncs automatically." />
      {list.length === 0 ? (
        <Banner tone="warn">
          No projects yet. Ask the Production Manager to add one — you need to be online once for the list to reach your phone.
        </Banner>
      ) : null}
      {error ? <Banner tone="crit">{error}</Banner> : null}
      {done ? (
        <Banner tone="ok">
          {done} <Link to="/my-shifts">See My shifts</Link>
        </Banner>
      ) : null}

      <div className="card stack">
        <Field label="Project">
          <select value={selected?.id ?? ""} onChange={(e) => setProjectId(e.target.value)}>
            {list.length !== 1 ? <option value="">Choose a project…</option> : null}
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.code ? ` (${p.code})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-2">
          <Field label="Start date">
            <input type="date" value={startDate} onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate < e.target.value) setEndDate(e.target.value);
            }} />
          </Field>
          <Field label="Start time">
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="End date">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="End time">
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>

        <div className="card-flat row-between">
          <span className="small muted">This shift</span>
          <span className="num" style={{ fontSize: "1.1rem", fontWeight: 650 }}>
            {calc ? `${formatHours(calc.totalHours)} h · AED ${formatAed(calc.wageAmount)}` : "—"}
          </span>
        </div>
        {problems.length ? <span className="small neg">{problems[0]}</span> : null}
        {calc && calc.totalHours > LONG_SHIFT_HOURS ? (
          <Banner tone="warn">That's over {LONG_SHIFT_HOURS} hours — double-check the dates and times.</Banner>
        ) : null}

        <button className="btn btn-primary btn-lg btn-block" disabled={problems.length > 0 || !selected} onClick={submit}>
          Save shift
        </button>
      </div>
      <p className="small faint">
        Hours round up to the next half hour. Rate is AED {WAGE_RATE_AED.toFixed(2)}/hour. Shifts that end after midnight
        are fine — set the end date to the next day.
      </p>
    </div>
  );
}
