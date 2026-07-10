import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import * as userService from '../services/userService';
import { formatRole } from '../utils/constants';
import LoadingSpinner from '../components/common/LoadingSpinner';

function formFromUser(user) {
  return {
    phone: user?.phone || '',
    address: user?.address || user?.personal_address || '',
  };
}

export default function ProfilePage() {
  const { user, loading, refreshUser } = useAuth();
  const [form, setForm] = useState(() => formFromUser(user));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(formFromUser(user));
  }, [user]);

  if (loading && !user) return <LoadingSpinner label="Loading profile..." />;
  if (!user) return null;

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await userService.updateProfile({
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      });
      await refreshUser();
      toast.success('Contact details updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'min-h-[2.75rem] w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-indigo-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
  const readOnlyClass =
    'min-h-[2.75rem] w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300';

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 sm:space-y-6 xl:max-w-3xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-subtitle mt-1">
            Update your contact details. Employment and leave-policy details are managed by HR.
          </p>
        </div>
        <Link to="/" className="touch-target inline-flex items-center justify-center text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          ? Back to dashboard
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Employment record</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Info label="Employee ID" value={user.employee_id} className={readOnlyClass} />
          <Info label="System role" value={formatRole(user.role)} className={readOnlyClass} />
          <Info label="Work email" value={user.email} className={`${readOnlyClass} sm:col-span-2`} />
          <Info label="Department" value={user.department} className={readOnlyClass} />
          <Info label="Leave country" value={user.country_code} className={readOnlyClass} />
        </div>
      </section>

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Contact details</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor="phone">Phone</label>
          <input id="phone" type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+65 ?" className={inputClass} autoComplete="tel" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor="address">Address</label>
          <textarea id="address" rows={3} value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} placeholder="Home / mailing address" className={`${inputClass} min-h-[5.5rem]`} autoComplete="street-address" />
        </div>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Link to="/" className="touch-target inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</Link>
          <button type="submit" disabled={saving} className="touch-target rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving?' : 'Save contact details'}</button>
        </div>
      </form>
    </div>
  );
}

function Info({ label, value, className }) {
  return <div><p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">{label}</p><div className={className}>{value || '?'}</div></div>;
}
