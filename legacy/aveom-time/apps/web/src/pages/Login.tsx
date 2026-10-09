import { useState } from "react";
import { Link } from "react-router-dom";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/firebase";
import { Banner, BrandMark, Field, ThemeToggle } from "@/components/ui";
import { errMessage } from "@/lib/functions";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("Enter your email above first, then tap ‘Forgot password’.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      setNotice("If that email has an account, a reset link is on its way.");
    } catch (err) {
      setError(errMessage(err));
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
          <h1>Sign in</h1>
          {error ? <Banner tone="crit">{error}</Banner> : null}
          {notice ? <Banner tone="info">{notice}</Banner> : null}
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
            <Field label="Password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <button className="btn-primary btn-block" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <button className="btn-ghost" onClick={resetPassword}>
            Forgot password?
          </button>
        </div>
        <p className="small muted" style={{ textAlign: "center" }}>
          New here? <Link to="/register">Register with your invite link</Link>
        </p>
      </div>
    </div>
  );
}
