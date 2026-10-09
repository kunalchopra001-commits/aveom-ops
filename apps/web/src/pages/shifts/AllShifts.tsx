import { useMemo, useState } from "react";
import { collection, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/auth/AuthProvider";
import { useLiveQuery } from "@/lib/data";
import { useProjects, useUsers } from "@/lib/queries";
import { api, errMessage } from "@/lib/api";
import { Banner, Chip, Empty, Field, Loading, PageHead, Sheet, Spinner } from "@/components/ui";
import { IconClock, IconEdit } from "@/components/icons";
import {
  COL,
  FLAG_LABEL,
  computeShiftHours,
  computeWage,
  dubaiDayRange,
  dubaiWallTimeToEpochMs,
  epochMsToDubaiParts,
  formatAed,
  formatDubaiDate,
  formatDubaiTime,
  formatHours,
  round2,
  todayDubai,
  type Shift,
} from "@shared";

export function AllShifts() {
  const { isAdmin } = useAuth();
  const users = useUsers();
  const projects = useProjects();
  const [from, setFrom] = useState(todayDubai().slice(0, 8) + "01");
  const [to, setTo] = useState(todayDubai());
  const [person, setPerson] = useState("");
  const [project, setProject] = useState("");
  const [editing, setEditing] = useState<Shift | null>(null);

  const valid = !!from && !!to && from <= to;
  const [fromMs, toMs] = valid ? dubaiDayRange(from, to) : [0, 0];
  const shifts = useLiveQuery<Shift>(
    valid
      ? query(
          collection(db, COL.shifts),
          where("deleted", "==", false),
          where("startAt", ">=", fromMs),
          where("startAt", "<=", toMs),
          orderBy("startAt", "asc"),
        )
      : null,
    [fromMs, toMs],
  );

  const rows = useMemo(
    () =>
      (shifts.data ?? [])
        .filter((s) => (!person || s.userUid === person) && (!project || s.projectId === project))
        .reverse(),
    [shifts.data, person, project],
  );
  const hours = round2(rows.reduce((a, s) => a + s.totalHours, 0));
  const wage = round2(rows.reduce((a, s) => a + s.wageAmount, 0));
  const shiftPeople = (users.data ?? []).filter((u) => u.perms.shifts || (shifts.data ?? []).some((s) => s.userUid === u.uid));

  return (
    <div className="page">
      <PageHead
        title="All shifts"
        sub={`${rows.length} shifts · ${formatHours(hours)} h · AED ${formatAed(wage)}`}
      />
      <div className="card grid grid-2 grid-auto" style={{ alignItems: "end" }}>
        <Field label="From">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Person">
          <select value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Everyone</option>
            {shiftPeople
              .sort((a, b) => a.displayName.localeCompare(b.displayName))
              .map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.displayName}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Project">
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">All projects</option>
            {(projects.data ?? [])
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {!valid ? <Banner tone="warn">The end date must be after the start date.</Banner> : null}
      {shifts.error ? <Banner tone="crit">{shifts.error}</Banner> : null}

      <div className="card card-tight table-wrap">
        {shifts.data === null ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon={<IconClock />} title="No shifts in this range" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Start</th>
                <th>End</th>
                <th>Project</th>
                <th className="num">Hours</th>
                <th className="num">Wage</th>
                {isAdmin ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.userName}</td>
                  <td className="nowrap">
                    {formatDubaiDate(s.startAt)} <span className="faint">{formatDubaiTime(s.startAt)}</span>
                  </td>
                  <td className="nowrap">
                    {formatDubaiDate(s.endAt)} <span className="faint">{formatDubaiTime(s.endAt)}</span>
                  </td>
                  <td>
                    {s.projectName}
                    {s.editedAt || s.flags.length ? (
                      <div className="row" style={{ gap: "0.25rem", marginTop: 3 }}>
                        {s.editedAt ? <Chip tone="info">Edited</Chip> : null}
                        {s.flags.map((f) => (
                          <Chip key={f.type} tone="warn">{FLAG_LABEL[f.type]}</Chip>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="num">{formatHours(s.totalHours)}</td>
                  <td className="num">{formatAed(s.wageAmount)}</td>
                  {isAdmin ? (
                    <td className="right">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)} aria-label="Edit shift">
                        <IconEdit />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total</td>
                <td className="num">{formatHours(hours)}</td>
                <td className="num">{formatAed(wage)}</td>
                {isAdmin ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      {editing ? <EditShift shift={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function EditShift({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const projects = useProjects();
  const s = epochMsToDubaiParts(shift.startAt);
  const e = epochMsToDubaiParts(shift.endAt);
  const [sd, setSd] = useState(s.date);
  const [st, setSt] = useState(s.time);
  const [ed, setEd] = useState(e.date);
  const [et, setEt] = useState(e.time);
  const [pid, setPid] = useState(shift.projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startAt = dubaiWallTimeToEpochMs(sd, st);
  const endAt = dubaiWallTimeToEpochMs(ed, et);
  const ok = Number.isFinite(startAt) && Number.isFinite(endAt) && endAt > startAt;
  const preview = ok ? computeShiftHours(startAt, endAt).totalHours : 0;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onClose();
    } catch (err) {
      setError(errMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={`Edit ${shift.userName}'s shift`}
      sub="Hours and wage are recalculated. The change is recorded in the activity log."
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-danger"
            disabled={busy}
            onClick={() => confirm("Delete this shift? It will drop out of all reports.") && run(() => api.deleteShift({ id: shift.id }))}
          >
            Delete
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !ok}
            onClick={() => run(() => api.editShift({ id: shift.id, startAt, endAt, projectId: pid }))}
          >
            {busy ? <Spinner small /> : "Save changes"}
          </button>
        </>
      }
    >
      <div className="stack">
        {error ? <Banner tone="crit">{error}</Banner> : null}
        <div className="grid grid-2">
          <Field label="Start date">
            <input type="date" value={sd} onChange={(x) => setSd(x.target.value)} />
          </Field>
          <Field label="Start time">
            <input type="time" value={st} onChange={(x) => setSt(x.target.value)} />
          </Field>
          <Field label="End date">
            <input type="date" value={ed} onChange={(x) => setEd(x.target.value)} />
          </Field>
          <Field label="End time">
            <input type="time" value={et} onChange={(x) => setEt(x.target.value)} />
          </Field>
        </div>
        <Field label="Project">
          <select value={pid} onChange={(x) => setPid(x.target.value)}>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.locked ? " (locked)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="card-flat row-between">
          <span className="small muted">
            Was {formatHours(shift.totalHours)} h · AED {formatAed(shift.wageAmount)}
          </span>
          <span className="num" style={{ fontWeight: 650 }}>
            {ok ? `${formatHours(preview)} h · AED ${formatAed(computeWage(preview))}` : "—"}
          </span>
        </div>
      </div>
    </Sheet>
  );
}
