// Pure, DB-free authorization helpers for UC-08 / delegation (M3).

const chain = require('./approvalChain');

// Roles that participate in TEAM-scoped, delegatable approval. The Boss is
// deliberately excluded: the Boss decides by role company-wide, has no
// same-tier peer to delegate to, and must not appear in any delegation picker.
const APPROVER_ROLES = ["SUPERVISOR", "MANAGER"];
const PENDING_STATUSES = chain.PENDING_STATUSES;

// Which pending status does an approver's role act on?
const matchesTier = (role, status) => chain.stageForRole(role) === status && !!status;

// today, startDate, endDate are 'YYYY-MM-DD' strings → lexicographic compare is safe.
const isDelegationActive = (d, todayISO) =>
    d.active === true && d.startDate <= todayISO && todayISO <= d.endDate;

// Delegation changes the actor, never the employee's approval chain. A Team A
// request remains owned by Team A at both tiers even when a Team B deputy acts.
const effectiveTeam = (request) => request.employee?.team;

// An EXECUTIVE request is a Manager's or the Boss's own leave. It has no
// conflict-free peer inside the applicant's team, so it is decided by role
// company-wide instead: a Manager's leave by the Boss, the Boss's leave by any
// Manager. HR Admin is NOT executive - HR's own leave runs the ordinary
// Supervisor -> Manager chain exactly like an Employee's.
// See services/approvalChain.js for the routing table this mirrors.
const isExecutiveRequest = chain.isExecutiveRequest;

// Reporting-line integration point. The current M1 schema in this archive does
// not yet declare supervisorId/managerId, but the official design does. These
// helpers consume those fields when a merged model/request supplies them and
// fall back to the legacy team scope only when no explicit assignment exists.
const assignedApproverId = (request, role) => {
    const source = role === "SUPERVISOR"
        ? [request?.supervisorId, request?.supervisor_id, request?.employee?.supervisorId, request?.employee?.supervisor_id]
        : role === "MANAGER"
        ? [request?.managerId, request?.manager_id, request?.employee?.managerId, request?.employee?.manager_id]
        : [];
    for (const value of source) {
        const id = Number(value);
        if (Number.isInteger(id) && id > 0) return id;
    }
    return null;
};

const isAssignedOriginalApprover = (user, request) => {
    if (!APPROVER_ROLES.includes(user.role)) return false;
    const assignedId = assignedApproverId(request, user.role);
    if (assignedId) return Number(user.id) === assignedId;
    return user.team === effectiveTeam(request);
};

const isOriginalTeamApprover = (user, request) =>
    isAssignedOriginalApprover(user, request);

// `delegations` are already filtered to currently effective delegations TO the
// caller and include fromUser { id, name, team, role }.
const chainDelegationFor = (user, request, delegations = []) => {
    const assignedId = assignedApproverId(request, user.role);
    return delegations.find((d) =>
        d.fromUser &&
        APPROVER_ROLES.includes(d.fromUser.role) &&
        d.fromUser.role === user.role &&
        (assignedId
            ? Number(d.fromUser.id) === assignedId
            : d.fromUser.team === effectiveTeam(request))
    ) || null;
};

// approver: {id, role, team}; request: {status, employee:{team}};
// delegations: effective delegations TO this approver, each with fromUser {team, role}
const canActOn = (approver, request, delegations = []) => {
    // Defense in depth: an approver account can never decide its own request,
    // even if a future integrated role model allows approvers to submit leave.
    if (Number(approver.id) === Number(request.employeeId)) return false;

    // Executive leave is decided by ROLE, company-wide, at exactly one stage:
    // a Manager's leave by the Boss at PENDING_BOSS, the Boss's leave by any
    // Manager at PENDING_MANAGER. Checked before the team logic below because
    // these deliberately ignore team scope and delegation.
    if (isExecutiveRequest(request)) {
        const requiredRole = chain.executiveApproverRoleFor(request);
        const requiredStage = chain.stageForRole(requiredRole);
        return request.status === requiredStage && approver.role === requiredRole;
    }

    if (!matchesTier(approver.role, request.status)) return false;
    const assignedId = assignedApproverId(request, approver.role);
    if (assignedId) {
        if (Number(approver.id) === assignedId) return true;
        return delegations.some((d) =>
            d.fromUser &&
            Number(d.fromUser.id) === assignedId &&
            matchesTier(d.fromUser.role, request.status));
    }

    const team = effectiveTeam(request);
    if (!team) return false;
    // Legacy integration fallback until M1 reporting-line columns are merged.
    if (approver.team === team) return true;
    return delegations.some((d) =>
        d.fromUser && d.fromUser.team === team && matchesTier(d.fromUser.role, request.status));
};

// UC-28: the request owner, both original approval tiers, active same-tier
// delegates covering either tier, and HR audit viewers may read the thread.
const canReadCommentThread = (user, request, effectiveDelegations = []) => {
    if (user.id === request.employeeId) return true;
    if (user.role === "HR_ADMIN") return true;
    // Executive requests have no team approver, so authorise the counterpart
    // role directly - otherwise the Boss could decide a Manager's leave but
    // not read the thread attached to it.
    if (isExecutiveRequest(request)) {
        return user.role === chain.executiveApproverRoleFor(request);
    }
    if (isOriginalTeamApprover(user, request)) return true;
    return !!chainDelegationFor(user, request, effectiveDelegations);
};

// Posting is the same participant set while pending, except HR is audit-only.
const canPostComment = (user, request, effectiveDelegations = []) =>
    PENDING_STATUSES.includes(request.status) &&
    user.role !== "HR_ADMIN" &&
    canReadCommentThread(user, request, effectiveDelegations);

// UC-08: own team plus teams covered by active same-tier delegations. The route
// validates a requested selector against this list, preventing team enumeration.
const authorizedTeamContexts = (user, effectiveDelegations = []) => {
    const byTeam = new Map();
    if (user.team) {
        byTeam.set(user.team, { team: user.team, actingFor: null });
    }
    if (APPROVER_ROLES.includes(user.role)) {
        for (const d of effectiveDelegations) {
            if (!d.fromUser || d.fromUser.role !== user.role || !d.fromUser.team) continue;
            if (!byTeam.has(d.fromUser.team)) {
                byTeam.set(d.fromUser.team, {
                    team: d.fromUser.team,
                    actingFor: { id: d.fromUser.id, name: d.fromUser.name }
                });
            }
        }
    }
    return [...byTeam.values()];
};

module.exports = {
    APPROVER_ROLES,
    PENDING_STATUSES,
    matchesTier,
    isExecutiveRequest,
    assignedApproverId,
    isAssignedOriginalApprover,
    isDelegationActive,
    canActOn,
    effectiveTeam,
    isOriginalTeamApprover,
    chainDelegationFor,
    canReadCommentThread,
    canPostComment,
    authorizedTeamContexts
};
