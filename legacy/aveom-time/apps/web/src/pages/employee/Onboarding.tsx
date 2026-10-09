import { useEffect, useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "@/firebase";
import { useAuth } from "@/auth/AuthProvider";
import {
  COL,
  normalizeIban,
  onboardingProblems,
  type BankDetails,
  type OnboardingValues,
} from "@shared";
import { Banner, BrandMark, Field, ThemeToggle } from "@/components/ui";
import { errMessage } from "@/lib/functions";

type UploadState = "idle" | "uploading" | "done";

export function Onboarding() {
  const { user, profile, signOut } = useAuth();
  const editing = !!profile?.profileComplete;

  const [contactNumber, setContact] = useState("");
  const [officialName, setOfficialName] = useState("");
  const [eidNumber, setEidNumber] = useState("");
  const [eidIssueDate, setIssue] = useState("");
  const [eidExpiryDate, setExpiry] = useState("");
  const [bank, setBank] = useState<BankDetails>({
    accountHolderName: "",
    bankName: "",
    accountNumber: "",
    iban: "",
  });
  const [frontState, setFrontState] = useState<UploadState>("idle");
  const [backState, setBackState] = useState<UploadState>("idle");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Seed from the profile (and keep OCR pre-fills flowing in until the user types).
  useEffect(() => {
    if (!profile) return;
    setContact((v) => v || profile.contactNumber || "");
    setOfficialName((v) => v || profile.officialName || "");
    setEidNumber((v) => v || profile.eidNumber || "");
    setIssue((v) => v || profile.eidIssueDate || "");
    setExpiry((v) => v || profile.eidExpiryDate || "");
    setBank((b) => ({
      accountHolderName: b.accountHolderName || profile.bank?.accountHolderName || "",
      bankName: b.bankName || profile.bank?.bankName || "",
      accountNumber: b.accountNumber || profile.bank?.accountNumber || "",
      iban: b.iban || profile.bank?.iban || "",
    }));
    if (profile.eidFrontPath) setFrontState("done");
    if (profile.eidBackPath) setBackState("done");
  }, [profile]);

  const values: OnboardingValues = useMemo(
    () => ({
      contactNumber,
      officialName,
      eidNumber,
      eidIssueDate,
      eidExpiryDate,
      eidFrontPath: profile?.eidFrontPath,
      eidBackPath: profile?.eidBackPath,
      bank,
    }),
    [contactNumber, officialName, eidNumber, eidIssueDate, eidExpiryDate, bank, profile],
  );
  const problems = onboardingProblems(values);

  async function upload(side: "front" | "back", file: File) {
    if (!user) return;
    setError("");
    const set = side === "front" ? setFrontState : setBackState;
    set("uploading");
    try {
      const path = `eid/${user.uid}/${side}`;
      await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
      await updateDoc(doc(db, COL.employees, user.uid), {
        [side === "front" ? "eidFrontPath" : "eidBackPath"]: path,
        updatedAt: Date.now(),
      });
      set("done");
    } catch (err) {
      set("idle");
      setError(errMessage(err));
    }
  }

  async function save() {
    if (!user || !profile) return;
    setError("");
    if (problems.length > 0) {
      setError(problems[0]);
      return;
    }
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {
        contactNumber: contactNumber.trim(),
        officialName: officialName.trim(),
        eidNumber: eidNumber.trim(),
        eidIssueDate,
        eidExpiryDate,
        bank: {
          accountHolderName: bank.accountHolderName.trim(),
          bankName: bank.bankName.trim(),
          accountNumber: bank.accountNumber?.trim() || undefined,
          iban: normalizeIban(bank.iban),
        },
        profileComplete: true,
        profileLocked: true,
        updatedAt: Date.now(),
      };
      if (profile.unlockGrant && !profile.unlockGrant.used) {
        patch.unlockGrant = { ...profile.unlockGrant, used: true };
      }
      await updateDoc(doc(db, COL.employees, user.uid), patch);
      // App re-routes to the shift tabs once profileLocked flips.
    } catch (err) {
      setError(errMessage(err));
      setBusy(false);
    }
  }

  const ocrPending = profile?.ocr?.needsReview;

  return (
    <div className="center-screen">
      <div className="stack" style={{ width: "min(520px, 94vw)" }}>
        <div className="row-between">
          <BrandMark />
          <div className="row" style={{ gap: "0.5rem" }}>
            <ThemeToggle />
            <button className="btn-ghost btn-sm" onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        </div>

        <div className="panel stack">
          <h1>{editing ? "Update your details" : "Complete your profile"}</h1>
          <p className="small muted">
            {editing
              ? "Your manager unlocked your profile for one update. Save when you’re done — it locks again afterwards."
              : "This is a one-time setup. After you save, your profile locks and only a manager can unlock it."}
          </p>

          {error ? <Banner tone="crit">{error}</Banner> : null}

          <h3>Contact</h3>
          <Field label="Working contact number" hint="UAE mobile, e.g. 0501234567">
            <input
              type="tel"
              inputMode="tel"
              value={contactNumber}
              onChange={(e) => setContact(e.target.value)}
            />
          </Field>

          <h3>Emirates ID</h3>
          <div className="grid-2">
            <IdUpload side="front" state={frontState} onFile={(f) => upload("front", f)} />
            <IdUpload side="back" state={backState} onFile={(f) => upload("back", f)} />
          </div>
          {ocrPending ? (
            <Banner tone="warn">
              We read what we could from your ID. Please check the four fields below and fix
              anything that’s wrong before saving.
            </Banner>
          ) : null}
          <Field label="Official name (as printed on the ID)">
            <input value={officialName} onChange={(e) => setOfficialName(e.target.value)} />
          </Field>
          <Field label="Emirates ID number" hint="784-XXXX-XXXXXXX-X">
            <input value={eidNumber} onChange={(e) => setEidNumber(e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label="ID issue date">
              <input type="date" value={eidIssueDate} onChange={(e) => setIssue(e.target.value)} />
            </Field>
            <Field label="ID expiry date">
              <input type="date" value={eidExpiryDate} onChange={(e) => setExpiry(e.target.value)} />
            </Field>
          </div>

          <h3>Bank account for wage transfers</h3>
          <Field label="Account holder name">
            <input
              value={bank.accountHolderName}
              onChange={(e) => setBank({ ...bank, accountHolderName: e.target.value })}
            />
          </Field>
          <div className="grid-2">
            <Field label="Bank name">
              <input value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} />
            </Field>
            <Field label="Account number" hint="Optional">
              <input
                value={bank.accountNumber ?? ""}
                onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })}
              />
            </Field>
          </div>
          <Field label="IBAN" hint="AE followed by 21 digits">
            <input
              value={bank.iban}
              onChange={(e) => setBank({ ...bank, iban: e.target.value.toUpperCase() })}
            />
          </Field>

          {problems.length > 0 ? (
            <details>
              <summary className="small muted">{problems.length} item(s) still needed</summary>
              <ul className="small muted">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <button
            className="btn-primary btn-block"
            disabled={busy || problems.length > 0}
            onClick={save}
          >
            {busy ? "Saving…" : editing ? "Save & lock profile" : "Submit & lock profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IdUpload({
  side,
  state,
  onFile,
}: {
  side: "front" | "back";
  state: UploadState;
  onFile: (f: File) => void;
}) {
  return (
    <label className="panel-flat stack-sm" style={{ cursor: "pointer" }}>
      <span className="eyebrow">
        {side} — {state === "done" ? "uploaded ✓" : state === "uploading" ? "uploading…" : "tap to add"}
      </span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <span className="small muted">Photo of the {side} of your Emirates ID</span>
    </label>
  );
}
