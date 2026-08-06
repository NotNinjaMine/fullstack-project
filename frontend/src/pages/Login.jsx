import { useState, useEffect } from "react";
import http from "../lib/http";
import { Mail, MessageSquare, KeyRound } from "lucide-react";

// Icon shown next to each 2FA delivery choice.
const methodIcon = (method) => {
  if (method === "SMS") return MessageSquare;
  if (method === "AUTHENTICATOR") return KeyRound;
  return Mail;
};

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

export default function Login({ onLogin, notice = "" }) {
  // mode: "login" | "forgot" | "reset"
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState(notice || "");
  const [busy, setBusy] = useState(false);

  // reset form state
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // M1 (2FA): state for the second sign-in step. `challenge` holds the opaque
  // challenge returned by /user/login (token + available delivery methods);
  // `code` is the 6-digit code the user types; `resendIn` is the cooldown
  // (seconds) before another code can be sent. EVERY sign-in — demo accounts
  // included — goes through this step, so if these aren't declared the very
  // first setChallenge() call throws and login stops working for everyone.
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);

  // Tick the resend cooldown down to zero, one second at a time.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Arriving from a password-reset email: /?resetToken=... opens the reset form.
  // Invitation links (?inviteToken=...) are handled by App.jsx, which shows the
  // standalone Register page instead — a new joiner has no account to sign in with.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("resetToken");
    const t = raw ? raw.replace(/\s+/g, "") : null;
    if (t) {
      setResetToken(t);
      setMode("reset");
      window.history.replaceState({}, "", "/");
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
        // M1 (2FA): password accepted, but no access token yet. We hold an opaque
        // challenge token and first ask HOW they want to receive the code.
        if (res.data.twoFactorRequired) {
          setChallenge({
            token: res.data.challengeToken,
            methods: res.data.methods || [],
            method: null,
            destination: null,
            demoCode: null,
          });
          setCode("");
          setMode("twofa-choose");
          setInfo("");
          setBusy(false);
          return;
        }
        localStorage.setItem("accessToken", res.data.accessToken);
        onLogin(res.data.user);
      })
      .catch((err) => {
        setError(err.response?.data?.message || "Login failed.");
        setBusy(false);
      });
  };

  // M1 (2FA): the user picked email or text — send the code, then show code entry.
  const chooseMethod = (method) => {
    setBusy(true);
    setError("");
    http
      .post("/user/2fa/send", { challengeToken: challenge.token, method })
      .then((res) => {
        setChallenge((c) => ({
          ...c,
          method: res.data.method,
          destination: res.data.destination,
          delivered: res.data.delivered,
          deliveryError: res.data.deliveryError,
          demoCode: res.data.demoCode || null,
        }));
        setCode("");
        setResendIn(30);
        setMode("twofa");
        setInfo(res.data.message || "");
      })
      .catch((err) => setError(err.response?.data?.message || "Could not send the code."))
      .finally(() => setBusy(false));
  };

  // M1 (2FA): submit the emailed/texted code to finish signing in.
  const verifyCode = () => {
    setBusy(true);
    setError("");
    http
      .post("/user/2fa/verify", { challengeToken: challenge.token, code: code.trim() })
      .then((res) => {
        localStorage.setItem("accessToken", res.data.accessToken);
        onLogin(res.data.user);
      })
      .catch((err) => {
        setError(err.response?.data?.message || (err.response?.data?.errors || []).join("; ") || "Verification failed.");
        setBusy(false);
      });
  };

  const resendCode = () => {
    setBusy(true);
    setError("");
    http
      .post("/user/2fa/send", { challengeToken: challenge.token, method: challenge.method })
      .then((res) => {
        setInfo(res.data.message || "A new code was sent.");
        setChallenge((c) => ({ ...c, demoCode: res.data.demoCode || null, delivered: res.data.delivered }));
        setCode("");
        setResendIn(30);
      })
      .catch((err) => setError(err.response?.data?.message || "Could not resend."))
      .finally(() => setBusy(false));
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

          {/* ---------------- 2FA: CHOOSE DELIVERY METHOD ---------------- */}
          {mode === "twofa-choose" && challenge && (
            <>
              <h2 className="font-semibold mb-1">Verify it's you</h2>
              <p className="text-sm text-slate-500 mb-4">
                Your password was accepted. For extra security, choose how you'd like
                to receive your 6-digit verification code.
              </p>

              <div className="space-y-2 mb-4">
                {challenge.methods.map((m) => {
                  const Icon = methodIcon(m.method);
                  const title =
                    m.method === "EMAIL"
                      ? "Email me a code"
                      : m.method === "SMS"
                      ? "Text me a code"
                      : "Use my authenticator app";
                  return (
                    <button
                      key={m.method}
                      onClick={() => m.available && chooseMethod(m.method)}
                      disabled={busy || !m.available}
                      className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                        m.available
                          ? "border-slate-200 hover:border-teal-500 hover:bg-teal-50 cursor-pointer"
                          : "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                            m.available ? "bg-teal-100 text-teal-700" : "bg-slate-200 text-slate-400"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-800">{title}</span>
                          <span className="block text-xs text-slate-500 truncate">
                            {m.available ? m.destination : m.reason}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mb-4">
                  {error}
                </p>
              )}
              {busy && <p className="text-sm text-slate-500 mb-2">Sending your code…</p>}

              <button
                onClick={() => {
                  setChallenge(null);
                  setPassword("");
                  switchMode("login");
                }}
                className="w-full text-sm text-slate-500 hover:text-slate-700 py-2"
              >
                ← Back to sign in
              </button>
            </>
          )}

          {/* ---------------- 2FA: ENTER THE CODE ---------------- */}
          {mode === "twofa" && challenge && (
            <>
              <h2 className="font-semibold mb-1">Verify it's you</h2>
              <p className="text-sm text-slate-500 mb-4">
                {challenge.method === "AUTHENTICATOR"
                  ? "Open your authenticator app (e.g. Microsoft Authenticator) and enter the current 6-digit code for Innovare LMS."
                  : challenge.method === "SMS"
                  ? `We sent a 6-digit code by text to ${challenge.destination}. It expires in 10 minutes.`
                  : `We sent a 6-digit code to ${challenge.destination}. It expires in 10 minutes.`}
              </p>

              {/* Demo affordance: with no email/SMS transport configured, or for a
                  demo authenticator account with no real device enrolled, the code
                  is shown here to keep the flow usable. */}
              {challenge.demoCode && (
                <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-4">
                  <p className="text-amber-900 font-medium">
                    Demo mode — your code is{" "}
                    <span className="font-mono text-base tracking-widest">{challenge.demoCode}</span>
                  </p>
                  <p className="text-xs text-amber-800 mt-1">
                    {challenge.method === "SMS"
                      ? "No SMS provider is configured, so the code is shown here instead of being texted."
                      : challenge.method === "AUTHENTICATOR"
                      ? "This is a demo account with no real authenticator app enrolled, so the code is shown here instead."
                      : "No email server is configured, so the code is shown here instead of being emailed."}
                  </p>
                </div>
              )}
              {!challenge.demoCode && challenge.deliveryError && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mb-4">
                  We couldn't deliver the code: {challenge.deliveryError}
                </p>
              )}

              <label className="block mb-4">
                <span className="text-sm text-slate-600">6-digit code</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verifyCode()}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="000000"
                  className={`${inputCls} text-center text-2xl tracking-[0.4em] font-mono`}
                />
              </label>

              {info && (
                <p className="text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg p-2.5 mb-4">
                  {info}
                </p>
              )}
              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mb-4">
                  {error}
                </p>
              )}

              <button
                onClick={verifyCode}
                disabled={busy || code.length !== 6}
                className="lf-btn lf-btn-primary w-full py-2.5"
              >
                {busy ? "Verifying…" : "Verify and sign in"}
              </button>

              <div className="flex items-center justify-between mt-2">
                {challenge.method === "AUTHENTICATOR" ? (
                  <span className="text-xs text-slate-400 py-2">
                    The code refreshes in your app every 30 seconds.
                  </span>
                ) : (
                  <button
                    onClick={resendCode}
                    disabled={busy || resendIn > 0}
                    className="text-sm text-slate-500 hover:text-slate-700 py-2 disabled:opacity-50"
                  >
                    {resendIn > 0 ? `Resend code (${resendIn}s)` : "Resend code"}
                  </button>
                )}
                <button
                  onClick={() => {
                    setCode("");
                    setError("");
                    setInfo("");
                    setMode("twofa-choose");
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700 py-2"
                >
                  ← Use a different method
                </button>
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
        </div>

        <p className="text-xs text-teal-200 text-center mt-4">
          Each role sees only its own page — enforced by JWT + server-side RBAC.
        </p>
      </div>
    </div>
  );
}
