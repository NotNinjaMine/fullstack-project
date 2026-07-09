// In-memory fixtures for the mock API — stand-in for Members 3/4's backend
// until it's available. Swap off via VITE_USE_MOCK_API=false (see .env.example).

export const MOCK_USERS = [
  { id: 1, name: "Wei Ling Tan", email: "weiling@innovare.com", password: "demo123!", role: "EMPLOYEE", team: "Finance", country: "Singapore", initials: "WT", gender: "F", dateOfBirth: "1996-04-12", children: [] },
  { id: 2, name: "Priya Sharma", email: "priya@innovare.com", password: "demo123!", role: "EMPLOYEE", team: "Finance", country: "Singapore", initials: "PS", gender: "F", dateOfBirth: "1998-11-02", children: [{ name: "Aarav", dob: "2019-08-15" }] },
  { id: 3, name: "Kumar Rajan", email: "kumar@innovare.com", password: "demo123!", role: "EMPLOYEE", team: "Finance", country: "Singapore", initials: "KR", gender: "M", dateOfBirth: "1994-07-08", children: [{ name: "Meera", dob: "2015-02-10" }], completedNS: true },
  { id: 4, name: "Marcus Lee", email: "marcus@innovare.com", password: "demo123!", role: "SUPERVISOR", team: "Finance", country: "Singapore", initials: "ML", gender: "M", dateOfBirth: "1985-09-15", children: [], completedNS: true },
  { id: 5, name: "Diana Ho", email: "diana@innovare.com", password: "demo123!", role: "MANAGER", team: "Finance", country: "Singapore", initials: "DH", gender: "F", dateOfBirth: "1982-01-30", children: [] },
];

export const publicUser = ({ password, ...rest }) => rest;

export const findUserByToken = (authHeader) => {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "");
  const match = token.match(/^mock-jwt-(\d+)$/);
  if (!match) return null;
  return MOCK_USERS.find((u) => u.id === Number(match[1])) ?? null;
};

// Minimum team headcount that must stay on duty (UC-07 coverage threshold)
export const MIN_PRESENT = 2;

export const TEAM_BY_NAME = (team) =>
  MOCK_USERS.filter((u) => u.team === team && u.role === "EMPLOYEE").map((u) => ({
    id: u.id,
    name: u.name,
    initials: u.initials,
  }));

export const HOLIDAYS_BY_COUNTRY = {
  Singapore: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-17", name: "Chinese New Year" },
    { date: "2026-02-18", name: "Chinese New Year (2nd day)" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-08-09", name: "National Day" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],
};

// Balances keyed by user id, mirroring the leave_balances table shape
// Types with an age- or context-dependent entitlement (childcare) are
// computed on the fly in mocks/server.js instead of being stored here.
export const BALANCES_BY_USER = {
  1: [
    { leaveType: "annual", entitled: 14, carried: 3, used: 2 },
    { leaveType: "sick_mc", entitled: 14, carried: 0, used: 0 },
    { leaveType: "sick_nomc", entitled: 2, carried: 0, used: 0 },
    { leaveType: "maternity", entitled: 112, carried: 0, used: 0 },
    { leaveType: "compassionate", entitled: 3, carried: 0, used: 0 },
    { leaveType: "hospitalisation", entitled: 60, carried: 0, used: 0 },
    { leaveType: "study_exam", entitled: 3, carried: 0, used: 0 },
    { leaveType: "birthday", entitled: 1, carried: 0, used: 0 },
  ],
  2: [
    { leaveType: "annual", entitled: 14, carried: 0, used: 5 },
    { leaveType: "sick_mc", entitled: 14, carried: 0, used: 1 },
    { leaveType: "sick_nomc", entitled: 2, carried: 0, used: 0 },
    { leaveType: "maternity", entitled: 112, carried: 0, used: 0 },
    { leaveType: "shared_parental", entitled: 20, carried: 0, used: 0 },
    { leaveType: "compassionate", entitled: 3, carried: 0, used: 0 },
    { leaveType: "hospitalisation", entitled: 60, carried: 0, used: 0 },
    { leaveType: "study_exam", entitled: 3, carried: 0, used: 0 },
    { leaveType: "birthday", entitled: 1, carried: 0, used: 0 },
  ],
  3: [
    { leaveType: "annual", entitled: 14, carried: 1, used: 6 },
    { leaveType: "sick_mc", entitled: 14, carried: 0, used: 0 },
    { leaveType: "sick_nomc", entitled: 2, carried: 0, used: 1 },
    { leaveType: "paternity", entitled: 10, carried: 0, used: 0 },
    { leaveType: "shared_parental", entitled: 20, carried: 0, used: 0 },
    { leaveType: "compassionate", entitled: 3, carried: 0, used: 0 },
    { leaveType: "hospitalisation", entitled: 60, carried: 0, used: 0 },
    { leaveType: "national_service", entitled: 14, carried: 0, used: 0 },
    { leaveType: "study_exam", entitled: 3, carried: 0, used: 0 },
    { leaveType: "birthday", entitled: 1, carried: 0, used: 0 },
  ],
};

const SEED_REQUESTS = [
  { id: 100, userId: 2, leaveType: "annual", startDate: "2026-07-14", endDate: "2026-07-16", halfDay: false, halfDayPeriod: null, status: "APPROVED", flagged: false, days: 3, reason: "Family trip", createdAt: "2026-06-20T09:00:00Z" },
  { id: 101, userId: 3, leaveType: "annual", startDate: "2026-07-15", endDate: "2026-07-15", halfDay: false, halfDayPeriod: null, status: "APPROVED", flagged: false, days: 1, reason: "Personal errand", createdAt: "2026-06-22T09:00:00Z" },
  { id: 102, userId: 1, leaveType: "annual", startDate: "2026-05-10", endDate: "2026-05-12", halfDay: false, halfDayPeriod: null, status: "APPROVED", flagged: false, days: 3, reason: "Family trip", createdAt: "2026-04-01T09:00:00Z" },
  { id: 103, userId: 1, leaveType: "sick_mc", startDate: "2026-03-03", endDate: "2026-03-03", halfDay: false, halfDayPeriod: null, status: "REJECTED", flagged: false, days: 1, reason: "Fever", createdAt: "2026-03-01T09:00:00Z" },
];

const STORAGE_KEY = "mock_leave_requests_v1";

// The mock has no server process to hold state, so without this a page
// refresh during manual testing would silently reset every apply/cancel
// back to the seed data. Persisted to localStorage; clear that key (or run
// localStorage.removeItem("mock_leave_requests_v1") in devtools) to reset.
function loadRequests() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupt/unavailable storage — fall through to the seed
  }
  return SEED_REQUESTS.map((r) => ({ ...r }));
}

