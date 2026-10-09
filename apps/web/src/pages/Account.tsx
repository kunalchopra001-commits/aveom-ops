import { useAuth } from "@/auth/AuthProvider";
import { Chip, PageHead, ThemeButton, initials } from "@/components/ui";
import { IconLogout } from "@/components/icons";
import { ROLE_LABEL } from "@shared";

export function Account() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <PageHead title="My account" />
      <div className="card stack">
        <div className="row">
          <span className="avatar" style={{ width: 48, height: 48, fontSize: "1rem" }}>{initials(profile.displayName)}</span>
          <div>
            <h2>{profile.displayName}</h2>
            <span className="small muted">@{profile.username} · {ROLE_LABEL[profile.role]}</span>
          </div>
        </div>
        <div className="row" style={{ gap: "0.35rem" }}>
          {profile.perms.shifts ? <Chip tone="info">Shifts</Chip> : null}
          {profile.perms.petty ? <Chip tone="pos">Petty cash</Chip> : null}
          {profile.role === "owner" ? <Chip tone="dark">Sends petty cash</Chip> : null}
        </div>
        <p className="small muted">
          Your username, password and access are managed by the Production Manager. Ask them if you need a new password or
          different access.
        </p>
      </div>
      <div className="row-between">
        <ThemeButton />
        <button className="btn btn-secondary" onClick={signOut}>
          <IconLogout /> Sign out
        </button>
      </div>
    </div>
  );
}
