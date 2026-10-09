import { useAuth } from "@/auth/AuthProvider";
import { Banner, BrandMark, ThemeToggle } from "@/components/ui";

function Frame({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  return (
    <div className="center-screen">
      <div className="stack" style={{ width: "min(400px, 92vw)" }}>
        <div className="row-between">
          <BrandMark />
          <ThemeToggle />
        </div>
        <div className="panel stack">{children}</div>
        <button className="btn-ghost" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export function PendingApproval() {
  return (
    <Frame>
      <h1>Waiting for approval</h1>
      <Banner tone="info">
        Your account has been created. A manager needs to approve it before you can start.
        You’ll get in automatically once they do — check back shortly.
      </Banner>
    </Frame>
  );
}

export function Blocked() {
  return (
    <Frame>
      <h1>Account disabled</h1>
      <Banner tone="crit">
        Your access to AVEOM TIME has been turned off. If you think this is a mistake,
        contact your operations manager.
      </Banner>
    </Frame>
  );
}
