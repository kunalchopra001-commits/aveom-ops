import { useState } from "react";
import { updatePassword } from "firebase/auth";
import { useAuth } from "@/auth/AuthProvider";
import { formatDubaiDate } from "@shared";
import { Banner, Chip, Field } from "@/components/ui";
import { errMessage } from "@/lib/functions";

export function ProfileTab() {
  const { user, profile } = useAuth();
  const [pw, setPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  if (!profile) return null;

  const expiryMs = profile.eidExpiryDate ? Date.parse(profile.eidExpiryDate + "T00:00:00+04:00") : null;
  const expirySoon = expiryMs != null && expiryMs - Date.now() < 30 * 864e5;

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg("");
    setPwErr("");
    if (pw.length < 8) {
      setPwErr("Use at least 8 characters.");
      return;
    }
    try {
      await updatePassword(user!, pw);
      setPw("");
      setPwMsg("Password updated.");
    } catch (err) {
      setPwErr(errMessage(err) + " You may need to sign out and in again first.");
    }
  }

  return (
    <div className="stack">
      <div className="row-between">
        <h2>Profile</h2>
        <Chip tone={profile.profileLocked ? "neutral" : "warn"}>
          {profile.profileLocked ? "locked" : "unlocked for edit"}
        </Chip>
      </div>

      {!profile.profileLocked ? (
        <Banner tone="warn">
          Your profile is unlocked. Open it from the top to make your one allowed update.
        </Banner>
      ) : (
        <Banner tone="info">
          Your details are locked. To change anything, ask your operations manager to unlock your
          profile.
        </Banner>
      )}

      <div className="panel">
        <dl className="kv">
          <dt>Name</dt>
          <dd>{profile.officialName ?? "—"}</dd>
          <dt>Email</dt>
          <dd>{profile.email}</dd>
          <dt>Contact</dt>
          <dd>{profile.contactNumber ?? "—"}</dd>
          <dt>EID no.</dt>
          <dd className="mono">{profile.eidNumber ?? "—"}</dd>
          <dt>EID issued</dt>
          <dd>{profile.eidIssueDate ? formatDubaiDate(Date.parse(profile.eidIssueDate + "T00:00:00+04:00")) : "—"}</dd>
          <dt>EID expires</dt>
          <dd>
            {profile.eidExpiryDate
              ? formatDubaiDate(Date.parse(profile.eidExpiryDate + "T00:00:00+04:00"))
              : "—"}{" "}
            {expirySoon ? <Chip tone="crit">expiring</Chip> : null}
          </dd>
          <dt>Bank</dt>
          <dd>
            {profile.bank ? `${profile.bank.bankName} · ${profile.bank.iban}` : "—"}
          </dd>
        </dl>
      </div>

      <div className="panel stack">
        <h3>Change password</h3>
        {pwMsg ? <Banner tone="info">{pwMsg}</Banner> : null}
        {pwErr ? <Banner tone="crit">{pwErr}</Banner> : null}
        <form className="stack" onSubmit={changePassword}>
          <Field label="New password">
            <input
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </Field>
          <button className="btn-block">Update password</button>
        </form>
      </div>
    </div>
  );
}
