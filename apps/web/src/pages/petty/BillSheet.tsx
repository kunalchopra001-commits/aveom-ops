import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { api, errMessage } from "@/lib/api";
import { openStoredFile } from "@/lib/data";
import { Banner, Field, Sheet, Spinner, StatusChip } from "@/components/ui";
import { formatAed, formatDubaiDateTime, formatIsoDate, type Bill } from "@shared";

/** Bill details with attachments; reviewers get Approve / Reject. */
export function BillSheet({ bill: b, onClose, canReview = false }: { bill: Bill; onClose: () => void; canReview?: boolean }) {
  const { user } = useAuth();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reviewable = canReview && b.status === "pending" && b.uid !== user?.uid;

  async function review(approve: boolean) {
    setBusy(true);
    setError("");
    try {
      await api.reviewBill({ id: b.id, approve, reason: approve ? undefined : reason.trim() });
      onClose();
    } catch (e) {
      setError(errMessage(e));
      setBusy(false);
    }
  }

  async function open(path: string) {
    try {
      await openStoredFile(path);
    } catch (e) {
      setError(errMessage(e));
    }
  }

  return (
    <Sheet
      title={`AED ${formatAed(b.amount)}`}
      sub={`${b.userName} · ${formatIsoDate(b.spentOn)}`}
      onClose={onClose}
      footer={
        reviewable ? (
          rejecting ? (
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setRejecting(false)}>
                Back
              </button>
              <button className="btn btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => review(false)}>
                {busy ? <Spinner small /> : "Reject bill"}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-danger" disabled={busy} onClick={() => setRejecting(true)}>
                Reject
              </button>
              <button className="btn btn-ok btn-lg" disabled={busy} onClick={() => review(true)}>
                {busy ? <Spinner small /> : "Approve"}
              </button>
            </>
          )
        ) : undefined
      }
    >
      <div className="stack">
        {error ? <Banner tone="crit">{error}</Banner> : null}
        <div className="row">
          <StatusChip status={b.status} />
        </div>
        <dl className="kv">
          <dt>For</dt>
          <dd>{b.description}</dd>
          {b.vendor ? (
            <>
              <dt>Shop / supplier</dt>
              <dd>{b.vendor}</dd>
            </>
          ) : null}
          {b.projectName ? (
            <>
              <dt>Project</dt>
              <dd>{b.projectName}</dd>
            </>
          ) : null}
          <dt>Submitted</dt>
          <dd>{formatDubaiDateTime(b.submittedAt)}</dd>
          {b.reviewedAt ? (
            <>
              <dt>{b.status === "approved" ? "Approved" : "Rejected"}</dt>
              <dd>
                {formatDubaiDateTime(b.reviewedAt)} by {b.reviewedByName}
              </dd>
            </>
          ) : null}
          {b.rejectReason ? (
            <>
              <dt>Reason</dt>
              <dd>{b.rejectReason}</dd>
            </>
          ) : null}
        </dl>
        <div className="stack-sm">
          <span className="eyebrow">Attachments</span>
          <div className="thumbs">
            {b.files.map((f, i) => (
              <button key={f.path} className="thumb" onClick={() => open(f.path)} title={f.name}>
                {f.contentType === "application/pdf" ? "PDF" : `IMG ${i + 1}`}
              </button>
            ))}
          </div>
          <span className="tiny faint">Opens in a new tab.</span>
        </div>
        {rejecting ? (
          <Field label="Why are you rejecting it?" hint="The person will see this reason.">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={300} />
          </Field>
        ) : null}
      </div>
    </Sheet>
  );
}
