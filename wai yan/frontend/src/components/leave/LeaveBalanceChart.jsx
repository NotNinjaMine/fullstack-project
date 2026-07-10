import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useTheme } from '../../hooks/useTheme';

const ANNUAL_COLORS = {
  used: '#6366f1', // indigo-500
  remaining: '#34d399', // emerald-400
};
const SICK_COLORS = {
  used: '#fb7185', // rose-400
  remaining: '#fbbf24', // amber-400
};

/**
 * ENH-7a: Pie/donut charts — used vs remaining for leave types.
 */
export default function LeaveBalanceChart({ balance }) {
  const { isDark } = useTheme();

  if (!balance) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No balance data for chart
        </p>
      </div>
    );
  }

  const annualUsed = Number(balance.annual_used) || 0;
  const annualRemaining = Number(balance.annual_balance) || 0;
  const annualTotal =
    Number(balance.annual_entitlement) || annualUsed + annualRemaining;

  const sickRemaining = Number(balance.sick_balance) || 0;
  // Sick entitlement not always provided — treat remaining as available pool
  const sickEntitlement =
    balance.sick_entitlement != null
      ? Number(balance.sick_entitlement)
      : sickRemaining;
  const sickUsed = Math.max(0, sickEntitlement - sickRemaining);

  const annualData = [
    { name: 'Used', value: annualUsed },
    { name: 'Remaining', value: Math.max(0, annualRemaining) },
  ].filter((d) => d.value > 0);

  // If both zero, show placeholder slice so chart still renders
  if (annualData.length === 0) {
    annualData.push({ name: 'No data', value: 1, empty: true });
  }

  const sickData =
    sickEntitlement > 0
      ? [
          ...(sickUsed > 0 ? [{ name: 'Used', value: sickUsed }] : []),
          ...(sickRemaining > 0
            ? [{ name: 'Remaining', value: sickRemaining }]
            : []),
        ]
      : [{ name: 'Remaining', value: Math.max(sickRemaining, 0.001) }];

  if (sickData.length === 0) {
    sickData.push({ name: 'No data', value: 1, empty: true });
  }

  const tooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
    borderRadius: 8,
    color: isDark ? '#f1f5f9' : '#0f172a',
    fontSize: 12,
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">
            Leave balance charts
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Used vs remaining · {balance.year || new Date().getFullYear()}
            {balance.carried_forward
              ? ` · ${balance.carried_forward} day(s) carried forward`
              : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
        <ChartCard
          title="Annual leave"
          subtitle={
            annualTotal > 0
              ? `${annualRemaining} of ${annualTotal} days left`
              : `${annualRemaining} days remaining`
          }
        >
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={annualData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={2}
                stroke={isDark ? '#0f172a' : '#fff'}
                strokeWidth={2}
              >
                {annualData.map((entry) => (
                  <Cell
                    key={`annual-${entry.name}`}
                    fill={
                      entry.empty
                        ? isDark
                          ? '#334155'
                          : '#e2e8f0'
                        : entry.name === 'Used'
                          ? ANNUAL_COLORS.used
                          : ANNUAL_COLORS.remaining
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) =>
                  annualData[0]?.empty ? ['—', name] : [`${value} day(s)`, name]
                }
              />
              <Legend
                verticalAlign="bottom"
                height={28}
                formatter={(value) => (
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Sick leave"
          subtitle={`${sickRemaining} day(s) remaining`}
        >
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={sickData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={2}
                stroke={isDark ? '#0f172a' : '#fff'}
                strokeWidth={2}
              >
                {sickData.map((entry) => (
                  <Cell
                    key={`sick-${entry.name}`}
                    fill={
                      entry.empty
                        ? isDark
                          ? '#334155'
                          : '#e2e8f0'
                        : entry.name === 'Used'
                          ? SICK_COLORS.used
                          : SICK_COLORS.remaining
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) =>
                  sickData[0]?.empty ? ['—', name] : [`${value} day(s)`, name]
                }
              />
              <Legend
                verticalAlign="bottom"
                height={28}
                formatter={(value) => (
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </section>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <p className="text-center text-sm font-medium text-slate-800 dark:text-slate-100">
        {title}
      </p>
      <p className="mb-1 text-center text-xs text-slate-500 dark:text-slate-400">
        {subtitle}
      </p>
      <div className="mx-auto w-full max-w-[280px] sm:max-w-none">{children}</div>
    </div>
  );
}
