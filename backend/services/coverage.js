// AI-2 Smart Coverage Analyzer - core engine.
// Pure functions over data fetched by the routes, so it is easy to unit test.

const MIN_PRESENT = 3;   // coverage rule: >= 3 of 5 present on any working day

const toISO = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fromISO = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
};

const addDays = (d, n) => {
    const c = new Date(d);
    c.setDate(c.getDate() + n);
    return c;
};

const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

// holidaySet: Set of ISO strings for the employee's country
const isWorkingDay = (d, holidaySet) => !isWeekend(d) && !holidaySet.has(toISO(d));

// Working days in [start, end] - weekends/PHs never deduct balance.
const workingDaysInRange = (startISO, endISO, holidaySet) => {
    const days = [];
    let cur = fromISO(startISO);
    const end = fromISO(endISO);
    while (cur <= end) {
        if (isWorkingDay(cur, holidaySet)) days.push(toISO(cur));
        cur = addDays(cur, 1);
    }
    return days;
};

// approvedLeaves: [{ userId, startDate, endDate }] for the SAME team
const offOn = (iso, approvedLeaves, excludeUserId = null) =>
    approvedLeaves
        .filter((l) => iso >= l.startDate && iso <= l.endDate && l.userId !== excludeUserId)
        .map((l) => l.userId);

const evaluateCoverage = (workDays, approvedLeaves, requesterId, teamSize) => {
    const conflicts = [];
    workDays.forEach((iso) => {
        const off = offOn(iso, approvedLeaves, requesterId);
        const present = teamSize - off.length - 1; // -1 = the requester
        if (present < MIN_PRESENT) {
            conflicts.push({ date: iso, present, offUserIds: off });
        }
    });
    return conflicts;
};

// Nearest same-length window after the requested range with full coverage.
const suggestAlternative = (afterISO, lengthWorkingDays, approvedLeaves, requesterId, teamSize, holidaySet) => {
    let probe = addDays(fromISO(afterISO), 1);
    for (let i = 0; i < 90; i++) {
        while (!isWorkingDay(probe, holidaySet)) probe = addDays(probe, 1);
        const win = [];
        let cur = new Date(probe);
        while (win.length < lengthWorkingDays) {
            if (isWorkingDay(cur, holidaySet)) win.push(toISO(cur));
            cur = addDays(cur, 1);
        }
        if (evaluateCoverage(win, approvedLeaves, requesterId, teamSize).length === 0) {
            return { start: win[0], end: win[win.length - 1] };
        }
        probe = addDays(probe, 1);
    }
    return null;
};

module.exports = {
    MIN_PRESENT, toISO, fromISO, addDays, isWeekend, isWorkingDay,
    workingDaysInRange, offOn, evaluateCoverage, suggestAlternative
};
