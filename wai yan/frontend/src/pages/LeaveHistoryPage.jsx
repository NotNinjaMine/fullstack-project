import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import * as leaveService from '../services/leaveService';
import * as dashboardService from '../services/dashboardService';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { LEAVE_TYPES } from '../utils/constants';

export default function LeaveHistoryPage() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [leaveType, setLeaveType] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = {};
        if (status) params.status = status;
        if (leaveType) params.leave_type = leaveType;
        const data = await leaveService.getMyLeaves(params);
        if (!cancelled) setLeaves(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) {
          toast.error(err.response?.data?.message || 'Failed to load leave history');
          setLeaves([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, leaveType]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">My leave history</h1>
          <p className="page-subtitle">Track status of all your requests</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                await dashboardService.exportMyLeaveCsv();
                toast.success('CSV downloaded');
              } catch (e) {
                toast.error(e.message || 'Export failed');
              }
            }}
            className="touch-target inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:flex-none"
          >
            Export CSV
          </button>
          <Link
            to="/leave/apply"
            className="touch-target inline-flex flex-1 items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 sm:flex-none"
          >
            Apply leave
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full min-h-[2.75rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:w-auto sm:min-w-[11rem]"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="supervisor_approved">Supervisor approved</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancel_pending">Cancel pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value)}
          className="w-full min-h-[2.75rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:w-auto sm:min-w-[11rem]"
        >
          <option value="">All types</option>
          {LEAVE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : leaves.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900 sm:p-10">
          <p className="font-medium text-slate-700 dark:text-slate-200">
            No leave requests found
          </p>
        </div>
      ) : (
        <>
          {/* ENH-6: stack as cards on mobile, table on md/lg+ */}
          <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {leaves.map((leave) => (
              <li key={leave.id}>
                <Link
                  to={`/leave/${leave.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99] hover:border-indigo-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold capitalize text-slate-900 dark:text-slate-100">
                      {leave.leave_type} leave
                    </p>
                    <StatusBadge status={leave.status} />
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {dayjs(leave.start_date).format('DD MMM')} –{' '}
                    {dayjs(leave.end_date).format('DD MMM YYYY')}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {leave.days_count} day{leave.days_count === 1 ? '' : 's'}
                    {leave.half_day_flag ? ` · half-day ${leave.half_day_period || ''}` : ''}
                    {leave.overlap_flag ? ' · overlap' : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:block">
            <div className="table-scroll">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Dates</th>
                    <th className="px-4 py-3">Days</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Flags</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {leaves.map((leave) => (
                    <tr
                      key={leave.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3 capitalize text-slate-900 dark:text-slate-100">
                        {leave.leave_type}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {dayjs(leave.start_date).format('DD MMM YYYY')} –{' '}
                        {dayjs(leave.end_date).format('DD MMM YYYY')}
                      </td>
                      <td className="px-4 py-3 dark:text-slate-200">{leave.days_count}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={leave.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {leave.overlap_flag && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                              Overlap
                            </span>
                          )}
                          {leave.half_day_flag && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              Half-day {leave.half_day_period}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/leave/${leave.id}`}
                          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
