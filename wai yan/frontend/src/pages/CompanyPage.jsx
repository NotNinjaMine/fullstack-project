import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as dashboardService from '../services/dashboardService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import HrCompanyEditPanel from '../components/company/HrCompanyEditPanel';
import { useAuth } from '../hooks/useAuth';
import { FLAG } from '../utils/company';
import { ROLES } from '../utils/constants';

/**
 * Company directory + HR edit panel for multi-country office details.
 */
export default function CompanyPage() {
  const { user } = useAuth();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const isHr = user?.role === ROLES.HR_ADMIN;

  const load = useCallback(async () => {
    try {
      const data = await dashboardService.getCompany({
        year: new Date().getFullYear(),
      });
      setCompany(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load company');
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (loading) return <LoadingSpinner label="Loading company..." />;
  if (!company) return null;

  const year = company.public_holidays?.year || new Date().getFullYear();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-6 2xl:max-w-6xl 3xl:max-w-7xl">
      <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-4 text-white shadow-lg sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-white/80">
          Company profile
        </p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{company.name}</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/90">{company.description}</p>
        <p className="mt-3 text-xs text-white/70">
          UEN / Reg. No. {company.reg_no} · HQ {company.hq_country} ·{' '}
          {company.timezone_primary}
          {company.updated_at
            ? ` · Last updated ${new Date(company.updated_at).toLocaleString()}`
            : ''}
        </p>
      </div>

      {isHr && (
        <HrCompanyEditPanel
          company={company}
          onSaved={async () => {
            setLoading(true);
            await load();
          }}
        />
      )}

      {!isHr && (
        <p className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-4 py-3 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
          Office addresses and company details are managed by HR Admin. Contact HR to request
          updates.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Company name" value={company.short_name || company.name} />
        <StatCard
          label="Approx. staff"
          value={`~${company.staff_count}`}
          hint="Across all offices"
        />
        <StatCard
          label="Total countries"
          value={company.total_countries}
          hint="Office locations"
        />
        <StatCard
          label={`Public holidays ${year}`}
          value={company.public_holidays?.total ?? '—'}
          hint="All countries combined"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Headquarters</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{company.hq_address}</p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Leave day-count excludes weekends and the employee’s local public holidays (by
          country code on their profile).
        </p>
        <Link
          to="/approvals/calendar"
          className="mt-3 inline-block text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Open multi-country public holiday calendar →
        </Link>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              {company.total_offices} offices · {company.total_countries} countries
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {(company.countries || []).map((c) => c.name).join(' · ') ||
                'Multi-country office network'}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
          {(company.offices || []).map((o) => (
            <article
              key={o.code}
              className={`rounded-xl border bg-white dark:bg-slate-900 p-4 shadow-sm ${
                o.is_hq ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-50">
                    {o.flag || FLAG[o.code]} {o.branch}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {o.city}
                    {o.city && o.country ? ', ' : ''}
                    {o.country} ({o.code})
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {o.is_hq && (
                    <span className="rounded-full bg-indigo-100 dark:bg-indigo-950 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-800 dark:text-indigo-200">
                      HQ
                    </span>
                  )}
                  <span className="rounded-full bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:text-rose-200">
                    {o.public_holidays_this_year || 0} PH · {year}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {o.address || 'No address set — HR can add this in the edit panel.'}
              </p>
              {(o.phone || o.email) && (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {[o.phone, o.email].filter(Boolean).join(' · ')}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Approx. headcount: {o.approx_staff} staff
              </p>
              {o.notes && (
                <p className="mt-1 text-[11px] italic text-slate-400">{o.notes}</p>
              )}
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-rose-100 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40/50 dark:bg-rose-950/30 p-5">
        <h2 className="font-bold text-rose-950">Public holidays by country ({year})</h2>
        <p className="mt-1 text-xs text-rose-900 dark:text-rose-100/70">
          Used when calculating leave working days for staff in that country. Years 2025–2045
          load on demand: database first, then free online API only if missing.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(company.countries || []).map((c) => (
            <span
              key={c.code}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-medium text-slate-800 dark:text-slate-100"
            >
              {c.flag || FLAG[c.code]} {c.name}
              <span className="font-bold text-rose-700 dark:text-rose-300">
                {company.public_holidays?.by_country?.[c.code] ?? 0}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-lg font-bold text-slate-900 dark:text-slate-50 sm:text-xl">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}
