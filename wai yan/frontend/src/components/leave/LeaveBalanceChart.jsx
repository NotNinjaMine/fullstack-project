import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useTheme } from '../../hooks/useTheme';

function cssToken(name, fallback = '') {
  if (typeof document === 'undefined') return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

/**
 * ENH-7a: Pie/donut charts — used vs remaining for leave types.
 * Colors resolve from live design tokens so light/dark themes stay correct.
 */
export default function LeaveBalanceChart({ balance }) {
  const { isDark } = useTheme();
  const ANNUAL_COLORS = {
    used: cssToken('--text-dim', '#9AA1AD'),
    remaining: cssToken('--accent', '#5B5BD6'),
  };
  const SICK_COLORS = {
    used: cssToken('--text-dim', '#9AA1AD'),
    remaining: cssToken('--success', '#16A34A'),
  };

  if (!balance) {
    return (
      <div
        className="rounded-xl p-5 shadow-sm"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
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
    backgroundColor: cssToken('--surface', isDark ? '#1A1C23' : '#FFFFFF'),
    border: `1px solid ${cssToken('--border', '#E7E9EF')}`,
    borderRadius: 8,
    color: cssToken('--text', isDark ? '#ECEDF1' : '#1A1D26'),
    fontSize: 12,
  };
  const chartStroke = cssToken('--surface', isDark ? '#1A1C23' : '#FFFFFF');
  const gridStroke = cssToken('--border', '#E7E9EF');

  return (
    <section
      className="rounded-xl p-4 shadow-sm sm:p-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold" style={{ color: 'var(--text)' }}>
            Leave balance charts
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
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
                stroke={chartStroke}
                strokeWidth={2}
              >
                {annualData.map((entry) => (
                  <Cell
                    key={`annual-${entry.name}`}
                    fill={
                      entry.empty
                        ? gridStroke
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
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
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
                stroke={chartStroke}
                strokeWidth={2}
              >
                {sickData.map((entry) => (
                  <Cell
                    key={`sick-${entry.name}`}
                    fill={
                      entry.empty
                        ? gridStroke
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
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
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
    <div
      className="rounded-lg p-3"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border-light)' }}
    >
      <p className="text-center text-sm font-medium" style={{ color: 'var(--text)' }}>
        {title}
      </p>
      <p className="mb-1 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        {subtitle}
      </p>
      <div className="mx-auto w-full max-w-[280px] sm:max-w-none">{children}</div>
    </div>
  );
}
