import StatusBadge from "../common/StatusBadge";
import { fmt } from "../../lib/dates";
import { leaveTypeLabel } from "../../lib/leaveTypes";

const CANCELLABLE = ["PENDING_SUPERVISOR", "PENDING_MANAGER"];

// Paginated-ready table of past requests (UC-08); cancellation per UC-03
export default function LeaveHistoryTable({ requests, onCancel }) {
  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-10 text-center text-slate-400">
        <p className="text-3xl mb-2">🗂️</p>
        <p className="font-medium text-slate-500">No requests yet</p>
        <p className="text-sm">Your submitted leave will appear here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <ul className="divide-y divide-slate-100">
        {requests.map((r) => (
          <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                {leaveTypeLabel(r.leaveType)} · {fmt(r.startDate)}
                {r.endDate !== r.startDate ? ` – ${fmt(r.endDate)}` : ""}{" "}
                {r.halfDay ? `(${r.halfDayPeriod} half-day)` : ""}
                <span className="text-slate-400 font-normal"> · {Number(r.days)}d</span>
              </p>
              <p className="text-xs text-slate-500">
                REQ-{r.id} · {r.reason}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={r.status} flagged={r.flagged} />
              {CANCELLABLE.includes(r.status) && (
                <button
                  onClick={() => onCancel(r.id)}
                  className="text-xs text-rose-600 hover:text-rose-700 underline"
                >
                  Cancel
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
