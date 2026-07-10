import { LEAVE_STATUSES } from '../../utils/constants';

const colorMap = {
  yellow:
    'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-700',
  blue: 'bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:ring-sky-700',
  green:
    'bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-700',
  red: 'bg-red-100 text-red-900 ring-red-300 dark:bg-red-950 dark:text-red-100 dark:ring-red-700',
  orange:
    'bg-orange-100 text-orange-900 ring-orange-300 dark:bg-orange-950 dark:text-orange-100 dark:ring-orange-700',
  gray: 'bg-slate-100 text-slate-800 ring-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600',
};

const dotMap = {
  yellow: 'bg-amber-500',
  blue: 'bg-sky-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  gray: 'bg-slate-400',
};

export default function StatusBadge({ status }) {
  const meta = LEAVE_STATUSES[status] || {
    label: status || 'Unknown',
    color: 'gray',
  };
  const color = meta.color || 'gray';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset shadow-sm ${
        colorMap[color] || colorMap.gray
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotMap[color] || dotMap.gray}`}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}
