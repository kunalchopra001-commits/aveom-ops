import { useState } from "react";
import { api, errMessage } from "@/lib/api";
import { openStoredFile } from "@/lib/data";
import { Banner, Field, Sheet, Spinner } from "@/components/ui";
import { IconArrowIn } from "@/components/icons";
import { METHOD_LABEL, formatAed, formatDubaiDateTime, formatIsoDate, type Transfer } from "@shared";

/** Payments sent to me that I still need to confirm (or report a problem with). */
export function ConfirmPayments({ transfers }: { transfers: Transfer[] }) {
  const waiting = transfers.filter((t) => t.status === "sent");
  const [open, setOpen] = useState<Transfer | null>(null);
  if (waiting.length === 0) return null;

  return (
    <div className="callout stack-sm">
      <div className="row-between">
        <div>
          <span className="eyebrow" style={{ color: "var(--signal-ink)" }}>Action needed</span>
          <h2 style={{ marginTop: 2 }}>
            Confirm {waiting.length === 1 ? "this payment" : `${waiting.length} payments`}
          </h2>
        </div>
      </div>
      <p className="small muted">
        Tap a payment once the money is actually in your hands or account. It only counts towards your balance after you
        confirm it.
      </p>
      <div className="card card-tight">
        <div className="list">
          {waiting.map((t) => (
            <button key={t.id} className="list-item" onClick={() => setOpen(t)}>
              <span className="icon-dot wait">
                <IconArrowIn />
              </span>
              <span className="grow">
                <span className="title">AED {formatAed(t.amount)}</span>
                <span className="sub" style={{ display: "block" }}>
                  {METHOD_LABEL[t.method]} from {t.sentByName} · {formatIsoDate(t.paidOn)}
                </span>
              </span>
              <span className="btn btn-primary btn-sm">Review</span>
            </button>
          ))}
        </div>
      </div>
      {open ? <RespondSheet transfer={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function RespondSheet({ transfer: t, onClose }: { transfer: Transfer; onClose: () => void }) {
  const [mode, setMode] = useState<"view" | "dispute">("view");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function respond(response: "received" | "disputed") {
    setBusy(true);
    setError("");
    try {
      await api.respondToTransfer({ id: t.id, response, note: note.trim() || undefined });
      onClose();
    } catch (e) {
      setError(errMessage(e));
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={`AED ${formatAed(t.amount)}`}
      sub={`${METHOD_LABEL[t.method]} from ${t.sentByName}`}
      onClose={onClose}
      footer={
        mode === "view" ? (
          <>
            <button className="btn btn-danger" disabled={busy} onClick={() => setMode("dispute")}>
              Something's wrong
            </button>
            <button className="btn btn-ok btn-lg" disabled={busy} onClick={() => respond("received")}>
              {busy ? <Spinner small /> : "Yes, I received it"}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setMode("view")}>
              Back
            </button>
            <button className="btn btn-danger" disabled={busy || note.trim().length < 3} onClick={() => respond("disputed")}>
              {busy ? <Spinner small /> : "Report problem"}
            </button>
          </>
        )
      }
    >
      <div className="stack">
        {error ? <Banner tone="crit">{error}</Banner> : null}
        <dl className="kv">
          <dt>Amount</dt>
          <dd className="num">AED {formatAed(t.amount)}</dd>
          <dt>Method</dt>
          <dd>{METHOD_LABEL[t.method]}</dd>
          <dt>Paid on</dt>
          <dd>{formatIsoDate(t.paidOn)}</dd>
          {t.reference ? (
            <>
              <dt>Reference</dt>
              <dd>{t.reference}</dd>
            </>
          ) : null}
          {t.note ? (
            <>
              <dt>Note</dt>
              <dd>{t.note}</dd>
            </>
          ) : null}
          <dt>Recorded</dt>
          <dd>{formatDubaiDateTime(t.sentAt)}</dd>
        </dl>
        {t.proofPath ? (
          <button className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => openStoredFile(t.proofPath!)}>
            View proof of payment
          </button>
        ) : null}
        {mode === "dispute" ? (
          <Field label="What's wrong?" hint="E.g. “Only received AED 400” or “Haven't received this yet”. Inaye will see this.">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} autoFocus maxLength={300} />
          </Field>
        ) : (
          <p className="small muted">Confirming is recorded with the date and time.</p>
        )}
      </div>
    </Sheet>
  );
}
