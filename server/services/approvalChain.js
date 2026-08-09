// The single source of truth for WHO approves WHOSE leave.
//
// Every other module (routes/leaveRequest.js, services/delegationService.js,
// services/notificationService.js, the client's status stepper) derives its
// behaviour from the table below, so the chain only ever has to change here.
//
//   Applicant    Stage 1              Stage 2            Decided by
//   ---------    -----------------    ---------------    ----------------------
//   EMPLOYEE     PENDING_SUPERVISOR   PENDING_MANAGER    own-team Supervisor,
//                                                        then own-team Manager
//   HR_ADMIN     PENDING_SUPERVISOR   PENDING_MANAGER    same as an Employee -
//                                                        HR has no special path
//   SUPERVISOR   PENDING_MANAGER      -                  own-team Manager only
//   MANAGER      PENDING_BOSS         -                  the Boss only
//   BOSS         PENDING_MANAGER      -                  any Manager
//
// Rationale for the two executive rows: a Manager has no conflict-free peer at
// their own tier, so their leave goes up to the Boss. The Boss has nobody above
// them, so their leave goes back down to the Manager tier - and because the Boss
// sits above every team, ANY active Manager may decide it (and, symmetrically,
// the Boss may decide any Manager's leave regardless of team).

'use strict';

const ROLES = ["EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"];

// Roles that hold an approval queue of their own.
const APPROVING_ROLES = ["SUPERVISOR", "MANAGER", "BOSS"];

const PENDING_STATUSES = ["PENDING_SUPERVISOR", "PENDING_MANAGER", "PENDING_BOSS"];

// Which pending stage does each approving role act on?
const STAGE_FOR_ROLE = {
    SUPERVISOR: "PENDING_SUPERVISOR",
    MANAGER: "PENDING_MANAGER",
    BOSS: "PENDING_BOSS"
};

const ROLE_FOR_STAGE = {
    PENDING_SUPERVISOR: "SUPERVISOR",
    PENDING_MANAGER: "MANAGER",
    PENDING_BOSS: "BOSS"
};

// Where a newly SUBMITTED (non-draft) request enters the chain.
const initialStatusFor = (applicantRole) => {
    switch (applicantRole) {
        case "SUPERVISOR": return "PENDING_MANAGER";
        case "MANAGER": return "PENDING_BOSS";
        case "BOSS": return "PENDING_MANAGER";
        // EMPLOYEE and HR_ADMIN both start at the Supervisor tier.
        default: return "PENDING_SUPERVISOR";
    }
};

// Where an approval at `currentStatus` moves the request next. Only the
// Supervisor stage has another stage after it; every other stage is final.
const nextStatusAfterApproval = (currentStatus) =>
    currentStatus === "PENDING_SUPERVISOR" ? "PENDING_MANAGER" : "APPROVED";

const isFinalStage = (status) => nextStatusAfterApproval(status) === "APPROVED";

// The role whose queue this request is currently sitting in.
const approverRoleFor = (status) => ROLE_FOR_STAGE[status] || null;

const stageForRole = (role) => STAGE_FOR_ROLE[role] || null;

// Executive requests (a Manager's or the Boss's own leave) are decided by role
// alone, company-wide - they are NOT scoped to the applicant's team, because
// the counterpart sits above/outside the team structure.
const isExecutiveRequest = (request) =>
    ["MANAGER", "BOSS"].includes(request?.employee?.role || null);

// For an executive request, the ONLY role allowed to decide it.
const executiveApproverRoleFor = (request) => {
    const applicant = request?.employee?.role || null;
    if (applicant === "MANAGER") return "BOSS";
    if (applicant === "BOSS") return "MANAGER";
    return null;
};

// Human label for a stage, used in notifications and the status tracker.
const stageLabel = (status) =>
    status === "PENDING_SUPERVISOR" ? "Supervisor review"
        : status === "PENDING_MANAGER" ? "Manager review"
            : status === "PENDING_BOSS" ? "Boss review"
                : status;

module.exports = {
    ROLES,
    APPROVING_ROLES,
    PENDING_STATUSES,
    STAGE_FOR_ROLE,
    ROLE_FOR_STAGE,
    initialStatusFor,
    nextStatusAfterApproval,
    isFinalStage,
    approverRoleFor,
    stageForRole,
    isExecutiveRequest,
    executiveApproverRoleFor,
    stageLabel
};
