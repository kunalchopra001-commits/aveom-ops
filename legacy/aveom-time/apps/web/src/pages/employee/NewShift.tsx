import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { useSync } from "@/sync/SyncProvider";
import {
  COL,
  LONG_SHIFT_HOURS,
  WAGE_RATE_AED,
  computeShiftFromInput,
  epochMsToDubaiParts,
  formatAed,
  formatHours,
  validateShiftInput,
  type Project,
  type ShiftFlag,
} from "@shared";
import { Banner, Field, useOnline } from "@/components/ui";

const today = epochMsToDubaiParts(Date.now()).date;

export function NewShift() {
  const { enqueue } = useSync();
  const online = useOnline();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState(today);
  const [endTime, setEndTime] = useState("17:00");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    // Firestore's offline cache serves this list when there is no connection.
    const q = query(collection(db, COL.projects), where("locked", "==", false));
    return onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => d.data() as Project)
        .sort((a, b) => a.name.localeCompare(b.name));
      setProjects(list);
      setProjectId((cur) => cur || list[0]?.id || "");
    });
  }, []);

  const input = { startDate, startTime, endDate, endTime };
  const problems = validateShiftInput(input);
  const calc = useMemo(
    () => (problems.length === 0 ? computeShiftFromInput(input) : null),
    [startDate, startTime, endDate, endTime],
  );

  async function submit() {
    setError("");
    setDone("");
    if (problems.length > 0) {
      setError(problems[0].message);
      return;
    }
    const project = (projects ?? []).find((p) => p.id === projectId);
    if (!project) {
      setError("Choose a project.");
      return;
    }
    const c = computeShiftFromInput(input);
    const flags: ShiftFlag[] = [];
    if (c.isLong) flags.push({ type: "long_shift" });

    await enqueue(crypto.randomUUID(), {
      projectId: project.id,
      projectName: project.name,
      startAt: c.startAt,
      endAt: c.endAt,
      rawMinutes: c.rawMinutes,
      totalHours: c.totalHours,
      wageRate: WAGE_RATE_AED,
      wageAmount: c.wageAmount,
      flags,
    });
    setDone(
      `Saved ${formatHours(c.totalHours)} h · AED ${formatAed(c.wageAmount)} — ` +
        (online ? "syncing now." : "will sync when you’re back online."),
    );
  }

  if (projects === null) return <p className="muted small">Loading…</p>;
  if (projects.length === 0) {
    return (
      <div className="stack">
        <h2>New shift</h2>
        <Banner tone="warn">
          No projects available yet. Ask your operations manager to add one (you need to be online
          at least once for the list to reach your phone).
        </Banner>
      </div>
    );
  }

  return (
    <div className="stack">
      <h2>New shift</h2>
      {error ? <Banner tone="crit">{error}</Banner> : null}
      {done ? <Banner tone="info">{done} See “My shifts”.</Banner> : null}

      <div className="grid-2">
        <Field label="Start date">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
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

      <Field label="Project">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="panel-flat row-between">
        <span className="small muted">This shift</span>
        <span className="mono">
          {calc ? `${formatHours(calc.totalHours)} h · AED ${formatAed(calc.wageAmount)}` : "—"}
        </span>
      </div>
      {calc && calc.totalHours > LONG_SHIFT_HOURS ? (
        <Banner tone="warn">That’s over {LONG_SHIFT_HOURS} hours — double-check the times.</Banner>
      ) : null}

      <button className="btn-primary btn-block" disabled={problems.length > 0} onClick={submit}>
        Submit shift
      </button>
      <p className="hint">
        Hours round up to the next half hour. Rate is AED {WAGE_RATE_AED.toFixed(2)}/hour. Shifts are
        saved on your phone and sync automatically.
      </p>
    </div>
  );
}
