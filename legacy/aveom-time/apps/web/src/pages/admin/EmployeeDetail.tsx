import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { db, storage } from "@/firebase";
import { useAuth } from "@/auth/AuthProvider";
import {
  COL,
  formatDubaiDate,
  isValidUaeIban,
  normalizeIban,
  type EmployeeProfile,
} from "@shared";
import { Banner, Chip, Field } from "@/components/ui";
import { api, errMessage } from "@/lib/functions";

export function EmployeeDetail() {
  const { uid = "" } = useParams();
  const { isAdmin } = useAuth();
  const [emp, setEmp] = useState<EmployeeProfile | null>(null);
  const [front, setFront] = useState<string>("");
  const [back, setBack] = useState<string>("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, COL.employees, uid), (snap) =>
      setEmp(snap.exists() ? (snap.data() as EmployeeProfile) : null),
    );
  }, [uid]);

  useEffect(() => {
    setFront("");
    setBack("");
    if (emp?.eidFrontPath)
      getDownloadURL(storageRef(storage, emp.eidFrontPath)).then(setFront).catch(() => {});
    if (emp?.eidBackPath)
      getDownloadURL(storageRef(storage, emp.eidBackPath)).then(setBack).catch(() => {});
  }, [emp?.eidFrontPath, emp?.eidBackPath]);

  if (!emp) return <p className="muted">Loading…</p>;

  async function run(label: string, fn: () => Promise<unknown>) {
    setError("");
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="stack">
      <header>
        <p className="small muted">
          <Link to="/admin/employees">← Employees</Link>
        </p>
        <div className="row-between">
          <h1>{emp.officialName ?? emp.email}</h1>
          <Chip tone={emp.status === "approved" ? "ok" : emp.status === "blocked" ? "crit" : "warn"}>
            {emp.status}
          </Chip>
        </div>
      </header>

      {error ? <Banner tone="crit">{error}</Banner> : null}
      {emp.ocr?.needsReview ? (
        <Banner tone="warn">OCR values need verifying against the ID images below.</Banner>
      ) : null}
      {emp.idPurgeAt ? (
        <Banner tone="warn">
          ID images scheduled for deletion on {formatDubaiDate(emp.idPurgeAt)} (employee is blocked).
        </Banner>
      ) : null}
      {emp.idPurgedAt ? <Banner tone="info">ID images were purged on {formatDubaiDate(emp.idPurgedAt)}.</Banner> : null}

      <div className="grid-2">
        <div className="panel stack-sm">
          <span className="eyebrow">Emirates ID — front</span>
          {front ? <img className="id-photo" src={front} alt="EID front" /> : <p className="muted small">Not uploaded</p>}
        </div>
        <div className="panel stack-sm">
          <span className="eyebrow">Emirates ID — back</span>
          {back ? <img className="id-photo" src={back} alt="EID back" /> : <p className="muted small">Not uploaded</p>}
        </div>
      </div>

      <div className="panel">
        <dl className="kv">
          <dt>Email</dt><dd>{emp.email}</dd>
          <dt>Contact</dt><dd>{emp.contactNumber ?? "—"}</dd>
          <dt>Official name</dt><dd>{emp.officialName ?? "—"}</dd>
          <dt>EID number</dt><dd className="mono">{emp.eidNumber ?? "—"}</dd>
          <dt>EID issued</dt><dd>{emp.eidIssueDate ?? "—"}</dd>
          <dt>EID expiry</dt><dd>{emp.eidExpiryDate ?? "—"}</dd>
          <dt>Bank</dt>
          <dd>
            {emp.bank
              ? `${emp.bank.accountHolderName} · ${emp.bank.bankName} · ${emp.bank.iban}${
                  emp.bank.accountNumber ? " · a/c " + emp.bank.accountNumber : ""
                }`
              : "—"}
          </dd>
          <dt>Profile</dt>
          <dd>
            {emp.profileComplete ? (emp.profileLocked ? "complete, locked" : "complete, unlocked") : "incomplete"}
            {emp.unlockGrant && !emp.unlockGrant.used ? " · unlock granted, unused" : ""}
          </dd>
        </dl>
      </div>

      {isAdmin ? (
        <div className="panel stack">
          <h3>Manager actions</h3>
          <div className="row wrap">
            <button
              disabled={!!busy || emp.profileLocked === false}
              onClick={() => run("unlock", () => api.grantProfileUnlock({ uid }))}
            >
              {busy === "unlock" ? "…" : "Unlock profile for one edit"}
            </button>
            {emp.status === "blocked" ? (
              <button
                disabled={!!busy}
                onClick={() => run("unblock", () => api.setEmployeeBlocked({ uid, blocked: false }))}
              >
                {busy === "unblock" ? "…" : "Unblock login"}
              </button>
            ) : (
              <button
                className="btn-danger"
                disabled={!!busy}
                onClick={() =>
                  confirm("Block this employee? Their Emirates ID images will be deleted after 7 days.") &&
                  run("block", () => api.setEmployeeBlocked({ uid, blocked: true }))
                }
              >
                {busy === "block" ? "…" : "Block login (termination)"}
              </button>
            )}
            <button className="btn-ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cancel correction" : "Correct a field"}
            </button>
          </div>
          {editing ? <CorrectionForm emp={emp} onDone={() => setEditing(false)} /> : null}
        </div>
      ) : (
        <Banner tone="info">You have view &amp; export access. Corrections are done by the Operations Manager or Founder.</Banner>
      )}
    </div>
  );
}

function CorrectionForm({ emp, onDone }: { emp: EmployeeProfile; onDone: () => void }) {
  const [contactNumber, setContact] = useState(emp.contactNumber ?? "");
  const [officialName, setName] = useState(emp.officialName ?? "");
  const [eidIssueDate, setIssue] = useState(emp.eidIssueDate ?? "");
  const [eidExpiryDate, setExpiry] = useState(emp.eidExpiryDate ?? "");
  const [iban, setIban] = useState(emp.bank?.iban ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    const patch: Record<string, unknown> = {};
    if (contactNumber !== (emp.contactNumber ?? "")) patch.contactNumber = contactNumber.trim();
    if (officialName !== (emp.officialName ?? "")) patch.officialName = officialName.trim();
    if (eidIssueDate !== (emp.eidIssueDate ?? "")) patch.eidIssueDate = eidIssueDate;
    if (eidExpiryDate !== (emp.eidExpiryDate ?? "")) patch.eidExpiryDate = eidExpiryDate;
    if (iban && iban !== (emp.bank?.iban ?? "")) {
      if (!isValidUaeIban(iban)) {
        setError("That IBAN is not valid.");
        return;
      }
      patch.bank = { ...(emp.bank ?? {}), iban: normalizeIban(iban) };
    }
    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }
    setBusy(true);
    try {
      await api.correctEmployeeField({ uid: emp.uid, patch });
      onDone();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-flat stack">
      {error ? <Banner tone="crit">{error}</Banner> : null}
      <Field label="Contact number">
        <input value={contactNumber} onChange={(e) => setContact(e.target.value)} />
      </Field>
      <Field label="Official name">
        <input value={officialName} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="EID issue date">
          <input type="date" value={eidIssueDate} onChange={(e) => setIssue(e.target.value)} />
        </Field>
        <Field label="EID expiry date">
          <input type="date" value={eidExpiryDate} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
      </div>
      <Field label="IBAN">
        <input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} />
      </Field>
      <button className="btn-primary" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save correction"}
      </button>
    </div>
  );
}
