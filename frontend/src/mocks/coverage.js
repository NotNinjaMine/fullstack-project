import dayjs from "dayjs";
import { MOCK_REQUESTS, TEAM_BY_NAME, HOLIDAYS_BY_COUNTRY, MIN_PRESENT } from "./data";

const isWeekend = (d) => d.day() === 0 || d.day() === 6;

const holidaySetFor = (country) =>
  new Set((HOLIDAYS_BY_COUNTRY[country] ?? []).map((h) => h.date));

// Working days in [start, end], excluding weekends and the country's public holidays (UC-06)
const workingDays = (start, end, holidaySet) => {
  const days = [];
  let cur = dayjs(start);
  const last = dayjs(end);
  while (cur.valueOf() <= last.valueOf()) {
    const iso = cur.format("YYYY-MM-DD");
    if (!isWeekend(cur) && !holidaySet.has(iso)) days.push(iso);
    cur = cur.add(1, "day");
  }
  return days;
};

const approvedAwayOn = (iso, teamUserIds, excludeUserId) =>
  MOCK_REQUESTS.filter(
    (r) =>
      r.status === "APPROVED" &&
      r.userId !== excludeUserId &&
      teamUserIds.includes(r.userId) &&
      iso >= r.startDate &&
      iso <= r.endDate
  );

// AI-2 Smart Coverage Analyzer (mock): flags days where team presence drops
// below MIN_PRESENT and suggests the nearest fully-covered range of the same length.
export function computeCoverage({ requester, startDate, endDate }) {
  const holidaySet = holidaySetFor(requester.country);
  const team = TEAM_BY_NAME(requester.team);
  const teamUserIds = team.map((t) => t.id);
  const teamSize = team.length;

  const buildConflicts = (start, end) => {
    const days = workingDays(start, end, holidaySet);
    const conflicts = [];
    days.forEach((iso) => {
      const away = approvedAwayOn(iso, teamUserIds, requester.id);
      const present = teamSize - 1 - away.length; // -1 for the requester themself
      if (present < MIN_PRESENT) {
        const names = away.map((r) => team.find((t) => t.id === r.userId)?.name).filter(Boolean);
        conflicts.push({
          date: iso,
          explanation: `Only ${present} of ${teamSize} team members present${
            names.length ? ` (${names.join(", ")} also away)` : ""
          }.`,
        });
      }
    });
    return { days, conflicts };
  };

  const { days, conflicts } = buildConflicts(startDate, endDate);

  let alternative = null;
  if (conflicts.length > 0) {
    const spanDays = dayjs(endDate).diff(dayjs(startDate), "day");
    for (let shift = 1; shift <= 8; shift++) {
      const altStart = dayjs(startDate).add(shift * 7, "day");
      const altEnd = altStart.add(spanDays, "day");
      const altStartIso = altStart.format("YYYY-MM-DD");
      const altEndIso = altEnd.format("YYYY-MM-DD");
      if (buildConflicts(altStartIso, altEndIso).conflicts.length === 0) {
        alternative = { start: altStartIso, end: altEndIso };
        break;
      }
    }
  }

  const holidaysSkipped = (HOLIDAYS_BY_COUNTRY[requester.country] ?? []).filter(
    (h) => h.date >= startDate && h.date <= endDate
  );

  return {
    days: days.length,
    teamSize,
    minPresent: MIN_PRESENT,
    conflicts,
    alternative,
    holidaysSkipped,
  };
}
