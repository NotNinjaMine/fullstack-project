// Single source of truth for pro-ration math (UC-20), shared by the mock
// server's bulk-entitlement logic and the Invitations/Entitlements pages'
// live preview — mirrors the pattern in lib/leaveTypes.js.

// Pro-rate an annual entitlement by remaining months from a start date.
// Joining on/after the 15th of the month counts as a half-month; result is
// rounded to the nearest 0.5 day.
export function prorateEntitlement(fullEntitlement, startISO, year = new Date().getFullYear()) {
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return fullEntitlement;
  if (start.getFullYear() < year) return fullEntitlement; // joined before the year — full
  if (start.getFullYear() > year) return 0; // joins next year — none this year

  const startMonth = start.getMonth(); // 0-11
  let monthsRemaining = 12 - startMonth; // includes the joining month
  if (start.getDate() >= 15) monthsRemaining -= 0.5;

  const prorated = (fullEntitlement * monthsRemaining) / 12;
  return Math.round(prorated * 2) / 2; // nearest 0.5 day
}

// 10 offices per the client brief; carryForwardMax is 5 days for everyone.
export const LEAVE_POLICIES = [
  { country: "SG", countryName: "Singapore", annualMin: 14, annualMax: 24, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: "TH", countryName: "Thailand", annualMin: 8, annualMax: 11, sickMc: 30, sickNoMc: 0, carryForwardMax: 5 },
  { country: "CN", countryName: "China", annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: "ID", countryName: "Indonesia", annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: "JP", countryName: "Japan", annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: "MY", countryName: "Malaysia", annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: "MM", countryName: "Myanmar", annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: "NZ", countryName: "New Zealand", annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: "PH", countryName: "Philippines", annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
  { country: "VN", countryName: "Vietnam", annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
];

export const policyFor = (countryCode) =>
  LEAVE_POLICIES.find((p) => p.country === countryCode) ?? LEAVE_POLICIES[0];

export const LOCALES = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "th", label: "ไทย" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "ja", label: "日本語" },
];
