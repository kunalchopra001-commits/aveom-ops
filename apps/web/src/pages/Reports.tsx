import { useState } from "react";
import { api, errMessage } from "@/lib/api";
import { saveBase64File, XLSX_MIME } from "@/lib/data";
import { Banner, Field, PageHead, Segmented, Spinner } from "@/components/ui";
import { IconChart, IconDownload, IconWallet } from "@/components/icons";
import { todayDubai } from "@shared";

type Preset = "this-month" | "last-month" | "custom";

function monthRange(offset: number): [string, string] {
  const [y, m] = todayDubai().split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1 + offset, 1));
  const end = new Date(Date.UTC(y, m + offset, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return [iso(start), offset === 0 ? todayDubai() : iso(end)];
}

export function Reports() {
  const [preset, setPreset] = useState<Preset>("this-month");
  const [custom, setCustom] = useState<[string, string]>(monthRange(0));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const [from, to] = preset === "this-month" ? monthRange(0) : preset === "last-month" ? monthRange(-1) : custom;
  const valid = !!from && !!to && from <= to;

  async function download(kind: "shifts" | "petty") {
    setBusy(kind);
    setError("");
    setDone("");
    try {
      const fn = kind === "shifts" ? api.shiftReport : api.pettyReport;
      const r = await fn({ periodStart: from, periodEnd: to });
      saveBase64File(r.base64, r.fileName, XLSX_MIME);
      setDone(`Downloaded ${r.fileName}`);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <PageHead title="Reports" sub="Excel workbooks, generated fresh each time from the live data." />
      {error ? <Banner tone="crit">{error}</Banner> : null}
      {done ? <Banner tone="ok">{done}</Banner> : null}

      <div className="card stack">
        <span className="eyebrow">Period</span>
        <Segmented<Preset>
          value={preset}
          onChange={setPreset}
          items={[
            { value: "this-month", label: "This month" },
            { value: "last-month", label: "Last month" },
            { value: "custom", label: "Custom" },
          ]}
        />
        {preset === "custom" ? (
          <div className="grid grid-2">
            <Field label="From">
              <input type="date" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} />
            </Field>
            <Field label="To">
              <input type="date" value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} />
            </Field>
          </div>
        ) : (
          <p className="small muted num">
            {from} → {to}
          </p>
        )}
      </div>

      <div className="grid grid-2 grid-auto">
        <ReportCard
          icon={<IconChart />}
          title="Shift hours"
          points={["Summary by person and by project", "One sheet per person with every shift", "Flags for overlaps and long shifts"]}
          busy={busy === "shifts"}
          disabled={!valid || !!busy}
          onClick={() => download("shifts")}
        />
        <ReportCard
          icon={<IconWallet />}
          title="Petty cash"
          points={["Opening and closing balance per person", "Statement sheet per person", "All payments and all bills"]}
          busy={busy === "petty"}
          disabled={!valid || !!busy}
          onClick={() => download("petty")}
        />
      </div>
    </div>
  );
}

function ReportCard({
  icon,
  title,
  points,
  busy,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  points: string[];
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="card stack">
      <div className="row">
        <span className="icon-dot">{icon}</span>
        <h2>{title}</h2>
      </div>
      <ul className="small muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <button className="btn btn-primary" disabled={disabled} onClick={onClick}>
        {busy ? <Spinner small /> : <IconDownload />} Download .xlsx
      </button>
    </div>
  );
}
