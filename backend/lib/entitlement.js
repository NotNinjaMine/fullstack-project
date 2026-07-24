// Pure pro-ration math + country reference data (UC-20). Mirrors the client's
// client/src/lib/entitlement.js so both sides compute the same figure.

// Pro-rate an annual entitlement by remaining months from a start date.
// Joining on/after the 15th counts as a half-month; rounded to nearest 0.5.
function prorateEntitlement(fullEntitlement, startISO, year = new Date().getFullYear()) {
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return fullEntitlement;
  if (start.getFullYear() < year) return fullEntitlement;
  if (start.getFullYear() > year) return 0;

  const startMonth = start.getMonth();
  let monthsRemaining = 12 - startMonth;
  if (start.getDate() >= 15) monthsRemaining -= 0.5;

  const prorated = (fullEntitlement * monthsRemaining) / 12;
  return Math.round(prorated * 2) / 2;
}

// 10 offices per the client brief; carryForwardMax is 5 days for everyone.
const LEAVE_POLICIES = [
  { country: 'SG', countryName: 'Singapore', annualMin: 14, annualMax: 24, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: 'TH', countryName: 'Thailand', annualMin: 8, annualMax: 11, sickMc: 30, sickNoMc: 0, carryForwardMax: 5 },
  { country: 'CN', countryName: 'China', annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: 'ID', countryName: 'Indonesia', annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: 'JP', countryName: 'Japan', annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: 'MY', countryName: 'Malaysia', annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: 'MM', countryName: 'Myanmar', annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: 'NZ', countryName: 'New Zealand', annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: 'PH', countryName: 'Philippines', annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: 'VN', countryName: 'Vietnam', annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
];

const COUNTRY_NAME = Object.fromEntries(LEAVE_POLICIES.map((p) => [p.country, p.countryName]));

const policyFor = (code) => LEAVE_POLICIES.find((p) => p.country === code) || LEAVE_POLICIES[0];

module.exports = { prorateEntitlement, LEAVE_POLICIES, COUNTRY_NAME, policyFor };
