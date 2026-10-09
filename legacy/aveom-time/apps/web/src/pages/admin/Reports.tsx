import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { db, storage } from "@/firebase";
import {
  COL,
  formatAed,
  formatDubaiDate,
  formatDubaiTime,
  type ReportMeta,
} from "@shared";
import { Banner } from "@/components/ui";
import { api, errMessage } from "@/lib/functions";

async function downloadFromPath(path: string, fileName: string) {
  const url = await getDownloadURL(storageRef(storage, path));
  const res = await fetch(url);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

export function Reports() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [past, setPast] = useState<ReportMeta[]>([]);

  useEffect(() => {
    const q = query(collection(db, COL.reports), orderBy("generatedAt", "desc"), limit(30));
    return onSnapshot(q, (snap) => setPast(snap.docs.map((d) => d.data() as ReportMeta)));
  }, []);

  async function generate() {
    setError("");
    setNote("");
    if (!start || !end) {
      setError("Pick a start and end date.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.generateReport({ periodStart: start, periodEnd: end });
      setNote(
        `${res.shiftCount} shifts · grand total AED ${formatAed(res.grandTotalWage)}. Downloading…`,
      );
      await downloadFromPath(res.storagePath, res.fileName);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <header>
        <h1>Reports</h1>
        <p className="muted small">
          One Excel workbook: a sheet per employee plus a summary sheet. Shifts are included by their
          start date; edits made after a download only show in newly generated reports.
        </p>
      </header>

      {error ? <Banner tone="crit">{error}</Banner> : null}
      {note ? <Banner tone="info">{note}</Banner> : null}

      <div className="panel row wrap" style={{ alignItems: "flex-end", gap: "0.8rem" }}>
        <label className="field">
          <span>Period start</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>Period end</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button className="btn-primary" disabled={busy} onClick={generate}>
          {busy ? "Generating…" : "Generate & download"}
        </button>
      </div>

      {past.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Generated</th>
                <th>Period</th>
                <th className="num">Shifts</th>
                <th className="num">Grand total</th>
                <th>By</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {past.map((r) => (
                <tr key={r.id}>
                  <td className="small muted">
                    {formatDubaiDate(r.generatedAt)} {formatDubaiTime(r.generatedAt)}
                  </td>
                  <td className="small">
                    {r.periodStart} → {r.periodEnd}
                  </td>
                  <td className="num">{r.shiftCount}</td>
                  <td className="num">{formatAed(r.grandTotalWage)}</td>
                  <td className="small muted">{r.generatedByName ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="btn-sm btn-ghost"
                      onClick={() => downloadFromPath(r.storagePath, r.fileName).catch(() => {})}
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
