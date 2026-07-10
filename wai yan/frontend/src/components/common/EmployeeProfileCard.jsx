import { Link } from 'react-router-dom';

/**
 * ENH-1: Full employee profile card.
 * Shows employee_id, job_title, office_branch, phone (+ extended fields).
 */
export default function EmployeeProfileCard({
  person,
  title = 'Employee profile',
  compact = false,
  className = '',
  showEditLink = false,
}) {
  if (!person) return null;

  const branchLabel = [person.office_branch, person.office_city, person.office_country]
    .filter(Boolean)
    .join(' · ');

  const fields = [
    { label: 'Employee ID', value: person.employee_id },
    { label: 'Full name', value: person.name },
    { label: 'Job title', value: person.job_title },
    { label: 'Department', value: person.department },
    { label: 'Role', value: person.role },
    { label: 'Work email', value: person.email },
    { label: 'Phone', value: person.phone },
    { label: 'Office branch', value: branchLabel || person.office_branch },
    { label: 'Leave country', value: person.country_code },
    {
      label: 'Personal address',
      value: person.personal_address || person.address,
      span: true,
    },
    { label: 'Company', value: person.company_name },
    {
      label: 'Company scale',
      value:
        person.company_staff_count != null
          ? `~${person.company_staff_count} staff · ${person.company_total_countries || '—'} countries · ${person.company_total_offices || '—'} offices`
          : null,
    },
    { label: 'Company address', value: person.company_address, span: true },
  ].filter((f) => f.value);

  if (compact) {
    return (
      <div
        className={`rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800/60 ${className}`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {title}
          </p>
          {showEditLink && (
            <Link
              to="/profile"
              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Edit
            </Link>
          )}
        </div>
        <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
          {person.name}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {[person.employee_id, person.job_title, person.department]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {branchLabel && (
          <p className="mt-0.5 text-xs text-indigo-700 dark:text-indigo-300">
            {branchLabel}
          </p>
        )}
        {person.phone && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {person.phone}
          </p>
        )}
      </div>
    );
  }

  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5 ${className}`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {title}
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-50">
            {person.name || '—'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {[person.job_title, person.department].filter(Boolean).join(' · ') ||
              '—'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {person.employee_id && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
              {person.employee_id}
            </span>
          )}
          {person.office_branch && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              {person.office_branch}
            </span>
          )}
          {person.role && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {String(person.role).replace(/_/g, ' ')}
            </span>
          )}
          {showEditLink && (
            <Link
              to="/profile"
              className="touch-target mt-1 inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200 dark:hover:bg-indigo-900"
            >
              Edit profile
            </Link>
          )}
        </div>
      </div>

      {/* ENH-1 highlight row: employee_id, job_title, office_branch, phone */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Highlight label="Employee ID" value={person.employee_id} mono />
        <Highlight label="Job title" value={person.job_title} />
        <Highlight label="Office branch" value={person.office_branch} />
        <Highlight label="Phone" value={person.phone} />
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.label} className={f.span ? 'sm:col-span-2' : ''}>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {f.label}
            </dt>
            <dd className="mt-0.5 break-words text-sm text-slate-800 dark:text-slate-200">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Highlight({ label, value, mono }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={`mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-slate-100 ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value || '—'}
      </p>
    </div>
  );
}
