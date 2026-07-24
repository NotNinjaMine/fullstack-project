import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { login, forgotPassword, resetPassword } from "../services/authService";
import useAuth from "../hooks/useAuth";
import { ROLE_HOME } from "../lib/nav";

const DEMO = [
  { e: "weiling@innovare.com", label: "Wei Ling · Employee" },
  { e: "priya@innovare.com", label: "Priya · Employee" },
  { e: "marcus@innovare.com", label: "Marcus · Supervisor" },
  { e: "diana@innovare.com", label: "Diana · Manager" },
  { e: "hr@innovare.com", label: "Aisha · HR Admin" },
];

const inputCls =
  "mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";

// UC-01: login. Redirects to /dashboard once credentials check out.
// UC-23: also hosts the standard "forgot password" email-link flow, and
// picks up a ?resetToken= link the same way an email client would deliver it.
export default function LoginPage() {
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  // mode: "login" | "forgot" | "reset"
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("resetToken");
    if (t) {
      setResetToken(t);
      setMode("reset");
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const switchMode = (m) => {
    setMode(m);
    setError("");
    setInfo("");
  };

  const attempt = () => {
    setBusy(true);
    setError("");
    login(email, password)
      .then(({ accessToken, user }) => {
        loginUser(accessToken, user);
        navigate(ROLE_HOME[user.role] ?? "/profile", { replace: true });
      })
      .catch((err) => {
        setError(err.response?.data?.message || "Login failed.");
      })
      .finally(() => setBusy(false));
  };

  const requestReset = () => {
    setBusy(true);
    setError("");
    setInfo("");
    forgotPassword(email)
      .then((res) => {
        setInfo(res.message);
        // Demo mode: no email server exists in a client-only mock, so the
        // token is returned directly and the flow drops straight into reset.
        if (res.demoResetToken) {
          setResetToken(res.demoResetToken);
          setMode("reset");
          setInfo(
            "Demo mode: no email server configured, so your reset code was filled in below. In production this code arrives by email only."
          );
        }
      })
      .catch((err) => setError(err.response?.data?.message || "Request failed."))
      .finally(() => setBusy(false));
  };

  const submitReset = () => {
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    resetPassword(resetToken.trim(), newPassword)
      .then((res) => {
        setPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setResetToken("");
        switchMode("login");
        setInfo(res.message);
      })
      .catch((err) => setError(err.response?.data?.message || "Reset failed."))
      .finally(() => setBusy(false));
  };

  return (
    <div className="min-h-screen bg-teal-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-widest text-teal-300">Innovare Management</p>
          <h1 className="text-2xl font-semibold text-white mt-1">Leave Management System</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          {mode === "login" && (
            <>
              <h2 className="font-semibold mb-4">Sign in</h2>

              <label className="block mb-3">
                <span className="text-sm text-slate-600">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && attempt()}
                  autoComplete="username"
                  className={inputCls}
                />
              </label>
              <label className="block mb-2">
                <span className="text-sm text-slate-600">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && attempt()}
                  autoComplete="current-password"
                  className={inputCls}
                />
              </label>

              <div className="text-right mb-4">
                <button
                  onClick={() => switchMode("forgot")}
                  className="text-xs text-teal-700 hover:text-teal-900 underline"
                >
                  Forgot password?
                </button>
              </div>

              {info && (
                <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 mb-4">
                  {info}
                </p>
              )}
              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mb-4">
                  {error}
                </p>
              )}

              <button
                onClick={attempt}
                disabled={busy || !email || !password}
                className="w-full bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white font-medium rounded-lg py-2.5"
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>

              <div className="mt-5 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-400 mb-2">
                  Demo accounts (password: <span className="font-mono">demo123!</span>) — tap to fill:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {DEMO.map((d) => (
                    <button
                      key={d.e}
                      onClick={() => {
                        setEmail(d.e);
                        setPassword("demo123!");
                      }}
                      className="text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-2 text-slate-600"
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {mode === "forgot" && (
            <>
              <h2 className="font-semibold mb-1">Reset your password</h2>
              <p className="text-sm text-slate-500 mb-4">
                Enter your work email and we'll send you a reset link, valid for 30 minutes.
              </p>

              <label className="block mb-4">
                <span className="text-sm text-slate-600">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && requestReset()}
                  autoComplete="username"
                  className={inputCls}
                />
              </label>

              {info && (
                <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 mb-4">
                  {info}
                </p>
              )}
              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mb-4">
                  {error}
                </p>
              )}

              <button
                onClick={requestReset}
                disabled={busy || !email}
                className="w-full bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white font-medium rounded-lg py-2.5"
              >
                {busy ? "Sending…" : "Send reset link"}
              </button>
              <button
                onClick={() => switchMode("login")}
                className="w-full mt-2 text-sm text-slate-500 hover:text-slate-700 py-2"
              >
                ← Back to sign in
              </button>
            </>
          )}

          {mode === "reset" && (
            <>
              <h2 className="font-semibold mb-1">Choose a new password</h2>
              <p className="text-sm text-slate-500 mb-4">
                Paste the reset code from your email, then set a new password (min 8 characters, at
                least 1 letter and 1 number).
              </p>

              <label className="block mb-3">
                <span className="text-sm text-slate-600">Reset code</span>
                <input
                  type="text"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  className={`${inputCls} font-mono text-xs`}
                />
              </label>
              <label className="block mb-3">
                <span className="text-sm text-slate-600">New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className={inputCls}
                />
              </label>
              <label className="block mb-4">
                <span className="text-sm text-slate-600">Confirm new password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitReset()}
                  autoComplete="new-password"
                  className={inputCls}
                />
              </label>

              {info && (
                <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 mb-4">
                  {info}
                </p>
              )}
              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mb-4">
                  {error}
                </p>
              )}

              <button
                onClick={submitReset}
                disabled={busy || !resetToken || !newPassword || !confirmPassword}
                className="w-full bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white font-medium rounded-lg py-2.5"
              >
                {busy ? "Updating…" : "Update password"}
              </button>
              <button
                onClick={() => switchMode("login")}
                className="w-full mt-2 text-sm text-slate-500 hover:text-slate-700 py-2"
              >
                ← Back to sign in
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-teal-200 text-center mt-4">
          Each role sees only its own page — enforced by JWT + server-side RBAC.
        </p>
      </div>
    </div>
  );
}
