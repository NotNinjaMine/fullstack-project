import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { canAccessApprovals, formatRole } from '../utils/constants';
import * as dashboardService from '../services/dashboardService';
import * as leaveService from '../services/leaveService';
import * as aiService from '../services/aiService';
import StatusBadge from '../components/common/StatusBadge';
import NotificationList from '../components/notifications/NotificationList';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmployeeProfileCard from '../components/common/EmployeeProfileCard';
import LeaveBalanceChart from '../components/leave/LeaveBalanceChart';

export default function DashboardPage() {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const [summary, setSummary] = useState(null);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiCoverage, setAiCoverage] = useState('');
  const [policyQ, setPolicyQ] = useState('');
  const [policyA, setPolicyA] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await dashboardService.getDashboardSummary();
        if (!cancelled) setSummary(data);

        // ENH-4: GET /api/leave/balance (raw + ai_summary)
        try {
          const bal = await leaveService.getLeaveBalance();
          if (!cancelled) setLeaveBalance(bal);
        } catch {
          // Fallback to summary.balance if dedicated endpoint unavailable
          if (!cancelled && data?.balance) {
            setLeaveBalance({ ...data.balance, ai_summary: null });
          }
        }

        if (canAccessApprovals(user?.role)) {
          try {
            const cov = await aiService.getCoverageBrief();
            if (!cancelled) setAiCoverage(cov.brief || '');
          } catch {
            /* ignore */
          }
        }
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  // Prefer dedicated balance endpoint; fall back to dashboard summary
  const balance = leaveBalance || summary?.balance;
  const aiBalance = leaveBalance?.ai_summary || null;
  const counts = summary?.my_leave_counts;
  const away = summary?.whos_away_this_week?.people || [];
  const isApprover = canAccessApprovals(user?.role);

  const runExport = async (fn, label) => {
    try {
      await fn();
      toast.success(`${label} downloaded`);
    } catch (e) {
      toast.error(e.message || 'Export failed');
    }
  };

  const exportLeave = () => runExport(dashboardService.exportMyLeaveCsv, 'Leave CSV');
  const exportApprovals = () =>
    runExport(dashboardService.exportApprovalsCsv, 'Approvals CSV');
  const exportSummary = () =>
    runExport(dashboardService.exportSummaryCsv, 'Dashboard summary CSV');
  const exportAway = () =>
    runExport(dashboardService.exportWhosAwayCsv, "Who's away CSV");

  if (loading) return <LoadingSpinner label="Loading dashboard..." />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Welcome, {user?.name}</h1>
          <p className="page-subtitle mt-0.5 break-words">
            {[
              user?.employee_id,
              formatRole(user?.role),
              user?.job_title,
              user?.department,
              user?.office_branch,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="scroll-x-hide flex gap-2 pb-0.5 sm:flex-wrap">
          <Link
            to="/profile"
            className="touch-target shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200 sm:text-sm"
          >
            Edit profile
          </Link>
          <button
            type="button"
            onClick={exportSummary}
            className="touch-target shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white sm:text-sm"
          >
            Export summary
          </button>
          <button
            type="button"
            onClick={exportLeave}
            className="touch-target shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:text-sm"
          >
            My leave CSV
          </button>
          <button
            type="button"
            onClick={exportAway}
            className="touch-target shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:text-sm"
          >
            Who&apos;s away
          </button>
          {isApprover && (
            <button
              type="button"
              onClick={exportApprovals}
              className="touch-target shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:text-sm"
            >
              Approvals CSV
            </button>
          )}
        </div>
      </div>

      {/* ENH-1: Full employee profile (employee_id, job_title, office_branch, phone) */}
      <EmployeeProfileCard
        person={user}
        title="Your company profile"
        compact={false}
        showEditLink
      />

      {summary?.company && (
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 p-4 shadow-sm dark:border-indigo-900 dark:from-indigo-950/60 dark:to-violet-950/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                Your organisation
              </p>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                {summary.company.name}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                ~{summary.company.staff_count} staff · {summary.company.total_countries}{' '}
                countries · {summary.company.total_offices} offices ·{' '}
                {summary.company.public_holidays_total} public holidays this year
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                HQ: {summary.company.hq_country}
                {summary.company.hq_address ? ` · ${summary.company.hq_address}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/company"
                className="touch-target rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Company & offices
              </Link>
              <Link
                to="/approvals/calendar"
                className="touch-target rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-slate-800"
              >
                Public holidays calendar
              </Link>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(summary.company.countries || []).map((c) => (
              <span
                key={c.code}
                className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-200 dark:ring-slate-600"
              >
                {c.flag} {c.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ENH-4: AI balance summary card above balance numbers */}
      {aiBalance && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
            AI balance summary
          </p>
          <p className="mt-1 leading-relaxed">{aiBalance}</p>
        </div>
      )}

      {/* Balance cards — ENH-6: 1-col mobile → 2 tablet → 3/4 desktop */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
        <BalanceCard
          title="Annual leave"
          remaining={balance?.annual_balance}
          total={balance?.annual_entitlement}
          used={balance?.annual_used}
          pct={balance?.annual_pct_remaining}
          accent="indigo"
        />
        <BalanceCard
          title="Sick leave"
          remaining={balance?.sick_balance}
          total={null}
          used={null}
          pct={null}
          accent="rose"
          subtitle="Days remaining this year"
        />
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 to-indigo-900 p-4 text-white shadow-sm dark:border-slate-700">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-200">
            Carry forward
          </p>
          <p className="mt-2 text-3xl font-bold">{balance?.carried_forward ?? 0}</p>
          <p className="mt-1 text-xs text-indigo-200">
            Days brought into {balance?.year}
          </p>
        </div>
      </div>

      {/* ENH-7a: Pie charts */}
      <LeaveBalanceChart balance={balance} />

      {/* Stats row */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-4 3xl:grid-cols-5">
        <StatCard label="My requests" value={counts?.total ?? 0} />
        <StatCard label="In progress" value={counts?.pending ?? 0} accent="amber" />
        <StatCard label="Approved" value={counts?.approved ?? 0} accent="green" />
        <StatCard
          label="Unread alerts"
          value={summary?.unread_notifications ?? unreadCount}
          accent="indigo"
        />
      </div>

      {/* Manager command center */}
      {isApprover && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/30 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-indigo-950 dark:text-indigo-100">
              Manager command center
            </h2>
            <Link
              to="/approvals"
              className="text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300"
            >
              Open queue →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat
              label="Pending your action"
              value={summary?.pending_approvals ?? 0}
              tone="amber"
            />
            <MiniStat
              label="High-risk (AI / special)"
              value={summary?.high_risk_pending ?? 0}
              tone="red"
            />
            <MiniStat label="Team away (7 days)" value={away.length} tone="slate" />
          </div>
          {aiCoverage && (
            <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm text-indigo-950 dark:bg-slate-900/60 dark:text-indigo-100">
              <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                AI coverage brief:{' '}
              </span>
              {aiCoverage}
            </p>
          )}
        </div>
      )}

      {/* AI policy Q&A */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">
          Ask AI about leave policy
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Grounded answers about two-tier approval, balances, and half-day rules
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={policyQ}
            onChange={(e) => setPolicyQ(e.target.value)}
            placeholder="e.g. When is my balance deducted?"
            className="min-h-[2.75rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            disabled={aiBusy || !policyQ.trim()}
            onClick={async () => {
              setAiBusy(true);
              try {
                const data = await aiService.askPolicyQuestion(policyQ.trim());
                setPolicyA(data.answer || '');
              } catch (e) {
                toast.error(e.response?.data?.message || 'AI request failed');
              } finally {
                setAiBusy(false);
              }
            }}
            className="touch-target rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {aiBusy ? 'Thinking…' : 'Ask'}
          </button>
        </div>
        {policyA && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-200">
            {policyA}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-5 lg:col-span-1">
          <h2 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">
            Quick actions
          </h2>
          <div className="flex flex-col gap-2">
            <Link
              to="/leave/apply"
              className="touch-target rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-indigo-700"
            >
              Apply for leave
            </Link>
            <Link
              to="/leave"
              className="touch-target rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              View leave history
            </Link>
            <Link
              to="/profile"
              className="touch-target rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Edit my profile
            </Link>
            <Link
              to="/approvals/calendar"
              className="touch-target rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Team calendar
            </Link>
            {isApprover && (
              <Link
                to="/approvals"
                className="touch-target rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-center text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
              >
                Approval queue
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                Who&apos;s away this week
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {summary?.whos_away_this_week?.start_date} →{' '}
                {summary?.whos_away_this_week?.end_date}
              </p>
            </div>
            <Link
              to="/approvals/calendar"
              className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Calendar
            </Link>
          </div>
          {away.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Nobody in your scope is on leave this week.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {away.slice(0, 8).map((p) => (
                <li
                  key={`${p.leave_id}-${p.user_id}`}
                  className="flex items-center gap-3 py-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
                    {p.name
                      ?.split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {p.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {p.department || '—'} · {p.leave_type} ·{' '}
                      {dayjs(p.start_date).format('DD MMM')} –{' '}
                      {dayjs(p.end_date).format('DD MMM')}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">
            Latest notifications
          </h2>
          <Link
            to="/notifications"
            className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          >
            View all
          </Link>
        </div>
        <NotificationList limit={5} />
      </div>
    </div>
  );
}

function BalanceCard({ title, remaining, total, used, pct, accent = 'indigo', subtitle }) {
  const bar =
    accent === 'rose'
      ? 'bg-rose-500'
      : accent === 'indigo'
        ? 'bg-indigo-500'
        : 'bg-slate-500';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-50">
        {remaining ?? 0}
        {total != null && (
          <span className="text-lg font-medium text-slate-400"> / {total}</span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {subtitle ||
          (used != null ? `${used} used · ${pct ?? 0}% remaining` : 'Days remaining')}
      </p>
      {total != null && total > 0 && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full rounded-full ${bar} transition-all`}
            style={{ width: `${Math.min(100, pct ?? 0)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent = 'slate' }) {
  const accents = {
    slate: 'text-slate-900 dark:text-slate-50',
    amber: 'text-amber-600 dark:text-amber-400',
    green: 'text-green-600 dark:text-green-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-3xl font-bold ${accents[accent]}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value, tone = 'slate' }) {
  const tones = {
    amber: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
    red: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100',
    slate: 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100',
  };
  return (
    <div className={`rounded-lg px-3 py-3 ${tones[tone]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
