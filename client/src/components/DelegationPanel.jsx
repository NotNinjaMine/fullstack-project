import { useState, useEffect, useCallback, useRef } from "react";
import http from "../lib/http";
import { runSingleFlight } from "../lib/decisionFeedback";

const fieldCls = "lf-input";

export default function DelegationPanel({ setToast, onChanged }) {
  const [candidates, setCandidates] = useState([]);
  const [given, setGiven] = useState([]);
  const [toUserId, setToUserId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submitLock = useRef(false);
  const revokeLocks = useRef(new Set());

  const load = useCallback(() => {
    http.get("/delegation/candidates").then((res) => setCandidates(res.data)).catch(() => {});
    http.get("/delegation/mine").then((res) => setGiven(res.data.given || [])).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = () => {
    runSingleFlight(submitLock, async () => {
      setSaving(true);
      setError("");
      try {
        await http.post("/delegation", {
          toUserId: Number(toUserId),
          startDate,
          endDate,
          reason: reason.trim() || null,
        });
        setToast?.("Delegation created. Delegate has been notified.");
        setToUserId("");
        setStartDate("");
        setEndDate("");
        setReason("");
        load();
        onChanged?.();
      } catch (err) {
        setError(
          err.response?.data?.message ||
            (err.response?.data?.errors || []).join("; ") ||
            "Could not create delegation."
        );
      } finally {
        setSaving(false);
      }
    });
  };

  const revoke = async (id) => {
    if (revokeLocks.current.has(id)) return;
    revokeLocks.current.add(id);
    try {
      const res = await http.put(`/delegation/${id}/revoke`);
      setToast?.(res.data.message);
      load();
      onChanged?.();
    } catch (err) {
      setToast?.(err.response?.data?.message || "Revoke failed.");
    } finally {
      revokeLocks.current.delete(id);
    }
  };

  return (
    <div className="lf-card-static p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-lf-text">Delegate approvals</h3>
        <span className="text-xs bg-lf-accent-soft text-lf-accent rounded-full px-2 py-0.5 font-medium">
          Date window · auto-expires
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Hand your approval queue to another Supervisor or Manager for a date range. You can revoke
        early; expired windows stop automatically.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block sm:col-span-2">
          <span className="text-sm text-slate-600">Delegate to</span>
          <select
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
            className={fieldCls}
          >
            <option value="">Select an approver…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.role} · {c.team}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={fieldCls}
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">End date</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={fieldCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm text-slate-600">Reason (optional)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            className={fieldCls}
          />
        </label>
      </div>

      {error && (
        <div className="mt-4 bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
          ⚠ {error}
        </div>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !toUserId || !startDate || !endDate}
          className="lf-btn lf-btn-primary"
        >
          {saving ? "Saving…" : "Create delegation"}
        </button>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-4">
        <h4 className="text-sm font-semibold text-slate-700 mb-2">Your delegations</h4>
        {given.length === 0 ? (
          <p className="text-xs text-slate-400">None yet.</p>
        ) : (
          <ul className="space-y-2">
            {given.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2"
              >
                <div>
                  <span className="font-medium">{d.toUser?.name}</span>
                  <span className="text-slate-500">
                    {" "}
                    · {d.startDate} → {d.endDate}
                    {d.reason ? ` · ${d.reason}` : ""}
                  </span>
                  <span
                    className={`ml-2 text-xs rounded-full px-2 py-0.5 ${
                      d.effective
                        ? "bg-emerald-100 text-emerald-800"
                        : d.active
                        ? "bg-slate-200 text-slate-600"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {d.effective ? "Active" : d.active ? "Scheduled/expired" : "Revoked"}
                  </span>
                </div>
                {d.active && (
                  <button
                    type="button"
                    onClick={() => revoke(d.id)}
                    className="lf-btn lf-btn-danger lf-btn-sm !py-1 !px-2.5 text-xs"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