// Mutable in-memory request log — apply/cancel mutate this array directly
export const MOCK_REQUESTS = loadRequests();

export function persistMockRequests() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_REQUESTS));
  } catch {
    // storage unavailable — mutation still applies for the rest of this session
  }
}

let nextRequestId = Math.max(103, ...MOCK_REQUESTS.map((r) => r.id)) + 1;
export const allocateRequestId = () => nextRequestId++;

// --- Email OTP (login 2FA) ----------------------------------------------
// In-memory only, deliberately not persisted: an interrupted verification
// is expected to restart from login rather than survive a page refresh.
// Stands in for a real email-delivered OTP until Members 3/4/5 wire up an
// actual mail service (e.g. SES/SendGrid) behind /user/login.
const OTP_STORE = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const generateOtpCode = () => String(Math.floor(100000 + Math.random() * 900000));

export function maskEmail(email) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
}

export function createOtpChallenge(user) {
  const otpToken = `otp-${user.id}-${Math.random().toString(36).slice(2)}`;
  const code = generateOtpCode();
  OTP_STORE.set(otpToken, { userId: user.id, code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  return { otpToken, code };
}

export function verifyOtpChallenge(otpToken, code) {
  const challenge = OTP_STORE.get(otpToken);
  if (!challenge) {
    return { ok: false, message: "This verification session has expired. Please sign in again." };
  }
  if (Date.now() > challenge.expiresAt) {
    OTP_STORE.delete(otpToken);
    return { ok: false, message: "Your code has expired. Please sign in again." };
  }
  if (challenge.code !== code) {
    challenge.attempts += 1;
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      OTP_STORE.delete(otpToken);
      return { ok: false, message: "Too many incorrect attempts. Please sign in again." };
    }
    return { ok: false, message: `Incorrect code. ${OTP_MAX_ATTEMPTS - challenge.attempts} attempt(s) left.` };
  }
  OTP_STORE.delete(otpToken);
  const user = MOCK_USERS.find((u) => u.id === challenge.userId);
  return { ok: true, user };
}

export function resendOtpChallenge(otpToken) {
  const challenge = OTP_STORE.get(otpToken);
  if (!challenge) return null;
  challenge.code = generateOtpCode();
  challenge.expiresAt = Date.now() + OTP_TTL_MS;
  challenge.attempts = 0;
  return { otpToken, code: challenge.code };
}
