import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: "🏠" },
  { to: "/apply", label: "Apply for leave", icon: "📝" },
  { to: "/history", label: "History", icon: "📋" },
  { to: "/calendar", label: "Team calendar", icon: "📅" },
];

// Persistent desktop nav; Navbar carries the equivalent links on mobile (UC-09)
export default function Sidebar() {
  return (
    <aside className="hidden md:block w-52 shrink-0">
      <nav className="bg-white rounded-xl shadow-sm p-2 sticky top-6 space-y-1">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                isActive ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"
              }`
            }
          >
            <span>{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
