import { useState } from "react";
import { useProjects } from "@/lib/queries";
import { api, errMessage } from "@/lib/api";
import { Banner, Chip, Empty, Field, Loading, PageHead, Spinner } from "@/components/ui";
import { IconFolder } from "@/components/icons";
import type { Project } from "@shared";

export function Projects() {
  const projects = useProjects();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errMessage(e));
      return false;
    } finally {
      setBusy("");
    }
  }

  const list = [...(projects.data ?? [])].sort((a, b) => Number(a.locked) - Number(b.locked) || a.name.localeCompare(b.name));

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHead title="Projects" sub="Projects appear in the shift and bill forms. Lock a project to hide it without losing its history." />
      {error ? <Banner tone="crit">{error}</Banner> : null}

      <form
        className="card row"
        style={{ alignItems: "flex-end" }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run("create", () => api.createProject({ name: name.trim(), code: code.trim() || undefined }))) {
            setName("");
            setCode("");
          }
        }}
      >
        <div className="grow">
          <Field label="New project name">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Expo City — Oct gala" />
          </Field>
        </div>
        <div style={{ width: 130 }}>
          <Field label="Code (optional)">
            <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} />
          </Field>
        </div>
        <button className="btn btn-primary" disabled={!name.trim() || busy === "create"}>
          {busy === "create" ? <Spinner small /> : "Add"}
        </button>
      </form>

      <div className="card card-tight">
        {projects.data === null ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty icon={<IconFolder />} title="No projects yet" />
        ) : (
          <div className="list">
            {list.map((p: Project) => (
              <div key={p.id} className="list-item">
                <span className="grow" style={{ minWidth: 0 }}>
                  {renaming?.id === p.id ? (
                    <form
                      className="row"
                      style={{ flexWrap: "nowrap" }}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await run(p.id, () => api.renameProject({ id: p.id, name: renaming.name.trim() }))) setRenaming(null);
                      }}
                    >
                      <input value={renaming.name} onChange={(e) => setRenaming({ id: p.id, name: e.target.value })} autoFocus />
                      <button className="btn btn-primary btn-sm" disabled={!renaming.name.trim()}>Save</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>Cancel</button>
                    </form>
                  ) : (
                    <>
                      <span className="title" style={{ opacity: p.locked ? 0.55 : 1 }}>{p.name}</span>
                      {p.code ? <span className="sub"> · {p.code}</span> : null}
                    </>
                  )}
                </span>
                {renaming?.id !== p.id ? (
                  <span className="row" style={{ gap: "0.3rem" }}>
                    {p.locked ? <Chip>Locked</Chip> : <Chip tone="pos">Open</Chip>}
                    <button className="btn btn-ghost btn-sm" onClick={() => setRenaming({ id: p.id, name: p.name })}>
                      Rename
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busy === p.id}
                      onClick={() => run(p.id, () => api.setProjectLocked({ id: p.id, locked: !p.locked }))}
                    >
                      {p.locked ? "Unlock" : "Lock"}
                    </button>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
