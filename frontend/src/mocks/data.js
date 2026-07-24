// In-memory fixtures for the mock API — stand-in for a real backend until
// one is available. Swap off via VITE_USE_MOCK_API=false (see .env.example).
import { LEAVE_POLICIES } from "../lib/entitlement";

const SEED_USERS = [
  { id: 1, name: "Wei Ling Tan", email: "weiling@innovare.com", password: "demo123!", role: "EMPLOYEE", team: "Finance", country: "Singapore", countryCode: "SG", initials: "WT", gender: "F", dateOfBirth: "1996-04-12", children: [], phone: "+65 9123 4561", locale: "en", notifyEmail: true, notifyInApp: true, status: "ACTIVE", failedLoginCount: 0, lockedUntil: null },
  { id: 2, name: "Priya Sharma", email: "priya@innovare.com", password: "demo123!", role: "EMPLOYEE", team: "Finance", country: "Singapore", countryCode: "SG", initials: "PS", gender: "F", dateOfBirth: "1998-11-02", children: [{ name: "Aarav", dob: "2019-08-15" }], phone: "+65 9123 4562", locale: "en", notifyEmail: true, notifyInApp: true, status: "ACTIVE", failedLoginCount: 0, lockedUntil: null },
  { id: 3, name: "Kumar Rajan", email: "kumar@innovare.com", password: "demo123!", role: "EMPLOYEE", team: "Finance", country: "Singapore", countryCode: "SG", initials: "KR", gender: "M", dateOfBirth: "1994-07-08", children: [{ name: "Meera", dob: "2015-02-10" }], completedNS: true, phone: "+65 9123 4563", locale: "en", notifyEmail: true, notifyInApp: false, status: "ACTIVE", failedLoginCount: 0, lockedUntil: null },
  { id: 4, name: "Marcus Lee", email: "marcus@innovare.com", password: "demo123!", role: "SUPERVISOR", team: "Finance", country: "Singapore", countryCode: "SG", initials: "ML", gender: "M", dateOfBirth: "1985-09-15", children: [], completedNS: true, phone: "+65 9123 4564", locale: "en", notifyEmail: true, notifyInApp: true, status: "ACTIVE", failedLoginCount: 0, lockedUntil: null },
  { id: 5, name: "Diana Ho", email: "diana@innovare.com", password: "demo123!", role: "MANAGER", team: "Finance", country: "Singapore", countryCode: "SG", initials: "DH", gender: "F", dateOfBirth: "1982-01-30", children: [], phone: "+65 9123 4565", locale: "en", notifyEmail: true, notifyInApp: true, status: "ACTIVE", failedLoginCount: 0, lockedUntil: null },
  { id: 6, name: "Aisha Rahman", email: "hr@innovare.com", password: "demo123!", role: "HR_ADMIN", team: "People & Culture", country: "Singapore", countryCode: "SG", initials: "AR", gender: "F", dateOfBirth: "1988-03-21", children: [], phone: "+65 9123 4566", locale: "en", notifyEmail: true, notifyInApp: true, status: "ACTIVE", failedLoginCount: 0, lockedUntil: null },
];

export const publicUser = ({ password, ...rest }) => rest;

const USERS_KEY = "mock_users_v1";

// Persisted like requests below, so profile edits / new invited accounts
// survive a page refresh during manual testing.
function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupt/unavailable storage — fall through to the seed
  }
  return SEED_USERS.map((u) => ({ ...u }));
}

export const MOCK_USERS = loadUsers();

export function persistMockUsers() {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(MOCK_USERS));
  } catch {
    // storage unavailable — mutation still applies for the rest of this session
  }
}

let nextUserId = Math.max(6, ...MOCK_USERS.map((u) => u.id)) + 1;
export const allocateUserId = () => nextUserId++;

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

/* ======================================================================
   Member 1 — Platform, Identity & Self-Service fixtures
   ====================================================================== */

// ---- UC-25: session management & security log ----------------------------

const SEED_SESSIONS = [
  { id: 900, userId: 1, deviceInfo: "Chrome on macOS", ipAddress: "203.0.113.4", lastActive: "2026-07-20T08:40:00Z", revokedAt: null, createdAt: "2026-07-18T08:00:00Z" },
  { id: 901, userId: 1, deviceInfo: "Safari on iPhone", ipAddress: "203.0.113.9", lastActive: "2026-07-19T18:05:00Z", revokedAt: null, createdAt: "2026-07-15T08:00:00Z" },
  { id: 902, userId: 4, deviceInfo: "Chrome on Windows", ipAddress: "203.0.113.11", lastActive: "2026-07-20T09:15:00Z", revokedAt: null, createdAt: "2026-07-10T08:00:00Z" },
  { id: 903, userId: 6, deviceInfo: "Edge on Windows", ipAddress: "203.0.113.20", lastActive: "2026-07-20T07:55:00Z", revokedAt: null, createdAt: "2026-07-01T08:00:00Z" },
];

