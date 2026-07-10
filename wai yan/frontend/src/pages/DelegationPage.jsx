import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import * as approvalService from '../services/approvalService';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/common/LoadingSpinner';

const inputClass =
  'min-h-[2.75rem] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

/**
 * UC-15: Approval Delegation / Acting Approver
 */
export default function DelegationPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    delegate_id: '',
    start_date: dayjs().format('YYYY-MM-DD'),
    end_date: dayjs().add(7, 'day').format('YYYY-MM-DD'),
  });

  const canCreate = ['supervisor', 'manager', 'hr_admin'].includes(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      const data = await approvalService.listDelegations();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load delegations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await approvalService.createDelegation({
        delegate_id: Number(form.delegate_id),
        start_date: form.start_date,
        end_date: form.end_date,
      });
      toast.success('Delegation created');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Create failed');
    }
  };

  const handleRevoke = async (id) => {
    try {
      await approvalService.revokeDelegation(id);
      toast.success('Delegation revoked');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Revoke failed');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="page-title">Approval delegation</h1>
        <p className="page-subtitle mt-1">
          UC-15 — Assign an acting approver while you are away
        </p>
      </div>

      {canCreate && (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            Create delegation
          </p>
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
              Delegate user ID (seed: 5 = Alice, 6 = Bob Lim)
            </label>
            <input
              type="number"
              required
              value={form.delegate_id}
              onChange={(e) => setForm((f) => ({ ...f, delegate_id: e.target.value }))}
              className={inputClass}
              placeholder="e.g. 5"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                Start
              </label>
              <input
                type="date"
                required
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                End
              </label>
              <input
                type="date"
                required
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
          <button
            type="submit"
            className="touch-target rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create
          </button>
        </form>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No delegations yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
          {items.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {d.delegator_name} → {d.delegate_name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {d.start_date} – {d.end_date} ·{' '}
                  {d.active ? (
                    <span className="text-green-700 dark:text-green-400">active</span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">revoked</span>
                  )}
                </p>
              </div>
              {d.active && (d.delegator_id === user?.id || user?.role === 'hr_admin') && (
                <button
                  type="button"
                  onClick={() => handleRevoke(d.id)}
                  className="touch-target shrink-0 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
