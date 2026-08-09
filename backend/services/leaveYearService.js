// The single "active leave year" every part of the app uses when it means
// "the current year" for balances: the Staff Table, the dashboard/risk-flag
// checks, the carry-forward summary report, an employee's own balance page,
// and the default year newly-added employees are provisioned into.
//
// Before any year-end carry-forward has ever run, this is simply the real
// calendar year — nothing changes for a fresh install. But "Run year-end
// carry-forward" (UC-04) writes LeaveBalance rows for the NEXT year, and from
// that moment on every one of those views needs to agree the new year is now
// current, or HR could confirm a rollover and watch nothing on screen change
// until the real calendar caught up months later. The single source of truth
// is simply the HIGHEST year any LeaveBalance row exists for, never lower
// than the real calendar year.
//
// NOTE: this is deliberately NOT used for reports that are about historical
// leave actually taken within a specific real calendar year (leave
// utilisation, sick-leave trend) — those stay tied to real dates on purpose.
const { LeaveBalance } = require('../models');

const currentLeaveYear = async () => {
    const maxYear = await LeaveBalance.max('year');
    const calendarYear = new Date().getFullYear();
    return Math.max(Number(maxYear) || 0, calendarYear);
};

module.exports = { currentLeaveYear };
