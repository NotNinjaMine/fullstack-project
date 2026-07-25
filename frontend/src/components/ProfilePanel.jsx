import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import http from "../lib/http";
import { X, User, Shield, Bell, Monitor } from "lucide-react";

// datetime-safe formatter (fmt() in lib/dates expects a bare YYYY-MM-DD)
const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const LOCALES = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "th", label: "ไทย" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "ja", label: "日本語" },
];

// M1 (UC-23 + UC-25): profile, notification prefs, password change, active
// sessions and the personal security log — all self-service in one modal.
export default function ProfilePanel({ user, onClose, onUpdated }) {
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [log, setLog] = useState([]);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    http.get("/user/profile").then((res) => setProfile(res.data)).catch(() => {});
    http.get("/user/sessions").then((res) => setSessions(res.data)).catch(() => {});
    http.get("/user/security-log").then((res) => setLog(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveProfile = () => {
    setBusy(true);
    http
      .put("/user/profile", {
        name: profile.name,
        phone: profile.phone,
        locale: profile.locale,
        notifyEmail: profile.notifyEmail,
        notifyInApp: profile.notifyInApp,
      })
      .then((res) => {
        toast.success("Profile updated.");
        onUpdated?.(res.data.user);
      })
      .catch((err) => toast.error(err.response?.data?.message || "Update failed."))
      .finally(() => setBusy(false));
  };

  const changePassword = () => {
    setBusy(true);
    http
      .put("/user/password", pw)
      .then(() => {
        toast.success("Password changed.");
        setPw({ currentPassword: "", newPassword: "" });
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Change failed."))
      .finally(() => setBusy(false));
  };

  const revoke = (id) => {
    http
      .put(`/user/sessions/${id}/revoke`)
      .then(() => {
        toast.success("Session revoked.");
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Revoke failed."));
  };

  const tabBtn = (id, label, Icon) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border ${
        tab === id
          ? "bg-teal-600 text-white border-transparent"
          : "bg-white text-lf-text-muted border-lf-border hover:bg-lf-muted"
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <div className="lf-modal-overlay">
      <div className="lf-modal-panel max-w-2xl w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-lf-text">My account</h3>
          <button type="button" onClick={onClose} className="text-lf-text-subtle hover:text-lf-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {tabBtn("profile", "Profile", User)}
          {tabBtn("security", "Password", Shield)}
          {tabBtn("sessions", "Sessions", Monitor)}
          {tabBtn("log", "Security log", Bell)}
        </div>

        {tab === "profile" && profile && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-lf-text-muted">Name</span>
                <input className="lf-input mt-1" value={profile.name || ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm text-lf-text-muted">Phone</span>
                <input className="lf-input mt-1" value={profile.phone || ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm text-lf-text-muted">Email (read-only)</span>
                <input className="lf-input mt-1 bg-lf-muted" value={profile.email} disabled />
              </label>
              <label className="block">
                <span className="text-sm text-lf-text-muted">Preferred language</span>
                <select className="lf-input mt-1" value={profile.locale || "en"} onChange={(e) => setProfile({ ...profile, locale: e.target.value })}>
                  {LOCALES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <label className="flex items-center gap-2 text-sm text-lf-text-muted">
                <input type="checkbox" checked={!!profile.notifyEmail} onChange={(e) => setProfile({ ...profile, notifyEmail: e.target.checked })} />
                Email notifications
              </label>
              <label className="flex items-center gap-2 text-sm text-lf-text-muted">
                <input type="checkbox" checked={!!profile.notifyInApp} onChange={(e) => setProfile({ ...profile, notifyInApp: e.target.checked })} />
                In-app notifications
              </label>
            </div>
            <p className="text-xs text-lf-text-subtle">
              Role, country and team are set by HR and cannot be changed here ({profile.role} · {profile.country} · {profile.team}).
            </p>
            <div className="flex justify-end">
              <button type="button" disabled={busy} onClick={saveProfile} className="lf-btn lf-btn-primary">Save changes</button>
            </div>
          </div>
        )}

        {tab === "security" && (
          <div className="space-y-3 max-w-md">
            <label className="block">
              <span className="text-sm text-lf-text-muted">Current password</span>
              <input type="password" className="lf-input mt-1" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm text-lf-text-muted">New password</span>
              <input type="password" className="lf-input mt-1" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
              <span className="text-xs text-lf-text-subtle">At least 8 characters, with a letter and a number.</span>
            </label>
            <div className="flex justify-end">
              <button type="button" disabled={busy} onClick={changePassword} className="lf-btn lf-btn-primary">Change password</button>
            </div>
          </div>
        )}

        {tab === "sessions" && (
          <div className="space-y-2">
            {sessions.length === 0 && <p className="text-sm text-lf-text-subtle">No active sessions.</p>}
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-lf-border px-3 py-2">
                <div>
                  <p className="text-sm text-lf-text">{s.deviceInfo || "Unknown device"}</p>
                  <p className="text-xs text-lf-text-subtle">
                    {s.ipAddress || "—"} · last active {fmtDateTime(s.lastActive)}
                  </p>
                </div>
                <button type="button" onClick={() => revoke(s.id)} className="lf-btn lf-btn-sm lf-btn-outline">Revoke</button>
              </div>
            ))}
          </div>
        )}

        {tab === "log" && (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {log.length === 0 && <p className="text-sm text-lf-text-subtle">No security events yet.</p>}
            {log.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm border-b border-lf-border py-1.5">
                <span className={`font-medium ${e.success ? "text-lf-text" : "text-lf-danger"}`}>
                  {e.eventType.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-lf-text-subtle">{fmtDateTime(e.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
