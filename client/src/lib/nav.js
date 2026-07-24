// Single source of truth for the role-based navigation shell (UC-09),
// shared by Navbar (mobile) and Sidebar (desktop) so the two never drift.

// Feature-area links, specific to each role's own vertical.
export const ROLE_LINKS = {
  EMPLOYEE: [
    { to: "/dashboard", label: "Dashboard", icon: "🏠" },
    { to: "/apply", label: "Apply for leave", icon: "📝" },
    { to: "/history", label: "History", icon: "📋" },
    { to: "/calendar", label: "Team calendar", icon: "📅" },
  ],
  SUPERVISOR: [{ to: "/approvals", label: "Approvals", icon: "✅" }],
  MANAGER: [{ to: "/approvals", label: "Approvals", icon: "✅" }],
  HR_ADMIN: [
    { to: "/admin", label: "HR dashboard", icon: "📊" },
    { to: "/invitations", label: "Invitations", icon: "✉️" },
    { to: "/announcements", label: "Announcements", icon: "📣" },
    { to: "/entitlements", label: "Entitlements", icon: "🗓️" },
  ],
};

// Available to every role — Member 1's own screens.
export const COMMON_LINKS = [
  { to: "/profile", label: "My account", icon: "👤" },
  { to: "/security", label: "Sessions & security", icon: "🔐" },
];

export const ROLE_HOME = {
  EMPLOYEE: "/dashboard",
  SUPERVISOR: "/approvals",
  MANAGER: "/approvals",
  HR_ADMIN: "/admin",
};

export const ROLE_LABEL = {
  EMPLOYEE: "Employee",
  SUPERVISOR: "Supervisor",
  MANAGER: "Manager",
  HR_ADMIN: "HR Admin",
};

export const linksFor = (role) => [...(ROLE_LINKS[role] ?? []), ...COMMON_LINKS];
