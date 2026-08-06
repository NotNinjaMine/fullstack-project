// M4 (UC-19 + UC-29): the single source of truth for leave duration.
// Reads the per-country weekend configuration (country_working_days) rather than
// a hard-coded Sat/Sun, and excludes that country's public holidays. M2 (balance
// forecast, deduction, sick quotas) and M5 (carry-forward, reports) call this —
// they never re-implement day counting.
//
// Kept pure where possible: the date maths are pure functions over a `workingDays`
// map + a Set of holiday ISO strings, so they are unit-testable without a DB.

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const DEFAULT_WORKING_DAYS = {
    mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false
};

const toISO = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fromISO = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
};

const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };

// A day is a working day iff the country config marks its weekday as working
// AND it is not a public holiday for that country.
const isWorkingDay = (date, workingDays, holidaySet) => {
    const key = WEEKDAY_KEYS[date.getDay()];
    const cfg = workingDays || DEFAULT_WORKING_DAYS;
    if (!cfg[key]) return false;
    return !holidaySet.has(toISO(date));
};

// Working days in [startISO, endISO] under a given weekend config + holiday set.
const workingDaysInRange = (startISO, endISO, workingDays, holidaySet) => {
    const out = [];
    let cur = fromISO(startISO);
    const end = fromISO(endISO);
    while (cur <= end) {
        if (isWorkingDay(cur, workingDays, holidaySet)) out.push(toISO(cur));
        cur = addDays(cur, 1);
    }
    return out;
};

// computed_days for a request: half-day = 0.5, else count of working days.
const computeDays = (startISO, endISO, halfDay, workingDays, holidaySet) => {
    const days = workingDaysInRange(startISO, endISO, workingDays, holidaySet);
    if (days.length === 0) return 0;
    return halfDay ? 0.5 : days.length;
};

// At least one working day per week must remain (UC-29 business rule).
const hasAtLeastOneWorkingDay = (workingDays) =>
    WEEKDAY_KEYS.some((k) => workingDays && workingDays[k] === true);

module.exports = {
    WEEKDAY_KEYS,
    DEFAULT_WORKING_DAYS,
    toISO,
    fromISO,
    addDays,
    isWorkingDay,
    workingDaysInRange,
    computeDays,
    hasAtLeastOneWorkingDay
};
