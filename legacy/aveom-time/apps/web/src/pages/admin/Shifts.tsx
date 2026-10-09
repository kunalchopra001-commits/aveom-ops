import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/auth/AuthProvider";
import {
  COL,
  dubaiWallTimeToEpochMs,
  epochMsToDubaiParts,
  formatAed,
  formatDubaiDate,
  formatDubaiTime,
  formatHours,
  type EmployeeProfile,
  type Project,
  type Shift,
} from "@shared";
import { Banner, Chip } from "@/components/ui";
import { api, errMessage } from "@/lib/functions";

export function Shifts() {
  const { isAdmin } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [empFilter, setEmpFilter] = useState("");
  const [projFilter, setProjFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editId, setEditId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const q = query(collection(db, COL.shifts), where("deleted", "==", false), orderBy("startAt", "desc"));
    return onSnapshot(q, (snap) => setShifts(snap.docs.map((d) => d.data() as Shift)));
  }, []);
  useEffect(
    () => onSnapshot(collection(db, COL.employees), (s) => setEmployees(s.docs.map((d) => d.data() as EmployeeProfile))),
    [],
  );
  useEffect(
    () => onSnapshot(collection(db, COL.projects), (s) => setProjects(s.docs.map((d) => d.data() as Project))),
    [],
  );

  const filtered = useMemo(() => {
    const fromMs = from ? dubaiWallTimeToEpochMs(from, "00:00") : -Infinity;
    const toMs = to ? dubaiWallTimeToEpochMs(to, "23:59") : Infinity;
    return shifts.filter(
      (s) =>
        (!empFilter || s.employeeUid === empFilter) &&
        (!projFilter || s.projectId === projFilter) &&
        s.startAt >= fromMs &&
        s.startAt <= toMs,
    );
  }, [shifts, empFilter, projFilter, from, to]);

  const totalHours = filtered.reduce((a, s) => a + s.totalHours, 0);
  const totalWage = filtered.reduce((a, s) => a + s.wageAmount, 0);

  async function run(label: string, fn: () => Promise<unknown>) {
    setError("");
    setBusy(label);
    try {
      await fn();
      setEditId("");
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="stack">
      <header>
        <h1>Shifts</h1>
        <p className="muted small">
          {filtered.length} shifts · {formatHours(totalHours)} h · AED {formatAed(totalWage)}
        </p>
      </header>
      {error ? <Banner tone="crit">{error}</Banner> : null}

      <div className="panel-flat row wrap" style={{ gap: "0.8rem", alignItems: "flex-end" }}>
        <label className="field">
          <span>Employee</span>
          <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
            <option value="">All</option>
            {employees.map((e) => (
              <option key={e.uid} value={e.uid}>
                {e.officialName ?? e.email}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Project</span>
          <select value={projFilter} onChange={(e) => setProjFilter(e.target.value)}>
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Start</th>
              <th>End</th>
              <th className="num">Hours</th>
              <th className="num">Wage</th>
              <th>Project</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) =>
              editId === s.id ? (
                <EditRow
                  key={s.id}
                  shift={s}
                  projects={projects}
                  busy={busy === "edit"}
                  onCancel={() => setEditId("")}
                  onSave={(patch) => run("edit", () => api.editShift({ id: s.id, ...patch }))}
                />
              ) : (
                <tr key={s.id}>
                  <td>{s.employeeName}</td>
                  <td className="small">
                    {formatDubaiDate(s.startAt)} {formatDubaiTime(s.startAt)}
                  </td>
                  <td className="small">
                    {formatDubaiDate(s.endAt)} {formatDubaiTime(s.endAt)}
                  </td>
                  <td className="num">{formatHours(s.totalHours)}</td>
                  <td className="num">{formatAed(s.wageAmount)}</td>
                  <td>
                    {s.projectName}
                    <div className="row wrap" style={{ gap: "0.3rem", marginTop: "0.2rem" }}>
                      {s.editedAt ? <Chip tone="warn">edited</Chip> : null}
                      {s.flags.map((f) => (
                        <Chip key={f.type} tone="warn">
                          {f.type.replace("_", " ")}
                        </Chip>
                      ))}
                    </div>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {isAdmin ? (
                      <>
                        <button className="btn-sm btn-ghost" onClick={() => setEditId(s.id)}>
                          Edit
                        </button>
                        <button
                          className="btn-sm btn-ghost"
                          onClick={() =>
                            confirm("Delete this shift? It will no longer appear in new reports.") &&
                            run("del" + s.id, () => api.deleteShift({ id: s.id }))
                          }
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ),
            )}
            {filtered.length > 0 ? (
              <tr>
                <td colSpan={3} style={{ fontWeight: 600 }}>
                  Total
                </td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {formatHours(totalHours)}
                </td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {formatAed(totalWage)}
                </td>
                <td colSpan={2} />
              </tr>
            ) : (
              <tr>
                <td colSpan={7} className="muted small">
                  No shifts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditRow({
  shift,
  projects,
  busy,
  onCancel,
  onSave,
}: {
  shift: Shift;
  projects: Project[];
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: { startAt: number; endAt: number; projectId: string }) => void;
}) {
  const s = epochMsToDubaiParts(shift.startAt);
  const e = epochMsToDubaiParts(shift.endAt);
  const [sd, setSd] = useState(s.date);
  const [st, setSt] = useState(s.time);
  const [ed, setEd] = useState(e.date);
  const [et, setEt] = useState(e.time);
  const [pid, setPid] = useState(shift.projectId);

  return (
    <tr>
      <td>{shift.employeeName}</td>
      <td>
        <input type="date" value={sd} onChange={(x) => setSd(x.target.value)} />
        <input type="time" value={st} onChange={(x) => setSt(x.target.value)} />
      </td>
      <td>
        <input type="date" value={ed} onChange={(x) => setEd(x.target.value)} />
        <input type="time" value={et} onChange={(x) => setEt(x.target.value)} />
      </td>
      <td colSpan={2} className="small muted">
        recalculated on save
      </td>
      <td>
        <select value={pid} onChange={(x) => setPid(x.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <button
          className="btn-sm btn-primary"
          disabled={busy}
          onClick={() =>
            onSave({
              startAt: dubaiWallTimeToEpochMs(sd, st),
              endAt: dubaiWallTimeToEpochMs(ed, et),
              projectId: pid,
            })
          }
        >
          Save
        </button>
        <button className="btn-sm btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}
