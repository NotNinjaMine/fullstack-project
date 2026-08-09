import { useEffect, useState } from "react";
import http from "../lib/http";
import { toISO } from "../lib/dates";

// New, self-contained addition — reads holidays/approvedLeaves already
// fetched by the page that renders it, and reuses the existing
// /leave/coverage-check endpoint (already called elsewhere on this same
// page) for the real staffing-conflict check. No changes to any existing
// calendar/schedule component.
const HORIZON_DAYS = 150;
const MAX_LEAVE_GAP = 4;

const fmtShort = (iso) =>
  new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short" });
const fmtRange = (startIso, endIso) =>
  startIso === endIso ? fmtShort(startIso) : `${fmtShort(startIso)} – ${fmtShort(endIso)}`;

// Walk the next HORIZON_DAYS days, group into weekday/off-day runs, and surface
// every short (<=4 workday) gap sandwiched between two off-runs that together
// include at least one public holiday — a "bridge a few days, get a long
// break" opportunity.
function findOpportunities(holidays, from) {
  const holidayByIso = new Map((holidays || []).map((h) => [h.date, h.name]));
  const days = [];
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const iso = toISO(d);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const isHoliday = holidayByIso.has(iso);
    days.push({ iso, off: isWeekend || isHoliday, isHoliday });
  }

  const runs = [];
  let i = 0;
  while (i < days.length) {
    const off = days[i].off;
    let j = i;
    while (j < days.length && days[j].off === off) j++;
    runs.push({ off, start: i, end: j - 1 });
    i = j;
  }

  const opportunities = [];
  for (let r = 1; r < runs.length - 1; r++) {
    const gap = runs[r];
    if (gap.off) continue;
    const gapLen = gap.end - gap.start + 1;
    if (gapLen > MAX_LEAVE_GAP) continue;
    const before = runs[r - 1];
    const after = runs[r + 1];
    const merged = days.slice(before.start, after.end + 1);
    const holidaysInvolved = merged.filter((d) => d.isHoliday).map((d) => ({ date: d.iso, name: holidayByIso.get(d.iso) }));
    if (holidaysInvolved.length === 0) continue;
    const totalDaysOff = after.end - before.start + 1;
    if (totalDaysOff - gapLen < 2) continue;
    opportunities.push({
      leaveDays: gapLen,
      totalDaysOff,
      breakStart: days[before.start].iso,
      breakEnd: days[after.end].iso,
      applyStart: days[gap.start].iso,
      applyEnd: days[gap.end].iso,
      holidaysInvolved,
    });
  }
  opportunities.sort((a, b) => (a.applyStart < b.applyStart ? -1 : 1));
  return opportunities;
}

// Only YOUR own approved leave makes a suggestion stale — a teammate being
// away on the same days doesn't disqualify it (multiple people can usually
// take the same days off; the real constraint is team coverage, checked
// separately via /leave/coverage-check below).
const isAlreadyMine = (o, approvedLeaves, userId) =>
  (approvedLeaves || []).some(
    (l) => l.userId === userId && l.startDate <= o.applyEnd && l.endDate >= o.applyStart
  );

export default function LongWeekendFinder({ holidays = [], approvedLeaves = [], remainingAnnual = 0, userId, onApply }) {
  const opportunities = findOpportunities(holidays, new Date())
    .filter((o) => !isAlreadyMine(o, approvedLeaves, userId))
    .slice(0, 5);

  // Coverage is a per-date-range, team-wide calculation (staffing minimums
  // HR/Managers configure) — not something derivable from data this page
  // already has, so we ask the same endpoint the real apply form uses.
  const [coverageByKey, setCoverageByKey] = useState({});
  useEffect(() => {
    let cancelled = false;
    opportunities.forEach((o) => {
      http
        .post("/leave/coverage-check", { startDate: o.applyStart, endDate: o.applyEnd })
        .then((res) => {
          if (!cancelled) setCoverageByKey((prev) => ({ ...prev, [o.applyStart]: res.data.conflicts || [] }));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holidays, approvedLeaves]);

  if (opportunities.length === 0) return null;

  return (
    <div className="lf-card-static p-5 border-l-4 border-lf-accent">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-lf-text">Long-weekend opportunities</h2>
        <span className="text-xs bg-lf-accent-soft text-lf-accent rounded-full px-2 py-0.5 font-medium">New</span>
      </div>
      <p className="text-sm text-slate-500 mb-3">
        A few days of annual leave near an upcoming public holiday can turn into a much longer break.
      </p>
      <div className="space-y-2">
        {opportunities.map((o) => {
          const affordable = o.leaveDays <= remainingAnnual;
          const conflicts = coverageByKey[o.applyStart];
          return (
            <div
              key={o.applyStart}
              className="flex items-center justify-between gap-3 rounded-lg border border-lf-border p-3 bg-white"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {fmtRange(o.breakStart, o.breakEnd)}{" "}
                  <span className="text-slate-400 font-normal">· {o.totalDaysOff} days off</span>
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Take {o.leaveDays} day{o.leaveDays > 1 ? "s" : ""} of leave ({fmtRange(o.applyStart, o.applyEnd)}) around{" "}
                  {[...new Set(o.holidaysInvolved.map((h) => h.name))].join(", ")}.
                </p>
                {!affordable && (
                  <p className="text-xs text-amber-600 mt-1">
                    Exceeds your remaining annual balance ({remainingAnnual}d left).
                  </p>
                )}
                {conflicts && conflicts.length > 0 && (
                  <p className="text-xs text-amber-600 mt-1" title={conflicts.map((c) => c.explanation).join("\n")}>
                    ⚠ Coverage is tight on {conflicts.length} of these day{conflicts.length > 1 ? "s" : ""} — may need special approval.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onApply(o.applyStart, o.applyEnd)}
                className="lf-btn lf-btn-outline lf-btn-sm shrink-0"
              >
                Pre-fill
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
