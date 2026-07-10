import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as approvalService from '../../services/approvalService';
import * as dashboardService from '../../services/dashboardService';
import LoadingSpinner from '../common/LoadingSpinner';
import ApprovalCard from './ApprovalCard';
import ApprovalDetail from './ApprovalDetail';

/**
 * Approval queue list + bulk toolbar.
 * Design: enterprise dark SaaS (Linear / Vercel inspired).
 */
export default function ApprovalQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState(null);
  const [checked, setChecked] = useState({});
  const [bulkNote, setBulkNote] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await approvalService.getPendingApprovals({ status: 'pending' });
      setItems(Array.isArray(data) ? data : []);
      setChecked({});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load approvals');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selectedIds = Object.entries(checked)
    .filter(([, v]) => v)
    .map(([k]) => Number(k));

  const toggle = (id) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAll = () => {
    if (selectedIds.length === items.length) {
      setChecked({});
      return;
    }
    const next = {};
    items.forEach((i) => {
      next[i.id] = true;
    });
    setChecked(next);
  };

  const openReview = (item, mode = 'view') => setReview({ item, mode });
  const closeReview = () => setReview(null);

  const runBulk = async (action) => {
    if (selectedIds.length === 0) {
      toast.error('Select at least one request');
      return;
    }
    if (action === 'reject' && !bulkNote.trim()) {
      toast.error('Bulk reject requires a note');
      return;
    }
    setBulkBusy(true);
    try {
      const result = await approvalService.bulkAction({
        action,
        ids: selectedIds,
        note: bulkNote,
      });
      toast.success(`Bulk ${action}: ${result.succeeded} ok, ${result.failed} failed`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk action failed');
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading approval queue..." />;

  return (
    <div className="space-y-8">
      {/* Bulk actions — visually distinct toolbar */}
      <section
        className={[
          'rounded-2xl border p-5 sm:p-6',
          'border-slate-200 bg-slate-50',
          'dark:border-slate-700/80 dark:bg-[#1E293B]/70',
          'dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        ].join(' ')}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                Bulk actions
              </h2>
              <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">
                UC-16
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Shared comment + multi-select.{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {selectedIds.length} selected
              </span>
            </p>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              {selectedIds.length === items.length ? 'Clear selection' : 'Select all'}
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            type="text"
            value={bulkNote}
            onChange={(e) => setBulkNote(e.target.value)}
            placeholder="Shared comment (required for bulk reject)"
            className={[
              'min-h-[2.75rem] flex-1 rounded-xl border px-3.5 py-2.5 text-sm outline-none transition',
              'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400',
              'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30',
              'dark:border-slate-600 dark:bg-[#0F172A] dark:text-slate-100 dark:placeholder:text-slate-500',
              'dark:focus:border-indigo-500',
            ].join(' ')}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => runBulk('approve')}
              className={[
                'touch-target rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition',
                'bg-[#6366F1] hover:bg-[#818cf8] active:scale-[0.98]',
                'disabled:opacity-50 shadow-sm shadow-indigo-900/20',
              ].join(' ')}
            >
              Bulk Approve
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => runBulk('reject')}
              className={[
                'touch-target rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition',
                'bg-[#EF4444] hover:bg-[#f87171] active:scale-[0.98]',
                'disabled:opacity-50 shadow-sm shadow-red-900/20',
              ].join(' ')}
            >
              Bulk Reject
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await dashboardService.exportApprovalsCsv();
                  toast.success('CSV downloaded');
                } catch (e) {
                  toast.error(e.message || 'Export failed');
                }
              }}
              className={[
                'touch-target rounded-xl border px-4 py-2.5 text-sm font-semibold transition',
                'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                'dark:border-slate-600 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800/80',
              ].join(' ')}
            >
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {/* Individual list */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Pending requests
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Click a card to open the review modal, or use Quick action for one request.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            {items.length} pending
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-16 text-center dark:border-slate-700 dark:bg-[#1E293B]/40">
            <p className="text-base font-medium text-slate-800 dark:text-slate-100">
              Queue is clear
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              No leave requests are waiting for your action.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 sm:gap-4">
                <div className="flex shrink-0 flex-col items-center pt-6">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-500 focus:ring-indigo-500 dark:border-slate-600 dark:bg-[#0F172A]"
                    checked={Boolean(checked[item.id])}
                    onChange={() => toggle(item.id)}
                    aria-label={`Select request ${item.id} for bulk action`}
                    title="Select for bulk"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <ApprovalCard item={item} onOpen={openReview} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {review && (
        <ApprovalDetail
          item={review.item}
          initialAction={review.mode}
          onClose={closeReview}
          onDone={() => {
            closeReview();
            load();
          }}
        />
      )}
    </div>
  );
}
