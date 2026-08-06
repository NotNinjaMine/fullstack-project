// This app's business day is Singapore time (SGT, UTC+8) — that's where HR,
// the demo accounts, and the seeded holiday calendars are all based. Several
// places need "today" as a YYYY-MM-DD string to compare against date-range
// columns (announcement display windows, delegation date ranges).
//
// The naive `new Date().toISOString().slice(0, 10)` looks right but is a real
// bug: toISOString() is always UTC. Whenever the server's system clock is set
// to UTC (the default on most hosting) rather than SGT, there's an 8-hour
// window every single day — from SGT midnight until SGT 08:00 — where the
// UTC calendar date is still "yesterday" relative to Singapore. An
// announcement (or a delegation) whose start date is "today" in Singapore
// would silently fail its `startDate <= today` check for those 8 hours, and
// simply not appear — with no error anywhere to point at why.
//
// Asia/Singapore has no DST and a fixed UTC+8 offset, so this needs no
// library — just format the same instant using that IANA zone instead of UTC.
const todaySGT = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
// en-CA locale formats as YYYY-MM-DD, which is exactly the column format used
// throughout (announcements.startDate/endDate, delegations.startDate/endDate).

module.exports = { todaySGT };
