import { useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Banner, BrandMark, Field, Spinner } from "@/components/ui";

export function Login() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(username, password);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <BrandMark />
        <div>
          <h1>Sign in</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Use the username and password the Production Manager gave you.
          </p>
        </div>
        <form className="card stack" onSubmit={submit}>
          {error ? <Banner tone="crit">{error}</Banner> : null}
          <Field label="Username">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? <Spinner small /> : "Sign in"}
          </button>
        </form>
        <p className="small faint" style={{ textAlign: "center" }}>
          Forgot your password? Ask the Production Manager to set a new one.
        </p>
      </div>
    </div>
  );
}
