import { NavLink } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import { ROLE_LINKS, COMMON_LINKS } from "../../lib/nav";

const linkClass = ({ isActive }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
    isActive ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"
  }`;

// Persistent desktop nav; Navbar carries the equivalent links on mobile
// (UC-09). Link set is role-driven (lib/nav.js) — every role sees its own
// feature area plus the shared My account / Security screens Member 1 owns.
export default function Sidebar() {
  const { user } = useAuth();
  const roleLinks = ROLE_LINKS[user.role] ?? [];

  return (
    <aside className="hidden md:block w-52 shrink-0">
      <nav className="bg-white rounded-xl shadow-sm p-2 sticky top-6 space-y-1">
        {roleLinks.map((l) => (
          <NavLink key={l.to} to={l.to} className={linkClass}>
            <span>{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
        {roleLinks.length > 0 && <div className="border-t border-slate-100 my-1.5" />}
        {COMMON_LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} className={linkClass}>
            <span>{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
