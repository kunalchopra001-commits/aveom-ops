import { useEffect, useState, type ReactNode } from "react";

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function FullScreenLoader({ label }: { label?: string }) {
  return (
    <div className="center-screen">
      <div className="stack-sm" style={{ alignItems: "center" }}>
        <Spinner />
        {label ? <p className="muted small">{label}</p> : null}
      </div>
    </div>
  );
}

type ChipTone = "neutral" | "ok" | "warn" | "crit";
export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  return <span className={`chip ${tone === "neutral" ? "" : tone}`}>{children}</span>;
}

type BannerTone = "info" | "warn" | "crit";
export function Banner({ tone = "info", children }: { tone?: BannerTone; children: ReactNode }) {
  return <div className={`banner ${tone}`}>{children}</div>;
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function BrandMark({ withName = true }: { withName?: boolean }) {
  return (
    <div className="brand">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="1" y="1" width="46" height="46" rx="12" fill="var(--accent)" />
        <circle
          cx="24"
          cy="25.5"
          r="13.5"
          fill="none"
          stroke="var(--on-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="59 13"
          transform="rotate(128 24 25.5)"
        />
        <path
          d="M16.5 13.5 L24 6 L31.5 13.5"
          fill="none"
          stroke="var(--on-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="24" y1="25.5" x2="31.5" y2="18" stroke="var(--on-accent)" strokeWidth="3.2" strokeLinecap="round" />
        <line x1="24" y1="25.5" x2="24" y2="16" stroke="var(--on-accent)" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="24" cy="25.5" r="2.6" fill="var(--on-accent)" />
      </svg>
      {withName ? <span className="name">AVEOM&nbsp;TIME</span> : null}
    </div>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(() => {
    try {
      return localStorage.getItem("aveom-theme");
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);
  return (
    <button
      className="theme-toggle"
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        try {
          localStorage.setItem("aveom-theme", next);
        } catch {
          /* ignore */
        }
      }}
    >
      ◑ theme
    </button>
  );
}

/** Small hook: is the browser online right now? */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
