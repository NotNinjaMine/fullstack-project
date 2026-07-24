import { useState, useEffect } from "react";
import http from "../lib/http";

const DEMO = [
  { e: "weiling@innovare.com", label: "Wei Ling · Employee (SG)" },
  { e: "linh@innovare.com", label: "Linh · Employee (VN)" },
  { e: "somchai@innovare.com", label: "Somchai · Employee (TH)" },
  { e: "priya@innovare.com", label: "Priya · Employee (SG)" },
  { e: "marcus@innovare.com", label: "Marcus · Supervisor (Team A)" },
  { e: "diana@innovare.com", label: "Diana · Manager (Team A)" },
  { e: "aiden@innovare.com", label: "Aiden · Supervisor (Team B)" },
  { e: "grace@innovare.com", label: "Grace · Manager (Team B)" },
  { e: "hr@innovare.com", label: "Aisha · HR Admin" },
];

const inputCls = "lf-input";

export default function Login({ onLogin }) {
  // mode: "login" | "forgot" | "reset"
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  // reset form state
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // M1 (UC-24) invite/onboarding state
  const [inviteToken, setInviteToken] = useState("");
  const [invitee, setInvitee] = useState(null); // { email, name, country, team, role }
  const [inviteLocale, setInviteLocale] = useState("en");

  // Arriving from an email link: /?resetToken=... opens the reset form directly.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("resetToken");
    const inv = params.get("inviteToken");
    if (t) {
      setResetToken(t);
      setMode("reset");
      window.history.replaceState({}, "", "/");
    } else if (inv) {
      setInviteToken(inv);
      window.history.replaceState({}, "", "/");
      http
        .get(`/invitation/verify?token=${encodeURIComponent(inv)}`)
        .then((res) => {
          setInvitee(res.data);
          setMode("invite");
        })
        .catch((err) => {
          setError(err.response?.data?.message || "This invitation link is invalid or has expired.");
        });
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
    http
      .post("/user/login", { email, password })
      .then((res) => {
        localStorage.setItem("accessToken", res.data.accessToken);
        onLogin(res.data.user);
      })
      .catch((err) => {
        setError(err.response?.data?.message || "Login failed.");
        setBusy(false);
      });
  };

  const requestReset = () => {
    setBusy(true);
    setError("");
    setInfo("");
    http
      .post("/user/forgot-password", { email })
      .then((res) => {
        setInfo(res.data.message);
        // Demo mode (no SMTP on the server): the API returns the token so the
        // flow can be completed offline. With SMTP configured, the token only
        // arrives by email and this branch never runs.
        if (res.data.demoResetToken) {
          setResetToken(res.data.demoResetToken);
          setMode("reset");
          setInfo(
            "Demo mode: no email server configured, so your reset code was filled in below. " +
              "In production this code arrives by email only."
          );
        }
      })
      .catch((err) =>
        setError(err.response?.data?.message || (err.response?.data?.errors || []).join("; ") || "Request failed.")
      )
      .finally(() => setBusy(false));
  };

  const submitReset = () => {
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    http
      .post("/user/reset-password", { token: resetToken.trim(), password: newPassword })
      .then((res) => {
        setPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setResetToken("");
        switchMode("login");
        setInfo(res.data.message);
      })
      .catch((err) =>
        setError(err.response?.data?.message || (err.response?.data?.errors || []).join("; ") || "Reset failed.")
      )
      .finally(() => setBusy(false));
  };

  // M1 (UC-24): new employee sets a password + preferences to activate the account.
  const submitInvite = () => {
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    http
      .post("/invitation/accept", {
        token: inviteToken.trim(),
        password: newPassword,
        locale: inviteLocale,
      })
      .then((res) => {
        setNewPassword("");
        setConfirmPassword("");
        setInviteToken("");
        setInvitee(null);
        switchMode("login");
        setInfo(res.data.message + " You can now sign in with your email and new password.");
      })
      .catch((err) =>
        setError(err.response?.data?.message || (err.response?.data?.errors || []).join("; ") || "Activation failed.")
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className="min-h-screen bg-teal-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-widest text-teal-300">Innovare Management</p>
          <h1 className="text-2xl font-semibold text-white mt-1">Leave Management System</h1>
        </div>

        <div className="bg-lf-surface rounded-2xl shadow-lf-lg border border-lf-border/60 p-6">
          {/* ---------------- SIGN IN ---------------- */}
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
                className="lf-btn lf-btn-primary w-full py-2.5"
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

          {/* ---------------- FORGOT PASSWORD ---------------- */}
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
                className="lf-btn lf-btn-primary w-full py-2.5"
              >
                {busy ? "Sending…" : "Send reset link"}
              </button>
              <button
                onClick={() => switchMode("login")}
                className="w-full mt-2 text-sm text-slate-500 hover:text-slate-700 py-2"
              >
                ← Back to sign in
              </button>
              <p className="text-xs text-slate-400 mt-3">
                Already have a reset code?{" "}
                <button onClick={() => switchMode("reset")} className="text-teal-700 underline">
                  Enter it here
                </button>
              </p>
            </>
          )}

          {/* ---------------- SET NEW PASSWORD ---------------- */}
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
                className="lf-btn lf-btn-primary w-full py-2.5"
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

          {/* ---------------- ACCEPT INVITATION (UC-24) ---------------- */}
          {mode === "invite" && (
            <>
              <h2 className="font-semibold mb-1">Welcome to Innovare{invitee?.name ? `, ${invitee.name.split(" ")[0]}` : ""}</h2>
              <p className="text-sm text-slate-500 mb-4">
                Set a password to activate your account, then sign in.
              </p>

              {invitee && (
                <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
                  <p><span className="text-slate-400">Email:</span> {invitee.email}</p>
                  <p><span className="text-slate-400">Role:</span> {invitee.role} · {invitee.country} · {invitee.team}</p>
                </div>
              )}

              <label className="block mb-3">
                <span className="text-sm text-slate-600">New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className={inputCls}
                />
                <span className="text-xs text-slate-400">Min 8 characters, at least 1 letter and 1 number.</span>
              </label>
              <label className="block mb-3">
                <span className="text-sm text-slate-600">Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitInvite()}
                  autoComplete="new-password"
                  className={inputCls}
                />
              </label>
              <label className="block mb-4">
                <span className="text-sm text-slate-600">Preferred language</span>
                <select
                  value={inviteLocale}
                  onChange={(e) => setInviteLocale(e.target.value)}
                  className={inputCls}
                >
                  <option value="en">English</option>
                  <option value="zh">中文</option>
                  <option value="th">ไทย</option>
                  <option value="vi">Tiếng Việt</option>
                  <option value="ms">Bahasa Melayu</option>
                  <option value="id">Bahasa Indonesia</option>
                  <option value="ja">日本語</option>
                </select>
              </label>

              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mb-4">
                  {error}
                </p>
              )}

              <button
                onClick={submitInvite}
                disabled={busy || !newPassword || !confirmPassword}
                className="lf-btn lf-btn-primary w-full py-2.5"
              >
                {busy ? "Activating…" : "Activate my account"}
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
