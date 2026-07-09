import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { login, verifyOtp, resendOtp } from "../services/authService";
import useAuth from "../hooks/useAuth";

const DEMO = [
  { e: "weiling@innovare.com", label: "Wei Ling · Employee" },
  { e: "priya@innovare.com", label: "Priya · Employee" },
  { e: "marcus@innovare.com", label: "Marcus · Supervisor" },
  { e: "diana@innovare.com", label: "Diana · Manager" },
];

const RESEND_COOLDOWN_S = 30;

// Shows the mock's OTP in a toast so the flow is testable without a real
// mailbox. Remove once Members 3/4/5 wire up an actual email service.
function announceDevCode(code) {
  if (!code) return;
  toast(`[DEV] Email verification code: ${code}`, { icon: "✉️", duration: 8000 });
}

// UC-01 precondition: login, now gated behind an email OTP second factor.
// Redirects to /dashboard once both credentials and the code check out.
export default function LoginPage() {
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState("credentials"); // "credentials" | "otp"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [otpToken, setOtpToken] = useState(null);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const attempt = () => {
    setBusy(true);
    setError("");
    login(email, password)
      .then((data) => {
        setOtpToken(data.otpToken);
        setMaskedEmail(data.maskedEmail);
        setStep("otp");
        setCode("");
        setOtpError("");
        setCooldown(RESEND_COOLDOWN_S);
        announceDevCode(data.devCode);
      })
      .catch((err) => {
        setError(err.response?.data?.message || "Login failed.");
      })
      .finally(() => setBusy(false));
  };

  const verify = () => {
    setOtpBusy(true);
    setOtpError("");
    verifyOtp(otpToken, code)
      .then(({ accessToken, user }) => {
        loginUser(accessToken, user);
        navigate("/dashboard", { replace: true });
      })
      .catch((err) => {
        setOtpError(err.response?.data?.message || "Verification failed.");
        setOtpBusy(false);
      });
  };

  const resend = () => {
    if (cooldown > 0) return;
    setOtpError("");
    resendOtp(otpToken)
      .then((data) => {
        setCode("");
        setCooldown(RESEND_COOLDOWN_S);
        announceDevCode(data.devCode);
        toast.success(`New code sent to ${maskedEmail}`);
      })
      .catch((err) => {
        setOtpError(err.response?.data?.message || "Couldn't resend the code.");
      });
  };

  const backToCredentials = () => {
    setStep("credentials");
    setOtpToken(null);
    setCode("");
    setOtpError("");
  };

  return (
    <div className="min-h-screen bg-teal-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-widest text-teal-300">Innovare Management</p>
          <h1 className="text-2xl font-semibold text-white mt-1">Leave Management System</h1>
        </div>

        {step === "credentials" ? (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="font-semibold mb-4">Sign in</h2>

            <label className="block mb-3">
              <span className="text-sm text-slate-600">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && attempt()}
                autoComplete="username"
                className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>
            <label className="block mb-4">
              <span className="text-sm text-slate-600">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && attempt()}
                autoComplete="current-password"
                className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>

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
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="font-semibold mb-1">Check your email</h2>
            <p className="text-sm text-slate-500 mb-4">
              We sent a 6-digit code to <span className="font-medium text-slate-700">{maskedEmail}</span>.
              It expires in 5 minutes.
            </p>

            <label className="block mb-4">
              <span className="text-sm text-slate-600">Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()}
                autoFocus
                className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-lg tracking-[0.4em] text-center font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>

            {otpError && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 mb-4">
                {otpError}
              </p>
            )}

            <button
              onClick={verify}
              disabled={otpBusy || code.length !== 6}
              className="w-full bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white font-medium rounded-lg py-2.5"
            >
              {otpBusy ? "Verifying…" : "Verify & sign in"}
            </button>

            <div className="mt-4 flex items-center justify-between text-sm">
              <button onClick={backToCredentials} className="text-slate-500 hover:text-slate-700">
                ← Back
              </button>
              <button
                onClick={resend}
                disabled={cooldown > 0}
                className="text-teal-700 hover:text-teal-900 disabled:text-slate-400"
              >
                {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-teal-200 text-center mt-4">
          Each role sees only its own page — enforced by JWT + server-side RBAC.
        </p>
      </div>
    </div>
  );
}
