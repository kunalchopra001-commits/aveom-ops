import { useState } from "react";
import { Link } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/firebase";
import { REGISTRATION_CODE_LENGTH } from "@shared";
import { Banner, BrandMark, Field, ThemeToggle } from "@/components/ui";
import { api, errMessage } from "@/lib/functions";

export function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Choose a password of at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don’t match.");
      return;
    }
    if (!new RegExp(`^\\d{${REGISTRATION_CODE_LENGTH}}$`).test(code)) {
      setError(`The registration code is ${REGISTRATION_CODE_LENGTH} digits.`);
      return;
    }
    setBusy(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      await api.requestRegistration({ email: cleanEmail, password, code });
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      // AuthProvider picks it up; App routes to the "pending approval" screen.
    } catch (err) {
      setError(errMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="stack" style={{ width: "min(380px, 92vw)" }}>
        <div className="row-between">
          <BrandMark />
          <ThemeToggle />
        </div>
        <div className="panel stack">
          <h1>Create your account</h1>
          <p className="small muted">
            Use the 6-digit code your manager gave you along with this link.
          </p>
          {error ? <Banner tone="crit">{error}</Banner> : null}
          <form className="stack" onSubmit={submit}>
            <Field label="Email">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password" hint="At least 8 characters. You can change it later.">
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="Confirm password">
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>
            <Field label="Registration code">
              <input
                inputMode="numeric"
                pattern="\d*"
                maxLength={REGISTRATION_CODE_LENGTH}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
              />
            </Field>
            <button className="btn-primary btn-block" disabled={busy}>
              {busy ? "Creating…" : "Register"}
            </button>
          </form>
        </div>
        <p className="small muted" style={{ textAlign: "center" }}>
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
