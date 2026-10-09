import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/auth/AuthProvider";
import { useSync } from "@/sync/SyncProvider";
import {
  COL,
  formatAed,
  formatDubaiDate,
  formatDubaiTime,
  formatHours,
  type Shift,
} from "@shared";
import { Banner, Chip } from "@/components/ui";
import type { OutboxEntry } from "@/lib/outbox";

export function MyShifts() {
  const { user } = useAuth();
  const { entries, retry, discard } = useSync();
  const [synced, setSynced] = useState<Shift[] | null>(null);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, COL.shifts),
      where("employeeUid", "==", user.uid),
      where("deleted", "==", false),
      orderBy("startAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setSynced(snap.docs.map((d) => d.data() as Shift));
      setFromCache(snap.metadata.fromCache);
    });
  }, [user]);

  if (!synced) return <p className="muted small">Loading…</p>;

  const syncedIds = new Set(synced.map((s) => s.id));
  const unsynced = entries.filter((e) => !syncedIds.has(e.id));

  const total = synced.reduce((a, s) => a + s.wageAmount, 0);
  const hours = synced.reduce((a, s) => a + s.totalHours, 0);

  return (
    <div className="stack">
      <div className="row-between">
        <h2>My shifts</h2>
        {fromCache ? <Chip tone="warn">offline copy</Chip> : <Chip tone="ok">synced</Chip>}
      </div>

      {unsynced.length > 0 ? (
        <div className="stack-sm">
          <span className="eyebrow">Not synced yet</span>
          {unsynced.map((e) => (
            <UnsyncedRow key={e.id} entry={e} onRetry={() => retry(e.id)} onDiscard={() => discard(e.id)} />
          ))}
        </div>
      ) : null}

      {synced.length === 0 && unsynced.length === 0 ? (
        <Banner tone="info">No shifts yet. Add your first one from the “New shift” tab.</Banner>
      ) : null}

      {synced.length > 0 ? (
        <>
          <div className="panel-flat row-between">
            <span className="small muted">{synced.length} synced</span>
            <span className="mono">
              {formatHours(hours)} h · AED {formatAed(total)}
            </span>
          </div>
          <div className="stack-sm">
            {synced.map((s) => (
              <div key={s.id} className="panel stack-sm">
                <div className="row-between">
                  <strong>{s.projectName}</strong>
                  <span className="mono small">AED {formatAed(s.wageAmount)}</span>
                </div>
                <div className="small muted">
                  {formatDubaiDate(s.startAt)} {formatDubaiTime(s.startAt)} →{" "}
                  {formatDubaiDate(s.endAt)} {formatDubaiTime(s.endAt)}
                </div>
                <div className="row wrap" style={{ gap: "0.4rem" }}>
                  <Chip tone="ok">{formatHours(s.totalHours)} h</Chip>
                  {s.editedAt ? <Chip tone="warn">edited by office</Chip> : null}
                  {s.flags.map((f) => (
                    <Chip key={f.type} tone="warn">
                      {f.type.replace("_", " ")}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function UnsyncedRow({
  entry,
  onRetry,
  onDiscard,
}: {
  entry: OutboxEntry;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const d = entry.draft;
  const tone = entry.status === "rejected" ? "crit" : "warn";
  return (
    <div className="panel stack-sm">
      <div className="row-between">
        <strong>{d.projectName}</strong>
        <Chip tone={tone}>
          {entry.status === "syncing" ? "syncing…" : entry.status === "rejected" ? "rejected" : "pending"}
        </Chip>
      </div>
      <div className="small muted">
        {formatDubaiDate(d.startAt)} {formatDubaiTime(d.startAt)} → {formatDubaiDate(d.endAt)}{" "}
        {formatDubaiTime(d.endAt)}
      </div>
      <div className="row wrap" style={{ gap: "0.4rem" }}>
        <Chip>{formatHours(d.totalHours)} h</Chip>
        <Chip>AED {formatAed(d.wageAmount)}</Chip>
      </div>
      {entry.error ? <p className="field-error">{entry.error}</p> : null}
      <div className="row" style={{ gap: "0.4rem" }}>
        {entry.status === "rejected" ? (
          <button className="btn-sm" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        <button className="btn-sm btn-ghost" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}
