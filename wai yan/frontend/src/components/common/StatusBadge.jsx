import { LEAVE_STATUSES } from '../../utils/constants';

/** Semantic status colors via design tokens (never hardcoded hex). */
const colorMap = {
  yellow:
    'bg-[var(--warning-muted)] text-[var(--warning)] ring-[color-mix(in_srgb,var(--warning)_35%,transparent)]',
  blue:
    'bg-[var(--accent-muted)] text-[var(--accent)] ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]',
  green:
    'bg-[var(--success-muted)] text-[var(--success)] ring-[color-mix(in_srgb,var(--success)_35%,transparent)]',
  red:
    'bg-[var(--danger-muted)] text-[var(--danger)] ring-[color-mix(in_srgb,var(--danger)_35%,transparent)]',
  orange:
    'bg-[var(--warning-muted)] text-[var(--warning)] ring-[color-mix(in_srgb,var(--warning)_35%,transparent)]',
  gray:
    'bg-[var(--surface-2)] text-[var(--text-dim)] ring-[var(--border)]',
};

const dotMap = {
  yellow: 'bg-[var(--warning)]',
  blue: 'bg-[var(--accent)]',
  green: 'bg-[var(--success)]',
  red: 'bg-[var(--danger)]',
  orange: 'bg-[var(--warning)]',
  gray: 'bg-[var(--text-dim)]',
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
