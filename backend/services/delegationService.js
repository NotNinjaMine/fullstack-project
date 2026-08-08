// Pure, DB-free authorization helpers for UC-08 / delegation (M3).

// Which pending status does an approver's role act on?
const matchesTier = (role, status) =>
    (role === "SUPERVISOR" && status === "PENDING_SUPERVISOR") ||
    (role === "MANAGER" && status === "PENDING_MANAGER");

// today, startDate, endDate are 'YYYY-MM-DD' strings → lexicographic compare is safe.
const isDelegationActive = (d, todayISO) =>
    d.active === true && d.startDate <= todayISO && todayISO >= d.startDate && todayISO <= d.endDate;

// Which team's approval chain currently owns this request: routedTeam if a
// cross-team delegate has already picked it up at a prior tier, otherwise the
// employee's own team (the normal, non-delegated path).
const effectiveTeam = (request) => request.routedTeam || request.employee.team;

// approver: {id, role, team}; request: {status, employee:{team, role}, employeeId, routedTeam};
// delegations: effective delegations TO this approver, each with fromUser {team, role}
const canActOn = (approver, request, delegations = []) => {
    // Never decide your own request, regardless of role or tier. Without this,
    // a Supervisor/Manager/HR Admin applying for their own leave (M1: they can
    // now use the Employee view like anyone else) could approve themselves.
    if (approver.id === request.employeeId) return false;

    // A Manager's or an HR Admin's own leave has no same-tier peer on their
    // team who could approve it without that exact conflict of interest, so
    // it is routed to HR Admin specifically instead of the normal team
    // Manager — regardless of team. See routes/leaveRequest.js /apply for
    // where this routing decision is made.
    const employeeRole = request.employee?.role || null;
    const leadershipRequest = employeeRole === "MANAGER" || employeeRole === "HR_ADMIN";
    if (leadershipRequest) {
        return request.status === "PENDING_MANAGER" && approver.role === "HR_ADMIN";
    }

    if (!matchesTier(approver.role, request.status)) return false;
    const team = effectiveTeam(request);
    // Own-team path (or the team the request has been routed to)
    if (approver.team === team) return true;
    // Delegated path: an effective delegation from an approver whose team+tier match this request
    return delegations.some(d =>
        d.fromUser.team === team && matchesTier(d.fromUser.role, request.status));
};

module.exports = { matchesTier, isDelegationActive, canActOn, effectiveTeam };
