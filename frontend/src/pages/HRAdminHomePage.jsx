import { Link } from "react-router-dom";
import OwnedByNotice from "../components/common/OwnedByNotice";

// The HR analytics/employee-directory dashboard itself belongs to the HR
// Admin, Analytics & Automation vertical (UC-10/UC-21/UC-22). This landing
// page still surfaces quick links to the HR-facing screens Member 1 owns
// (UC-20, UC-24, UC-26) so the HR_ADMIN role has a coherent home.
export default function HRAdminHomePage() {
  const links = [
    { to: "/invitations", label: "Invitations", desc: "Send onboarding links to new hires", icon: "✉️" },
    { to: "/announcements", label: "Announcements", desc: "Compose and target broadcasts", icon: "📣" },
    { to: "/entitlements", label: "Bulk entitlements", desc: "Yearly entitlement + pro-ration", icon: "🗓️" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow"
          >
            <p className="text-2xl mb-1">{l.icon}</p>
            <p className="font-medium text-slate-700">{l.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{l.desc}</p>
          </Link>
        ))}
      </div>
      <OwnedByNotice
        title="Employee directory, policy config & analytics"
        description="The full HR dashboard (employee records, reporting, audit trail) lives in the HR Admin, Analytics & Automation vertical."
      />
    </div>
  );
}
