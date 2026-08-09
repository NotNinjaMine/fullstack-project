import { useState, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import http from "../lib/http";
import { fmt } from "../lib/dates";
import { runSingleFlight, submitLeaveDecision } from "../lib/decisionFeedback";
import CommentThread from "../components/CommentThread";
import DelegationPanel from "../components/DelegationPanel";
import StaffTable, { useStaff } from "../components/StaffTable";
import ConfirmDialog from "../components/ConfirmDialog";
import RejectReasonModal from "../components/RejectReasonModal";
import TeamSchedule from "../components/TeamSchedule";

const typeLabel = (id) =>
  ({ annual: "Annual Leave", sick_mc: "Sick Leave (with MC)", sick_nomc: "Sick Leave (without MC)" }[id] ?? id);

const statusChipClass = (r) =>
  r.cancellationRequested
    ? "bg-indigo-100 text-indigo-800"
    : r.flagged
    ? "bg-orange-100 text-orange-800"
    : "bg-amber-100 text-amber-800";

const recChipClass = (action) =>
  action === "APPROVE"
    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
    : action === "APPROVE_NOTE"
    ? "bg-brand-100 text-brand-800 border-brand-300"
    : "bg-orange-100 text-orange-800 border-orange-300";

const hoursSince = (dt) => Math.max(0, Math.floor((new Date() - new Date(dt)) / (1000 * 60 * 60)));

export default function Approver({ user, setToast }) {
  // The Boss uses this exact page. The only differences are that their queue is
  // company-wide (Managers' own leave, which the server returns from
  // /leave/pending for role BOSS) and that, like a Manager, their decision is
  // final rather than an endorsement. See server/services/approvalChain.js.
  const isBoss = user.role === "BOSS";
  const isManager = user.role === "MANAGER" || isBoss;
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showDelegation, setShowDelegation] = useState(false);
  const [policies, setPolicies] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [scheduleRefresh, setScheduleRefresh] = useState(0);

  // F4 / F3 modal state (parent owns API + loading to prevent double-submit)
  const [bulkConfirm, setBulkConfirm] = useState(null); // { approve: boolean } | null
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkActionLock = useRef(false);

  // M3 AI assist (on-demand only — never on page load)
  const [briefLoading, setBriefLoading] = useState(false);
  const [coverageBrief, setCoverageBrief] = useState(null); // { brief, bullets, source }

  // M2 (UC-27): swap approvals awaiting this approver's tier.
  const [swapQueue, setSwapQueue] = useState([]);

  // M1 (UC-25): account recovery. Managers see the SAME staff directory as HR
  // (shared StaffTable + useStaff hook, one endpoint) so the two views can never
  // disagree, and can unlock anyone locked out by failed sign-ins — including a
  // locked-out HR admin, who would otherwise have no way back in.
  const [showLocked, setShowLocked] = useState(false);
  const staff = useStaff();

  const load = useCallback(() => {
    setLoading(true);
    http
      .get("/leave/pending")
      .then((res) => {
        setQueue(res.data);
        setSelected(new Set());
        setScheduleRefresh((value) => value + 1);
      })
      .finally(() => setLoading(false));
    http.get("/swap/pending").then((res) => setSwapQueue(res.data)).catch(() => setSwapQueue([]));
  }, []);

  useEffect(() => {
    load();
    // Country policies drive the add-employee form (calendar + entitlement law)
    http.get("/user/policies").then((res) => setPolicies(res.data));
  }, [load]);

  /** GET /ai/coverage-brief — advisory queue triage for supervisors */
  const loadCoverageBrief = () => {
    if (briefLoading) return;
    setBriefLoading(true);
    http
      .get("/ai/coverage-brief")
      .then((res) => {
        setCoverageBrief(res.data);
        toast.success("Coverage brief ready (advisory only).");
      })
      .catch((err) => {
        const msg =
          err.response?.data?.message ||
          "AI coverage brief unavailable — triage the queue manually.";
        toast.error(msg);
      })
      .finally(() => setBriefLoading(false));
  };

  /**
   * Single-request decision API (used after ConfirmDialog / RejectReasonModal).
   * Returns a Promise so the card can keep its loading flag until settle.
   */
  const decide = (id, approve, acknowledgeException = false, rejectionReason = null) =>
    submitLeaveDecision({
      httpClient: http,
      toastApi: toast,
      requestId: id,
      approve,
      acknowledgeException,
      rejectionReason,
    })
      .then((data) => {
        // One channel only. The previous dual-renderer callback produced two
        // overlapping prompts for the same committed decision.
        load();
        return data;
      })
      .catch((err) => {
        const msg = err.response?.data?.message || "Decision failed.";
        toast.error(msg, { id: `leave-decision-${id}-error` });
        throw err;
      });

  const toggleSelect = (id) => {
    const item = queue.find((request) => request.id === id);
    if (!item || item.flagged) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Bulk decide — only called after ConfirmDialog confirm */
  const runBulkDecide = (rejectionReason = null) => {
    if (!bulkConfirm) return;
    const ids = [...selected];
    if (ids.length === 0) return;
    const approve = bulkConfirm.approve;
    const body = { ids, approve, acknowledgeException: false };
    if (!approve) body.rejectionReason = rejectionReason;

    runSingleFlight(bulkActionLock, async () => {
      setBulkBusy(true);
      try {
        const res = await http.put("/leave/bulk-decide", body);
        const results = res.data.results || [];
        const ok = results.filter((r) => r.ok).length;
        const fail = results.filter((r) => !r.ok);
        let msg;
        const toastId = `leave-bulk-${approve ? "approve" : "reject"}-${ids.join("-")}`;
        if (fail.length === 0) {
          msg = `${ok} request(s) ${approve ? "approved" : "rejected"}.`;
          toast.success(msg, { id: toastId });
        } else {
          const sample = fail
            .slice(0, 2)
            .map((r) => `REQ-${r.id}: ${r.message}`)
            .join("; ");
          msg = `${ok} ok, ${fail.length} failed. ${sample}`;
          toast.error(msg, { id: toastId });
        }
        setBulkConfirm(null);
        load();
      } catch (err) {
        const msg = err.response?.data?.message || "Bulk decision failed.";
        toast.error(msg, { id: `leave-bulk-${approve ? "approve" : "reject"}-error` });
      } finally {
        setBulkBusy(false);
      }
    });
  };

  // M2 (UC-27): approve/reject a leave swap at this approver's tier.
  const decideSwap = (id, approve) => {
    http
      .put(`/swap/${id}/decide`, { approve })
      .then((res) => {
        toast.success(res.data.message || "Swap decision recorded.");
        load();
      })
      .catch((err) => {
        const msg = err.response?.data?.message || "Swap decision failed.";
        toast.error(msg);
      });
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            {isBoss ? "Final approvals — Managers" : isManager ? "Final approvals" : "Team requests"}
            {!isBoss && ` — ${user.team}`}
          </h2>
          <p className="text-sm text-slate-500">
            {isBoss
              ? "Managers' own leave, from every team. Your decision is final; flagged requests need your explicit coverage-exception approval."
              : isManager
              ? "Tier 2 of 2. Flagged requests need your explicit coverage-exception approval."
              : "Tier 1 of 2. Your approval routes the request to the Manager."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={loadCoverageBrief}
            disabled={briefLoading}
            title="AI triage of your pending queue (advisory only — never auto-decides)"
            className="lf-btn lf-btn-outline lf-btn-sm"
          >
            {briefLoading ? "Briefing…" : "AI coverage brief"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowDelegation((v) => !v);
              setShowAddEmployee(false);
            }}
            className="lf-btn lf-btn-outline lf-btn-sm"
          >
            {showDelegation ? "Close" : "Delegate approvals"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddEmployee((v) => !v);
              setShowDelegation(false);
            }}
            className="lf-btn lf-btn-primary lf-btn-sm"
          >
            {showAddEmployee ? "Close" : "+ Add employee"}
          </button>
          {isManager && (
            <button
              type="button"
              onClick={() => { setShowLocked((v) => !v); staff.load(); }}
              title="View all staff and unlock anyone locked out by too many failed sign-in attempts"
              className={`lf-btn lf-btn-sm ${staff.lockedCount > 0 ? "lf-btn-primary" : "lf-btn-outline"}`}
            >
              {showLocked ? "Close" : "Unlock accounts"}
              {staff.lockedCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] px-1.5 py-0.5">
                  {staff.lockedCount}
                </span>
              )}
            </button>
          )}
          <span className="text-sm bg-lf-surface rounded-full shadow-lf-sm border border-lf-border px-3 py-1.5">
            <span className="font-semibold text-lf-accent">{queue.length}</span> pending
          </span>
        </div>
      </div>

      {/* M3 AI: queue-level coverage brief (on-demand) */}
      {coverageBrief && (
        <div className="lf-card-static p-4">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="font-semibold text-lf-text text-sm">Queue coverage brief</h3>
              <p className="text-xs text-slate-500">
                Advisory only · {coverageBrief.queueSize ?? "—"} at{" "}
                {coverageBrief.tier || "your tier"} · source: {coverageBrief.source || "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCoverageBrief(null)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Dismiss
            </button>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{coverageBrief.brief}</p>
          {Array.isArray(coverageBrief.bullets) && coverageBrief.bullets.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {coverageBrief.bullets.map((b, i) => (
                <li key={i}>• {b}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-400 mt-2">
            Does not approve, reject, or change routing — use bulk actions and cards to decide.
          </p>
        </div>
      )}

      {showAddEmployee && (
        <AddEmployeePanel
          user={user}
          isManager={isManager}
          policies={policies}
          setToast={setToast}
          onDone={() => setShowAddEmployee(false)}
        />
      )}

      {showDelegation && (
        <DelegationPanel setToast={setToast} onChanged={load} />
      )}

      <TeamSchedule refreshKey={scheduleRefresh} />

      {/* M1 (UC-25): locked-account recovery (managers) — the safety net that
          lets a Manager unlock a locked-out HR admin, and any other account. */}
      {isManager && showLocked && (
        <div className="lf-card p-5">
          <p className="text-sm text-slate-500 mb-3">
            All staff, with the same details HR sees. Accounts lock after 3 failed sign-in attempts — a{" "}
            <span className="text-red-700 font-medium">Locked</span> status shows an Unlock button, which clears the
            lockout immediately so they can sign in again.
            {staff.lockedCount === 0 && " No accounts are currently locked."}
          </p>
          <StaffTable
            rows={staff.rows}
            loading={staff.loading}
            onUnlock={staff.unlock}
            onForceLogout={staff.forceLogout}
            onDeactivate={staff.deactivate}
            onReactivate={staff.reactivate}
            onDeleteForever={staff.deleteForever}
            currentUserId={user?.id}
            onChangeRole={staff.changeRole}
            assignableRoles={staff.assignableRoles}
            title="Staff"
          />
        </div>
      )}

      {/* M2 (UC-27): leave-swap approvals */}
      {swapQueue.length > 0 && (
        <div className="lf-card p-5">
          <h3 className="font-semibold text-lf-text mb-1">Leave swaps awaiting your approval</h3>
          <p className="text-xs text-lf-text-subtle mb-3">
            {isManager
              ? "Final approval — approving swaps both employees' dates atomically (balances unchanged)."
              : "Supervisor endorsement — approved swaps then route to the Manager for final sign-off."}
          </p>
          <ul className="divide-y divide-slate-100">
            {swapQueue.map((s) => (
              <li key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <p className="font-medium">
                    {s.proposer?.name} ⇄ {s.counterpart?.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmt(s.proposerStart)}
                    {s.proposerStart !== s.proposerEnd ? `→${fmt(s.proposerEnd)}` : ""} ⇄{" "}
                    {fmt(s.counterpartStart)}
                    {s.counterpartStart !== s.counterpartEnd ? `→${fmt(s.counterpartEnd)}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => decideSwap(s.id, true)} className="lf-btn lf-btn-sm lf-btn-primary">
                    {isManager ? "Approve swap" : "Endorse"}
                  </button>
                  <button onClick={() => decideSwap(s.id, false)} className="lf-btn lf-btn-sm lf-btn-danger">
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">Loading queue…</p>}

      {!loading && queue.length === 0 && (
        <div className="lf-card-static p-10 text-center text-lf-text-subtle">
          <p className="text-3xl mb-2">✓</p>
          <p className="font-medium text-lf-text-muted">Queue clear</p>
          <p className="text-sm">
            {isManager
              ? "Requests approved by the Supervisor will land here for final decision."
              : "New team requests will appear here with an AI-3 summary card."}
          </p>
        </div>
      )}

      {queue.map((req) => (
        <RequestCard
          key={req.id}
          req={req}
          isManager={isManager}
          onDecide={decide}
          selected={selected.has(req.id)}
          onToggleSelect={() => toggleSelect(req.id)}
          setToast={setToast}
        />
      ))}

      {/* M3: sticky bulk action bar — opens ConfirmDialog (F4), never fires API immediately */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-lg bg-lf-surface border border-lf-border shadow-lf-lg rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-lf-text">
            <span className="font-semibold text-lf-accent">{selected.size}</span> selected
          </span>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => setBulkConfirm({ approve: true })}
              className="lf-btn lf-btn-primary lf-btn-sm"
            >
              Approve selected
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => setBulkConfirm({ approve: false })}
              className="lf-btn lf-btn-danger lf-btn-sm"
            >
              Reject selected
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="lf-btn lf-btn-ghost lf-btn-sm"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* F4: bulk approve / bulk reject confirmation */}
      <ConfirmDialog
        open={!!bulkConfirm?.approve}
        onClose={() => !bulkBusy && setBulkConfirm(null)}
        onConfirm={runBulkDecide}
        loading={bulkBusy}
        variant="primary"
        title={
          `Approve ${selected.size} request(s)?`
        }
        message={
          "Selected requests will be decided at your tier. This cannot be undone from the queue."
        }
        confirmLabel="Yes, approve"
        loadingLabel="Approving…"
        cancelLabel="Go back"
      />

      <RejectReasonModal
        open={bulkConfirm?.approve === false}
        onClose={() => !bulkBusy && setBulkConfirm(null)}
        onConfirm={runBulkDecide}
        loading={bulkBusy}
        request={queue.find((item) => selected.has(item.id)) || null}
        bulkCount={selected.size}
        confirmLabel={`Reject ${selected.size} request(s)`}
        loadingLabel="Rejecting…"
      />
    </main>
  );
}

/* ---------------- Add employee (Supervisor: own team, EMPLOYEE only;
                    Manager: any team, EMPLOYEE or SUPERVISOR) ---------------- */

const genTempPassword = () => {
  // Meets the server rule: >= 8 chars, at least 1 letter and 1 number
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const nums = "23456789";
  let p = "";
  for (let i = 0; i < 7; i++) p += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 3; i++) p += nums[Math.floor(Math.random() * nums.length)];
  return p;
};

function AddEmployeePanel({ user, isManager, policies, setToast, onDone }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState(user.country || "SG");
  const [role, setRole] = useState("EMPLOYEE");
  const [team, setTeam] = useState(user.team);
  const [annualEntitlement, setAnnualEntitlement] = useState("");
  const [tempPassword, setTempPassword] = useState(genTempPassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  // Teams are a closed list served by the API — the same one the blackout
  // scope picker uses, so a new hire's team always matches team-scoped
  // blackouts and team calendars.
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    http.get("/coverage/options")
      .then((res) => setTeams(res.data.teams || []))
      .catch(() => setTeams([user.team]));
  }, [user.team]);

  const policy = policies.find((p) => p.country === country);

  const submit = () => {
    setSaving(true);
    setError("");
    http
      .post("/user/employees", {
        name: name.trim(),
        email: email.trim(),
        tempPassword,
        country,
        role,
        team: team.trim(),
        annualEntitlement: annualEntitlement === "" ? null : Number(annualEntitlement),
      })
      .then((res) => {
        setCreated({ ...res.data, tempPassword });
        setToast(res.data.message);
        setName("");
        setEmail("");
        setAnnualEntitlement("");
        setTempPassword(genTempPassword());
      })
      .catch((err) =>
        setError(
          err.response?.data?.message ||
            (err.response?.data?.errors || []).join("; ") ||
            "Could not add employee."
        )
      )
      .finally(() => setSaving(false));
  };

  const fieldCls = "lf-input";

  return (
    <div className="lf-card-static p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-lf-text">Add a new employee</h3>
        <span className="text-xs bg-lf-accent-soft text-lf-accent rounded-full px-2 py-0.5 font-medium">
          {isManager ? "Manager · any team" : `Supervisor · ${user.team} only`}
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        The account's public-holiday calendar and leave entitlement are set automatically from the
        country you pick, per that country's statutory policy.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm text-slate-600">Full name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">Work email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldCls}
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">Country (drives calendar + entitlement)</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={fieldCls}>
            {policies.map((p) => (
              <option key={p.country} value={p.country}>
                {p.countryName} ({p.country}) — {p.annualMin}–{p.annualMax} days annual
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={!isManager}
            className={`${fieldCls} ${!isManager ? "text-slate-400" : ""}`}
          >
            <option value="EMPLOYEE">Employee</option>
            {isManager && <option value="SUPERVISOR">Supervisor</option>}
          </select>
          {!isManager && (
            <span className="text-xs text-slate-400">
              Supervisors can add employees only — ask a Manager to add supervisors.
            </span>
          )}
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">Team</span>
          {/* A Supervisor may only add to their own team, so the field is locked
              to it; a Manager picks from the teams that exist. */}
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            disabled={!isManager}
            className={`${fieldCls} ${!isManager ? "text-slate-400 bg-slate-50" : ""}`}
          >
            {(teams.length ? teams : [user.team]).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {!isManager && (
            <span className="text-xs text-slate-400">
              Supervisors add to their own team only.
            </span>
          )}
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">
            Annual entitlement{policy ? ` (${policy.annualMin}–${policy.annualMax} days)` : ""}
          </span>
          <input
            type="number"
            min={policy?.annualMin}
            max={policy?.annualMax}
            value={annualEntitlement}
            onChange={(e) => setAnnualEntitlement(e.target.value)}
            placeholder={policy ? `Default: ${policy.annualMin} (statutory minimum)` : ""}
            className={fieldCls}
          />
          {policy && (
            <span className="text-xs text-slate-400">
              Sick leave auto-set by policy: {policy.sickMc}d with MC, {policy.sickNoMc}d without.
              Values outside the range are clamped to it.
            </span>
          )}
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm text-slate-600">Temporary password (share securely with the new hire)</span>
          <div className="flex gap-2 mt-1">
            <input
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              className="flex-1 border border-slate-300 rounded-lg p-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={() => setTempPassword(genTempPassword())}
              className="text-sm bg-slate-100 hover:bg-slate-200 rounded-lg px-3 text-slate-600"
            >
              Regenerate
            </button>
          </div>
          <span className="text-xs text-slate-400">
            They can change it later via "Forgot password?" on the sign-in page.
          </span>
        </label>
      </div>

      {error && (
        <div className="mt-4 bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
          ⚠ {error}
        </div>
      )}

      {created && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
          <p className="font-medium">✓ {created.user.name} added</p>
          <p className="mt-1">
            {created.user.email} · {created.user.role} · {created.user.team} ·{" "}
            {created.policyApplied.countryName} calendar
          </p>
          <p className="mt-1">
            Temporary password: <span className="font-mono">{created.tempPassword}</span> — copy it
            now, it is not shown again.
          </p>
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !name.trim() || !email.trim() || !tempPassword}
          className="lf-btn lf-btn-primary"
        >
          {saving ? "Adding…" : "Add employee"}
        </button>
        <button type="button" onClick={onDone} className="lf-btn lf-btn-ghost">
          Done
        </button>
      </div>
    </div>
  );
}

function RequestCard({ req, isManager, onDecide, selected, onToggleSelect, setToast }) {
  const [ai3, setAi3] = useState(null);
  const [ack, setAck] = useState(false);
  const waitedHrs = hoursSince(req.stageEnteredAt || req.createdAt);
  // A cancellation request returns days and frees coverage, so it never needs a
  // coverage exception acknowledgement (UC-03).
  const isCancellation = !!req.cancellationRequested;
  // UC-03 (extended): a pending new end date means the employee wants to return
  // early, not to withdraw the leave entirely.
  const isEarlyReturn = isCancellation && !!req.pendingEndDate;
  const changeLabel = isEarlyReturn ? "Early return" : "Cancellation";
  const needsAck = isManager && req.flagged && !isCancellation;
  const locked = !String(req.status || "").startsWith("PENDING");

  // ── F3 / F4 modal state ──────────────────────────────────────────
  // confirmApprove  → ConfirmDialog (Yes/No approve)
  // rejectOpen      → RejectReasonModal (requires reason string)
  // actionLoading   → shared in-flight flag (disables buttons + modal close)
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const actionLock = useRef(false);

  // M3 AI assists (on-demand)
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftNote, setDraftNote] = useState(null); // { note, source, mode }
  const [explainLoading, setExplainLoading] = useState(false);
  const [statusExplain, setStatusExplain] = useState(null);

  // AI-3 summary is generated by the server per request
  useEffect(() => {
    http.get(`/ai/summary/${req.id}`).then((res) => setAi3(res.data));
  }, [req.id]);

  const fetchDraftNote = (mode) => {
    if (draftLoading) return;
    setDraftLoading(true);
    http
      .post("/ai/draft-note", { requestId: req.id, mode })
      .then((res) => {
        setDraftNote({ ...res.data, mode });
        toast.success("Draft note ready — copy/edit before you decide.");
      })
      .catch((err) => {
        toast.error(err.response?.data?.message || "Draft note unavailable.");
      })
      .finally(() => setDraftLoading(false));
  };

  const fetchExplainStatus = () => {
    if (explainLoading) return;
    setExplainLoading(true);
    http
      .post("/ai/explain-status", { requestId: req.id })
      .then((res) => {
        setStatusExplain(res.data);
      })
      .catch((err) => {
        toast.error(err.response?.data?.message || "Status explanation unavailable.");
      })
      .finally(() => setExplainLoading(false));
  };

  /** ConfirmDialog onConfirm → approve API; close modal only on success */
  const runApprove = () => {
    runSingleFlight(actionLock, async () => {
      setActionLoading(true);
      try {
        await onDecide(req.id, true, ack);
        setConfirmApprove(false);
      } catch (_) {
        /* toast already shown by parent; keep modal open so user can retry */
      } finally {
        setActionLoading(false);
      }
    });
  };

  /**
   * RejectReasonModal onConfirm(reason) → reject API with rejectionReason.
   * Passes the full queue `req` into the modal for the summary card.
   */
  const runReject = (reason) => {
    runSingleFlight(actionLock, async () => {
      setActionLoading(true);
      try {
        await onDecide(req.id, false, false, reason);
        setRejectOpen(false);
      } catch (_) {
        /* toast already shown by parent; keep modal open */
      } finally {
        setActionLoading(false);
      }
    });
  };

  return (
    <div className="lf-card-request">
      {/* request header */}
      <div className="p-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <label
            className="flex items-center pt-2 shrink-0"
            title={req.flagged ? "Requires individual coverage-exception review." : "Select for bulk action"}
          >
            <input
              type="checkbox"
              checked={!!selected}
              onChange={onToggleSelect}
              disabled={req.flagged}
              aria-label={
                req.flagged
                  ? `REQ-${req.id} requires individual coverage-exception review and cannot be bulk-selected`
                  : `Select REQ-${req.id} for bulk action`
              }
              className="w-4 h-4 accent-brand-700 rounded disabled:cursor-not-allowed disabled:opacity-40"
            />
          </label>
          <span className="w-10 h-10 rounded-full bg-lf-accent text-white flex items-center justify-center font-semibold shrink-0 shadow-sm">
            {req.employee?.initials}
          </span>
          <div>
            <p className="font-semibold text-lf-text">
              {req.employee?.name}{" "}
              <span className="font-normal text-lf-text-subtle text-sm">· REQ-{req.id}</span>
            </p>
            <p className="text-sm text-lf-text-muted">
              {typeLabel(req.leaveType)} · {fmt(req.startDate)}
              {req.endDate !== req.startDate ? ` → ${fmt(req.endDate)}` : ""} · {Number(req.days)}{" "}
              day(s){req.halfDay ? " (half-day)" : ""}
            </p>
            <p className="text-sm text-lf-text-muted mt-0.5">"{req.reason}"</p>
            {req.actingFor && (
              <span className="inline-block mt-1 text-xs lf-chip-indigo rounded-full px-2 py-0.5 font-medium">
                Acting for {req.actingFor.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`text-xs rounded-full px-2.5 py-1 ${statusChipClass(req)}`}>
            {isEarlyReturn
              ? "Early return request"
              : isCancellation
              ? "Cancellation request"
              : req.flagged
              ? "Flagged · special approval"
              : "Pending"}
          </span>
          <span
            className={`text-xs ${waitedHrs >= 24 ? "text-orange-600 font-medium" : "text-slate-400"}`}
          >
            Waiting {waitedHrs}h{waitedHrs >= 24 ? " · 24h reminder due" : ""}
          </span>
        </div>
      </div>

      {/* AI-3 summary card */}
      <div className="mx-5 mb-5 rounded-xl border border-brand-200/80 bg-lf-accent-soft p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-brand-900 text-sm">Approval summary</h4>
          <span className="text-xs bg-brand-200/80 text-brand-900 rounded-full px-2 py-0.5 font-medium">
            AI-3 · Approval Assistant
          </span>
        </div>

        {!ai3 ? (
          <p className="text-sm text-brand-800">Generating summary…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* pattern */}
            <div className="bg-lf-surface rounded-lg p-3 border border-lf-border/60 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-lf-text-subtle mb-1.5">
                12-month pattern
              </p>
              <ul className="space-y-1.5 text-sm text-lf-text">
                {ai3.patterns.map((p, i) => (
                  <li key={i}>• {p}</li>
                ))}
              </ul>
            </div>

            {/* coverage strip */}
            <div className="bg-lf-surface rounded-lg p-3 border border-lf-border/60 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-lf-text-subtle mb-1.5">
                Team coverage if approved
              </p>
              {ai3.coveragePerDay.length === 0 ? (
                <p className="text-sm text-slate-500">No working days in range.</p>
              ) : (
                <ul className="space-y-1.5">
                  {ai3.coveragePerDay.map((c) => (
                    <li key={c.date} className="flex items-center gap-2 text-sm">
                      <span className="w-20 shrink-0 text-slate-500 text-xs">{fmt(c.date)}</span>
                      <span className="flex gap-0.5">
                        {Array.from({ length: ai3.teamSize }).map((_, i) => (
                          <span
                            key={i}
                            className={`w-3 h-3 rounded-sm ${
                              i < c.present
                                ? "bg-emerald-500"
                                : c.present < ai3.minPresent
                                ? "bg-rose-400"
                                : "bg-slate-300"
                            }`}
                          />
                        ))}
                      </span>
                      <span
                        className={`text-xs ${
                          c.present < ai3.minPresent
                            ? "text-rose-600 font-medium"
                            : "text-slate-500"
                        }`}
                      >
                        {c.present}/{ai3.teamSize} present
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {ai3.conflicts.length > 0 && (
                <p className="text-xs text-rose-600 mt-2">
                  Also away:{" "}
                  {[...new Set(ai3.conflicts.flatMap((c) => c.offNames))].join(", ")}
                </p>
              )}
            </div>

            {/* recommendation */}
            <div className="bg-lf-surface rounded-lg p-3 flex flex-col border border-lf-border/60 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-lf-text-subtle mb-1.5">
                Recommendation
              </p>
              <span
                className={`self-start text-xs font-medium rounded-full border px-2.5 py-1 mb-2 ${recChipClass(
                  ai3.recommendation.action
                )}`}
              >
                {ai3.recommendation.label}
              </span>
              <p className="text-sm text-slate-700">{ai3.recommendation.rationale}</p>
              <p className="text-xs text-slate-400 mt-auto pt-2">
                Advisory only — the decision is always yours (no auto-approval).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* audit timeline */}
      <div className="mx-5 mb-4 text-xs text-slate-400 space-y-0.5">
        {(req.AuditLogs || []).map((t, i) => (
          <p key={i}>
            {new Date(t.createdAt).toLocaleString("en-SG", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            — {t.action} ({t.actorName})
          </p>
        ))}
      </div>

      {/* M3: comment thread */}
      <CommentThread requestId={req.id} locked={locked} setToast={setToast} />

      {/* M3 AI assist strip — draft notes & status explain (on-demand, advisory) */}
      <div className="mx-5 mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fetchDraftNote("approve")}
          disabled={draftLoading || locked}
          className="lf-btn lf-btn-outline lf-btn-sm text-xs"
          title="Draft an approval/endorsement note (you still decide)"
        >
          {draftLoading ? "Drafting…" : "AI draft approve note"}
        </button>
        <button
          type="button"
          onClick={() => fetchDraftNote("reject")}
          disabled={draftLoading || locked}
          className="lf-btn lf-btn-outline lf-btn-sm text-xs"
          title="Draft a rejection note (you still decide)"
        >
          AI draft reject note
        </button>
        <button
          type="button"
          onClick={fetchExplainStatus}
          disabled={explainLoading}
          className="lf-btn lf-btn-ghost lf-btn-sm text-xs"
          title="Explain why this request is still pending"
        >
          {explainLoading ? "Explaining…" : "Why still pending?"}
        </button>
      </div>
      {draftNote && (
        <div className="mx-5 mb-3 rounded-lg border border-brand-100 bg-brand-50/80 p-3 text-sm">
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-xs font-medium text-brand-900 uppercase tracking-wide">
              Draft {draftNote.mode} note · {draftNote.source}
            </span>
            <button
              type="button"
              className="text-xs text-brand-800 underline"
              onClick={() => {
                navigator.clipboard?.writeText(draftNote.note || "");
                toast.success("Copied draft note.");
              }}
            >
              Copy
            </button>
          </div>
          <p className="text-slate-700">{draftNote.note}</p>
          <p className="text-xs text-slate-400 mt-1">
            Paste into comments or rejection reason after review — AI never decides for you.
          </p>
        </div>
      )}
      {statusExplain && (
        <div className="mx-5 mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
            Status explanation · {statusExplain.source}
          </p>
          <p>{statusExplain.explanation}</p>
        </div>
      )}

      {/* UC-03: this pending item withdraws leave that was already approved */}
      {isCancellation && (
        <div className="mx-5 mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
          <p className="font-medium">
            {isEarlyReturn
              ? `${req.employee?.name} wants to come back early — ending this leave on ${fmt(req.pendingEndDate)} instead of ${fmt(req.endDate)}.`
              : `${req.employee?.name} is asking to cancel this approved leave.`}
          </p>
          <p className="text-xs mt-1">
            {isManager
              ? `Approving returns ${Number(req.days)} day(s) to their balance and marks the leave CANCELLED. Rejecting leaves the approved leave in place.`
              : "Endorsing sends the cancellation to the Manager. Rejecting leaves the approved leave in place."}
          </p>
        </div>
      )}

      {/* actions — open safety modals; never call API directly */}
      <div className="px-5 pb-5 flex flex-wrap items-center gap-3">
        {needsAck && (
          <label className="flex items-center gap-2 text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 w-full sm:w-auto">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="w-4 h-4 accent-orange-600"
            />
            I explicitly approve this coverage exception
          </label>
        )}
        <button
          type="button"
          onClick={() => setConfirmApprove(true)}
          disabled={(needsAck && !ack) || actionLoading}
          className="lf-btn lf-btn-primary"
        >
          {isCancellation
            ? isManager
              ? `Approve ${changeLabel.toLowerCase()} (final)`
              : `Endorse ${changeLabel.toLowerCase()} → Manager`
            : isManager
            ? req.flagged
              ? "Approve exception (final)"
              : "Approve (final)"
            : req.flagged
            ? "Endorse & escalate to Manager"
            : "Approve → route to Manager"}
        </button>
        <button
          type="button"
          onClick={() => setRejectOpen(true)}
          disabled={actionLoading}
          className="lf-btn lf-btn-danger"
        >
          Reject
        </button>
      </div>

      {/* F4: Yes/No confirmation before approve — accent primary only */}
      <ConfirmDialog
        open={confirmApprove}
        onClose={() => !actionLoading && setConfirmApprove(false)}
        onConfirm={runApprove}
        loading={actionLoading}
        variant="primary"
        icon="check"
        title={
          isCancellation
            ? isManager
              ? isEarlyReturn
                ? `End ${req.employee?.name}'s leave on ${fmt(req.pendingEndDate)}?`
                : `Cancel ${req.employee?.name}'s approved leave?`
              : `Endorse ${req.employee?.name}'s ${changeLabel.toLowerCase()}?`
            : isManager
            ? req.flagged
              ? `Approve coverage exception for ${req.employee?.name}?`
              : `Approve leave for ${req.employee?.name}?`
            : `Endorse ${req.employee?.name}'s request?`
        }
        message={
          isCancellation
            ? isManager
              ? `This is a final decision. The leave becomes CANCELLED and ${Number(req.days)} day(s) go back to their balance.`
              : "Your endorsement sends the cancellation to the Manager for the final decision."
            : isManager
            ? "This is a final decision. Balance will be deducted and the employee notified."
            : "Your approval routes this request to the Manager for the final decision."
        }
        confirmLabel={isManager ? "Yes, approve" : "Yes, endorse"}
        loadingLabel="Approving…"
        cancelLabel="Go back"
      />

      {/* F3: pass full `req` so the modal can render employee / type / dates / reason */}
      <RejectReasonModal
        open={rejectOpen}
        onClose={() => !actionLoading && setRejectOpen(false)}
        onConfirm={runReject}
        loading={actionLoading}
        request={req}
        confirmLabel="Reject request"
        loadingLabel="Rejecting…"
      />
    </div>
  );
}
