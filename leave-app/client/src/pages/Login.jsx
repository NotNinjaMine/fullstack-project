import { useState } from "react";
import http from "../lib/http";

const DEMO = [
  { e: "weiling@innovare.com", label: "Wei Ling · Employee" },
  { e: "priya@innovare.com", label: "Priya · Employee" },
  { e: "marcus@innovare.com", label: "Marcus · Supervisor" },
  { e: "diana@innovare.com", label: "Diana · Manager" },
];

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="min-h-screen bg-teal-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-widest text-teal-300">Innovare Management</p>
          <h1 className="text-2xl font-semibold text-white mt-1">Leave Management System</h1>
        </div>

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

        <p className="text-xs text-teal-200 text-center mt-4">
          Each role sees only its own page — enforced by JWT + server-side RBAC.
        </p>
      </div>
    </div>
  );
}
