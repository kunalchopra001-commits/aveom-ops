import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { SyncProvider, useSync } from "@/sync/SyncProvider";
import { BrandMark, ThemeToggle, useOnline } from "@/components/ui";

function relative(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function Chrome() {
  const { signOut } = useAuth();
  const { pendingCount, rejectedCount, lastSyncedAt, flushing } = useSync();
  const online = useOnline();

  return (
    <div className="shell">
      <div className="shell-top">
        <BrandMark withName={false} />
        <div className="row" style={{ gap: "0.5rem" }}>
          <div className="stack-sm" style={{ alignItems: "flex-end", gap: "0.1rem" }}>
            <span className={`chip ${online ? "ok" : "warn"}`}>
              {flushing ? "syncing…" : online ? "online" : "offline"}
            </span>
            <span className="hint">
              {lastSyncedAt ? `synced ${relative(lastSyncedAt)}` : "not synced yet"}
            </span>
          </div>
          <ThemeToggle />
          <button className="btn-ghost btn-sm" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>

      <div className="shell-body">
        <Outlet />
      </div>

      <nav className="tabbar">
        <NavLink to="/new" className={({ isActive }) => (isActive ? "active" : "")}>
          New shift
        </NavLink>
        <NavLink to="/shifts" className={({ isActive }) => (isActive ? "active" : "")}>
          My shifts
          {pendingCount + rejectedCount > 0 ? ` (${pendingCount + rejectedCount})` : ""}
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
          Profile
        </NavLink>
      </nav>
    </div>
  );
}

export function EmployeeHome() {
  return (
    <SyncProvider>
      <Chrome />
    </SyncProvider>
  );
}
