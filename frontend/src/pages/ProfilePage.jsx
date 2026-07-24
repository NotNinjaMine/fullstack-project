import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import useAuth from "../hooks/useAuth";
import Tabs from "../components/common/Tabs";
import LocaleSwitcher from "../components/common/LocaleSwitcher";
import { getProfile, updateProfile, changePassword } from "../services/profileService";
import { ROLE_LABEL } from "../lib/nav";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "password", label: "Password" },
  { id: "preferences", label: "Preferences" },
];

// UC-23: employee self-service profile, password change, and notification
// preferences / locale. Available to every role.
export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState("profile");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    getProfile().then(setForm);
  }, []);

  const saveProfile = () => {
    setSaving(true);
    updateProfile({
      name: form.name,
      phone: form.phone,
      notifyEmail: form.notifyEmail,
      notifyInApp: form.notifyInApp,
    })
      .then((res) => {
        toast.success("Profile updated.");
        updateUser(res.user);
      })
      .catch((err) => toast.error(err.response?.data?.message || "Update failed."))
      .finally(() => setSaving(false));
  };

  const submitPassword = () => {
    if (pw.newPassword !== pw.confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setPwBusy(true);
    changePassword(pw.currentPassword, pw.newPassword)
      .then((res) => {
        toast.success(res.message || "Password changed.");
        setPw({ currentPassword: "", newPassword: "", confirmPassword: "" });
      })
      .catch((err) => toast.error(err.response?.data?.message || "Change failed."))
      .finally(() => setPwBusy(false));
  };

  if (!form) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">My account</h1>
        <p className="text-sm text-slate-500">
          Manage your contact details, password, and notification preferences.
        </p>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "profile" && (
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm text-slate-600">Full name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>
            <label className="block">
              <span className="text-sm text-slate-600">Phone</span>
              <input
                value={form.phone || ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>
            <label className="block">
              <span className="text-sm text-slate-600">Email (read-only)</span>
              <input value={form.email} disabled className="mt-1 w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-sm text-slate-500" />
            </label>
            <label className="block">
              <span className="text-sm text-slate-600">Country / Team (HR-managed)</span>
              <input
                value={`${form.country} · ${form.team}`}
                disabled
                className="mt-1 w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-sm text-slate-500"
              />
            </label>
          </div>
          <p className="text-xs text-slate-400">
            Reporting lines, role, and entitlements can only be changed by HR.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={saveProfile}
              className="text-sm bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white rounded-lg px-4 py-2"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {tab === "password" && (
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4 max-w-md">
          <label className="block">
            <span className="text-sm text-slate-600">Current password</span>
            <input
              type="password"
              value={pw.currentPassword}
              onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">New password</span>
            <input
              type="password"
              value={pw.newPassword}
              onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <span className="text-xs text-slate-400">At least 8 characters, with a letter and a number.</span>
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Confirm new password</span>
            <input
              type="password"
              value={pw.confirmPassword}
              onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && submitPassword()}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={pwBusy || !pw.currentPassword || !pw.newPassword || !pw.confirmPassword}
              onClick={submitPassword}
              className="text-sm bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white rounded-lg px-4 py-2"
            >
              {pwBusy ? "Changing…" : "Change password"}
            </button>
          </div>
        </div>
      )}

      {tab === "preferences" && (
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-5 max-w-md">
          <div>
            <span className="text-sm text-slate-600">Preferred language</span>
            <LocaleSwitcher />
            <p className="text-xs text-slate-400 mt-1">Dates and formats will follow the chosen locale.</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Notification channels</p>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={!!form.notifyEmail}
                onChange={(e) => setForm({ ...form, notifyEmail: e.target.checked })}
              />
              Email notifications
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={!!form.notifyInApp}
                onChange={(e) => setForm({ ...form, notifyInApp: e.target.checked })}
              />
              In-app notifications
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={saveProfile}
              className="text-sm bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white rounded-lg px-4 py-2"
            >
              {saving ? "Saving…" : "Save preferences"}
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Signed in as <span className="font-medium">{user.name}</span> · {ROLE_LABEL[user.role] ?? user.role}
      </p>
    </div>
  );
}
