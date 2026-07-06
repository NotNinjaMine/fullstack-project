import { useState, useEffect } from "react";
import http from "./lib/http";
import Login from "./pages/Login";
import Employee from "./pages/Employee";
import Approver from "./pages/Approver";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Restore session from stored JWT (lab5 /user/auth pattern)
  useEffect(() => {
    if (localStorage.getItem("accessToken")) {
      http
        .get("/user/auth")
        .then((res) => setUser(res.data.user))
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-teal-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-teal-300">
              Innovare Management · Leave Management System
            </p>
            <h1 className="text-xl font-semibold">
              {user.role === "EMPLOYEE"
                ? "Employee Dashboard"
                : user.role === "SUPERVISOR"
                ? "Supervisor Approvals"
                : "Manager Approvals"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-medium leading-tight">{user.name}</p>
              <p className="text-xs text-teal-200">
                {user.role.charAt(0) + user.role.slice(1).toLowerCase()} · {user.team}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center font-semibold">
              {user.initials}
            </div>
            <button
              onClick={logout}
              className="text-sm bg-teal-800 hover:bg-teal-700 rounded-lg px-3 py-2"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-11/12 bg-slate-900 text-white text-sm rounded-lg shadow-lg px-4 py-3">
          {toast}
        </div>
      )}

      {/* Role decides the ONLY page this account can see. The server
          enforces the same rule again on every API call (requireRole). */}
      {user.role === "EMPLOYEE" ? (
        <Employee user={user} setToast={setToast} />
      ) : (
        <Approver user={user} setToast={setToast} />
      )}
    </div>
  );
}
