import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { verifyInvitation, acceptInvitation } from "../services/invitationService";
import { LOCALES } from "../lib/entitlement";

// UC-24: new-employee onboarding. Reached via the single-use registration
// link (?inviteToken=...) an HR Admin sent from the Invitations screen.
// Guided first-login tour: confirm details → set password → notification
// preferences/locale → done.
export default function RegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("inviteToken") || "";

  const [step, setStep] = useState(0); // 0 confirm, 1 password, 2 preferences, 3 done
  const [invitee, setInvitee] = useState(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [locale, setLocale] = useState("en");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This invitation link is missing its token.");
      return;
    }
    verifyInvitation(token)
      .then(setInvitee)
      .catch((err) => setError(err.response?.data?.message || "This invitation link is invalid or has expired."));
  }, [token]);

  const submit = () => {
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    acceptInvitation({ token, password, locale, notifyEmail, notifyInApp })
      .then(() => setStep(3))
      .catch((err) => setError(err.response?.data?.message || "Activation failed."))
      .finally(() => setBusy(false));
  };

  return (
    <div className="min-h-screen bg-teal-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-widest text-teal-300">Innovare Management</p>
          <h1 className="text-2xl font-semibold text-white mt-1">Welcome aboard</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          {error && !invitee && (
            <div>
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mb-4">
                {error}
              </p>
              <Link to="/login" className="text-sm text-teal-700 underline">
                Back to sign in
              </Link>
            </div>
          )}

          {invitee && step === 0 && (
            <>
              <h2 className="font-semibold mb-1">Confirm your details</h2>
              <p className="text-sm text-slate-500 mb-4">Set up by HR — check everything looks right.</p>
              <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 space-y-1">
                <p><span className="text-slate-400">Name:</span> {invitee.name}</p>
                <p><span className="text-slate-400">Email:</span> {invitee.email}</p>
                <p><span className="text-slate-400">Country:</span> {invitee.country}</p>
                <p><span className="text-slate-400">Team:</span> {invitee.team}</p>
                <p><span className="text-slate-400">Role:</span> {invitee.role}</p>
              </div>
              <button
                onClick={() => setStep(1)}
                className="w-full bg-teal-700 hover:bg-teal-800 text-white font-medium rounded-lg py-2.5"
              >
                Looks right — continue
              </button>
            </>
          )}

          {invitee && step === 1 && (
            <>
              <h2 className="font-semibold mb-1">Set your password</h2>
              <p className="text-sm text-slate-500 mb-4">At least 8 characters, with a letter and a number.</p>
              <label className="block mb-3">
                <span className="text-sm text-slate-600">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </label>
              <label className="block mb-4">
                <span className="text-sm text-slate-600">Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </label>
              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mb-4">{error}</p>
              )}
              <button
                onClick={() => {
                  if (!password || !confirmPassword) return;
                  setError("");
                  setStep(2);
                }}
                disabled={!password || !confirmPassword}
                className="w-full bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white font-medium rounded-lg py-2.5"
              >
                Continue
              </button>
            </>
          )}

          {invitee && step === 2 && (
            <>
              <h2 className="font-semibold mb-1">Notification preferences</h2>
              <p className="text-sm text-slate-500 mb-4">You can change these anytime from My account.</p>
              <label className="block mb-4">
                <span className="text-sm text-slate-600">Preferred language</span>
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {LOCALES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </label>
              <div className="space-y-2 mb-5">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
                  Email notifications
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={notifyInApp} onChange={(e) => setNotifyInApp(e.target.checked)} />
                  In-app notifications
                </label>
              </div>
              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mb-4">{error}</p>
              )}
              <button
                onClick={submit}
                disabled={busy}
                className="w-full bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white font-medium rounded-lg py-2.5"
              >
                {busy ? "Activating…" : "Activate my account"}
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-semibold mb-1">You're all set 🎉</h2>
              <p className="text-sm text-slate-500 mb-5">
                Your account is active. Sign in with your email and the password you just set.
              </p>
              <button
                onClick={() => navigate("/login", { replace: true })}
                className="w-full bg-teal-700 hover:bg-teal-800 text-white font-medium rounded-lg py-2.5"
              >
                Go to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
