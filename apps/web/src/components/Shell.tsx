import { useState, type ComponentType, type SVGProps } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useSync } from "@/sync/SyncProvider";
import { useMyTransfers, usePendingBills, reviewableBills, useUsers } from "@/lib/queries";
import { BrandMark, Sheet, ThemeButton, initials, useOnline } from "@/components/ui";
import {
  IconChart,
  IconClock,
  IconFolder,
  IconHome,
  IconList,
  IconLogout,
  IconMenu,
  IconPlusClock,
  IconReceipt,
  IconSend,
  IconShield,
  IconUser,
  IconUsers,
  IconWallet,
} from "@/components/icons";
import { ROLE_LABEL, formatDubaiTime } from "@shared";

interface NavItem {
  to: string;
  label: string;
  short?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  group: "me" | "overview" | "manage";
  badge?: number;
}

function useNav(): { items: NavItem[]; primary: NavItem[] } {
  const { user, isAdmin, isOwner, isViewer, canShifts, canPetty } = useAuth();
  const transfers = useMyTransfers();
  const pending = usePendingBills();
  const users = useUsers();
  const { rejectedCount } = useSync();

  const toConfirm = (transfers.data ?? []).filter((t) => t.status === "sent").length;
  const toReview = reviewableBills(pending.data, { uid: user?.uid ?? "", isAdmin, isOwner }, users.data).length;

  const items: NavItem[] = [{ to: "/", label: "Home", icon: IconHome, group: "me" }];
  if (canShifts) {
    items.push({ to: "/log", label: "Log a shift", short: "Log shift", icon: IconPlusClock, group: "me" });
    items.push({ to: "/my-shifts", label: "My shifts", icon: IconClock, group: "me", badge: rejectedCount });
  }
  if (canPetty) {
    items.push({ to: "/my-petty", label: "My petty cash", short: "Petty cash", icon: IconWallet, group: "me", badge: toConfirm });
  }
  if (isOwner) items.push({ to: "/send", label: "Send money", icon: IconSend, group: "me" });
  if (isViewer) {
    items.push({ to: "/petty", label: "Petty cash", short: "Petty", icon: IconReceipt, group: "overview", badge: toReview });
    items.push({ to: "/shifts", label: "All shifts", short: "Shifts", icon: IconList, group: "overview" });
    items.push({ to: "/reports", label: "Reports", icon: IconChart, group: "overview" });
  }
  if (isAdmin) {
    items.push({ to: "/people", label: "People & access", short: "People", icon: IconUsers, group: "manage" });
    items.push({ to: "/projects", label: "Projects", icon: IconFolder, group: "manage" });
    items.push({ to: "/logs", label: "Logs", icon: IconShield, group: "manage" });
  }
  items.push({ to: "/account", label: "My account", short: "Account", icon: IconUser, group: "me" });

  // Bottom bar (phones): Home + the three most-used destinations for this person.
  const priority = ["/log", "/my-petty", "/send", "/petty", "/people", "/reports", "/my-shifts", "/shifts"];
  const primary = [
    items[0],
    ...priority.map((p) => items.find((i) => i.to === p)).filter((i): i is NavItem => !!i).slice(0, 3),
  ];
  return { items, primary };
}

export function Shell() {
  const { profile, role, signOut } = useAuth();
  const { pendingCount, flushing, lastSyncedAt } = useSync();
  const online = useOnline();
  const { items, primary } = useNav();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const moreBadge = items.filter((i) => !primary.includes(i)).reduce((a, i) => a + (i.badge ?? 0), 0);

  const syncLabel = !online
    ? pendingCount
      ? `Offline · ${pendingCount} to sync`
      : "Offline"
    : flushing
      ? "Syncing…"
      : pendingCount
        ? `${pendingCount} waiting to sync`
        : lastSyncedAt
          ? `Synced ${formatDubaiTime(lastSyncedAt)}`
          : "Online";

  const groups: { key: NavItem["group"]; label: string }[] = [
    { key: "me", label: "Me" },
    { key: "overview", label: "Overview" },
    { key: "manage", label: "Manage" },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" style={{ padding: "0 0.4rem" }}>
          <BrandMark />
        </NavLink>
        {groups.map((g) => {
          const list = items.filter((i) => i.group === g.key);
          if (!list.length) return null;
          return (
            <nav className="nav-group" key={g.key} aria-label={g.label}>
              <span className="eyebrow">{g.label}</span>
              {list.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === "/"} className="nav-link">
                  <i.icon />
                  {i.label}
                  {i.badge ? <span className="count">{i.badge}</span> : null}
                </NavLink>
              ))}
            </nav>
          );
        })}
        <div className="sidebar-foot">
          <span className={`status-pill${online ? "" : " off"}`} style={{ padding: "0 0.4rem" }}>
            <span className="dot" />
            {syncLabel}
          </span>
          <div className="me-card">
            <span className="avatar">{initials(profile?.displayName ?? "?")}</span>
            <div className="grow">
              <div className="truncate" style={{ fontWeight: 600 }}>{profile?.displayName}</div>
              <div className="tiny faint">{role ? ROLE_LABEL[role] : ""}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={signOut} aria-label="Sign out" title="Sign out">
              <IconLogout />
            </button>
          </div>
          <ThemeButton />
        </div>
      </aside>

      <div>
        <header className="topbar">
          <NavLink to="/">
            <BrandMark />
          </NavLink>
          <span className={`status-pill${online ? "" : " off"}`}>
            <span className="dot" />
            {syncLabel}
          </span>
        </header>
        <main className="main" key={loc.pathname}>
          <Outlet />
        </main>
      </div>

      <nav className="bottomnav" aria-label="Main">
        {primary.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === "/"}>
            <i.icon />
            {i.short ?? i.label}
            {i.badge ? <span className="nav-badge">{i.badge}</span> : null}
          </NavLink>
        ))}
        <button onClick={() => setMenu(true)} aria-label="More">
          <IconMenu />
          More
          {moreBadge ? <span className="nav-badge">{moreBadge}</span> : null}
        </button>
      </nav>

      {menu ? (
        <Sheet title={profile?.displayName ?? "Menu"} sub={role ? ROLE_LABEL[role] : undefined} onClose={() => setMenu(false)}>
          <div className="card card-tight">
            <div className="list">
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === "/"} className="list-item" onClick={() => setMenu(false)}>
                  <span className="icon-dot">
                    <i.icon />
                  </span>
                  <span className="grow title">{i.label}</span>
                  {i.badge ? <span className="chip neg">{i.badge}</span> : null}
                </NavLink>
              ))}
              <button className="list-item" onClick={signOut}>
                <span className="icon-dot">
                  <IconLogout />
                </span>
                <span className="grow title">Sign out</span>
              </button>
            </div>
          </div>
          <div style={{ marginTop: "0.8rem" }}>
            <ThemeButton />
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
