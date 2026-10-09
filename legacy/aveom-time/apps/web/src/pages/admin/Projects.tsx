import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/auth/AuthProvider";
import { COL, CONFIG_DOC, type Project } from "@shared";
import { Banner, Chip, Field } from "@/components/ui";
import { api, errMessage } from "@/lib/functions";

export function Projects() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [regCode, setRegCode] = useState<string>("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, COL.projects), (snap) =>
      setRows(snap.docs.map((d) => d.data() as Project).sort((a, b) => a.name.localeCompare(b.name))),
    );
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, COL.config, CONFIG_DOC.registration), (snap) =>
      setRegCode(snap.exists() ? ((snap.data()?.code as string) ?? "") : ""),
    );
  }, []);

  async function run(label: string, fn: () => Promise<unknown>) {
    setError("");
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="stack">
      <header>
        <h1>Projects</h1>
        <p className="muted small">Locked projects disappear from the crew’s dropdown but keep their history.</p>
      </header>
      {error ? <Banner tone="crit">{error}</Banner> : null}

      {isAdmin ? (
        <div className="panel stack">
          <h3>Add a project</h3>
          <div className="row wrap" style={{ alignItems: "flex-end" }}>
            <div className="grow">
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
            <Field label="Code (optional)">
              <input value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <button
              className="btn-primary"
              disabled={!name.trim() || !!busy}
              onClick={() =>
                run("add", async () => {
                  await api.createProject({ name: name.trim(), code: code.trim() || undefined });
                  setName("");
                  setCode("");
                })
              }
            >
              {busy === "add" ? "…" : "Add"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Code</th>
              <th>State</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="mono small">{p.code ?? "—"}</td>
                <td>
                  <Chip tone={p.locked ? "neutral" : "ok"}>{p.locked ? "locked" : "active"}</Chip>
                </td>
                <td style={{ textAlign: "right" }}>
                  {isAdmin ? (
                    <button
                      className="btn-sm"
                      disabled={!!busy}
                      onClick={() => run("lock" + p.id, () => api.setProjectLocked({ id: p.id, locked: !p.locked }))}
                    >
                      {p.locked ? "Unlock" : "Lock"}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted small">
                  No projects yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {isAdmin ? (
        <div className="panel stack">
          <h3>Registration code</h3>
          <p className="small muted">
            Share this 6-digit code together with the app link. Rotating it does not affect people
            who already registered.
          </p>
          <div className="row">
            <span className="mono" style={{ fontSize: "1.4rem", letterSpacing: "0.2em" }}>
              {regCode || "— — — — — —"}
            </span>
            <button
              disabled={!!busy}
              onClick={() => run("rotate", () => api.setRegistrationCode({ code: "generate" }))}
            >
              {busy === "rotate" ? "…" : regCode ? "Rotate" : "Generate"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
