import { useState } from "react";
import { NavLink } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import LocaleSwitcher from "./LocaleSwitcher";
import { linksFor, ROLE_LABEL } from "../../lib/nav";

const ROLE_TITLE = {
  EMPLOYEE: "Employee Dashboard",
  SUPERVISOR: "Supervisor Approvals",
  MANAGER: "Manager Approvals",
  HR_ADMIN: "HR Administration",
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = linksFor(user.role);

  return (
    <header className="bg-teal-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-teal-800 text-teal-100"
            aria-label="Toggle navigation"
          >
            ☰
          </button>
          <div>
            <p className="text-xs uppercase tracking-widest text-teal-300">
              Innovare Management · Leave Management System
            </p>
            <h1 className="text-xl font-semibold">{ROLE_TITLE[user.role] ?? "Dashboard"}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LocaleSwitcher compact />
          {/* Notification badge placeholder — wired to the Notifications vertical (UC-12) */}
          <button
            className="w-9 h-9 rounded-full bg-teal-800 hover:bg-teal-700 flex items-center justify-center"
            aria-label="Notifications"
            title="Notifications"
          >
            🔔
          </button>
          <div className="text-right hidden sm:block">
            <p className="font-medium leading-tight">{user.name}</p>
            <p className="text-xs text-teal-200">
              {ROLE_LABEL[user.role] ?? user.role} · {user.team}
            </p>
          </div>
          <NavLink
            to="/profile"
            className="w-10 h-10 rounded-full bg-teal-600 hover:bg-teal-500 flex items-center justify-center font-semibold"
            title="My account"
          >
            {user.initials}
          </NavLink>
          <button onClick={logout} className="text-sm bg-teal-800 hover:bg-teal-700 rounded-lg px-3 py-2">
            Log out
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="md:hidden bg-teal-800 px-4 py-2 flex flex-col gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm ${isActive ? "bg-teal-700 text-white" : "text-teal-200"}`
              }
            >
              {l.icon} {l.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
