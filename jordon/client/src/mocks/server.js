import MockAdapter from "axios-mock-adapter";
import {
  MOCK_USERS,
  MOCK_REQUESTS,
  BALANCES_BY_USER,
  HOLIDAYS_BY_COUNTRY,
  TEAM_BY_NAME,
  publicUser,
  findUserByToken,
  allocateRequestId,
  persistMockRequests,
  persistMockUsers,
  allocateUserId,
  MOCK_SESSIONS,
  persistMockSessions,
  allocateSessionId,
  MOCK_SECURITY_EVENTS,
  persistMockSecurityEvents,
  logSecurityEvent,
  LOCK_THRESHOLD,
  LOCK_MINUTES,
  MOCK_ANNOUNCEMENTS,
  persistMockAnnouncements,
  allocateAnnouncementId,
  MOCK_ANNOUNCEMENT_ACKS,
  persistMockAnnouncementAcks,
  announcementTargetsUser,
  MOCK_INVITATIONS,
  persistMockInvitations,
  allocateInvitationId,
  INVITE_TTL_MS,
  LEAVE_POLICIES,
  MOCK_RESET_TOKENS,
  RESET_TTL_MS,
} from "./data";
import { computeCoverage } from "./coverage";
import { parseNaturalLanguage } from "./parseNaturalLanguage";
import { LEAVE_TYPES, childcareEntitlement, isSameDayOfYear } from "../lib/leaveTypes";
import { prorateEntitlement, policyFor } from "../lib/entitlement";

const authHeaderOf = (config) => config.headers?.Authorization ?? config.headers?.authorization;

const requireUser = (config) => findUserByToken(authHeaderOf(config));

const UNAUTHORISED = [401, { message: "Invalid or expired session." }];
const FORBIDDEN = [403, { message: "Forbidden: insufficient role." }];

const requireRole = (user, ...roles) => user && roles.includes(user.role);

const CANCELLABLE = ["PENDING_SUPERVISOR", "PENDING_MANAGER"];

// Simple stand-in for a signed random token — good enough for a client-only
// mock; a real backend would use crypto.randomBytes + a SHA-256 hash at rest.
const randomToken = () =>
  Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

function balancesFor(user) {
  const stored = BALANCES_BY_USER[user.id] ?? [];
  const childcare = childcareEntitlement(user);
  if (childcare > 0 && !stored.some((b) => b.leaveType === "childcare")) {
    return [...stored, { leaveType: "childcare", entitled: childcare, carried: 0, used: 0 }];
  }
  return stored;
}

// Mirrors the client's "available = entitled + carried - used - pending"
// math (useLeave.js) so the mock rejects the same over-applications the UI
// would already grey out.
function remainingFor(user, leaveType) {
  const balance = balancesFor(user).find((b) => b.leaveType === leaveType);
  if (!balance) return 0;
  const pending = MOCK_REQUESTS.filter(
    (r) => r.userId === user.id && r.leaveType === leaveType && CANCELLABLE.includes(r.status)
  ).reduce((sum, r) => sum + Number(r.days), 0);
  return Number(balance.entitled) + Number(balance.carried) - Number(balance.used) - pending;
}

const isLocked = (user) => !!(user.lockedUntil && new Date(user.lockedUntil) > new Date());

