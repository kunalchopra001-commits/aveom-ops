import { useEffect, useState, type ReactNode } from "react";
import { formatAed, type BillStatus, type TransferStatus } from "@shared";
import { IconAlert, IconCheck, IconInfo, IconX } from "@/components/icons";

/** Shown on the reviewers' demo copy so it is never mistaken for the live app. */
export const IS_DEMO = import.meta.env.VITE_DEMO === "1";
export function DemoBar() {
  if (!IS_DEMO) return null;
  return (
    <div className="demo-bar" role="note">
      DEMO · sample data only · changes here don't affect AVEOM
    </div>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return <div className={`spinner${small ? " sm" : ""}`} role="status" aria-label="Loading" />;
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

export function Loading() {
  return (
    <div className="stack-sm" style={{ padding: "1rem" }} aria-label="Loading">
      <div className="skeleton" style={{ width: "60%" }} />
      <div className="skeleton" style={{ width: "85%" }} />
      <div className="skeleton" style={{ width: "45%" }} />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div className="t">{title}</div>
      {children ? <div className="small">{children}</div> : null}
    </div>
  );
}

type Tone = "info" | "ok" | "warn" | "crit";
export function Banner({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const Icon = tone === "ok" ? IconCheck : tone === "info" ? IconInfo : IconAlert;
  return (
    <div className={`banner ${tone}`} role={tone === "crit" ? "alert" : "status"}>
      <Icon />
      <div className="grow">{children}</div>
    </div>
  );
}

type ChipTone = "neutral" | "pos" | "neg" | "warn" | "info" | "dark";
export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  return <span className={`chip ${tone === "neutral" ? "" : tone}`}>{children}</span>;
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? <span className="err">{error}</span> : null}
    </label>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function Money({ value, sign }: { value: number; sign?: "in" | "out" }) {
  return (
    <span className={`num ${sign === "in" ? "pos" : sign === "out" ? "neg" : ""}`}>
      {sign === "in" ? "+" : sign === "out" ? "−" : ""}
      {formatAed(value)}
    </span>
  );
}

export function Stat({ label, value, note, money = true }: { label: string; value: number | string; note?: ReactNode; money?: boolean }) {
  return (
    <div className="card stat">
      <span className="eyebrow">{label}</span>
      <span className="value">
        {money && typeof value === "number" ? (
          <>
            <small>AED</small>
            {formatAed(value)}
          </>
        ) : (
          value
        )}
      </span>
      {note ? <span className="note">{note}</span> : null}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)}>
          {it.label}
          {it.count ? <span className="n">{it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string }[];
}) {
  return (
    <div className="seg">
      {items.map((it) => (
        <button key={it.value} type="button" aria-pressed={value === it.value} onClick={() => onChange(it.value)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({
  title,
  sub,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <div>
            <h2>{title}</h2>
            {sub ? <p className="small muted" style={{ marginTop: 4 }}>{sub}</p> : null}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        {children}
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

const TRANSFER_STATUS: Record<TransferStatus, [string, ChipTone]> = {
  sent: ["Awaiting confirmation", "warn"],
  acknowledged: ["Confirmed", "pos"],
  disputed: ["Disputed", "neg"],
  cancelled: ["Cancelled", "neutral"],
};
const BILL_STATUS: Record<BillStatus, [string, ChipTone]> = {
  pending: ["Pending review", "warn"],
  approved: ["Approved", "pos"],
  rejected: ["Rejected", "neg"],
};

export function StatusChip({ status }: { status: TransferStatus | BillStatus }) {
  const [label, tone] = (TRANSFER_STATUS as Record<string, [string, ChipTone]>)[status] ??
    (BILL_STATUS as Record<string, [string, ChipTone]>)[status] ?? [status, "neutral"];
  return <Chip tone={tone}>{label}</Chip>;
}

export function BrandMark({ withName = true }: { withName?: boolean }) {
  return (
    <span className="brand">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="12" fill="#1b1d22" />
        <path d="M12 35 L24 11 L36 35" fill="none" stroke="#e9a521" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17.5 27 H30.5" stroke="#f3f1ec" strokeWidth="3.4" strokeLinecap="round" />
      </svg>
      {withName ? (
        <span className="word">
          AVEOM <b>OPS</b>
        </span>
      ) : null}
    </span>
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

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

export function ThemeButton() {
  const [theme, setTheme] = useState<string | null>(() => {
    try {
      return localStorage.getItem("aveom-ops-theme");
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);
  const dark =
    theme === "dark" || (!theme && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  return (
    <button
      className="theme-btn"
      onClick={() => {
        const next = dark ? "light" : "dark";
        setTheme(next);
        try {
          localStorage.setItem("aveom-ops-theme", next);
        } catch {
          /* ignore */
        }
      }}
    >
      {dark ? "☀ Light mode" : "☾ Dark mode"}
    </button>
  );
}
