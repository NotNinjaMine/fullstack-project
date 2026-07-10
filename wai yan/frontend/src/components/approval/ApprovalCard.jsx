import dayjs from 'dayjs';
import StatusBadge from '../common/StatusBadge';
import { formatRole } from '../../utils/constants';

function initials(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Approval list card — elevated surface, quick actions, click-to-review.
 */
export default function ApprovalCard({ item, onOpen }) {
  const openView = () => onOpen?.(item, 'view');
  const openApprove = (e) => {
    e.stopPropagation();
    onOpen?.(item, 'approve');
  };
  const openReject = (e) => {
    e.stopPropagation();
    onOpen?.(item, 'reject');
  };

  const dateRange = `${dayjs(item.start_date).format('DD MMM YYYY')} – ${dayjs(item.end_date).format('DD MMM YYYY')}`;
  const awaiting = item.awaiting_role
    ? `Awaiting ${formatRole(item.awaiting_role)}`
    : null;
  const teamCount =
    typeof item.team_on_leave_count === 'number' ? item.team_on_leave_count : null;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={openView}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openView();
        }
      }}
      className={[
        'group relative w-full cursor-pointer overflow-hidden rounded-2xl border text-left',
        'border-slate-200 bg-white shadow-sm',
        'dark:border-slate-700/80 dark:bg-[#1E293B] dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]',
        'p-5 sm:p-6',
        'transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-indigo-400/60 hover:shadow-lg',
        'dark:hover:border-indigo-500/50 dark:hover:shadow-[0_12px_40px_rgba(99,102,241,0.12)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
        'dark:focus-visible:ring-offset-[#0F172A]',
        'active:translate-y-0',
      ].join(' ')}
      aria-label={`Review leave request from ${item.applicant?.name || 'employee'}`}
    >
      {/* Left accent */}
      <div
        className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-indigo-500 to-violet-500 opacity-70 transition group-hover:opacity-100"
        aria-hidden
      />

      <div className="flex items-start gap-4 pl-1">
        <div
          className={[
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold',
            'bg-indigo-500/15 text-indigo-600 ring-1 ring-indigo-500/20',
            'dark:bg-indigo-500/20 dark:text-indigo-300 dark:ring-indigo-400/20',
          ].join(' ')}
        >
          {initials(item.applicant?.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-lg">
                {item.applicant?.name || 'Unknown employee'}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                <span className="font-mono text-[13px] text-slate-600 dark:text-slate-300">
                  {item.applicant?.employee_id || '—'}
                </span>
                {item.applicant?.department ? (
                  <span className="text-slate-400 dark:text-slate-500">
                    {' '}
                    · {item.applicant.department}
                  </span>
                ) : null}
                {item.applicant?.job_title ? (
                  <span className="text-slate-400 dark:text-slate-500">
                    {' '}
                    · {item.applicant.job_title}
                  </span>
                ) : null}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <StatusBadge status={item.status || 'pending'} />
              {awaiting && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {awaiting}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Meta grid */}
      <div className="mt-5 grid grid-cols-2 gap-3 pl-1 sm:grid-cols-4">
        <Meta label="Leave type">
          <span className="capitalize">{item.leave_type}</span>
          {item.half_day_flag ? (
            <span className="text-slate-400"> · half-day</span>
          ) : null}
        </Meta>
        <Meta label="Dates" className="sm:col-span-2">
          <span className="font-medium text-slate-900 dark:text-slate-100">{dateRange}</span>
        </Meta>
        <Meta label="Duration">
          <span className="font-semibold text-slate-900 dark:text-white">
            {item.days_count}
          </span>
          <span className="ml-1 text-slate-500 dark:text-slate-400">
            day{Number(item.days_count) === 1 ? '' : 's'}
          </span>
        </Meta>
      </div>

      {/* Tags */}
      <div className="mt-4 flex flex-wrap gap-2 pl-1">
        {item.overlap_flag && (
          <Chip tone="amber">Overlap flagged</Chip>
        )}
        {item.special_approval_flag && (
          <Chip tone="violet">Special approval</Chip>
        )}
        {teamCount != null && (
          <Chip tone="slate">
            <span className="mr-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-slate-700 px-1 text-[10px] font-bold text-white dark:bg-slate-200 dark:text-slate-900">
              {teamCount}
            </span>
            Team on leave
          </Chip>
        )}
      </div>

      {/* Footer */}
      <div
        className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 pl-1 dark:border-slate-700/80 sm:flex-row sm:items-center sm:justify-between"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 transition group-hover:gap-2.5 dark:text-indigo-400">
          Click to review
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/10 text-xs dark:bg-indigo-500/20">
            →
          </span>
        </span>

        <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            Quick action
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openApprove}
              className={[
                'touch-target inline-flex min-h-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-xl px-4',
                'text-sm font-semibold text-white',
                'bg-[#22C55E] shadow-sm shadow-emerald-900/20',
                'transition hover:bg-[#4ade80] active:scale-[0.98]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80',
                'sm:flex-none sm:min-w-[6.75rem]',
              ].join(' ')}
            >
              Approve
            </button>
            <button
              type="button"
              onClick={openReject}
              className={[
                'touch-target inline-flex min-h-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-xl px-4',
                'text-sm font-semibold text-white',
                'bg-[#EF4444] shadow-sm shadow-red-900/20',
                'transition hover:bg-[#f87171] active:scale-[0.98]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/80',
                'sm:flex-none sm:min-w-[6.75rem]',
              ].join(' ')}
            >
              Reject
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function Meta({ label, children, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 dark:border-slate-700/70 dark:bg-[#0F172A]/55 ${className}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm leading-snug text-slate-700 dark:text-slate-200">{children}</p>
    </div>
  );
}

function Chip({ children, tone = 'slate' }) {
  const tones = {
    amber:
      'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-200',
    violet:
      'bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-200',
    slate:
      'bg-slate-500/10 text-slate-700 ring-slate-500/20 dark:text-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
