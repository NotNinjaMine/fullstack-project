import { useState, useEffect } from "react";
import http from "./lib/http";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Employee from "./pages/Employee";
import Approver from "./pages/Approver";
import Admin from "./pages/Admin";
import AnnouncementBanner from "./components/AnnouncementBanner";
import ProfilePanel from "./components/ProfilePanel";
import BrandLogo from "./components/BrandLogo";
import NotificationBell from "./components/NotificationBell";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  // M1 (UC-24): an invitation link (?inviteToken=...) opens the standalone
  // account-creation page rather than the sign-in card, because the person
  // arriving has no account to sign in with yet. Read once on mount and the
  // token is removed from the address bar so it isn't left in history.
  const [inviteToken, setInviteToken] = useState(() => {
    const raw = new URLSearchParams(window.location.search).get("inviteToken");
    return raw ? raw.replace(/\s+/g, "") : null;
  });
  const [signInNotice, setSignInNotice] = useState("");
  // M1: Supervisors/Managers/HR Admins can also apply for leave for
  // themselves, using the same page an Employee sees. "role" shows their
  // normal role page (Approver/Admin); "employee" shows the Employee page
  // instead, without changing who they actually are or what the server
  // enforces per-request. An EMPLOYEE has nothing to switch to, so this is
  // simply unused for that role.
  const [viewMode, setViewMode] = useState("role");

  // Restore session from stored JWT (lab5 /user/auth pattern).
  //
  // An invitation link is for creating a BRAND-NEW account, so it must never
  // drop the visitor into someone else's dashboard. If a demo session is still
  // stored from earlier, clear it and stay signed out: this makes the invite
  // link open the Register page straight away, and it means finishing
  // registration lands on the sign-in screen (ready for the new credentials)
  // rather than the old account's dashboard. Demo accounts stay reachable from
  // the sign-in page's demo buttons as usual.
  useEffect(() => {
    if (inviteToken) {
      localStorage.clear();
      setUser(null);
      setLoading(false);
      // Take the single-use token out of the address bar (and therefore out of
      // browser history) as soon as it has been read into state.
      window.history.replaceState({}, "", "/");
      return;
    }
    if (localStorage.getItem("accessToken")) {
      http
        .get("/user/auth")
        .then((res) => setUser(res.data.user))
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [inviteToken]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const logout = () => {
    localStorage.clear();
    setUser(null);
    setViewMode("role");
  };

  if (loading) {
    return (
      <div className="min-h-screen lf-page flex items-center justify-center text-lf-text-subtle">
        Loading…
      </div>
    );
  }

  // Account creation from an invitation — its own page, before any sign-in.
  if (!user && inviteToken) {
    return (
      <Register
        token={inviteToken}
        onDone={(message) => {
          setInviteToken(null);
          window.history.replaceState({}, "", "/");
          if (message) setSignInNotice(message);
        }}
      />
    );
  }

  if (!user) {
    return <Login onLogin={setUser} notice={signInNotice} />;
  }

  const roleHomeLabel = (role) =>
    role === "SUPERVISOR" ? "Supervisor Approvals"
    : role === "MANAGER" ? "Manager Approvals"
    // The Boss uses the SAME page as a Manager (see below) — only the heading
    // and the queue it loads differ, because a Boss decides Managers' leave.
    : role === "BOSS" ? "Boss Approvals"
    : role === "HR_ADMIN" ? "HR Administration"
    : "Employee Dashboard";

  return (
    <div className="min-h-screen lf-page">
      {/* Innovare header: corporate purple bar closed by the gold accent rule */}
      <header className="bg-brand-800 text-white shadow-lf-md border-b-[3px] border-gold-500">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            {/* The logo is purple artwork, so it sits on a white plate to stay
                legible on the corporate purple bar and keep its clear space. */}
            <BrandLogo plate height={46} />
            <div>
              <p className="text-xs uppercase tracking-widest text-gold-400">
                Leave Management System
              </p>
              <h1 className="text-xl font-semibold">
                {viewMode === "employee" ? "Employee Dashboard" : roleHomeLabel(user.role)}
              </h1>
            </div>
          </div>

          {/* M1: only roles with somewhere ELSE to go get this — an Employee's
              own page already IS the "apply for leave" page. */}
          {user.role !== "EMPLOYEE" && (
            <button
              type="button"
              onClick={() => setViewMode((v) => (v === "employee" ? "role" : "employee"))}
              className="lf-btn lf-btn-sm text-sm bg-brand-600 text-white hover:bg-brand-500 border-transparent focus-visible:ring-offset-brand-800"
            >
              {viewMode === "employee" ? `← Back to ${roleHomeLabel(user.role)}` : "Apply for leave"}
            </button>
          )}

          <div className="flex items-center gap-3">
            <NotificationBell setToast={setToast} />
            <div className="text-right">
              <p className="font-medium leading-tight">{user.name}</p>
              <p className="text-xs text-brand-200">
                {user.role.charAt(0) + user.role.slice(1).toLowerCase()} · {user.team}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center font-semibold shadow-sm ring-2 ring-brand-700/40">
              {user.initials}
            </div>
            <button
              type="button"
              onClick={() => setShowProfile(true)}
              className="lf-btn lf-btn-sm text-sm bg-brand-700 text-white hover:bg-brand-600 border-transparent focus-visible:ring-offset-brand-800"
            >
              My account
            </button>
            <button
              type="button"
              onClick={logout}
              className="lf-btn lf-btn-sm text-sm bg-brand-700 text-white hover:bg-brand-600 border-transparent focus-visible:ring-offset-brand-800"
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

      {/* Role decides the DEFAULT page this account sees. The server enforces
          the same rule again on every API call (requireRole) — switching to
          "Apply for leave" only changes which page is SHOWN, not what the
          account is actually allowed to do; the Employee endpoints already
          accept Supervisors/Managers/HR Admins acting on their own records. */}
      {viewMode === "employee" ? (
        <Employee user={user} setToast={setToast} />
      ) : user.role === "EMPLOYEE" ? (
        <Employee user={user} setToast={setToast} />
      ) : user.role === "HR_ADMIN" ? (
        <Admin user={user} setToast={setToast} />
      ) : (
        <Approver user={user} setToast={setToast} />
      )}
    </div>
  );
}
