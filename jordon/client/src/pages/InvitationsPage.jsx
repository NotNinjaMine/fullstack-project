import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { listInvitations, sendInvitation } from "../services/invitationService";
import { LEAVE_POLICIES, prorateEntitlement, policyFor } from "../lib/entitlement";

const EMPTY_FORM = { name: "", email: "", countryCode: "SG", team: "Finance", role: "EMPLOYEE", startDate: "" };

const STATUS_CLASS = {
  PENDING: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  EXPIRED: "bg-slate-100 text-slate-500",
};

// UC-24: HR sends a single-use, 48-hour invitation. The new employee's
// entitlement is auto pro-rated from their start date (UC-20) on activation.
export default function InvitationsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sending, setSending] = useState(false);
  const [lastLink, setLastLink] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    listInvitations()
      .then(setList)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const policy = policyFor(form.countryCode);
  const proratedPreview = form.startDate ? prorateEntitlement(policy.annualMin, form.startDate) : null;

  const invite = () => {
    setSending(true);
    setLastLink(null);
    sendInvitation(form)
      .then((res) => {
        toast.success(res.message);
        if (res.demoInviteToken) {
          setLastLink(`${window.location.origin}/register?inviteToken=${res.demoInviteToken}`);
        }
        setForm({ ...EMPTY_FORM, countryCode: form.countryCode, team: form.team });
        load();
      })
      .catch((err) =>
        toast.error(err.response?.data?.message || (err.response?.data?.errors || []).join(", ") || "Failed.")
      )
      .finally(() => setSending(false));
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Invite a new employee</h1>
        <p className="text-sm text-slate-500">
          Sends a single-use registration link (expires in 48 hours) and auto-computes a pro-rated
          entitlement from the employee's start date.
        </p>
      </div>

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
            <span className="text-sm text-slate-600">Work email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Country (drives calendar + entitlement)</span>
            <select
              value={form.countryCode}
              onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {LEAVE_POLICIES.map((p) => (
                <option key={p.country} value={p.country}>
                  {p.countryName} ({p.country}) — {p.annualMin}–{p.annualMax}d annual
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Team</span>
            <input
              value={form.team}
              onChange={(e) => setForm({ ...form, team: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Role</span>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="EMPLOYEE">Employee</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="MANAGER">Manager</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Start date (for pro-ration)</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </label>
        </div>

        {proratedPreview != null && (
          <p className="text-xs text-teal-800 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
            Preview: {proratedPreview} of {policy.annualMin} annual day(s) pro-rated from {form.startDate}.
          </p>
        )}

        {lastLink && (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all">
            Demo mode (no SMTP) — registration link: <code className="text-slate-700">{lastLink}</code>
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            disabled={sending || !form.name.trim() || !form.email.trim()}
            onClick={invite}
            className="text-sm bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white rounded-lg px-4 py-2"
          >
            {sending ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Invitations</h2>
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {!loading && list.length === 0 && <p className="text-sm text-slate-400">No invitations yet.</p>}
        <div className="divide-y divide-slate-100">
          {list.map((v) => (
            <div key={v.id} className="py-2.5 flex items-center justify-between text-sm gap-3">
              <span className="truncate">
                {v.name} · {v.email} · {v.role} · {v.countryCode}
              </span>
              <span className={`text-xs rounded-full px-2.5 py-1 shrink-0 ${STATUS_CLASS[v.status]}`}>{v.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
