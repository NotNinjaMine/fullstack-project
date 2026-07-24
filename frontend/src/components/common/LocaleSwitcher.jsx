import { useState } from "react";
import { LOCALES } from "../../lib/entitlement";
import { updateProfile } from "../../services/profileService";
import useAuth from "../../hooks/useAuth";

// UC-23 (E): preferred UI language. Persists immediately via PUT /user/profile
// and updates the session in place — usable inline in the Navbar or embedded
// in a form (e.g. the Profile page, the invitation-acceptance onboarding tour).
export default function LocaleSwitcher({ compact = false }) {
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);

  const onChange = (e) => {
    const locale = e.target.value;
    setSaving(true);
    updateProfile({ locale })
      .then(() => updateUser({ locale }))
      .finally(() => setSaving(false));
  };

  return (
    <select
      value={user?.locale || "en"}
      onChange={onChange}
      disabled={saving}
      aria-label="Preferred language"
      className={
        compact
          ? "text-xs bg-teal-800 text-teal-100 rounded-lg px-2 py-1.5 border-none focus:outline-none"
          : "mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
      }
    >
      {LOCALES.map((l) => (
        <option key={l.code} value={l.code} className="text-slate-800">
          {l.label}
        </option>
      ))}
    </select>
  );
}
