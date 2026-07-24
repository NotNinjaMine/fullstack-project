import { Link } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import useLeave from "../hooks/useLeave";
import LoadingSpinner from "../components/common/LoadingSpinner";
import StatusBadge from "../components/common/StatusBadge";
import LeaveBalanceCard from "../components/employee/LeaveBalanceCard";
import { toISO, fmt } from "../lib/dates";
import { eligibleLeaveTypes } from "../lib/leaveTypes";

// Employee landing page: balance overview + upcoming requests (UC-01, UC-08)
export default function DashboardPage() {
  const { user } = useAuth();
  const { balances, requests, loading, pendingByType } = useLeave();

  if (loading) return <LoadingSpinner />;

  const today = toISO(new Date());
  const upcoming = requests
    .filter((r) => ["PENDING_SUPERVISOR", "PENDING_MANAGER", "APPROVED"].includes(r.status))
    .filter((r) => r.endDate >= today)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Welcome back, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-slate-500">
          {user.team} · {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
        </p>
      </div>

      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">📝</span>
          <div>
            <p className="font-medium text-teal-900">Planning time off?</p>
            <p className="text-sm text-teal-700">Head to Apply for leave to submit a new request.</p>
          </div>
        </div>
        <Link
          to="/apply"
          className="shrink-0 bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium rounded-lg px-4 py-2.5 whitespace-nowrap"
        >
          Apply for leave →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {eligibleLeaveTypes(user)
          .filter((t) => !t.uncapped)
          .map((t) => {
            const b = balances.find((x) => x.leaveType === t.id);
            if (!b) return null;
            return (
              <LeaveBalanceCard
                key={t.id}
                label={t.label}
                entitled={b.entitled}
                carried={b.carried}
                used={b.used}
                pending={pendingByType[t.id] || 0}
              />
            );
          })}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/calendar"
          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg px-5 py-2.5"
        >
          View team calendar
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Upcoming & pending requests</h2>
          <Link to="/history" className="text-sm text-teal-700 hover:underline">
            View all
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing upcoming — apply for leave to get started.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((r) => (
              <li key={r.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  {fmt(r.startDate)}
                  {r.endDate !== r.startDate ? ` – ${fmt(r.endDate)}` : ""}
                  <span className="text-slate-400"> · {Number(r.days)}d</span>
                </p>
                <StatusBadge status={r.status} flagged={r.flagged} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
