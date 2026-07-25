import { useState, useEffect } from "react";
import http from "./lib/http";
import Login from "./pages/Login";
import Employee from "./pages/Employee";
import Approver from "./pages/Approver";
import Admin from "./pages/Admin";
import AnnouncementBanner from "./components/AnnouncementBanner";
import ProfilePanel from "./components/ProfilePanel";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showProfile, setShowProfile] = useState(false);

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
      <div className="min-h-screen lf-page flex items-center justify-center text-lf-text-subtle">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen lf-page">
      <header className="bg-teal-900 text-white shadow-lf-md">
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
                : user.role === "MANAGER"
                ? "Manager Approvals"
                : "HR Administration"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-medium leading-tight">{user.name}</p>
              <p className="text-xs text-teal-200">
                {user.role.charAt(0) + user.role.slice(1).toLowerCase()} · {user.team}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center font-semibold shadow-sm ring-2 ring-teal-700/40">
              {user.initials}
            </div>
            <button
              type="button"
              onClick={() => setShowProfile(true)}
              className="lf-btn lf-btn-sm text-sm bg-teal-800 text-white hover:bg-teal-700 border-transparent focus-visible:ring-offset-teal-900"
            >
              My account
            </button>
            <button
              type="button"
              onClick={logout}
              className="lf-btn lf-btn-sm text-sm bg-teal-800 text-white hover:bg-teal-700 border-transparent focus-visible:ring-offset-teal-900"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-11/12 bg-slate-900 text-white text-sm rounded-xl shadow-lf-lg px-4 py-3">
          {toast}
        </div>
      )}

      <AnnouncementBanner />

      {showProfile && (
        <ProfilePanel
          user={user}
          onClose={() => setShowProfile(false)}
          onUpdated={(u) => setUser((prev) => ({ ...prev, ...u }))}
        />
      )}

      {/* Role decides the ONLY page this account can see. The server
          enforces the same rule again on every API call (requireRole). */}
      {user.role === "EMPLOYEE" ? (
        <Employee user={user} setToast={setToast} />
      ) : user.role === "HR_ADMIN" ? (
        <Admin user={user} setToast={setToast} />
      ) : (
        <Approver user={user} setToast={setToast} />
      )}
    </div>
  );
}
