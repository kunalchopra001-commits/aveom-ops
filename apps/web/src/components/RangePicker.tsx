import { useState } from "react";
import { fortnightOf, formatRange, isFortnight, shiftFortnight, todayDubai, type DateRange } from "@shared";

/**
 * Pay-period picker. Defaults to the current fortnight (1–15 / 16–end); ‹ › step
 * between fortnights, "Custom" opens a free date range for looking further back.
 */
export function RangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [custom, setCustom] = useState(!isFortnight(value));
  const current = fortnightOf();
  const isCurrent = value[0] === current[0] && value[1] === current[1];
  const atFuture = value[1] >= todayDubai();

  if (custom) {
    return (
      <div className="card-flat stack-sm">
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <label className="field grow">
            <span>From</span>
            <input type="date" value={value[0]} max={value[1]} onChange={(e) => e.target.value && onChange([e.target.value, value[1]])} />
          </label>
          <label className="field grow">
            <span>To</span>
            <input type="date" value={value[1]} min={value[0]} onChange={(e) => e.target.value && onChange([value[0], e.target.value])} />
          </label>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => {
            setCustom(false);
            onChange(current);
          }}
        >
          ← Back to this fortnight
        </button>
      </div>
    );
  }

  return (
    <div className="row-between card-flat" style={{ padding: "0.45rem 0.5rem" }}>
      <button className="btn btn-ghost btn-sm" aria-label="Previous fortnight" onClick={() => onChange(shiftFortnight(value, -1))}>
        ‹
      </button>
      <div className="stack-sm" style={{ alignItems: "center", gap: 0 }}>
        <b className="num">{formatRange(value)}</b>
        <span className="tiny faint">
          {isCurrent ? "This fortnight" : (
            <button className="theme-btn" style={{ padding: 0, fontSize: "inherit" }} onClick={() => onChange(current)}>
              Jump to this fortnight
            </button>
          )}
          {" · "}
          <button className="theme-btn" style={{ padding: 0, fontSize: "inherit" }} onClick={() => setCustom(true)}>
            Custom dates
          </button>
        </span>
      </div>
      <button
        className="btn btn-ghost btn-sm"
        aria-label="Next fortnight"
        disabled={atFuture}
        onClick={() => onChange(shiftFortnight(value, 1))}
      >
        ›
      </button>
    </div>
  );
}
