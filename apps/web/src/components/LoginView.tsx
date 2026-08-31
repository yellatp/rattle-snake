import { useState } from "react";
import ErrorBoundary from "./ErrorBoundary";
import { loginAccount, registerAccount } from "../lib/api";

function LoginViewInner() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      if (mode === "register") {
        await registerAccount(email.trim(), password, name.trim() || undefined);
      } else {
        await loginAccount(email.trim(), password);
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="panel auth-panel">
      <h2>{mode === "login" ? "Sign in" : "Create an account"}</h2>
      <form className="editor-form" onSubmit={submit}>
        {mode === "register" && (
          <div className="form-row">
            <label htmlFor="auth-name">Name</label>
            <input
              id="auth-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>
        )}
        <div className="form-row">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            minLength={8}
            required
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn" disabled={working}>
            {working ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
          >
            {mode === "login" ? "Need an account? Register" : "Already registered? Sign in"}
          </button>
        </div>
        {error && <div className="error-banner">{error}</div>}
      </form>
    </section>
  );
}

export default function LoginView() {
  return (
    <ErrorBoundary>
      <LoginViewInner />
    </ErrorBoundary>
  );
}
