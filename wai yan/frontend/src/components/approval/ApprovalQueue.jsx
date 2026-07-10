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
          'border-[var(--border)] bg-[var(--surface-2)]',
          'dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        ].join(' ')}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-[var(--text)]">
                Bulk actions
              </h2>
              <span className="rounded-md bg-[var(--accent-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                UC-16
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Shared comment + multi-select.{' '}
              <span className="font-medium text-[var(--text)]">
                {selectedIds.length} selected
              </span>
            </p>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]"
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
              'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] placeholder:text-[var(--text-dim)]',
              'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]',
            ].join(' ')}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => runBulk('approve')}
              className={[
                'touch-target rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition',
                'bg-[var(--accent)] hover:bg-[var(--accent-hover)] active:scale-[0.98]',
                'disabled:opacity-50 shadow-[var(--shadow-accent)]',
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
                'bg-[var(--danger)] hover:opacity-90 active:scale-[0.98]',
                'disabled:opacity-50 shadow-sm',
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
                'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)]',
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
            <h2 className="text-sm font-semibold tracking-tight text-[var(--text)]">
              Pending requests
            </h2>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Click a card to open the review modal, or use Quick action for one request.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
            {items.length} pending
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)]/40 px-6 py-16 text-center">
            <p className="text-base font-medium text-[var(--text)]">
              Queue is clear
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
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
                    className="h-4 w-4 cursor-pointer rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)] bg-[var(--surface)]"
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
