// M2 (UC-01 / UC-03 / UC-05 / UC-13 / UC-14 / UC-27): the employee-side business
// rules, kept as PURE functions so they can be unit-tested without a database
// (same style as services/calculationService.js and services/delegationService.js).
//
// The routes stay thin: they fetch rows, call these rules, and translate the
// { ok, message } results into the existing 400 / 403 response shapes.

/* ---------------- dates: always reason in Singapore time (HQ) ---------------- */

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

// "Today" in SGT regardless of the server's own timezone. `now` is injectable
// so tests do not depend on the wall clock.
const sgtTodayISO = (now = new Date()) =>
    new Date(now.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 10);

const daysBetweenISO = (aISO, bISO) => {
    const a = new Date(`${aISO}T00:00:00Z`).getTime();
    const b = new Date(`${bISO}T00:00:00Z`).getTime();
    return Math.round((b - a) / 86400000);
};

/* ---------------- UC-01: no double-booking of your own dates ---------------- */

const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart <= bEnd && bStart <= aEnd;

// Two half-days on the SAME single date are allowed when they are opposite
// halves (AM + PM) — anything else that overlaps is a double booking.
const isComplementaryHalfDay = (a, b) =>
    !!a.halfDay && !!b.halfDay &&
    a.startDate === a.endDate && b.startDate === b.endDate &&
    a.startDate === b.startDate &&
    !!a.halfDayPeriod && !!b.halfDayPeriod &&
    a.halfDayPeriod !== b.halfDayPeriod;

// existing: the employee's own live requests
//   [{ id, startDate, endDate, halfDay, halfDayPeriod }] — callers pass only rows
//   that still hold dates (pending / approved / cancellation-pending), never drafts.
// Returns the first clashing row, or null.
const findOverlapping = (existing, candidate) =>
    (existing || []).find((r) =>
        Number(r.id) !== Number(candidate.id || 0) &&
        rangesOverlap(r.startDate, r.endDate, candidate.startDate, candidate.endDate) &&
        !isComplementaryHalfDay(r, candidate)
    ) || null;

const overlapCheck = (existing, candidate) => {
    const clash = findOverlapping(existing, candidate);
    if (!clash) return { ok: true };
    const range = clash.startDate === clash.endDate
        ? clash.startDate
        : `${clash.startDate} → ${clash.endDate}`;
    return {
        ok: false,
        message: `You already have leave on these dates (REQ-${clash.id}, ${range}). Cancel it first or pick different dates.`
    };
};

/* ---------------- UC-01 / UC-05: back-dating ---------------- */

// Annual leave is planned ahead; sick leave is normally submitted retroactively
// (UC-05), so it may be back-dated within a short window.
const MAX_SICK_BACKDATE_DAYS = 14;

const isSickType = (leaveType) => leaveType === "sick_mc" || leaveType === "sick_nomc";

const backdateCheck = (leaveType, startISO, todayISO) => {
    const age = daysBetweenISO(startISO, todayISO); // > 0 means startISO is in the past
    if (age <= 0) return { ok: true };
    if (!isSickType(leaveType)) {
        return {
            ok: false,
            message: `Annual leave cannot start in the past (${startISO}). Pick today or a future date.`
        };
    }
    if (age > MAX_SICK_BACKDATE_DAYS) {
        return {
            ok: false,
            message: `Sick leave can only be back-dated up to ${MAX_SICK_BACKDATE_DAYS} days. ${startISO} is ${age} days ago — ask HR to record it for you.`
        };
    }
    return { ok: true };
};

/* ---------------- UC-05: country sick-leave quota ---------------- */

// policy: a LeavePolicy row { country, countryName, sickMc, sickNoMc }.
// Countries such as Thailand grant 30 days with an MC and 0 without one, so the
// employee gets the policy reason rather than a bare "insufficient balance".
const sickQuotaCheck = (leaveType, policy) => {
    if (!isSickType(leaveType) || !policy) return { ok: true };
    const where = policy.countryName || policy.country || "your country";
    if (leaveType === "sick_nomc" && Number(policy.sickNoMc) <= 0) {
        return {
            ok: false,
            message: `${where} policy grants no sick leave without a medical certificate. Choose "Sick leave (with MC)" and attach your MC.`
        };
    }
    if (leaveType === "sick_mc" && Number(policy.sickMc) <= 0) {
        return { ok: false, message: `${where} policy grants no MC-backed sick leave.` };
    }
    return { ok: true };
};

