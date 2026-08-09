import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import http from "../lib/http";
import Modal from "./Modal";
import { User, Shield, Bell, Monitor, KeyRound } from "lucide-react";
import { LOCALES, translator } from "../lib/i18n";

// datetime-safe formatter (fmt() in lib/dates expects a bare YYYY-MM-DD)
const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

// M1 (UC-23 + UC-25): profile, notification prefs, password change, active
// sessions and the personal security log — all self-service in one modal.
export default function ProfilePanel({ user, onClose, onUpdated }) {
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [log, setLog] = useState([]);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [busy, setBusy] = useState(false);

  // Authenticator-app (TOTP) enrolment state.
  const [totpSetup, setTotpSetup] = useState(null); // { qrDataUrl, manualKey, otpauthUrl }
  const [totpCode, setTotpCode] = useState("");
  const [disablePw, setDisablePw] = useState("");

  // Translations for the Details tab. Reads the locale straight off the
  // in-progress `profile` object rather than the saved user, so picking a
  // language in the dropdown re-labels the form IMMEDIATELY — you can see what
  // you're choosing before committing it with Save. Falls back to the signed-in
  // user's saved locale while the profile is still loading, then to English.
  const t = translator(profile?.locale || user?.locale || "en");

  const startTotpSetup = () => {
    setBusy(true);
    http
      .post("/user/2fa/totp/setup")
      .then((res) => {
        setTotpSetup(res.data);
        setTotpCode("");
      })
      .catch((err) => toast.error(err.response?.data?.message || "Could not start setup."))
      .finally(() => setBusy(false));
  };

  const enableTotp = () => {
    setBusy(true);
    http
      .post("/user/2fa/totp/enable", { code: totpCode })
      .then((res) => {
        toast.success(res.data.message || "Authenticator enabled.");
        setTotpSetup(null);
        setTotpCode("");
        setProfile((p) => ({ ...p, totpEnabled: true }));
      })
      .catch((err) => toast.error(err.response?.data?.message || "Could not enable authenticator."))
      .finally(() => setBusy(false));
  };

  const disableTotp = () => {
    setBusy(true);
    http
      .post("/user/2fa/totp/disable", { password: disablePw })
      .then((res) => {
        toast.success(res.data.message || "Authenticator turned off.");
        setDisablePw("");
        setProfile((p) => ({ ...p, totpEnabled: false }));
      })
      .catch((err) => toast.error(err.response?.data?.message || "Could not disable authenticator."))
      .finally(() => setBusy(false));
  };

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
        toast.success(t("profile.updated"));
        // Reflect the server's canonical values (incl. recomputed initials) in
        // the panel immediately, and bubble up so the app header updates too.
        setProfile((p) => ({ ...p, ...res.data.user }));
        onUpdated?.(res.data.user);
      })
      .catch((err) => toast.error(err.response?.data?.message || t("profile.updateFailed")))
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
          ? "bg-brand-600 text-white border-transparent"
          : "bg-white text-lf-text-muted border-lf-border hover:bg-lf-muted"
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <Modal title={t("profile.myAccount")} onClose={onClose} size="lg">
      <div className="flex flex-wrap gap-2 mb-4">
        {tabBtn("profile", t("profile.tabDetails"), User)}
        {tabBtn("security", t("profile.tabPassword"), Shield)}
        {tabBtn("totp", t("profile.tabAuthenticator"), KeyRound)}
        {tabBtn("sessions", t("profile.tabSessions"), Monitor)}
        {tabBtn("log", t("profile.tabSecurityLog"), Bell)}
      </div>

        {tab === "profile" && profile && (
          <div className="space-y-3">
            {/* Current account information at a glance (all fields) */}
            <div className="flex items-center gap-3 rounded-xl border border-lf-border bg-lf-muted/40 p-3">
              <div className="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center font-semibold flex-shrink-0">
                {profile.initials || (profile.name || "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-lf-text truncate">{profile.name}</p>
                <p className="text-xs text-lf-text-subtle truncate">{profile.email}</p>
                <p className="text-xs text-lf-text-subtle">
                  {profile.role} · {profile.country} · {profile.team}
                  {profile.phone ? ` · ${profile.phone}` : ""}
                </p>
              </div>
            </div>

            <p className="text-sm font-medium text-lf-text pt-1">{t("profile.editYourDetails")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-lf-text-muted">{t("profile.name")}</span>
                <input className="lf-input mt-1" value={profile.name || ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm text-lf-text-muted">{t("profile.phone")}</span>
                <input className="lf-input mt-1" value={profile.phone || ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm text-lf-text-muted">{t("profile.emailReadOnly")}</span>
                <input className="lf-input mt-1 bg-lf-muted" value={profile.email || ""} disabled />
              </label>
              <label className="block">
                <span className="text-sm text-lf-text-muted">{t("profile.preferredLanguage")}</span>
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
                {t("profile.emailNotifications")}
              </label>
              <label className="flex items-center gap-2 text-sm text-lf-text-muted">
                <input type="checkbox" checked={!!profile.notifyInApp} onChange={(e) => setProfile({ ...profile, notifyInApp: e.target.checked })} />
                {t("profile.inAppNotifications")}
              </label>
            </div>
            <p className="text-xs text-lf-text-subtle">
              {t("profile.managedByHr")}
            </p>
            <div className="flex justify-end">
              <button type="button" disabled={busy} onClick={saveProfile} className="lf-btn lf-btn-primary">
                {busy ? t("profile.saving") : t("profile.saveChanges")}
              </button>
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

        {tab === "totp" && profile && (
          <div className="space-y-4 max-w-md">
            <div>
              <p className="text-sm font-medium text-lf-text">Authenticator app</p>
              <p className="text-xs text-lf-text-subtle mt-1">
                Add a third way to verify your sign-ins with an authenticator app.
                Works with <strong>Microsoft Authenticator</strong>, Google Authenticator,
                Authy and any other TOTP app. The app shows a 6-digit code that changes
                every 30 seconds — no email or text needed. Email and text verification
                stay available too.
              </p>
            </div>

            {profile.totpEnabled ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  Authenticator app is <strong>on</strong>. You can pick “Authenticator app” at sign-in.
                </div>
                <p className="text-sm text-lf-text-muted">To turn it off, confirm your password:</p>
                <input
                  type="password"
                  className="lf-input"
                  placeholder="Current password"
                  value={disablePw}
                  onChange={(e) => setDisablePw(e.target.value)}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={busy || disablePw.length < 8}
                    onClick={disableTotp}
                    className="lf-btn lf-btn-outline"
                  >
                    Turn off authenticator
                  </button>
                </div>
              </div>
            ) : totpSetup ? (
              <div className="space-y-3">
                <p className="text-sm text-lf-text-muted">
                  1. Scan this QR code in your authenticator app:
                </p>
                <div className="flex justify-center">
                  <img
                    src={totpSetup.qrDataUrl}
                    alt="Authenticator setup QR code"
                    width={200}
                    height={200}
                    className="rounded-lg border border-lf-border"
                  />
                </div>
                <p className="text-xs text-lf-text-subtle text-center">
                  Can’t scan? Enter this key by hand:{" "}
                  <span className="font-mono break-all">{totpSetup.manualKey}</span>
                </p>
                <p className="text-sm text-lf-text-muted">
                  2. Enter the 6-digit code the app shows:
                </p>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="lf-input text-center text-xl tracking-[0.3em] font-mono"
                />
                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setTotpSetup(null);
                      setTotpCode("");
                    }}
                    className="lf-btn lf-btn-outline"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy || totpCode.length !== 6}
                    onClick={enableTotp}
                    className="lf-btn lf-btn-primary"
                  >
                    Verify &amp; enable
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button type="button" disabled={busy} onClick={startTotpSetup} className="lf-btn lf-btn-primary">
                  Set up authenticator app
                </button>
              </div>
            )}
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
          <div className="space-y-1">
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
    </Modal>
  );
}
