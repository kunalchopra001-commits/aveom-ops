import { useState } from "react";
import { Link } from "react-router-dom";
import { collection, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/auth/AuthProvider";
import { useSync } from "@/sync/SyncProvider";
import { useLiveQuery } from "@/lib/data";
import { Chip, Empty, Loading, PageHead } from "@/components/ui";
import { RangePicker } from "@/components/RangePicker";
import { IconCloudOff, IconClock } from "@/components/icons";
import type { OutboxEntry } from "@/sync/outbox";
import {
  COL,
  FLAG_LABEL,
  dubaiDayRange,
  formatAed,
  formatDubaiDate,
  formatDubaiTime,
  formatHours,
  formatRange,
  fortnightOf,
  round2,
  type DateRange,
  type Shift,
} from "@shared";

function span(startAt: number, endAt: number) {
  const sameDay = formatDubaiDate(startAt) === formatDubaiDate(endAt);
  return `${formatDubaiDate(startAt)}, ${formatDubaiTime(startAt)} – ${sameDay ? "" : formatDubaiDate(endAt) + ", "}${formatDubaiTime(endAt)}`;
}

export function MyShifts() {
  const { user } = useAuth();
  const { entries, retry, discard } = useSync();
  const [range, setRange] = useState<DateRange>(() => fortnightOf());
  const [fromMs, toMs] = dubaiDayRange(range[0], range[1]);
  const shifts = useLiveQuery<Shift>(
    user
      ? query(
          collection(db, COL.shifts),
          where("userUid", "==", user.uid),
          where("deleted", "==", false),
          where("startAt", ">=", fromMs),
          where("startAt", "<=", toMs),
          orderBy("startAt", "desc"),
        )
      : null,
    [user?.uid, fromMs, toMs],
  );

  const synced = shifts.data ?? [];
  const ids = new Set(synced.map((s) => s.id));
  // Shifts still on this phone are always shown, whatever period is selected.
  const unsynced = entries.filter((e) => !ids.has(e.id));
  const hours = round2(synced.reduce((a, s) => a + s.totalHours, 0));
  const wage = round2(synced.reduce((a, s) => a + s.wageAmount, 0));

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageHead
        title="My shifts"
        actions={
          <Link to="/log" className="btn btn-primary">
            Log a shift
          </Link>
        }
      />
      <RangePicker value={range} onChange={setRange} />
      <div className="grid grid-2">
        <div className="card stat">
          <span className="eyebrow">Hours</span>
          <span className="value">{formatHours(hours)} h</span>
          <span className="note">{synced.length} shift{synced.length === 1 ? "" : "s"}</span>
        </div>
        <div className="card stat">
          <span className="eyebrow">Earned</span>
          <span className="value"><small>AED</small>{formatAed(wage)}</span>
          <span className="note">AED 25.00 / hour</span>
        </div>
      </div>

      {unsynced.length ? (
        <div className="stack-sm">
          <span className="eyebrow">On this phone — not synced yet</span>
          <div className="card card-tight">
            <div className="list">
              {unsynced.map((e) => (
                <UnsyncedRow key={e.id} entry={e} onRetry={() => retry(e.id)} onDiscard={() => discard(e.id)} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {shifts.data === null ? (
        <Loading />
      ) : synced.length === 0 ? (
        <div className="card">
          <Empty icon={<IconClock />} title={`No shifts in ${formatRange(range)}`}>
            <Link to="/log">Log a shift</Link>
          </Empty>
        </div>
      ) : null}

      {synced.length ? (
        <div className="card card-tight">
          <div className="list">
            {synced.map((s) => (
              <div key={s.id} className="list-item">
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="title">{s.projectName}</span>
                  <span className="sub" style={{ display: "block" }}>{span(s.startAt, s.endAt)}</span>
                  {s.editedAt || s.flags.length ? (
                    <span className="row" style={{ gap: "0.3rem", marginTop: 4 }}>
                      {s.editedAt ? <Chip tone="info">Edited by office</Chip> : null}
                      {s.flags.map((f) => (
                        <Chip key={f.type} tone="warn">{FLAG_LABEL[f.type]}</Chip>
                      ))}
                    </span>
                  ) : null}
                </span>
                <span className="stack-sm" style={{ alignItems: "flex-end", gap: 2 }}>
                  <span className="num" style={{ fontWeight: 650 }}>{formatHours(s.totalHours)} h</span>
                  <span className="tiny faint num">AED {formatAed(s.wageAmount)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UnsyncedRow({ entry, onRetry, onDiscard }: { entry: OutboxEntry; onRetry: () => void; onDiscard: () => void }) {
  const d = entry.draft;
  const rejected = entry.status === "rejected";
  return (
    <div className="list-item" style={{ alignItems: "flex-start" }}>
      <span className={`icon-dot ${rejected ? "out" : "wait"}`}>
        <IconCloudOff />
      </span>
      <span className="grow stack-sm" style={{ gap: 4, minWidth: 0 }}>
        <span className="row-between">
          <span className="title">{d.projectName}</span>
          <Chip tone={rejected ? "neg" : "warn"}>
            {entry.status === "syncing" ? "Syncing…" : rejected ? "Not accepted" : "Waiting for signal"}
          </Chip>
        </span>
        <span className="sub">
          {span(d.startAt, d.endAt)} · {formatHours(d.totalHours)} h
        </span>
        {entry.error ? <span className="small neg">{entry.error}</span> : null}
        <span className="row" style={{ gap: "0.4rem" }}>
          {rejected ? (
            <button className="btn btn-secondary btn-sm" onClick={onRetry}>
              Retry
            </button>
          ) : null}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => confirm("Remove this shift from your phone? It hasn't been sent to the office.") && onDiscard()}
          >
            Discard
          </button>
        </span>
      </span>
    </div>
  );
}
