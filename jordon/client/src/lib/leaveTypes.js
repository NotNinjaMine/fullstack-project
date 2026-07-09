// Single source of truth for leave-type labels + eligibility rules, shared by
// the dashboard, apply form, history table, and the mock server's validation.

const ageInYears = (dobIso, onIso) => {
  const dob = new Date(dobIso);
  const on = new Date(onIso);
  let age = on.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    on.getMonth() < dob.getMonth() || (on.getMonth() === dob.getMonth() && on.getDate() < dob.getDate());
  return beforeBirthday ? age - 1 : age;
};

// Ignores year — true when the two dates fall on the same day of the year.
export const isSameDayOfYear = (dobIso, dateIso) => {
  const dob = new Date(dobIso);
  const date = new Date(dateIso);
  return dob.getMonth() === date.getMonth() && dob.getDate() === date.getDate();
};

// The employee's next occurrence of their birthday (today counts as next).
export const nextBirthdayOn = (dobIso, fromIso = new Date().toISOString().slice(0, 10)) => {
  const dob = new Date(dobIso);
  const from = new Date(fromIso);
  const todayOnly = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let candidate = new Date(from.getFullYear(), dob.getMonth(), dob.getDate());
  if (candidate < todayOnly) candidate = new Date(from.getFullYear() + 1, dob.getMonth(), dob.getDate());
  return candidate.toISOString().slice(0, 10);
};

// Mirrors the real-world tiering: a child under 7 unlocks the higher
// allowance; only a child 7 or older (and no younger sibling) gets the lower
// one. No children at all means no entitlement.
export function childcareEntitlement(user, onIso = new Date().toISOString().slice(0, 10)) {
  const children = user.children || [];
  if (children.length === 0) return 0;
  return children.some((c) => ageInYears(c.dob, onIso) < 7) ? 6 : 2;
}

export const LEAVE_TYPES = [
  { id: "annual", label: "Annual Leave" },
  { id: "sick_mc", label: "Sick Leave (with MC)" },
  { id: "sick_nomc", label: "Sick Leave (without MC)" },
  { id: "maternity", label: "Maternity Leave", eligible: (u) => u.gender === "F" },
  { id: "paternity", label: "Paternity Leave", eligible: (u) => u.gender === "M" },
  { id: "childcare", label: "Childcare Leave", eligible: (u) => (u.children?.length ?? 0) > 0 },
  {
    id: "shared_parental",
    label: "Shared Parental Leave",
    eligible: (u) => (u.children?.length ?? 0) > 0,
  },
  { id: "compassionate", label: "Compassionate Leave" },
  { id: "hospitalisation", label: "Hospitalisation Leave" },
  {
    id: "national_service",
    label: "National Service Leave",
    eligible: (u) => u.gender === "M" && !!u.completedNS,
  },
  { id: "study_exam", label: "Study/Exam Leave" },
  {
    id: "birthday",
    label: "Birthday Leave",
    fixedToBirthday: true,
    noHalfDay: true,
  },
  { id: "unpaid", label: "Unpaid Leave", uncapped: true },
];

export const leaveTypeLabel = (id) => LEAVE_TYPES.find((t) => t.id === id)?.label ?? id;

export const eligibleLeaveTypes = (user) => LEAVE_TYPES.filter((t) => !t.eligible || t.eligible(user));
