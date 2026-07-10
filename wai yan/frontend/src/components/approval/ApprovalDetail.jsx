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
    low: 'border-[var(--success)]/30 bg-[var(--success-muted)] text-[var(--success)]',
    medium: 'border-[var(--warning)]/30 bg-[var(--warning-muted)] text-[var(--warning)]',
    high: 'border-[var(--danger)]/30 bg-[var(--danger-muted)] text-[var(--danger)]',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay)] p-0 backdrop-blur-[2px] sm:items-center sm:p-4 md:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-request-title"
        className={[
          'flex w-full flex-col overflow-hidden',
          'max-h-[100dvh] rounded-t-2xl sm:max-h-[90dvh] sm:max-w-lg sm:rounded-2xl md:max-w-xl lg:max-w-2xl',
          'border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-light)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">
              Review request
            </p>
            <h2
              id="review-request-title"
              className="mt-0.5 truncate text-lg font-semibold tracking-tight text-[var(--text)]"
            >
              {item.applicant?.name || 'Applicant'}
            </h2>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              <span className="font-mono text-[13px]">
                {item.applicant?.employee_id || '—'}
              </span>
              {item.applicant?.department ? ` · ${item.applicant.department}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--text-dim)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
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
                  ? 'border-[var(--success)]/30 bg-[var(--success-muted)] text-[var(--success)]'
                  : 'border-[var(--danger)]/30 bg-[var(--danger-muted)] text-[var(--danger)]'
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
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-sm text-[var(--text-muted)]">
              <p className="font-medium text-[var(--text)]">Review mode</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
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
                <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
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
              <div className="mt-3 rounded-xl border border-[var(--border-light)] bg-[var(--surface-2)] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-dim)]">
                  Reason / remarks
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text)]">
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
                  <span className="rounded-lg bg-[var(--warning-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--warning)]">
                    Overlap flagged
                  </span>
                ) : (
                  <span className="rounded-lg bg-[var(--success-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--success)]">
                    No overlap flag
                  </span>
                )}
                {teamCount != null && (
                  <span className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)]">
                    {teamCount} team member{teamCount === 1 ? '' : 's'} on leave
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                Coverage context helps you decide impact on the team for this date range.
              </p>
            </div>
          </Section>

          {/* AI recommendation */}
          {summary && (
            <section
              className={`rounded-2xl border p-4 ${
                riskBox[summary.risk_level] || riskBox.low
              }`}
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
                <p className="text-xs text-[var(--text-muted)]">
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
                    className="font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
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
                    className="font-medium text-[var(--danger)] hover:underline disabled:opacity-50"
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
                  'bg-[var(--surface)] text-[var(--text)] placeholder:text-[var(--text-dim)]',
                  preferredAction === 'reject'
                    ? 'border-[var(--danger)]/60 focus:border-[var(--danger)] focus:ring-2 focus:ring-[var(--danger-muted)]'
                    : 'border-[var(--border)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]',
                ].join(' ')}
              />
            </Section>
          ) : (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-sm text-[var(--text-muted)]">
              View only — action is limited to the assigned supervisor/manager (or their
              delegate).
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex shrink-0 flex-col gap-3 border-t border-[var(--border-light)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          {showActionControls ? (
            <>
              <p className="text-center text-[11px] text-[var(--text-dim)] sm:text-left">
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
                      ? 'bg-[var(--danger)] shadow-md ring-2 ring-[var(--danger)]/50'
                      : 'bg-[var(--danger)] opacity-90 hover:opacity-100',
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
                      ? 'bg-[var(--accent)] shadow-[var(--shadow-accent)] ring-2 ring-[var(--accent)]/50'
                      : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]',
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
              className="touch-target ml-auto rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-2)]"
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
    <section className="rounded-2xl border border-[var(--border-light)] bg-[var(--surface-2)]/50 p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value, mono = false, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-dim)]">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm text-[var(--text)] ${
          mono ? 'font-mono text-[13px]' : ''
        }`}
      >
        {value || '—'}
      </dd>
    </div>
  );
}
