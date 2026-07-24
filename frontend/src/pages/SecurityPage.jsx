import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import Tabs from "../components/common/Tabs";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { listSessions, revokeSession, getSecurityLog } from "../services/sessionService";

const TABS = [
  { id: "sessions", label: "Active sessions" },
  { id: "log", label: "Security log" },
];

const fmt = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

const EVENT_LABEL = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  FAILED_LOGIN: "Failed sign-in attempt",
  PASSWORD_CHANGE: "Password changed",
  SESSION_REVOKED: "Session revoked",
  LOCKED: "Account locked",
};

// UC-25: session management & security log. Available to every role for
// their own sessions; HR's cross-user force-logout/unlock lives on the
// Invitations/HR admin surface (role-gated separately).
export default function SecurityPage() {
  const [tab, setTab] = useState("sessions");
  const [sessions, setSessions] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([listSessions(), getSecurityLog()])
      .then(([s, l]) => {
        setSessions(s);
        setLog(l);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmRevoke = () => {
    if (!revokeTarget) return;
    setRevoking(true);
    revokeSession(revokeTarget.id)
      .then((res) => {
        toast.success(res.message || "Session revoked.");
        setRevokeTarget(null);
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Revoke failed."))
      .finally(() => setRevoking(false));
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Sessions & security</h1>
        <p className="text-sm text-slate-500">
          Review devices signed into your account and your login history for the past year.
        </p>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {loading && <p className="text-sm text-slate-400">Loading…</p>}

      {!loading && tab === "sessions" && (
        <div className="bg-white rounded-xl shadow-sm divide-y divide-slate-100">
          {sessions.length === 0 && <p className="p-5 text-sm text-slate-400">No active sessions.</p>}
          {sessions.map((s) => (
            <div key={s.id} className="p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-700">{s.deviceInfo || "Unknown device"}</p>
                <p className="text-xs text-slate-400">
                  {s.ipAddress || "—"} · last active {fmt(s.lastActive)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRevokeTarget(s)}
                className="text-xs rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 px-3 py-1.5"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "log" && (
        <div className="bg-white rounded-xl shadow-sm divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
          {log.length === 0 && <p className="p-5 text-sm text-slate-400">No security events yet.</p>}
          {log.map((e) => (
            <div key={e.id} className="p-3.5 flex items-center justify-between text-sm">
              <span className={e.success ? "text-slate-700" : "text-rose-600 font-medium"}>
                {EVENT_LABEL[e.eventType] || e.eventType}
              </span>
              <span className="text-xs text-slate-400">{fmt(e.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => !revoking && setRevokeTarget(null)}
        onConfirm={confirmRevoke}
        loading={revoking}
        variant="danger"
        title="Revoke this session?"
        message="The device will be signed out immediately. Your other sessions are not affected."
        confirmLabel="Revoke session"
      />
    </div>
  );
}