const SEED_SECURITY_EVENTS = [
  { id: 950, userId: 1, eventType: "LOGIN", ipAddress: "203.0.113.4", success: true, createdAt: "2026-07-20T08:40:00Z" },
  { id: 951, userId: 1, eventType: "LOGIN", ipAddress: "203.0.113.9", success: true, createdAt: "2026-07-19T18:05:00Z" },
  { id: 952, userId: 1, eventType: "FAILED_LOGIN", ipAddress: "198.51.100.7", success: false, createdAt: "2026-07-17T21:12:00Z" },
  { id: 953, userId: 4, eventType: "LOGIN", ipAddress: "203.0.113.11", success: true, createdAt: "2026-07-20T09:15:00Z" },
  { id: 954, userId: 6, eventType: "LOGIN", ipAddress: "203.0.113.20", success: true, createdAt: "2026-07-20T07:55:00Z" },
];

const SESSIONS_KEY = "mock_sessions_v1";
const SECURITY_EVENTS_KEY = "mock_security_events_v1";

function loadFromStorage(key, seed) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupt/unavailable storage — fall through to the seed
  }
  return seed.map((r) => ({ ...r }));
}

const persistTo = (key, arr) => {
  try {
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    // storage unavailable — mutation still applies for the rest of this session
  }
};

export const MOCK_SESSIONS = loadFromStorage(SESSIONS_KEY, SEED_SESSIONS);
export const persistMockSessions = () => persistTo(SESSIONS_KEY, MOCK_SESSIONS);

export const MOCK_SECURITY_EVENTS = loadFromStorage(SECURITY_EVENTS_KEY, SEED_SECURITY_EVENTS);
export const persistMockSecurityEvents = () => persistTo(SECURITY_EVENTS_KEY, MOCK_SECURITY_EVENTS);

let nextSessionId = Math.max(903, ...MOCK_SESSIONS.map((s) => s.id)) + 1;
export const allocateSessionId = () => nextSessionId++;
let nextEventId = Math.max(954, ...MOCK_SECURITY_EVENTS.map((e) => e.id)) + 1;
export const allocateEventId = () => nextEventId++;

export const logSecurityEvent = (userId, eventType, ipAddress, success = true) => {
  MOCK_SECURITY_EVENTS.unshift({
    id: allocateEventId(),
    userId,
    eventType,
    ipAddress: ipAddress ?? "127.0.0.1",
    success,
    createdAt: new Date().toISOString(),
  });
  persistMockSecurityEvents();
};

export const LOCK_THRESHOLD = 3;
export const LOCK_MINUTES = 15;

// ---- UC-26: system announcements ------------------------------------------

const SEED_ANNOUNCEMENTS = [
  {
    id: 800,
    title: "Scheduled maintenance this weekend",
    body: "The Leave Management System will be briefly unavailable on Saturday 01:00–02:00 SGT for scheduled maintenance.",
    targetType: "ALL",
    targetValue: null,
    startDate: "2026-07-15",
    endDate: "2026-08-15",
    requiresAck: false,
    createdByName: "Aisha Rahman",
    active: true,
    createdAt: "2026-07-15T09:00:00Z",
  },
  {
    id: 801,
    title: "New leave policy acknowledgement required",
    body: "Please review and acknowledge the updated annual-leave carry-forward policy (capped at 5 days) before continuing.",
    targetType: "ROLE",
    targetValue: "EMPLOYEE",
    startDate: "2026-07-01",
    endDate: "2026-12-31",
    requiresAck: true,
    createdByName: "Aisha Rahman",
    active: true,
    createdAt: "2026-07-01T09:00:00Z",
  },
];

const SEED_ANNOUNCEMENT_ACKS = [];

const ANNOUNCEMENTS_KEY = "mock_announcements_v1";
const ANNOUNCEMENT_ACKS_KEY = "mock_announcement_acks_v1";

export const MOCK_ANNOUNCEMENTS = loadFromStorage(ANNOUNCEMENTS_KEY, SEED_ANNOUNCEMENTS);
export const persistMockAnnouncements = () => persistTo(ANNOUNCEMENTS_KEY, MOCK_ANNOUNCEMENTS);

export const MOCK_ANNOUNCEMENT_ACKS = loadFromStorage(ANNOUNCEMENT_ACKS_KEY, SEED_ANNOUNCEMENT_ACKS);
export const persistMockAnnouncementAcks = () => persistTo(ANNOUNCEMENT_ACKS_KEY, MOCK_ANNOUNCEMENT_ACKS);

let nextAnnouncementId = Math.max(801, ...MOCK_ANNOUNCEMENTS.map((a) => a.id)) + 1;
export const allocateAnnouncementId = () => nextAnnouncementId++;

export const announcementTargetsUser = (a, user) => {
  if (a.targetType === "ALL") return true;
  if (a.targetType === "COUNTRY") return a.targetValue === user.countryCode;
  if (a.targetType === "ROLE") return a.targetValue === user.role;
  return false;
};

// ---- UC-24: new-employee invitation & onboarding --------------------------

const SEED_INVITATIONS = [];
const INVITATIONS_KEY = "mock_invitations_v1";

export const MOCK_INVITATIONS = loadFromStorage(INVITATIONS_KEY, SEED_INVITATIONS);
export const persistMockInvitations = () => persistTo(INVITATIONS_KEY, MOCK_INVITATIONS);

let nextInvitationId = 1;
export const allocateInvitationId = () => nextInvitationId++;

export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

// ---- UC-20: bulk yearly entitlement & pro-ration --------------------------

export { LEAVE_POLICIES };

// ---- UC-23: password reset (forgot-password flow) -------------------------

export const MOCK_RESET_TOKENS = new Map(); // token -> { userId, expiresAt }
export const RESET_TTL_MS = 30 * 60 * 1000;
