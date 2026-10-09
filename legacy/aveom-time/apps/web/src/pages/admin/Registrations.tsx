import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/auth/AuthProvider";
import { COL, formatDubaiDate, formatDubaiTime, type EmployeeProfile } from "@shared";
import { Banner, Chip } from "@/components/ui";
import { api, errMessage } from "@/lib/functions";

export function Registrations() {
  const { isManager } = useAuth();
  const [rows, setRows] = useState<EmployeeProfile[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query(collection(db, COL.employees), where("status", "==", "pending"));
    return onSnapshot(q, (snap) =>
      setRows(
        snap.docs
          .map((d) => d.data() as EmployeeProfile)
          .sort((a, b) => a.createdAt - b.createdAt),
      ),
    );
  }, []);

  async function act(uid: string, kind: "approve" | "reject") {
    setError("");
    setBusy(uid + kind);
    try {
      if (kind === "approve") await api.approveRegistration({ uid });
      else await api.rejectRegistration({ uid });
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="stack">
      <header>
        <h1>Pending registrations</h1>
        <p className="muted small">Approve an account before the person can start logging shifts.</p>
      </header>
      {error ? <Banner tone="crit">{error}</Banner> : null}
      {rows.length === 0 ? (
        <Banner tone="info">Nothing waiting.</Banner>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Requested</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid}>
                  <td>
                    {r.email} <Chip tone="warn">pending</Chip>
                  </td>
                  <td className="small muted">
                    {formatDubaiDate(r.createdAt)} {formatDubaiTime(r.createdAt)}
                  </td>
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <button
                        className="btn-primary btn-sm"
                        disabled={!isManager || !!busy}
                        onClick={() => act(r.uid, "approve")}
                      >
                        {busy === r.uid + "approve" ? "…" : "Approve"}
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        disabled={!isManager || !!busy}
                        onClick={() => act(r.uid, "reject")}
                      >
                        Reject
                      </button>
                    </div>
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
