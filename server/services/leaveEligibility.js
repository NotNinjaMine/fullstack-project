// M5 — two rules that several callers each used to implement for themselves.
//
// 1. UC-10 leave-type eligibility. The apply-form dropdown (GET /leave/types)
//    and the enforcement path (POST /leave/apply, draft update, draft submit)
//    have to agree exactly: if the list offers a type the server would reject,
//    the employee hits a 400 on a choice the app just gave them.
//
// 2. UC-31 forfeiture risk. The reminder email (carryForwardService), the
//    carry-forward report (reportService) and the AI-5 dashboard flag
//    (anomalyDetector) all tell HR who is about to lose leave. Only the first
//    read the country's configured cap; the other two hard-coded 5, so on any
//    country with a different cap they disagreed about the same employee.
//
// Pure functions: no database, no HTTP, no environment. Callers do the I/O and
// pass plain rows in.

// ─── Leave-type eligibility ──────────────────────────────────────

// A null or empty applicableCountries list means "offered everywhere". The HR
// panel submits [] when every country chip is cleared and the route normalises
// that to NULL on write, so both spellings must read the same — treating []
// as "nowhere" would disable a leave type company-wide by accident.
const isOfferedInCountry = (type, country) => {
    const countries = Array.isArray(type?.applicableCountries) ? type.applicableCountries : [];
    return countries.length === 0 || countries.includes(country);
};

// users.gender is nullable (accounts predate the column), so a restricted type
// must fail CLOSED for an employee with no gender recorded. Failing open would
// hand every legacy account access to every restricted type.
const isAllowedForGender = (type, gender) => {
    const restriction = type?.genderRestriction || "ANY";
    return restriction === "ANY" || gender === restriction;
};

// Whether a type draws down a balance pool. Approval skips the deduction when
// this is false — otherwise final approval would look for a leave_balances row
// that does not exist and fail with a 409 *after* two people had approved.
//
// An unknown type is false here. Note that routes/leaveRequest.js deliberately
// treats an unresolved type as tracking a balance instead (`!typeRow || …`):
// that is the deduct path, where a legacy leaveType code with no catalogue row
// must still draw down rather than silently become free leave. Do not "unify"
// the two without deciding which way an unknown code should fail.
const tracksBalance = (type) => Boolean(type?.affectsAnnualBalance || type?.affectsSickBalance);

// The single eligibility verdict. `type` may be null (the code did not resolve),
// which is a 400 with a usable message, not a 500.
//
// Country is checked before gender so someone failing both is told the fact they
// can act on. The gender message says "your profile" rather than naming the
// restriction: the employee learns they are ineligible without the error
// publishing the rule.
const checkLeaveTypeEligibility = (type, user) => {
    if (!type || !type.active) {
        return { ok: false, reason: "INACTIVE", message: "This leave type is not available." };
    }
    if (!isOfferedInCountry(type, user?.country)) {
        return { ok: false, reason: "COUNTRY", message: `${type.name} is not available in your country.` };
    }
    if (!isAllowedForGender(type, user?.gender)) {
        return { ok: false, reason: "GENDER", message: `${type.name} is not available for your profile.` };
    }
    return { ok: true, type };
};

// The apply-form dropdown. Defined in terms of checkLeaveTypeEligibility so the
// list can never offer something the enforcement path would reject.
const eligibleTypesFor = (catalogue, user) =>
    (Array.isArray(catalogue) ? catalogue : []).filter((type) => checkLeaveTypeEligibility(type, user).ok);

// ─── Forfeiture risk ─────────────────────────────────────────────

// Used when a country has no usable carryForwardMax configured. Matches the
// Singapore statutory default the seed data uses.
const DEFAULT_CARRY_FORWARD_MAX = 5;

// Balances are DECIMAL(4,1) and the MySQL driver hands them back as strings.
// Without coercion "14" + "5" concatenates to "145" and every figure in every
// forfeiture email becomes nonsense.
const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

// Rounded to one decimal because the columns are DECIMAL(4,1): keeps half-days
// exact and stops binary float error surfacing as "6.500000000000001 days".
const round1 = (n) => Math.round(n * 10) / 10;

// Deliberately not clamped at zero. A negative remaining is a real state (HR
// adjusted a balance downward) and hiding it here would hide the adjustment.
const remainingDays = (balance) =>
    round1(toNumber(balance?.entitled) + toNumber(balance?.carried) - toNumber(balance?.used));

// Everything above the country's own cap is lost at year-end.
//
// The cap is read with an explicit null/finite check rather than `Number(cap) || 5`:
// a country that genuinely carries nothing forward has a cap of 0, and the
// falsy-OR form would silently turn that into 5 and under-report its employees'
// risk by five days.
const daysAtRisk = (balance, carryForwardMax) => {
    const cap = carryForwardMax == null || !Number.isFinite(Number(carryForwardMax))
        ? DEFAULT_CARRY_FORWARD_MAX
        : Number(carryForwardMax);
    return round1(Math.max(0, remainingDays(balance) - cap));
};

// The cap a LeavePolicy row configures, for callers that need it separately
// from daysAtRisk (to show it in a title or a message). Same null/finite check,
// so a genuine 0 survives.
const capForPolicy = (policy) => {
    const configured = Number(policy?.carryForwardMax);
    return Number.isFinite(configured) ? configured : DEFAULT_CARRY_FORWARD_MAX;
};

// Ordered high to low; the first match wins, so exactly one tier can ever fire.
// Lower edges are inclusive: exactly 5 days at risk is critical, not a warning.
const FORFEITURE_TIERS = [
    { min: 5, tier: "critical" },
    { min: 3, tier: "warning" },
    { min: 1, tier: "notice" }
];

// null means "send nothing" — under a day at risk never generates an email.
// It is a normal outcome, not an error.
const forfeitureTier = (atRisk) => {
    const days = Number(atRisk);
    if (!Number.isFinite(days)) return null;
    return FORFEITURE_TIERS.find((t) => days >= t.min)?.tier || null;
};

// Subject-line prefix for the reminder email.
const TIER_WORDS = { critical: "Urgent", warning: "Important", notice: "Heads up" };
const tierWord = (tier) => TIER_WORDS[tier] || null;

// The AI-5 dashboard flags at 3 days, deliberately higher than the email's
// 1 day, so HR's panel is not filled with single-day noise. It must never be
// the other way round: anything flagged is always something worth emailing.
const isAnomalyWorthy = (atRisk) => Number(atRisk) >= 3;

module.exports = {
    isOfferedInCountry,
    isAllowedForGender,
    tracksBalance,
    checkLeaveTypeEligibility,
    eligibleTypesFor,
    remainingDays,
    daysAtRisk,
    capForPolicy,
    forfeitureTier,
    tierWord,
    isAnomalyWorthy,
    FORFEITURE_TIERS,
    DEFAULT_CARRY_FORWARD_MAX
};
