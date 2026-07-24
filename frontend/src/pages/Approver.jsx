import { useState, useEffect, useCallback } from "react";
import http from "../lib/http";
import { UserPlus, Lock, Unlock } from "lucide-react";

const emptyForm = { name: "", email: "", tempPassword: "", country: "SG", role: "EMPLOYEE", team: "", annualEntitlement: "" };

// Shared SUPERVISOR + MANAGER landing page. Approval queues / coverage /
// swap screens (owned by other members) aren't wired up yet; what IS here
// is Member 1's slice: onboarding a direct report, and — for MANAGER only —
// a way to unlock any account whose lockout has no other path back in
// (including HR_ADMIN, which can't unlock itself).
export default function Approver({ user, setToast }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState([]);

  const isManager = user.role === "MANAGER";

  const loadLocked = useCallback(() => {
    if (!isManager) return;
    http.get("/user/locked").then((res) => setLocked(res.data)).catch(() => {});
  }, [isManager]);

  useEffect(() => {
    loadLocked();
  }, [loadLocked]);

  const addEmployee = () => {
    setBusy(true);
    http
      .post("/user/employees", {
        ...form,
        role: isManager ? form.role : "EMPLOYEE",
        annualEntitlement: form.annualEntitlement === "" ? null : Number(form.annualEntitlement)
      })
      .then((res) => {
        setToast?.(res.data.message);
        setForm(emptyForm);
      })
      .catch((err) =>
        setToast?.(err.response?.data?.message || (err.response?.data?.errors || []).join("; ") || "Could not add employee.")
      )
      .finally(() => setBusy(false));
  };

  const unlock = (id) => {
    http
      .put(`/user/${id}/unlock`)
      .then((res) => {
        setToast?.(res.data.message);
        loadLocked();
      })
      .catch((err) => setToast?.(err.response?.data?.message || "Unlock failed."));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {isManager && locked.length > 0 && (
        <div className="lf-card-static p-5">
          <h3 className="font-semibold text-lf-text flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-lf-danger" /> Locked accounts
          </h3>
          <p className="text-sm text-lf-text-muted mb-3">
            Any account locked out after too many failed logins — including HR, which has no
            other way to self-unlock — can be cleared here.
          </p>
          <div className="space-y-2">
            {locked.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-lf-border px-3 py-2">
                <div>
                  <p className="text-sm text-lf-text">{u.name} · <span className="text-lf-text-subtle">{u.role}</span></p>
                  <p className="text-xs text-lf-text-subtle">
                    {u.email} · locked until {new Date(u.lockedUntil).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <button type="button" onClick={() => unlock(u.id)} className="lf-btn lf-btn-sm lf-btn-outline">
                  <Unlock className="w-3.5 h-3.5" /> Unlock
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="lf-card-static p-5 max-w-xl">
        <h3 className="font-semibold text-lf-text flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4" /> Add a direct report
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-lf-text-muted">Full name</span>
            <input className="lf-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm text-lf-text-muted">Work email</span>
            <input type="email" className="lf-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm text-lf-text-muted">Temporary password</span>
            <input type="text" className="lf-input" value={form.tempPassword} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm text-lf-text-muted">Country</span>
            <select className="lf-input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
              {["SG", "VN", "TH", "MY", "ID", "PH", "CN", "IN", "JP", "US"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          {isManager ? (
            <>
              <label className="block">
                <span className="text-sm text-lf-text-muted">Role</span>
                <select className="lf-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="SUPERVISOR">Supervisor</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-lf-text-muted">Team</span>
                <input className="lf-input" placeholder={user.team} value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} />
              </label>
            </>
          ) : (
            <p className="text-xs text-lf-text-subtle sm:col-span-2">
              Added as an Employee on your team ({user.team}).
            </p>
          )}
          <label className="block sm:col-span-2">
            <span className="text-sm text-lf-text-muted">Annual entitlement override (optional)</span>
            <input type="number" min="0" max="60" className="lf-input" value={form.annualEntitlement} onChange={(e) => setForm({ ...form, annualEntitlement: e.target.value })} />
            <span className="text-xs text-lf-text-subtle">Leave blank to use the country's statutory minimum.</span>
          </label>
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" disabled={busy || !form.name || !form.email || !form.tempPassword} onClick={addEmployee} className="lf-btn lf-btn-primary">
            Add employee
          </button>
        </div>
      </div>
    </div>
  );
}
