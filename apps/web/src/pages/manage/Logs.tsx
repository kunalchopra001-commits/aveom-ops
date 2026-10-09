import { useState } from "react";
import { collection, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { useLiveQuery, saveBase64File, XLSX_MIME } from "@/lib/data";
import { api, errMessage } from "@/lib/api";
import { Banner, Chip, Empty, Field, Loading, PageHead, Spinner, Tabs } from "@/components/ui";
import { IconDownload, IconShield } from "@/components/icons";
import {
  COL,
  METHOD_LABEL,
  ROLE_LABEL,
  dubaiDayRange,
  formatAed,
  formatDubaiDate,
  formatDubaiTime,
  todayDubai,
  type AccessLog,
  type AckLog,
  type ActivityLog,
} from "@shared";

type Tab = "access" | "ack" | "activity";

function daysAgo(n: number): string {
  const d = new Date(`${todayDubai()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function When({ at }: { at: number }) {
  return (
    <span className="nowrap">
      {formatDubaiDate(at)} <span className="faint num">{formatDubaiTime(at)}</span>
    </span>
  );
}

export function Logs() {
  const [tab, setTab] = useState<Tab>("access");
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(todayDubai());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const valid = !!from && !!to && from <= to;
  const [fromMs, toMs] = valid ? dubaiDayRange(from, to) : [0, 0];
  const col = tab === "access" ? COL.logAccess : tab === "ack" ? COL.logAck : COL.logActivity;
  const logs = useLiveQuery<AccessLog | AckLog | ActivityLog>(
    valid ? query(collection(db, col), where("at", ">=", fromMs), where("at", "<=", toMs), orderBy("at", "desc")) : null,
    [col, fromMs, toMs],
  );

  const q = search.trim().toLowerCase();
  const rows = (logs.data ?? []).filter((l) => !q || JSON.stringify(l).toLowerCase().includes(q));

  async function exportAll() {
    setBusy(true);
    setError("");
    try {
      const r = await api.logsReport({ periodStart: from, periodEnd: to });
      saveBase64File(r.base64, r.fileName, XLSX_MIME);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHead
        title="Logs"
        sub="Every sign-in, payment confirmation and change. Only you can see these."
        actions={
          <button className="btn btn-secondary" onClick={exportAll} disabled={!valid || busy}>
            {busy ? <Spinner small /> : <IconDownload />} Export to Excel
          </button>
        }
      />
      {error ? <Banner tone="crit">{error}</Banner> : null}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: "access", label: "Sign-ins" },
          { value: "ack", label: "Acknowledgements" },
          { value: "activity", label: "Activity" },
        ]}
      />
      <div className="grid grid-2 grid-auto" style={{ alignItems: "end" }}>
        <Field label="From">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Search">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, action, amount…" />
        </Field>
      </div>

      <div className="card card-tight table-wrap">
        {logs.data === null ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon={<IconShield />} title="Nothing logged in this range" />
        ) : tab === "access" ? (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Person</th>
                <th>Device</th>
              </tr>
            </thead>
            <tbody>
              {(rows as AccessLog[]).map((l) => (
                <tr key={l.id}>
                  <td><When at={l.at} /></td>
                  <td>
                    {l.event === "sign_in" ? (
                      <Chip tone="pos">Signed in</Chip>
                    ) : l.event === "sign_out" ? (
                      <Chip>Signed out</Chip>
                    ) : (
                      <Chip tone="neg">Failed sign-in</Chip>
                    )}
                  </td>
                  <td>
                    {l.userName ?? "—"} <span className="faint">@{l.username}</span>
                  </td>
                  <td className="tiny faint" style={{ maxWidth: 320 }}>{deviceOf(l.userAgent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : tab === "ack" ? (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Person</th>
                <th>Response</th>
                <th className="num">Amount</th>
                <th>Payment</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {(rows as AckLog[]).map((l) => (
                <tr key={l.id}>
                  <td><When at={l.at} /></td>
                  <td>{l.userName}</td>
                  <td>{l.response === "received" ? <Chip tone="pos">Received</Chip> : <Chip tone="neg">Disputed</Chip>}</td>
                  <td className="num">{formatAed(l.amount)}</td>
                  <td className="small">{METHOD_LABEL[l.method]} from {l.sentByName}</td>
                  <td className="small">{l.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What happened</th>
              </tr>
            </thead>
            <tbody>
              {(rows as ActivityLog[]).map((l) => (
                <tr key={l.id}>
                  <td><When at={l.at} /></td>
                  <td>
                    {l.actorName}
                    <div className="tiny faint">{ROLE_LABEL[l.actorRole]}</div>
                  </td>
                  <td>
                    <span className="chip" style={{ marginRight: 6 }}>{l.action}</span>
                    {l.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function deviceOf(ua?: string): string {
  if (!ua) return "—";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : "Other";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "";
  return [os, br].filter(Boolean).join(" · ");
}
