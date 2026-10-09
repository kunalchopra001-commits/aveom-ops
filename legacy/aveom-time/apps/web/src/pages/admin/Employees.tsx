import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";
import { COL, formatDubaiDate, type EmployeeProfile } from "@shared";
import { Banner, Chip } from "@/components/ui";

function statusTone(s: EmployeeProfile["status"]) {
  return s === "approved" ? "ok" : s === "blocked" ? "crit" : "warn";
}

export function Employees() {
  const [rows, setRows] = useState<EmployeeProfile[]>([]);

  useEffect(() => {
    return onSnapshot(collection(db, COL.employees), (snap) =>
      setRows(
        snap.docs
          .map((d) => d.data() as EmployeeProfile)
          .sort((a, b) => (a.officialName ?? a.email).localeCompare(b.officialName ?? b.email)),
      ),
    );
  }, []);

  const expiring = rows.filter((r) => {
    if (!r.eidExpiryDate) return false;
    const ms = Date.parse(r.eidExpiryDate + "T00:00:00+04:00");
    return ms - Date.now() < 30 * 864e5;
  });

  return (
    <div className="stack">
      <header>
        <h1>Employees</h1>
        <p className="muted small">{rows.length} total</p>
      </header>

      {expiring.length > 0 ? (
        <Banner tone="warn">
          {expiring.length} Emirates ID(s) expired or expiring within 30 days:{" "}
          {expiring.map((e) => e.officialName ?? e.email).join(", ")}
        </Banner>
      ) : null}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Profile</th>
              <th>EID expiry</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid}>
                <td>
                  <Link to={r.uid}>{r.officialName ?? r.email}</Link>
                </td>
                <td>
                  <Chip tone={statusTone(r.status)}>{r.status}</Chip>
                </td>
                <td>
                  {r.profileComplete ? (
                    <Chip tone={r.profileLocked ? "neutral" : "warn"}>
                      {r.profileLocked ? "locked" : "unlocked"}
                    </Chip>
                  ) : (
                    <Chip tone="warn">incomplete</Chip>
                  )}
                </td>
                <td className="small">{r.eidExpiryDate ?? "—"}</td>
                <td className="small muted">{formatDubaiDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
