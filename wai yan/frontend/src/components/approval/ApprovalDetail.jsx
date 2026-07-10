import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import * as approvalService from '../../services/approvalService';
import * as aiService from '../../services/aiService';
import StatusBadge from '../common/StatusBadge';
import { useAuth } from '../../hooks/useAuth';
import { formatRole } from '../../utils/constants';

/**
 * Review Request modal — premium dark enterprise layout.
 * @param {'view'|'approve'|'reject'} [initialAction='view']
 */
export default function ApprovalDetail({
  item,
  onClose,
  onDone,
  initialAction = 'view',
}) {
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [preferredAction, setPreferredAction] = useState(
    initialAction === 'approve' || initialAction === 'reject' ? initialAction : null
  );

  useEffect(() => {
    setPreferredAction(
      initialAction === 'approve' || initialAction === 'reject' ? initialAction : null
    );
    setNote('');
  }, [item?.id, initialAction]);

  if (!item) return null;

  const canAction =
    user?.role === 'supervisor' ||
    user?.role === 'manager' ||
    user?.role === 'employee';
  const showActionControls = canAction && user?.role !== 'hr_admin';
  const isIndividual = preferredAction === 'approve' || preferredAction === 'reject';
  const summary = item.ai_summary;
  const teamCount =
    typeof item.team_on_leave_count === 'number' ? item.team_on_leave_count : null;

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const result = await approvalService.approveRequest(item.id, note);
      let msg = 'Approval recorded';
      if (result.status === 'approved') msg = 'Request fully approved';
      else if (result.status === 'cancelled') msg = 'Cancellation fully approved';
      else if (result.status === 'supervisor_approved') msg = 'Supervisor approval recorded';
      else if (result.status === 'cancel_pending') msg = 'Cancel step approved';
      toast.success(msg);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Approve failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!note.trim()) {
      toast.error('A rejection note is required');
      return;
    }
    setSubmitting(true);
    try {
      await approvalService.rejectRequest(item.id, note.trim());
      toast.success('Request rejected');
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reject failed');
    } finally {
      setSubmitting(false);
    }
  };

  const riskBox = {
    low: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
    medium: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    high: 'border-red-500/30 bg-red-500/10 text-red-100',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4 md:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-request-title"
        className={[
          'flex w-full flex-col overflow-hidden',
          'max-h-[100dvh] rounded-t-2xl sm:max-h-[90dvh] sm:max-w-lg sm:rounded-2xl md:max-w-xl lg:max-w-2xl',
          'border border-slate-200 bg-white shadow-2xl',
          'dark:border-slate-700/80 dark:bg-[#1E293B]',
          'dark:shadow-[0_25px_80px_rgba(0,0,0,0.55)]',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700/80 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              Review request
            </p>
            <h2
              id="review-request-title"
              className="mt-0.5 truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50"
            >
              {item.applicant?.name || 'Applicant'}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              <span className="font-mono text-[13px]">
                {item.applicant?.employee_id || '—'}
              </span>
              {item.applicant?.department ? ` · ${item.applicant.department}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {isIndividual && (
            <div
              className={`rounded-xl border px-3.5 py-3 text-sm ${
                preferredAction === 'approve'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100'
                  : 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-100'
              }`}
            >
              <p className="font-medium">You are reviewing this request individually</p>
              <p className="mt-0.5 text-xs opacity-90">
                Preferred action: <strong className="capitalize">{preferredAction}</strong>
                {preferredAction === 'reject' ? ' — a note is required.' : '.'}
              </p>
            </div>
          )}

          {!isIndividual && showActionControls && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-[#0F172A]/60 dark:text-slate-300">
              <p className="font-medium text-slate-800 dark:text-slate-100">Review mode</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Check the details below, then Approve or Reject when ready.
              </p>
            </div>
          )}

          {/* Applicant profile */}
          <Section title="Applicant profile">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Full name" value={item.applicant?.name} />
              <Field label="Employee ID" value={item.applicant?.employee_id} mono />
              <Field label="Job title" value={item.applicant?.job_title} />
              <Field label="Department" value={item.applicant?.department} />
              <Field label="Office" value={item.applicant?.office_branch} />
              <Field label="Country" value={item.applicant?.country_code} />
              <Field label="Email" value={item.applicant?.email} className="sm:col-span-2" />
            </dl>
          </Section>

          {/* Leave details */}
          <Section title="Leave details">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={item.status || 'pending'} />
              {item.awaiting_role && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Awaiting {formatRole(item.awaiting_role)}
                </span>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Type" value={<span className="capitalize">{item.leave_type}</span>} />
              <Field
                label="Days"
                value={`${item.days_count}${item.half_day_flag ? ` · half-day ${item.half_day_period || ''}` : ''}`}
              />
              <Field
                label="Start"
                value={dayjs(item.start_date).format('DD MMM YYYY')}
              />
              <Field
                label="End"
                value={dayjs(item.end_date).format('DD MMM YYYY')}
              />
            </dl>
            {item.remarks && (
              <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-700/70 dark:bg-[#0F172A]/50">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Reason / remarks
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                  {item.remarks}
                </p>
              </div>
            )}
          </Section>

          {/* Team coverage */}
          <Section title="Team coverage">
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {item.overlap_flag ? (
                  <span className="rounded-lg bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200">
                    Overlap flagged
                  </span>
                ) : (
                  <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                    No overlap flag
                  </span>
                )}
                {teamCount != null && (
                  <span className="rounded-lg bg-slate-500/10 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {teamCount} team member{teamCount === 1 ? '' : 's'} on leave
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Coverage context helps you decide impact on the team for this date range.
              </p>
            </div>
          </Section>

          {/* AI recommendation */}
          {summary && (
            <section
              className={`rounded-2xl border p-4 ${
                riskBox[summary.risk_level] || riskBox.low
              } border-opacity-100 text-slate-800 dark:text-inherit`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold tracking-tight">
                  AI recommendation
                </h3>
                <span className="rounded-md bg-black/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide dark:bg-white/10">
                  Risk: {summary.risk_level}
                </span>
              </div>
              <ul className="list-inside list-disc space-y-1 text-xs opacity-95">
                {(summary.bullets || []).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              {summary.recommendation && (
                <p className="mt-2 text-sm font-medium">{summary.recommendation}</p>
              )}
              {summary.assistant_note && (
                <p className="mt-1 text-[11px] opacity-75">{summary.assistant_note}</p>
              )}
              <p className="mt-2 text-[10px] opacity-60">
                Source: {summary.generated_by || 'assistant'}
                {summary.fallback_reason ? ` · ${summary.fallback_reason}` : ''}
              </p>
            </section>
          )}

          {/* Note */}
          {showActionControls ? (
            <Section title="Decision note">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {preferredAction === 'reject'
                    ? 'Required for rejection'
                    : 'Optional for approval · required when rejecting'}
                </p>
                <div className="flex gap-3 text-xs">
                  <button
                    type="button"
                    disabled={drafting}
                    onClick={async () => {
                      setDrafting(true);
                      try {
                        const data = await aiService.draftApproverNote(item, 'approve');
                        setNote(data.note || '');
                        setPreferredAction('approve');
                        toast.success('Approve note drafted');
                      } catch (e) {
                        toast.error(e.response?.data?.message || 'Draft failed');
                      } finally {
                        setDrafting(false);
                      }
                    }}
                    className="font-medium text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
                  >
                    AI draft approve
                  </button>
                  <button
                    type="button"
                    disabled={drafting}
                    onClick={async () => {
                      setDrafting(true);
                      try {
                        const data = await aiService.draftApproverNote(item, 'reject');
                        setNote(data.note || '');
                        setPreferredAction('reject');
                        toast.success('Reject note drafted');
                      } catch (e) {
                        toast.error(e.response?.data?.message || 'Draft failed');
                      } finally {
                        setDrafting(false);
                      }
                    }}
                    className="font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                  >
                    AI draft reject
                  </button>
                </div>
              </div>
              <textarea
                id="note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  preferredAction === 'reject'
                    ? 'Required — reason for rejection'
                    : 'Add an optional note…'
                }
                className={[
                  'min-h-[5.5rem] w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition',
                  'bg-white text-slate-900 placeholder:text-slate-400',
                  'dark:bg-[#0F172A] dark:text-slate-100 dark:placeholder:text-slate-500',
                  preferredAction === 'reject'
                    ? 'border-red-400/60 focus:border-red-500 focus:ring-2 focus:ring-red-500/25'
                    : 'border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25 dark:border-slate-600',
                ].join(' ')}
              />
            </Section>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-[#0F172A]/50 dark:text-slate-300">
              View only — action is limited to the assigned supervisor/manager (or their
              delegate).
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-700/80 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          {showActionControls ? (
            <>
              <p className="text-center text-[11px] text-slate-400 sm:text-left">
                {isIndividual
                  ? 'Individual decision — not a bulk action'
                  : 'Confirm your decision'}
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setPreferredAction('reject');
                    handleReject();
                  }}
                  className={[
                    'touch-target rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50',
                    preferredAction === 'reject'
                      ? 'bg-[#EF4444] shadow-md shadow-red-900/30 ring-2 ring-red-400/50'
                      : 'bg-[#EF4444]/90 hover:bg-[#EF4444]',
                  ].join(' ')}
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setPreferredAction('approve');
                    handleApprove();
                  }}
                  className={[
                    'touch-target rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50',
                    preferredAction === 'approve'
                      ? 'bg-[#6366F1] shadow-md shadow-indigo-900/30 ring-2 ring-indigo-400/50'
                      : 'bg-[#6366F1] hover:bg-[#818cf8]',
                  ].join(' ')}
                >
                  Approve
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="touch-target ml-auto rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-700/70 dark:bg-[#0F172A]/35">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value, mono = false, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm text-slate-800 dark:text-slate-100 ${
          mono ? 'font-mono text-[13px]' : ''
        }`}
      >
        {value || '—'}
      </dd>
    </div>
  );
}
