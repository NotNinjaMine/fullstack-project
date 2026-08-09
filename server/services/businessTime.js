// M3: business-time helpers.
//
// Everything date-shaped in this system is Singapore business time (the HQ
// timezone), matching Sequelize's `timezone: '+08:00'` in models/index.js and
// the assignment's "all scheduled jobs run on Singapore Time" rule.
//
// WHY THIS FILE EXISTS: `new Date().toISOString().slice(0,10)` returns the UTC
// calendar date. Between 00:00 and 08:00 SGT that is YESTERDAY, so a delegation
// starting "today" was still treated as not-yet-started for the first eight
// hours of every Singapore working day. Delegation windows, reminder ages and
// audit stamps all read from here instead.
//
// No new runtime dependency: Intl is built into Node.

const TZ = process.env.APP_TIMEZONE || "Asia/Singapore";

// 'en-CA' formats as YYYY-MM-DD, which is exactly the shape DATEONLY columns
// and the existing lexicographic date comparisons expect.
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
});

/** Current business-calendar date as 'YYYY-MM-DD' (Asia/Singapore). */
const todayISO = (now = new Date()) => dateFormatter.format(now);

/** Any Date → its business-calendar date as 'YYYY-MM-DD'. */
const toBusinessDateISO = (value) => dateFormatter.format(new Date(value));

/** 'YYYY-MM-DD' + n days, still on the business calendar. */
const addDaysISO = (iso, days) => {
    // Parse as UTC midnight and shift in whole days: no DST in SGT, and we only
    // ever return a calendar date, so this is exact.
    const base = new Date(`${iso}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + Number(days));
    return base.toISOString().slice(0, 10);
};

/** Whole hours between two instants (used for reminder ageing). */
const hoursBetween = (from, to) =>
    (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60);

module.exports = { TZ, todayISO, toBusinessDateISO, addDaysISO, hoursBetween };