/* ---------------- UC-13: medical-certificate attachments ---------------- */

const ALLOWED_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
// ~5MB binary ≈ 7M base64 characters (the column is TEXT('long')).
const MAX_ATTACHMENT_CHARS = 7_000_000;

const attachmentCheck = ({ attachmentType, attachmentData }) => {
    if (!attachmentData) return { ok: true };
    const type = String(attachmentType || "").toLowerCase();
    if (!ALLOWED_ATTACHMENT_TYPES.includes(type)) {
        return { ok: false, message: "Medical certificates must be a PDF, JPG or PNG file." };
    }
    if (!/^data:/.test(String(attachmentData))) {
        return { ok: false, message: "Attachment must be uploaded through the form." };
    }
    if (String(attachmentData).length > MAX_ATTACHMENT_CHARS) {
        return { ok: false, message: "Attachment is too large (max ~5MB)." };
    }
    return { ok: true };
};

/* ---------------- UC-14: balance forecast / what-if ---------------- */

const num = (v) => Number(v || 0);

// balance: a LeaveBalance row; pendingDays: days already reserved by live
// requests of the same type (cancellation-pending rows excluded by the caller).
const forecastBalance = (balance, pendingDays, requestedDays) => {
    const entitled = num(balance?.entitled);
    const carried = num(balance?.carried);
    const used = num(balance?.used);
    const pending = num(pendingDays);
    const requested = num(requestedDays);
    const remainingBefore = entitled + carried - used - pending;
    const remainingAfter = remainingBefore - requested;
    return {
        entitled, carried, used, pending, requested,
        remainingBefore: Math.round(remainingBefore * 2) / 2,
        remainingAfter: Math.round(remainingAfter * 2) / 2,
        sufficient: remainingAfter >= 0
    };
};

/* ---------------- UC-27: swap compatibility ---------------- */

// Dates swap, balances do not (UC-27). That only holds when both entries cost
// the same number of days for BOTH employees — the caller recomputes each
// employee's day count for the other's dates under their own country calendar
// and passes them in as `proposerDaysOnTheirDates` / `counterpartDaysOnMyDates`.
const swapCompatible = ({
    mine, theirs, todayISO,
    proposerDaysOnTheirDates, counterpartDaysOnMyDates
}) => {
    if (num(mine.days) !== num(theirs.days) || !!mine.halfDay !== !!theirs.halfDay) {
        return {
            ok: false,
            message: `Swaps must cost the same number of days so balances stay unchanged (yours: ${num(mine.days)}d, theirs: ${num(theirs.days)}d).`
        };
    }
    if (mine.startDate <= todayISO || theirs.startDate <= todayISO) {
        return { ok: false, message: "Only leave that starts in the future can be swapped." };
    }
    if (proposerDaysOnTheirDates != null && num(proposerDaysOnTheirDates) !== num(mine.days)) {
        return {
            ok: false,
            message: `Those dates would cost you ${num(proposerDaysOnTheirDates)} day(s) instead of ${num(mine.days)} under your country's calendar, so the swap would change your balance.`
        };
    }
    if (counterpartDaysOnMyDates != null && num(counterpartDaysOnMyDates) !== num(theirs.days)) {
        return {
            ok: false,
            message: `Your dates would cost your teammate ${num(counterpartDaysOnMyDates)} day(s) instead of ${num(theirs.days)} under their country's calendar, so the swap would change their balance.`
        };
    }
    return { ok: true };
};

module.exports = {
    SGT_OFFSET_MS,
    MAX_SICK_BACKDATE_DAYS,
    ALLOWED_ATTACHMENT_TYPES,
    MAX_ATTACHMENT_CHARS,
    sgtTodayISO,
    daysBetweenISO,
    rangesOverlap,
    isComplementaryHalfDay,
    findOverlapping,
    overlapCheck,
    isSickType,
    backdateCheck,
    sickQuotaCheck,
    attachmentCheck,
    forecastBalance,
    swapCompatible
};