// Stands in for a real Express API until one is available.
// Toggle off via VITE_USE_MOCK_API=false once a real backend is running.
export function installMockApi(api) {
  const mock = new MockAdapter(api, { delayResponse: 350 });

  mock.onPost("/user/login").reply((config) => {
    const { email, password } = JSON.parse(config.data || "{}");
    const genericError = { message: "Invalid email or password." };
    const user = MOCK_USERS.find((u) => u.email === email);
    if (!user) return [401, genericError];

    if (isLocked(user)) {
      return [
        423,
        {
          message: `Account locked after too many failed attempts. Try again after ${new Date(
            user.lockedUntil
          ).toLocaleTimeString("en-SG")}, or ask HR to unlock.`,
        },
      ];
    }
    if (user.status === "INVITED") {
      return [403, { message: "This account has not been activated. Please use your invitation link to set a password." }];
    }
    if (user.status === "DEACTIVATED") {
      return [403, { message: "This account has been deactivated. Contact HR." }];
    }

    if (user.password !== password) {
      user.failedLoginCount = Number(user.failedLoginCount || 0) + 1;
      logSecurityEvent(user.id, "FAILED_LOGIN", "198.51.100.7", false);
      if (user.failedLoginCount >= LOCK_THRESHOLD) {
        user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
        logSecurityEvent(user.id, "LOCKED", "198.51.100.7", false);
        persistMockUsers();
        return [423, { message: "Too many failed attempts — account locked for 15 minutes." }];
      }
      persistMockUsers();
      return [401, genericError];
    }

    user.failedLoginCount = 0;
    user.lockedUntil = null;
    persistMockUsers();

    const accessToken = `mock-jwt-${user.id}`;
    MOCK_SESSIONS.push({
      id: allocateSessionId(),
      userId: user.id,
      deviceInfo: navigator.userAgent?.slice(0, 80) || "Unknown device",
      ipAddress: "203.0.113.50",
      lastActive: new Date().toISOString(),
      revokedAt: null,
      createdAt: new Date().toISOString(),
    });
    persistMockSessions();
    logSecurityEvent(user.id, "LOGIN", "203.0.113.50", true);

    return [200, { accessToken, user: publicUser(user) }];
  });

  mock.onGet("/user/auth").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    return [200, { user: publicUser(user) }];
  });

  // ---- UC-23: forgot / reset password (public — no auth) ------------------

  mock.onPost("/user/forgot-password").reply((config) => {
    const { email } = JSON.parse(config.data || "{}");
    const genericMsg = "If that email is registered, a reset link has been sent. The link expires in 30 minutes.";
    const user = MOCK_USERS.find((u) => u.email === email);
    if (!user) return [200, { message: genericMsg }];

    const token = randomToken();
    MOCK_RESET_TOKENS.set(token, { userId: user.id, expiresAt: Date.now() + RESET_TTL_MS });
    // Demo mode: no SMTP server exists in a client-only mock, so the token is
    // returned directly (a real backend would only ever email it).
    return [200, { message: genericMsg, demoResetToken: token }];
  });

  mock.onPost("/user/reset-password").reply((config) => {
    const { token, password } = JSON.parse(config.data || "{}");
    const entry = MOCK_RESET_TOKENS.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      return [400, { message: "This reset link is invalid or has expired. Please request a new one." }];
    }
    const user = MOCK_USERS.find((u) => u.id === entry.userId);
    if (!user) return [400, { message: "This reset link is invalid or has expired. Please request a new one." }];
    user.password = password;
    persistMockUsers();
    MOCK_RESET_TOKENS.delete(token); // single-use
    logSecurityEvent(user.id, "PASSWORD_CHANGE", "203.0.113.50", true);
    return [200, { message: "Password updated. You can now sign in with your new password." }];
  });

  // ---- UC-23: self-service profile & preferences ---------------------------

  mock.onGet("/user/profile").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    return [200, publicUser(user)];
  });

  mock.onPut("/user/profile").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    const data = JSON.parse(config.data || "{}");
    if (data.name !== undefined) user.name = data.name;
    if (data.phone !== undefined) user.phone = data.phone;
    if (data.locale !== undefined) user.locale = data.locale;
    if (data.notifyEmail !== undefined) user.notifyEmail = !!data.notifyEmail;
    if (data.notifyInApp !== undefined) user.notifyInApp = !!data.notifyInApp;
    persistMockUsers();
    return [200, { message: "Profile updated.", user: publicUser(user) }];
  });

  mock.onPut("/user/password").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    const { currentPassword, newPassword } = JSON.parse(config.data || "{}");
    if (user.password !== currentPassword) {
      return [400, { message: "Current password is incorrect." }];
    }
    if (!newPassword || newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return [400, { message: "New password must be at least 8 characters with a letter and a number." }];
    }
    user.password = newPassword;
    persistMockUsers();
    logSecurityEvent(user.id, "PASSWORD_CHANGE", "203.0.113.50", true);
    return [200, { message: "Password changed successfully." }];
  });

  // ---- UC-25: session management & security log ----------------------------

  mock.onGet("/user/sessions").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    const list = MOCK_SESSIONS.filter((s) => s.userId === user.id && !s.revokedAt).sort((a, b) =>
      a.lastActive < b.lastActive ? 1 : -1
    );
    return [200, list];
  });

  mock.onPut(/\/user\/sessions\/\d+\/revoke$/).reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    const id = Number(config.url.match(/\/user\/sessions\/(\d+)\/revoke$/)[1]);
    const session = MOCK_SESSIONS.find((s) => s.id === id);
    if (!session) return [404, { message: "Session not found." }];
    if (session.userId !== user.id) return [403, { message: "Forbidden." }];
    session.revokedAt = new Date().toISOString();
    persistMockSessions();
    logSecurityEvent(user.id, "SESSION_REVOKED", "203.0.113.50", true);
    return [200, { message: "Session revoked." }];
  });

  mock.onGet("/user/security-log").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const list = MOCK_SECURITY_EVENTS.filter(
      (e) => e.userId === user.id && new Date(e.createdAt) >= oneYearAgo
    ).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return [200, list.slice(0, 200)];
  });

  // ---- UC-25: HR — force-logout & unlock any user --------------------------

  mock.onPut(/\/user\/\d+\/unlock$/).reply((config) => {
    const actor = requireUser(config);
    if (!actor) return UNAUTHORISED;
    if (!requireRole(actor, "HR_ADMIN")) return FORBIDDEN;
    const id = Number(config.url.match(/\/user\/(\d+)\/unlock$/)[1]);
    const target = MOCK_USERS.find((u) => u.id === id);
    if (!target) return [404, { message: "User not found." }];
    target.failedLoginCount = 0;
    target.lockedUntil = null;
    persistMockUsers();
    return [200, { message: `${target.name} unlocked.` }];
  });

  mock.onPut(/\/user\/\d+\/force-logout$/).reply((config) => {
    const actor = requireUser(config);
    if (!actor) return UNAUTHORISED;
    if (!requireRole(actor, "HR_ADMIN")) return FORBIDDEN;
    const id = Number(config.url.match(/\/user\/(\d+)\/force-logout$/)[1]);
    let revoked = 0;
    MOCK_SESSIONS.forEach((s) => {
      if (s.userId === id && !s.revokedAt) {
        s.revokedAt = new Date().toISOString();
        revoked++;
      }
    });
    persistMockSessions();
    logSecurityEvent(id, "SESSION_REVOKED", "203.0.113.50", true);
    return [200, { message: `${revoked} session(s) revoked.`, revoked }];
  });

  // ---- UC-26: system announcements ------------------------------------------

  mock.onGet("/announcement/active").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    const today = new Date().toISOString().slice(0, 10);
    const targeted = MOCK_ANNOUNCEMENTS.filter(
      (a) => a.active && a.startDate <= today && a.endDate >= today && announcementTargetsUser(a, user)
    );
    const acked = new Set(
      MOCK_ANNOUNCEMENT_ACKS.filter((k) => k.userId === user.id).map((k) => k.announcementId)
    );
    const result = targeted
      .filter((a) => !(a.requiresAck && acked.has(a.id)))
      .map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        requiresAck: a.requiresAck,
        createdByName: a.createdByName,
        startDate: a.startDate,
        endDate: a.endDate,
      }));
    return [200, result];
  });

  mock.onPost(/\/announcement\/\d+\/ack$/).reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    const id = Number(config.url.match(/\/announcement\/(\d+)\/ack$/)[1]);
    if (!MOCK_ANNOUNCEMENT_ACKS.some((k) => k.announcementId === id && k.userId === user.id)) {
      MOCK_ANNOUNCEMENT_ACKS.push({ announcementId: id, userId: user.id, ackedAt: new Date().toISOString() });
      persistMockAnnouncementAcks();
    }
    return [200, { message: "Acknowledged." }];
  });

  mock.onGet("/announcement").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    if (!requireRole(user, "HR_ADMIN")) return FORBIDDEN;
    const list = [...MOCK_ANNOUNCEMENTS]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((a) => ({
        ...a,
        ackCount: MOCK_ANNOUNCEMENT_ACKS.filter((k) => k.announcementId === a.id).length,
      }));
    return [200, list];
  });

  mock.onPost("/announcement").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    if (!requireRole(user, "HR_ADMIN")) return FORBIDDEN;
    const data = JSON.parse(config.data || "{}");
    if (!data.title?.trim() || !data.body?.trim()) {
      return [400, { errors: ["Title and body are required."] }];
    }
    if (!data.startDate || !data.endDate || data.endDate < data.startDate) {
      return [400, { message: "endDate must be on or after startDate." }];
    }
    if (data.targetType !== "ALL" && !data.targetValue) {
      return [400, { message: "targetValue is required for COUNTRY/ROLE targeting." }];
    }
    const a = {
      id: allocateAnnouncementId(),
      title: data.title.trim(),
      body: data.body.trim(),
      targetType: data.targetType || "ALL",
      targetValue: data.targetType === "ALL" ? null : data.targetValue,
      startDate: data.startDate,
      endDate: data.endDate,
      requiresAck: !!data.requiresAck,
      createdByName: user.name,
      active: true,
      createdAt: new Date().toISOString(),
    };
    MOCK_ANNOUNCEMENTS.push(a);
    persistMockAnnouncements();
    return [200, a];
  });

  mock.onPut(/\/announcement\/\d+\/deactivate$/).reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    if (!requireRole(user, "HR_ADMIN")) return FORBIDDEN;
    const id = Number(config.url.match(/\/announcement\/(\d+)\/deactivate$/)[1]);
    const a = MOCK_ANNOUNCEMENTS.find((x) => x.id === id);
    if (!a) return [404, { message: "Announcement not found." }];
    a.active = false;
    persistMockAnnouncements();
    return [200, { message: "Announcement deactivated." }];
  });

  // ---- UC-24: new-employee invitation & onboarding --------------------------

  mock.onGet("/invitation").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    if (!requireRole(user, "HR_ADMIN")) return FORBIDDEN;
    const now = Date.now();
    const list = [...MOCK_INVITATIONS]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((v) => ({
        id: v.id,
        email: v.email,
        name: v.name,
        countryCode: v.countryCode,
        team: v.team,
        role: v.role,
        status: v.acceptedAt ? "ACCEPTED" : new Date(v.expiresAt).getTime() < now ? "EXPIRED" : "PENDING",
        invitedByName: v.invitedByName,
        createdAt: v.createdAt,
        expiresAt: v.expiresAt,
      }));
    return [200, list];
  });

  mock.onPost("/invitation").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    if (!requireRole(user, "HR_ADMIN")) return FORBIDDEN;
    const data = JSON.parse(config.data || "{}");
    if (!data.name?.trim() || !data.email?.trim()) {
      return [400, { errors: ["name and email are required."] }];
    }
    if (MOCK_USERS.some((u) => u.email === data.email) || MOCK_INVITATIONS.some((v) => v.email === data.email && !v.acceptedAt)) {
      return [400, { message: "Email already exists or has a pending invitation." }];
    }
    const policy = policyFor(data.countryCode || "SG");
    const countryNames = { SG: "Singapore", TH: "Thailand", CN: "China", ID: "Indonesia", JP: "Japan", MY: "Malaysia", MM: "Myanmar", NZ: "New Zealand", PH: "Philippines", VN: "Vietnam" };

    // Create the account up-front as INVITED (inactive) with a random password.
    const newUser = {
      id: allocateUserId(),
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      password: randomToken().slice(0, 12),
      role: data.role || "EMPLOYEE",
      team: data.team || "Finance",
      country: countryNames[data.countryCode] || "Singapore",
      countryCode: data.countryCode || "SG",
      initials: data.name.trim().split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase(),
      gender: null,
      dateOfBirth: null,
      children: [],
      phone: "",
      locale: "en",
      notifyEmail: true,
      notifyInApp: true,
      status: "INVITED",
      failedLoginCount: 0,
      lockedUntil: null,
    };
    MOCK_USERS.push(newUser);
    persistMockUsers();
    // Pre-seed a balance row so the account is immediately usable post-activation.
    BALANCES_BY_USER[newUser.id] = [
      { leaveType: "annual", entitled: policy.annualMin, carried: 0, used: 0 },
      { leaveType: "sick_mc", entitled: policy.sickMc, carried: 0, used: 0 },
      { leaveType: "sick_nomc", entitled: policy.sickNoMc, carried: 0, used: 0 },
    ];

    const token = randomToken();
    const invite = {
      id: allocateInvitationId(),
      email: newUser.email,
      name: newUser.name,
      countryCode: newUser.countryCode,
      team: newUser.team,
      role: newUser.role,
      startDate: data.startDate || null,
      token,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
      acceptedAt: null,
      invitedByName: user.name,
      createdAt: new Date().toISOString(),
    };
    MOCK_INVITATIONS.push(invite);
    persistMockInvitations();

    // Demo mode: no email server exists, so the raw token is returned so the
    // flow can be completed end to end without SMTP.
    return [200, {
      message: `Invitation sent to ${newUser.email}. The link expires in 48 hours.`,
      invitationId: invite.id,
      demoInviteToken: token,
    }];
  });

  // Public — no auth required (the invitee has no session yet)
  mock.onGet(/\/invitation\/verify/).reply((config) => {
    const url = new URL(config.url, "http://mock.local");
    const token = url.searchParams.get("token") || "";
    const invite = MOCK_INVITATIONS.find((v) => v.token === token && !v.acceptedAt);
    if (!invite || new Date(invite.expiresAt).getTime() < Date.now()) {
      return [400, { message: "This invitation is invalid or has expired." }];
    }
    return [200, { email: invite.email, name: invite.name, country: invite.countryCode, team: invite.team, role: invite.role }];
  });

  mock.onPost("/invitation/accept").reply((config) => {
    const data = JSON.parse(config.data || "{}");
    const invite = MOCK_INVITATIONS.find((v) => v.token === data.token && !v.acceptedAt);
    if (!invite || new Date(invite.expiresAt).getTime() < Date.now()) {
      return [400, { message: "This invitation is invalid or has expired." }];
    }
    if (!data.password || data.password.length < 8 || !/[a-zA-Z]/.test(data.password) || !/[0-9]/.test(data.password)) {
      return [400, { message: "Password must be at least 8 characters with a letter and a number." }];
    }
    const newUser = MOCK_USERS.find((u) => u.email === invite.email);
    if (!newUser) return [400, { message: "The invited account no longer exists." }];

    newUser.password = data.password;
    newUser.status = "ACTIVE";
    newUser.locale = data.locale || "en";
    newUser.notifyEmail = data.notifyEmail !== false;
    newUser.notifyInApp = data.notifyInApp !== false;
    persistMockUsers();

    // UC-24 → UC-20: pro-rate the annual entitlement from the start date on activation.
    if (invite.startDate) {
      const policy = policyFor(invite.countryCode);
      const prorated = prorateEntitlement(policy.annualMin, invite.startDate, new Date(invite.startDate).getFullYear());
      const balances = BALANCES_BY_USER[newUser.id];
      if (balances) {
        const annual = balances.find((b) => b.leaveType === "annual");
        if (annual) annual.entitled = prorated;
      }
    }

    invite.acceptedAt = new Date().toISOString();
    persistMockInvitations();

    return [200, { message: "Account activated. You can now sign in." }];
  });

  // ---- UC-20: bulk yearly entitlement update & pro-ration -------------------

  mock.onGet("/admin/policies").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    return [200, LEAVE_POLICIES];
  });

  mock.onGet(/\/admin\/entitlement\/preview/).reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    if (!requireRole(user, "HR_ADMIN")) return FORBIDDEN;
    const url = new URL(config.url, "http://mock.local");
    const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
    const rows = MOCK_USERS.filter((u) => u.status === "ACTIVE").map((u) => {
      const policy = policyFor(u.countryCode);
      const balances = BALANCES_BY_USER[u.id] ?? [];
      const annual = balances.find((b) => b.leaveType === "annual");
      return {
        userId: u.id,
        name: u.name,
        country: u.countryCode,
        currentEntitled: annual ? Number(annual.entitled) : null,
        targetEntitled: policy.annualMin,
      };
    });
    return [200, { year, rows }];
  });

  mock.onPost("/admin/entitlement/commit").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    if (!requireRole(user, "HR_ADMIN")) return FORBIDDEN;
    const { year } = JSON.parse(config.data || "{}");
    const targetYear = year || new Date().getFullYear();
    let updated = 0;
    MOCK_USERS.filter((u) => u.status === "ACTIVE").forEach((u) => {
      const policy = policyFor(u.countryCode);
      const balances = BALANCES_BY_USER[u.id] ?? (BALANCES_BY_USER[u.id] = []);
      let annual = balances.find((b) => b.leaveType === "annual");
      if (!annual) {
        annual = { leaveType: "annual", entitled: 0, carried: 0, used: 0 };
        balances.push(annual);
      }
      annual.entitled = policy.annualMin;
      updated++;
    });
    return [200, { year: targetYear, updated, message: `Entitlements updated for ${updated} employee(s) in ${targetYear}.` }];
  });

  mock.onPost("/admin/entitlement/prorate").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    if (!requireRole(user, "HR_ADMIN")) return FORBIDDEN;
    const { fullEntitlement, startDate } = JSON.parse(config.data || "{}");
    const prorated = prorateEntitlement(Number(fullEntitlement), startDate);
    return [200, { fullEntitlement: Number(fullEntitlement), startDate, prorated }];
  });

  /* ================= existing Employee Experience endpoints (unchanged) ================= */

  mock.onGet("/leave/balances").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    return [200, balancesFor(user)];
  });

  mock.onGet("/leave/mine").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    const mine = MOCK_REQUESTS.filter((r) => r.userId === user.id).sort((a, b) =>
      a.startDate < b.startDate ? 1 : -1
    );
    return [200, mine];
  });

  mock.onPost("/leave/apply").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    const body = JSON.parse(config.data || "{}");

    const typeDef = LEAVE_TYPES.find((t) => t.id === body.leaveType);
    if (!typeDef) return [400, { message: "Unknown leave type." }];
    if (typeDef.eligible && !typeDef.eligible(user)) {
      return [403, { message: `You are not eligible for ${typeDef.label}.` }];
    }
    if (typeDef.fixedToBirthday) {
      if (body.startDate !== body.endDate) {
        return [400, { message: "Birthday leave can only be taken as a single day." }];
      }
      if (body.halfDay) {
        return [400, { message: "Birthday leave cannot be taken as a half-day." }];
      }
      if (!isSameDayOfYear(user.dateOfBirth, body.startDate)) {
        return [400, { message: "Birthday leave can only be applied on your actual birthday." }];
      }
    }

    const { days, conflicts } = computeCoverage({
      requester: user,
      startDate: body.startDate,
      endDate: body.endDate,
    });
    const requestedDays = body.halfDay ? 0.5 : days;

    if (!typeDef.uncapped) {
      const remaining = remainingFor(user, body.leaveType);
      if (requestedDays > remaining) {
        return [400, { message: `Insufficient ${typeDef.label} balance: ${remaining} day(s) remaining.` }];
      }
    }

    const flagged = conflicts.length > 0;
    const request = {
      id: allocateRequestId(),
      userId: user.id,
      leaveType: body.leaveType,
      startDate: body.startDate,
      endDate: body.endDate,
      halfDay: !!body.halfDay,
      halfDayPeriod: body.halfDay ? body.halfDayPeriod : null,
      reason: body.reason,
      status: "PENDING_SUPERVISOR",
      flagged,
      days: requestedDays,
      createdAt: new Date().toISOString(),
    };
    MOCK_REQUESTS.push(request);
    persistMockRequests();
    return [201, { id: request.id, status: request.status, flagged, days: request.days }];
  });

  mock.onPut(/\/leave\/\d+\/cancel$/).reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    const id = Number(config.url.match(/\/leave\/(\d+)\/cancel$/)[1]);
    const request = MOCK_REQUESTS.find((r) => r.id === id && r.userId === user.id);
    if (!request) return [404, { message: "Leave request not found." }];
    if (!CANCELLABLE.includes(request.status)) {
      return [409, { message: `Cannot cancel a request that is already ${request.status.toLowerCase()}.` }];
    }
    request.status = "CANCELLED";
    persistMockRequests();
    return [200, { id, status: "CANCELLED", message: "Request cancelled." }];
  });

  mock.onPost("/leave/coverage-check").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    const { startDate, endDate } = JSON.parse(config.data || "{}");
    return [200, computeCoverage({ requester: user, startDate, endDate })];
  });

  mock.onGet("/leave/team-calendar").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    const team = TEAM_BY_NAME(user.team);
    const teamIds = team.map((t) => t.id);
    const approved = MOCK_REQUESTS.filter((r) => r.status === "APPROVED" && teamIds.includes(r.userId)).map(
      (r) => ({ userId: r.userId, startDate: r.startDate, endDate: r.endDate, halfDay: r.halfDay })
    );
    return [200, { team, approved }];
  });

  mock.onGet("/holiday").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    return [200, HOLIDAYS_BY_COUNTRY[user.country] ?? []];
  });

  mock.onPost("/ai/parse").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    const { text } = JSON.parse(config.data || "{}");
    return [200, parseNaturalLanguage(text || "")];
  });

  return mock;
}
