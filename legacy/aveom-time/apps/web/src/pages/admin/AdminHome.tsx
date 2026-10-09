import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { BrandMark, Chip, ThemeToggle } from "@/components/ui";

const LINKS = [
  ["registrations", "Registrations"],
  ["employees", "Employees"],
  ["shifts", "Shifts"],
  ["projects", "Projects"],
  ["reports", "Reports"],
  ["audit", "Audit log"],
] as const;

export function AdminHome() {
  const { role, signOut } = useAuth();
  return (
    <div className="admin">
      <nav className="admin-nav">
        <div style={{ padding: "0.3rem 0.5rem 0.8rem" }}>
          <BrandMark />
        </div>
        {LINKS.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>
            {label}
          </NavLink>
        ))}
        <div className="grow" />
        <div className="stack-sm" style={{ padding: "0.5rem" }}>
          <Chip>{role}</Chip>
          <ThemeToggle />
          <button className="btn-sm" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </nav>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
