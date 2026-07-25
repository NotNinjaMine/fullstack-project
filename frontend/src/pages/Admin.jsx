import { useState, useEffect, useCallback } from "react";
import http from "../lib/http";
import { UserPlus, Lock, Unlock, LogOut, Send, Megaphone, RefreshCcw } from "lucide-react";

const COUNTRIES = ["SG", "VN", "TH", "MY", "ID", "PH", "CN", "IN", "JP", "US"];
const emptyInvite = { name: "", email: "", country: "SG", team: "", role: "EMPLOYEE", startDate: "" };
const emptyAnnouncement = { title: "", body: "", targetType: "ALL", targetValue: "", startDate: "", endDate: "", requiresAck: false };

// HR admin landing page. This is Member 1's slice only — the full HR admin
// panel (audit log, reporting, coverage) is Member 5's and gets layered on
// top once that file lands. What's here: the user/lockout table (UC-25),
// bulk entitlement (UC-20), invitations (UC-24) and announcements (UC-26).
export default function Admin({ user, setToast }) {
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [busy, setBusy] = useState(false);

  const [invite, setInvite] = useState(emptyInvite);
  const [lastInviteLink, setLastInviteLink] = useState(null);
  const [announcement, setAnnouncement] = useState(emptyAnnouncement);

  const load = useCallback(() => {
    http.get("/admin/users").then((res) => setUsers(res.data)).catch(() => {});
    http.get("/invitation").then((res) => setInvitations(res.data)).catch(() => {});
    http.get("/announcement").then((res) => setAnnouncements(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isLocked = (u) => u.lockedUntil && new Date(u.lockedUntil) > new Date();

  const unlock = (id) => {
    http.put(`/user/${id}/unlock`)
      .then((res) => { setToast?.(res.data.message); load(); })
      .catch((err) => setToast?.(err.response?.data?.message || "Unlock failed."));
  };

  const forceLogout = (id) => {
    http.put(`/user/${id}/force-logout`)
      .then((res) => setToast?.(res.data.message))
      .catch((err) => setToast?.(err.response?.data?.message || "Force-logout failed."));
  };

  const bulkEntitlement = () => {
    setBusy(true);
    http.post("/admin/entitlement/commit", {})
      .then((res) => { setToast?.(res.data.message); load(); })
      .catch((err) => setToast?.(err.response?.data?.message || "Update failed."))
      .finally(() => setBusy(false));
  };

  const sendInvite = () => {
    setBusy(true);
    setLastInviteLink(null);
    http.post("/invitation", invite)
      .then((res) => {
        setToast?.(res.data.message);
        if (res.data.demoInviteToken) {
          setLastInviteLink(`${window.location.origin}/?inviteToken=${res.data.demoInviteToken}`);
        }
        setInvite(emptyInvite);
        load();
      })
      .catch((err) => setToast?.(err.response?.data?.message || (err.response?.data?.errors || []).join("; ") || "Invitation failed."))
      .finally(() => setBusy(false));
  };

  const createAnnouncement = () => {
    setBusy(true);
    http.post("/announcement", {
      ...announcement,
      targetValue: announcement.targetType === "ALL" ? undefined : announcement.targetValue
    })
      .then(() => {
        setToast?.("Announcement created.");
        setAnnouncement(emptyAnnouncement);
        load();
      })
      .catch((err) => setToast?.(err.response?.data?.message || (err.response?.data?.errors || []).join("; ") || "Could not create announcement."))
      .finally(() => setBusy(false));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* ---------------- Users + lockout ---------------- */}
      <div className="lf-card-static p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-lf-text">Accounts</h3>
          <button type="button" onClick={load} className="lf-btn lf-btn-ghost lf-btn-sm">
            <RefreshCcw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-lf-text-subtle border-b border-lf-border">
                <th className="py-1.5 font-medium">Name</th>
                <th className="font-medium">Role</th>
                <th className="font-medium">Country</th>
                <th className="font-medium">Team</th>
                <th className="font-medium">Annual left</th>
                <th className="font-medium">Sick left</th>
                <th className="font-medium">Status</th>
                <th className="font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const locked = isLocked(u);
                return (
                  <tr key={u.id} className="border-b border-lf-border/60">
                    <td className="py-1.5">{u.name}</td>
                    <td>{u.role}</td>
                    <td>{u.country}</td>
                    <td>{u.team}</td>
                    <td>{u.annual ? u.annual.remaining : "—"}</td>
                    <td>{u.sick ? u.sick.remaining : "—"}</td>
                    <td>
                      {locked ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                          Locked until {new Date(u.lockedUntil).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      ) : u.status === "INVITED" ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Invited (pending)</span>
                      ) : u.status === "DEACTIVATED" ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Deactivated</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Active</span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        {locked && (
                          <button type="button" onClick={() => unlock(u.id)} className="lf-btn lf-btn-sm lf-btn-outline">
                            <Unlock className="w-3.5 h-3.5" /> Unlock
                          </button>
                        )}
                        <button type="button" onClick={() => forceLogout(u.id)} className="lf-btn lf-btn-sm lf-btn-outline">
                          <LogOut className="w-3.5 h-3.5" /> Force logout
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={8} className="py-4 text-center text-lf-text-subtle">No accounts yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" disabled={busy} onClick={bulkEntitlement} className="lf-btn lf-btn-outline lf-btn-sm">
            <Lock className="w-3.5 h-3.5" /> Apply bulk entitlement (this year)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ---------------- Invitations ---------------- */}
        <div className="lf-card-static p-5">
          <h3 className="font-semibold text-lf-text flex items-center gap-2 mb-4">
            <Send className="w-4 h-4" /> Invite an employee
          </h3>
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm text-lf-text-muted">Full name</span>
              <input className="lf-input" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm text-lf-text-muted">Work email</span>
              <input type="email" className="lf-input" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-lf-text-muted">Country</span>
                <select className="lf-input" value={invite.country} onChange={(e) => setInvite({ ...invite, country: e.target.value })}>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-lf-text-muted">Role</span>
                <select className="lf-input" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="SUPERVISOR">Supervisor</option>
                  <option value="MANAGER">Manager</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-lf-text-muted">Team</span>
                <input className="lf-input" value={invite.team} onChange={(e) => setInvite({ ...invite, team: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm text-lf-text-muted">Start date</span>
                <input type="date" className="lf-input" title="Start date (for pro-ration)" value={invite.startDate} onChange={(e) => setInvite({ ...invite, startDate: e.target.value })} />
              </label>
            </div>
            <div className="flex justify-end">
              <button type="button" disabled={busy || !invite.name || !invite.email} onClick={sendInvite} className="lf-btn lf-btn-primary">
                Send invitation
              </button>
            </div>
            {lastInviteLink && (
              <p className="text-xs text-lf-text-subtle bg-lf-muted rounded-lg p-2 break-all">
                Demo mode (no SMTP configured) — share this link directly:<br />
                <span className="font-mono">{lastInviteLink}</span>
              </p>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-lf-border space-y-1.5 max-h-56 overflow-y-auto">
            {invitations.length === 0 && <p className="text-sm text-lf-text-subtle">No invitations sent yet.</p>}
            {invitations.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <span>{i.name} <span className="text-lf-text-subtle">· {i.email}</span></span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  i.status === "ACCEPTED" ? "bg-emerald-100 text-emerald-800"
                  : i.status === "EXPIRED" ? "bg-slate-200 text-slate-600"
                  : "bg-amber-100 text-amber-800"
                }`}>{i.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ---------------- Announcements ---------------- */}
        <div className="lf-card-static p-5">
          <h3 className="font-semibold text-lf-text flex items-center gap-2 mb-4">
            <Megaphone className="w-4 h-4" /> Broadcast an announcement
          </h3>
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm text-lf-text-muted">Title</span>
              <input className="lf-input" value={announcement.title} onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm text-lf-text-muted">Message</span>
              <textarea className="lf-input" rows={3} value={announcement.body} onChange={(e) => setAnnouncement({ ...announcement, body: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-lf-text-muted">Starts</span>
                <input type="date" className="lf-input" value={announcement.startDate} onChange={(e) => setAnnouncement({ ...announcement, startDate: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm text-lf-text-muted">Ends</span>
                <input type="date" className="lf-input" value={announcement.endDate} onChange={(e) => setAnnouncement({ ...announcement, endDate: e.target.value })} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-lf-text-muted">Target</span>
                <select className="lf-input" value={announcement.targetType} onChange={(e) => setAnnouncement({ ...announcement, targetType: e.target.value })}>
                  <option value="ALL">Everyone</option>
                  <option value="COUNTRY">By country</option>
                  <option value="ROLE">By role</option>
                </select>
              </label>
              {announcement.targetType !== "ALL" && (
                <label className="block">
                  <span className="text-sm text-lf-text-muted">Value</span>
                  <input className="lf-input" placeholder={announcement.targetType === "COUNTRY" ? "e.g. SG" : "e.g. EMPLOYEE"} value={announcement.targetValue} onChange={(e) => setAnnouncement({ ...announcement, targetValue: e.target.value })} />
                </label>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-lf-text-muted">
              <input type="checkbox" checked={announcement.requiresAck} onChange={(e) => setAnnouncement({ ...announcement, requiresAck: e.target.checked })} />
              Require acknowledgement (blocks until dismissed)
            </label>
            <div className="flex justify-end">
              <button type="button" disabled={busy || !announcement.title || !announcement.body || !announcement.startDate || !announcement.endDate} onClick={createAnnouncement} className="lf-btn lf-btn-primary">
                Publish
              </button>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-lf-border space-y-1.5 max-h-40 overflow-y-auto">
            {announcements.length === 0 && <p className="text-sm text-lf-text-subtle">No announcements yet.</p>}
            {announcements.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span>{a.title}</span>
                <span className="text-xs text-lf-text-subtle">{a.ackCount} acked · {a.active ? "active" : "ended"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
