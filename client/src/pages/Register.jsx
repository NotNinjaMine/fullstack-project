import { useState, useEffect } from "react";
import http from "../lib/http";
import BrandLogo from "../components/BrandLogo";
import { LOCALES } from "../lib/i18n";

// M1 (UC-24): the page an invitation link opens.
//
// Deliberately a SEPARATE page from Login, not another mode inside it. Someone
// arriving from an invitation has no account yet — showing them the sign-in card
// with the fields swapped out is confusing, because there is nothing for them to
// sign in with. This is a proper "create your account" screen: it confirms the
// details HR set for them, collects what only they can provide, and hands them
// to the sign-in page once the account exists.
const inputCls = "lf-input";

export default function Register({ token, onDone }) {
  const [checking, setChecking] = useState(true);
  const [invitee, setInvitee] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Details the new employee provides themselves
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [locale, setLocale] = useState("en");
  const [notifyEmail, setNotifyEmail] = useState(true);

  // Optional: authenticator-app (TOTP) enrolment, right here during onboarding
  // instead of making the new hire find it under My account later. Uses the
  // SAME invite token for authorization — there's no account to log into yet.
  const [totpSetup, setTotpSetup] = useState(null); // { qrDataUrl, manualKey } | null
  const [totpCode, setTotpCode] = useState("");
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpError, setTotpError] = useState("");

  // Validate the link before showing the form — an expired or already-used
  // invitation should say so plainly rather than let them fill everything in
  // and fail at the end.
  useEffect(() => {
    http
      .get(`/invitation/verify?token=${encodeURIComponent(token)}`)
      .then((res) => {
        setInvitee(res.data);
        setName(res.data.name || "");
      })
      .catch((err) =>
        setError(
          err.response?.data?.message ||
            "This invitation link is invalid or has expired. Ask HR to send a new one."
        )
      )
      .finally(() => setChecking(false));
  }, [token]);

  const submit = () => {
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    http
      .post("/invitation/accept", {
        token,
        password,
        name: name.trim(),
        phone: phone.trim() || null,
        locale,
        notifyEmail,
        notifyInApp: true,
      })
      .then((res) => onDone(res.data.message || "Account created. You can now sign in.", res.data.twoFactor))
      .catch((err) =>
        setError(
          err.response?.data?.message ||
            (err.response?.data?.errors || []).join("; ") ||
            "Could not create your account."
        )
      )
      .finally(() => setBusy(false));
  };

  const canSubmit = !busy && password.length >= 8 && confirm.length >= 8 && name.trim().length >= 3;

  const startTotpSetup = () => {
    setTotpBusy(true);
    setTotpError("");
    http
      .post("/invitation/totp/setup", { token })
      .then((res) => {
        setTotpSetup(res.data);
        setTotpCode("");
      })
      .catch((err) => setTotpError(err.response?.data?.message || "Could not start setup."))
      .finally(() => setTotpBusy(false));
  };

  const enableTotp = () => {
    setTotpBusy(true);
    setTotpError("");
    http
      .post("/invitation/totp/enable", { token, code: totpCode })
      .then(() => {
        setTotpEnabled(true);
        setTotpSetup(null);
        setTotpCode("");
      })
      .catch((err) => setTotpError(err.response?.data?.message || "Could not enable authenticator."))
      .finally(() => setTotpBusy(false));
  };

  return (
    <div className="min-h-screen lf-page flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="text-center mb-6">
          <BrandLogo height={72} className="mb-4" />
          <p className="text-xs uppercase tracking-widest text-brand-700">Innovare Management</p>
          <h1 className="text-2xl font-semibold text-lf-text mt-1">Create your account</h1>
          <p className="text-sm text-lf-text-muted mt-1">
            You've been invited to the Leave Management System. Set up your sign-in details to get started.
          </p>
        </div>

        <div className="bg-lf-surface rounded-2xl border border-lf-border shadow-lf-md p-6">
          {checking && <p className="text-sm text-lf-text-subtle">Checking your invitation…</p>}

          {!checking && !invitee && (
            <>
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 mb-4">
                <p className="text-sm font-medium text-rose-800">This link can't be used</p>
                <p className="text-xs text-rose-700 mt-1">{error}</p>
              </div>
              <button type="button" onClick={() => onDone(null)} className="lf-btn lf-btn-outline w-full">
                Go to sign in
              </button>
            </>
          )}

          {!checking && invitee && (
            <>
              {/* What HR has already set — shown so they can confirm it's really them */}
              <div className="rounded-xl border border-lf-border bg-lf-muted/40 p-3 mb-5">
                <p className="text-xs uppercase tracking-wide text-lf-text-subtle mb-1">Your details from HR</p>
                <p className="text-sm text-lf-text">
                  <span className="font-medium">{invitee.email}</span>
                </p>
                <p className="text-xs text-lf-text-subtle mt-0.5">
                  {invitee.role} · {invitee.country} · {invitee.team}
                </p>
                <p className="text-xs text-lf-text-subtle mt-1.5">
                  Your role, country and team are set by HR and can't be changed here.
                </p>
              </div>

              <label className="block mb-3">
                <span className="text-sm text-lf-text-muted">Full name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </label>

              <label className="block mb-3">
                <span className="text-sm text-lf-text-muted">Create a password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className={inputCls}
                />
                <span className="text-xs text-lf-text-subtle">
                  At least 8 characters, with a letter and a number.
                </span>
              </label>

              <label className="block mb-3">
                <span className="text-sm text-lf-text-muted">Confirm password</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
                  autoComplete="new-password"
                  className={inputCls}
                />
              </label>

              <label className="block mb-3">
                <span className="text-sm text-lf-text-muted">Mobile number (optional)</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+65 8765 1234"
                  autoComplete="tel"
                  className={inputCls}
                />
                <span className="text-xs text-lf-text-subtle">
                  Include the country code. Adding it lets you choose <strong>text message</strong> for your
                  sign-in verification code — otherwise codes are emailed. You can add it later under My account.
                </span>
              </label>

              <label className="block mb-3">
                <span className="text-sm text-lf-text-muted">Preferred language</span>
                <select value={locale} onChange={(e) => setLocale(e.target.value)} className={inputCls}>
                  {LOCALES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </label>

              {/* Optional authenticator-app enrolment — same idea as My account →
                  Authenticator, just offered up front so it can be set up in one
                  visit instead of a separate trip after first signing in. */}
              <div className="rounded-xl border border-lf-border bg-lf-muted/40 p-3 mb-4">
                <p className="text-sm font-medium text-lf-text">Authenticator app (optional)</p>
                <p className="text-xs text-lf-text-subtle mt-1 mb-2">
                  Works with Microsoft Authenticator, Google Authenticator, Authy, or any similar app.
                  Once set up, you can choose it at sign-in and enter the current 6-digit code it shows
                  instead of one emailed or texted to you. You can skip this and set it up later, or use
                  email/text instead.
                </p>

                {totpEnabled ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800">
                    Authenticator app enabled. You'll be able to choose it at sign-in.
                  </div>
                ) : totpSetup ? (
                  <div className="space-y-2">
                    <p className="text-xs text-lf-text-muted">1. Scan this QR code in your authenticator app:</p>
                    <div className="flex justify-center">
                      <img
                        src={totpSetup.qrDataUrl}
                        alt="Authenticator setup QR code"
                        width={180}
                        height={180}
                        className="rounded-lg border border-lf-border"
                      />
                    </div>
                    <p className="text-xs text-lf-text-subtle text-center">
                      Can't scan? Enter this key by hand: <span className="font-mono break-all">{totpSetup.manualKey}</span>
                    </p>
                    <p className="text-xs text-lf-text-muted">2. Enter the 6-digit code the app shows:</p>
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className={`${inputCls} text-center text-lg tracking-[0.3em] font-mono`}
                    />
                    {totpError && <p className="text-xs text-rose-600">{totpError}</p>}
                    <div className="flex justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => { setTotpSetup(null); setTotpCode(""); setTotpError(""); }}
                        className="lf-btn lf-btn-sm lf-btn-outline"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={totpBusy || totpCode.length !== 6}
                        onClick={enableTotp}
                        className="lf-btn lf-btn-sm lf-btn-primary"
                      >
                        {totpBusy ? "Checking…" : "Verify & enable"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {totpError && <p className="text-xs text-rose-600 mb-2">{totpError}</p>}
                    <button type="button" disabled={totpBusy} onClick={startTotpSetup} className="lf-btn lf-btn-sm lf-btn-outline">
                      Set up authenticator app
                    </button>
                  </>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-lf-text-muted mb-4">
                <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
                Email me about leave approvals and reminders
              </label>

              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mb-4">
                  {error}
                </p>
              )}

              <button type="button" onClick={submit} disabled={!canSubmit} className="lf-btn lf-btn-primary w-full py-2.5">
                {busy ? "Creating your account…" : "Create account"}
              </button>

              <p className="text-xs text-lf-text-subtle text-center mt-3">
                After this you'll sign in with your email and the password you just chose. Every sign-in also asks
                for a 6-digit verification code — by email or text, or your authenticator app if you set one up
                above.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
