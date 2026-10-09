import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/firebase";
import { COL, formatDubaiDate, formatDubaiTime, type AuditEntry } from "@shared";
import { Banner } from "@/components/ui";

export function AuditLog() {
  const [rows, setRows] = useState<AuditEntry[]>([]);

  useEffect(() => {
    const q = query(collection(db, COL.auditLog), orderBy("at", "desc"), limit(200));
    return onSnapshot(q, (snap) => setRows(snap.docs.map((d) => d.data() as AuditEntry)));
  }, []);

  return (
    <div className="stack">
      <header>
        <h1>Audit log</h1>
        <p className="muted small">Last 200 actions.</p>
      </header>
      {rows.length === 0 ? (
        <Banner tone="info">Nothing logged yet.</Banner>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="small muted">
                    {formatDubaiDate(r.at)} {formatDubaiTime(r.at)}
                  </td>
                  <td className="small">
                    {r.actorName ?? r.actorUid} <span className="muted">({r.actorRole})</span>
                  </td>
                  <td className="mono small">{r.action}</td>
                  <td className="mono small">
                    {r.targetType}/{r.targetId.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
