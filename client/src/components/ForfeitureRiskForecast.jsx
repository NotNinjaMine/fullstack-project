import { toISO } from "../lib/dates";

// New, self-contained addition — reads data already fetched by the page
// that renders it (annual balance, pending days, the country policy's
// carryForwardMax, and this year's holidays). No new API calls. Mirrors the
// exact forfeiture rule server/services/carryForwardService.js applies at
// year-end: unused annual leave beyond the country's carry-forward cap is lost.
const workingDaysRemainingThisYear = (holidays) => {
  const today = new Date();
  const yearEnd = new Date(today.getFullYear(), 11, 31);
  const holidaySet = new Set(
    (holidays || [])
      .filter((h) => h.date >= toISO(today) && h.date <= toISO(yearEnd))
      .map((h) => h.date)
  );
  let count = 0;
  for (let d = new Date(today); d <= yearEnd; d.setDate(d.getDate() + 1)) {
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    if (!weekend && !holidaySet.has(toISO(d))) count++;
  }
  return count;
};

export default function ForfeitureRiskForecast({ available = 0, carryForwardMax = 5, holidays = [], onPlan }) {
  const atRisk = Math.max(0, available - carryForwardMax);
  if (atRisk <= 0) return null;

  const year = new Date().getFullYear();
  const workingDaysLeft = workingDaysRemainingThisYear(holidays);
  const safePct = available > 0 ? Math.min(100, (carryForwardMax / available) * 100) : 0;

  return (
    <div className="lf-card-static p-5 border-l-4 border-amber-400">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-lf-text">Forfeiture risk</h2>
        <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 font-medium">New</span>
      </div>
      <p className="text-sm text-slate-600 mb-3">
        You&apos;re on pace to forfeit <span className="font-semibold text-amber-700">{atRisk} day{atRisk > 1 ? "s" : ""}</span> of
        annual leave at year-end — only {carryForwardMax}d carries forward into {year + 1}, and you have {available}d available now.
      </p>

      <div className="mb-1 flex justify-between text-[11px] text-slate-400">
        <span>0d</span>
        <span>{carryForwardMax}d cap</span>
        <span>{available}d you have</span>
      </div>
      <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden" title={`${carryForwardMax}d carries forward, ${atRisk}d at risk`}>
        <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${safePct}%` }} />
        <div className="absolute inset-y-0 bg-amber-400" style={{ left: `${safePct}%`, right: 0 }} />
      </div>

      <p className="text-xs text-slate-500 mt-3">
        {workingDaysLeft} working day{workingDaysLeft === 1 ? "" : "s"} left in {year} to use it before it&apos;s lost.
      </p>

      <div className="flex justify-end mt-2">
        <button type="button" onClick={onPlan} className="lf-btn lf-btn-outline lf-btn-sm">
          Plan time off
        </button>
      </div>
    </div>
  );
}
