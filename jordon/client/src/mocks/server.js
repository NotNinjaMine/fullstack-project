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
  maskEmail,
  createOtpChallenge,
  verifyOtpChallenge,
  resendOtpChallenge,
} from "./data";
import { computeCoverage } from "./coverage";
import { parseNaturalLanguage } from "./parseNaturalLanguage";
import { LEAVE_TYPES, childcareEntitlement, isSameDayOfYear } from "../lib/leaveTypes";

const authHeaderOf = (config) => config.headers?.Authorization ?? config.headers?.authorization;

const requireUser = (config) => findUserByToken(authHeaderOf(config));

const UNAUTHORISED = [401, { message: "Invalid or expired session." }];

const CANCELLABLE = ["PENDING_SUPERVISOR", "PENDING_MANAGER"];

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

// Stands in for Members 3/4's Express API until it's available.
// Toggle off via VITE_USE_MOCK_API=false once a real backend is running.
export function installMockApi(api) {
  const mock = new MockAdapter(api, { delayResponse: 350 });

  mock.onPost("/user/login").reply((config) => {
    const { email, password } = JSON.parse(config.data || "{}");
    const user = MOCK_USERS.find((u) => u.email === email && u.password === password);
    if (!user) return [401, { message: "Invalid email or password." }];
    const { otpToken, code } = createOtpChallenge(user);
    // No real mail service until Members 3/4/5 wire one up — log the code
    // and echo it back as `devCode` so this stays testable without email.
    console.info(`[mock email] Verification code for ${user.email}: ${code}`);
    return [200, { otpRequired: true, otpToken, maskedEmail: maskEmail(user.email), devCode: code }];
  });

  mock.onPost("/user/verify-otp").reply((config) => {
    const { otpToken, code } = JSON.parse(config.data || "{}");
    const result = verifyOtpChallenge(otpToken, code);
    if (!result.ok) return [401, { message: result.message }];
    return [200, { accessToken: `mock-jwt-${result.user.id}`, user: publicUser(result.user) }];
  });

  mock.onPost("/user/resend-otp").reply((config) => {
    const { otpToken } = JSON.parse(config.data || "{}");
    const challenge = resendOtpChallenge(otpToken);
    if (!challenge) return [401, { message: "This verification session has expired. Please sign in again." }];
    console.info(`[mock email] Verification code resent: ${challenge.code}`);
    return [200, { devCode: challenge.code }];
  });

  mock.onGet("/user/auth").reply((config) => {
    const user = requireUser(config);
    if (!user) return UNAUTHORISED;
    return [200, { user: publicUser(user) }];
  });

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
