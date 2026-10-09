import { useMemo, useRef, useState } from "react";
import { api, errMessage } from "@/lib/api";
import { newId, safeFileName, uploadFile } from "@/lib/data";
import { useAllBills, useAllTransfers, useUsers } from "@/lib/queries";
import { Banner, Empty, Field, Loading, Money, PageHead, Segmented, Sheet, Spinner, StatusChip, useOnline } from "@/components/ui";
import { IconSend, IconUpload, IconX } from "@/components/icons";
import {
  METHOD_LABEL,
  MAX_UPLOAD_BYTES,
  canHoldPetty,
  computeStatement,
  formatAed,
  formatIsoDate,
  parseAmount,
  todayDubai,
  type Transfer,
  type TransferMethod,
} from "@shared";

export function SendMoney() {
  const users = useUsers();
  const transfers = useAllTransfers();
  const bills = useAllBills();
  const online = useOnline();

  const recipients = useMemo(
    () =>
      (users.data ?? [])
        .filter((u) => u.active && u.perms.petty && canHoldPetty(u.role))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [users.data],
  );
  const balanceOf = (uid: string) =>
    computeStatement(
      (transfers.data ?? []).filter((t) => t.toUid === uid),
      (bills.data ?? []).filter((b) => b.uid === uid),
    ).balance;

  const [toUid, setToUid] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<TransferMethod>("transfer");
  const [paidOn, setPaidOn] = useState(todayDubai());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [cancel, setCancel] = useState<Transfer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const parsed = parseAmount(amount);
  const recipient = recipients.find((r) => r.uid === toUid);
  const ready = !!recipient && !!parsed && !!paidOn;

  async function send() {
    if (!recipient || !parsed) return;
    setBusy(true);
    setError("");
    try {
      const id = newId();
      let proofPath: string | undefined;
      if (proof) proofPath = await uploadFile(`transfers/${id}/${safeFileName(proof.name)}`, proof);
      await api.sendPettyCash({
        id,
        toUid: recipient.uid,
        amount: parsed,
        method,
        paidOn,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
        proofPath,
      });
      setDone(`AED ${formatAed(parsed)} recorded for ${recipient.displayName}. They'll be asked to confirm it.`);
      setAmount("");
      setReference("");
      setNote("");
      setProof(null);
      setConfirming(false);
    } catch (e) {
      setError(errMessage(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const recent = (transfers.data ?? []).slice(0, 25);

  return (
    <div className="page">
      <PageHead title="Send petty cash" sub="Record money you've transferred or handed over. The person confirms when they receive it." />
      {!online ? <Banner tone="warn">You're offline — you need signal to record a payment.</Banner> : null}
      {done ? <Banner tone="ok">{done}</Banner> : null}
      {error ? <Banner tone="crit">{error}</Banner> : null}

      <div className="grid grid-main">
        <div className="card stack">
          <Field label="Pay to">
            <select value={toUid} onChange={(e) => setToUid(e.target.value)}>
              <option value="">Choose a person…</option>
              {recipients.map((r) => (
                <option key={r.uid} value={r.uid}>
                  {r.displayName} — balance AED {formatAed(balanceOf(r.uid))}
                </option>
              ))}
            </select>
          </Field>
          {users.data && recipients.length === 0 ? (
            <Banner tone="info">Nobody has petty cash access yet. The Production Manager switches it on per person.</Banner>
          ) : null}
          <Field label="Amount">
            <div className="input-money">
              <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </Field>
          <div className="field">
            <span>How</span>
            <Segmented<TransferMethod>
              value={method}
              onChange={setMethod}
              items={[
                { value: "transfer", label: "Bank transfer" },
                { value: "cash", label: "Cash" },
              ]}
            />
          </div>
          <div className="grid grid-2">
            <Field label="Date paid">
              <input type="date" value={paidOn} max={todayDubai()} onChange={(e) => setPaidOn(e.target.value)} />
            </Field>
            <Field label={method === "transfer" ? "Bank reference (optional)" : "Reference (optional)"}>
              <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
            </Field>
          </div>
          <Field label="Note (optional)" hint="E.g. what the money is for.">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </Field>
          <div className="field">
            <span>Proof of payment (optional)</span>
            {proof ? (
              <div className="file-chip">
                <span className="pdf" style={{ background: "var(--sunken)", color: "var(--ink-2)" }}>
                  {proof.type === "application/pdf" ? "PDF" : "IMG"}
                </span>
                <span className="grow truncate">{proof.name}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setProof(null)} aria-label="Remove file">
                  <IconX />
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => fileInput.current?.click()}>
                <IconUpload /> Attach screenshot or PDF
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              hidden
              accept="image/*,application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.size > MAX_UPLOAD_BYTES) setError("That file is bigger than 10 MB.");
                else setProof(f ?? null);
                e.target.value = "";
              }}
            />
          </div>
          <button className="btn btn-primary btn-lg" disabled={!ready || !online} onClick={() => setConfirming(true)}>
            <IconSend /> Review & send
          </button>
        </div>

        <div className="card card-tight">
          <div style={{ padding: "0.9rem 1rem" }}>
            <h2>Recent payments</h2>
          </div>
          <hr className="divider" />
          {transfers.data === null ? (
            <Loading />
          ) : recent.length === 0 ? (
            <Empty title="No payments yet" />
          ) : (
            <div className="list">
              {recent.map((t) => (
                <div key={t.id} className="list-item">
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="title truncate" style={{ display: "block" }}>{t.toName}</span>
                    <span className="sub">
                      {formatIsoDate(t.paidOn)} · {METHOD_LABEL[t.method]}
                    </span>
                    {t.status === "disputed" && t.responseNote ? (
                      <span className="tiny neg" style={{ display: "block" }}>“{t.responseNote}”</span>
                    ) : null}
                  </span>
                  <span className="stack-sm" style={{ alignItems: "flex-end", gap: 4 }}>
                    <Money value={t.amount} />
                    <StatusChip status={t.status} />
                    {t.status === "sent" || t.status === "disputed" ? (
                      <button className="btn btn-ghost btn-sm" style={{ minHeight: 26 }} onClick={() => setCancel(t)}>
                        Cancel
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirming && recipient && parsed ? (
        <Sheet
          title="Send this payment?"
          onClose={() => !busy && setConfirming(false)}
          footer={
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>
                Edit
              </button>
              <button className="btn btn-primary btn-lg" disabled={busy} onClick={send}>
                {busy ? <Spinner small /> : "Confirm & send"}
              </button>
            </>
          }
        >
          <dl className="kv">
            <dt>To</dt>
            <dd>{recipient.displayName}</dd>
            <dt>Amount</dt>
            <dd className="num" style={{ fontWeight: 700 }}>AED {formatAed(parsed)}</dd>
            <dt>How</dt>
            <dd>{METHOD_LABEL[method]}</dd>
            <dt>Date paid</dt>
            <dd>{formatIsoDate(paidOn)}</dd>
            {reference ? (
              <>
                <dt>Reference</dt>
                <dd>{reference}</dd>
              </>
            ) : null}
            {proof ? (
              <>
                <dt>Proof</dt>
                <dd>{proof.name}</dd>
              </>
            ) : null}
          </dl>
        </Sheet>
      ) : null}

      {cancel ? <CancelSheet transfer={cancel} onClose={() => setCancel(null)} /> : null}
    </div>
  );
}

function CancelSheet({ transfer: t, onClose }: { transfer: Transfer; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Sheet
      title="Cancel this payment?"
      sub={`AED ${formatAed(t.amount)} to ${t.toName}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Keep it
          </button>
          <button
            className="btn btn-danger"
            disabled={busy || reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await api.cancelTransfer({ id: t.id, reason: reason.trim() });
                onClose();
              } catch (e) {
                setError(errMessage(e));
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner small /> : "Cancel payment"}
          </button>
        </>
      }
    >
      <div className="stack">
        {error ? <Banner tone="crit">{error}</Banner> : null}
        <p className="small muted">Use this if the payment was recorded by mistake. It stays in the log as cancelled.</p>
        <Field label="Reason">
          <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={300} />
        </Field>
      </div>
    </Sheet>
  );
}
