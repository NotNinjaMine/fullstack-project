import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import * as leaveService from '../services/leaveService';
import * as aiService from '../services/aiService';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmployeeProfileCard from '../components/common/EmployeeProfileCard';
import { useAuth } from '../hooks/useAuth';
import { ConfirmDialog } from '../components/ui';

export default function LeaveDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [leave, setLeave] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [aiExplain, setAiExplain] = useState('');
  const [explainBusy, setExplainBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await leaveService.getLeaveById(id);
      setLeave(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Leave not found');
      navigate('/leave');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isOwner =
    leave?.applicant?.id === user?.id || leave?.user_id === user?.id;
  // Backend allows owner or HR admin (matches frontend-api-integration RBAC table)
  const canCancel =
    leave &&
    (isOwner || user?.role === 'hr_admin') &&
    !['cancelled', 'rejected', 'cancel_pending'].includes(leave.status);

  const requestCancelConfirm = () => {
    if (!reason.trim()) {
      toast.error('Please provide a cancellation reason');
      return;
    }
    setConfirmOpen(true);
  };

  const handleCancel = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a cancellation reason');
      return;
    }
    setCancelling(true);
    try {
      const result = await leaveService.cancelLeave(leave.id, reason.trim());
      toast.success(
        result.status === 'cancel_pending'
          ? 'Cancellation submitted for approval'
          : 'Leave cancelled'
      );
      setConfirmOpen(false);
      await load();
      setReason('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!leave) return null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-6 xl:max-w-4xl">
      <div className="flex items-center gap-3">
        <Link
          to="/leave"
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← Back
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold capitalize text-slate-900 dark:text-slate-50">
              {leave.leave_type} leave
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Request #{leave.id}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={leave.status} />
            <button
              type="button"
              disabled={explainBusy}
              onClick={async () => {
                setExplainBusy(true);
                try {
                  const data = await aiService.explainLeaveStatus({ leave_id: leave.id });
                  setAiExplain(data.explanation || '');
                } catch (e) {
                  toast.error(e.response?.data?.message || 'AI explain failed');
                } finally {
                  setExplainBusy(false);
                }
              }}
              className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
            >
              {explainBusy ? 'Explaining…' : 'Explain status with AI'}
            </button>
          </div>
        </div>
        {aiExplain && (
          <p className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100">
            {aiExplain}
          </p>
        )}

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Start" value={dayjs(leave.start_date).format('DD MMM YYYY')} />
          <Field label="End" value={dayjs(leave.end_date).format('DD MMM YYYY')} />
          <Field label="Days" value={leave.days_count} />
          <Field
            label="Half day"
            value={
              leave.half_day_flag ? `Yes (${leave.half_day_period || '—'})` : 'No'
            }
          />
          <Field label="Supervisor status" value={leave.supervisor_status} />
          <Field label="Manager status" value={leave.manager_status} />
          <Field label="Supervisor note" value={leave.supervisor_note || '—'} />
          <Field label="Manager note" value={leave.manager_note || '—'} />
          <Field
            label="Flags"
            value={[
              leave.overlap_flag ? 'Overlap' : null,
              leave.special_approval_flag ? 'Special approval' : null,
            ]
              .filter(Boolean)
              .join(', ') || 'None'}
          />
          <Field
            label="Submitted"
            value={dayjs(leave.created_at).format('DD MMM YYYY HH:mm')}
          />
        </dl>

        {leave.remarks && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Remarks
            </p>
            <p className="mt-1">{leave.remarks}</p>
          </div>
        )}
      </div>

      <EmployeeProfileCard
        person={leave.applicant}
        title="Applicant — company, branch & contact"
      />

      {canCancel && (
        <div className="rounded-xl border border-red-100 bg-white p-6 shadow-sm dark:border-red-900 dark:bg-slate-900">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">
            Cancel this request
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Pending requests cancel immediately. Approved / supervisor-approved leave goes
            through cancel approval.
          </p>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for cancellation"
            className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-red-400 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            disabled={cancelling}
            onClick={requestCancelConfirm}
            className="touch-target mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {cancelling ? 'Submitting...' : 'Request cancellation'}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={
          leave.status === 'pending'
            ? 'Cancel this leave request?'
            : 'Request cancellation of this approved leave?'
        }
        message={
          leave.status === 'pending'
            ? 'This pending request will be cancelled immediately.'
            : 'A cancellation request will be sent for approval. Your leave stays active until approved.'
        }
        confirmLabel={leave.status === 'pending' ? 'Cancel leave' : 'Request cancel'}
        variant="danger"
        loading={cancelling}
        onCancel={() => { if (!cancelling) setConfirmOpen(false); }}
        onConfirm={handleCancel}
      />
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 capitalize text-slate-800 dark:text-slate-200">{value}</dd>
    </div>
  );
}
