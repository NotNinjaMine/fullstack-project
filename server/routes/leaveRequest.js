const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize, User, LeaveRequest, LeaveBalance, LeavePolicy, LeaveType, PublicHoliday, AuditLog, Comment, Delegation } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
const cov = require('../services/coverage');
const { notify, notifyMany, getResponsibleApprovers, getCommentParticipants } = require('../services/notificationService');
const {
    matchesTier, isDelegationActive, canActOn, effectiveTeam,
    canReadCommentThread, canPostComment, authorizedTeamContexts, chainDelegationFor
} = require('../services/delegationService');
// Who approves whose leave - the one routing table the whole app derives from.
const chain = require('../services/approvalChain');
// M3: "today" in Singapore time, shared by every scheduled/date comparison.
const { todayISO } = require('../services/businessTime');
const { normalizeSubmissionKey } = require('../services/submissionIdempotency');
// M4 owns leave-duration maths (UC-19 + UC-29) — M2 calls it, never re-implements it.
const calc = require('../services/calculationService');
const { workingDaysFor } = require('../services/weekendConfigService');
// M2 employee-side business rules (pure, unit-tested in tests/m2.leaveRules.test.js)
const rules = require('../services/leaveRules');
const { buildIcs, icsFilename } = require('../services/icsService');
// M1: "the current year" for balances is the ACTIVE leave year, which moves the
// moment HR runs a year-end carry-forward (UC-04) - not necessarily the calendar
// year. Everything that reads a balance resolves it through this one service.
const { currentLeaveYear } = require('../services/leaveYearService');
const { checkLeaveTypeEligibility, eligibleTypesFor } = require('../services/leaveEligibility');

/* ---------------- helpers ---------------- */

const holidaySetFor = async (country) => {
    const rows = await PublicHoliday.findAll({ where: { country } });
    return new Set(rows.map(r => r.date));
};

// Working days for a range under the employee's country weekend config (UC-29)
// AND their country's public holidays (UC-06) — the single source of truth.
const workDaysForUser = async (user, startDate, endDate) => {
    const [holidaySet, workingDays] = await Promise.all([
        holidaySetFor(user.country),
        workingDaysFor(user.country)
    ]);
    return {
        holidaySet,
        workingDays,
        workDays: calc.workingDaysInRange(startDate, endDate, workingDays, holidaySet)
    };
};

// Day count a given user would spend on a date range (their country's calendar).
const daysForUserRange = async (user, startDate, endDate, halfDay) => {
    const { workDays } = await workDaysForUser(user, startDate, endDate);
    if (workDays.length === 0) return 0;
    return halfDay ? 0.5 : workDays.length;
};

const policyFor = (country) => LeavePolicy.findOne({ where: { country } });

// Live requests that still hold dates on the employee's calendar — used for the
// self-overlap check (UC-01). Drafts are excluded: they are not committed yet.
const liveRequestsFor = (userId) =>
    LeaveRequest.findAll({
        where: {
            employeeId: userId,
            status: { [Op.in]: [...chain.PENDING_STATUSES, "APPROVED"] }
        },
        attributes: ["id", "startDate", "endDate", "halfDay", "halfDayPeriod", "status"]
    });

// Days already reserved by live requests of one type. A cancellation-pending row
// is excluded: its days are still counted in `used`, so counting them again here
// would reserve the same days twice (UC-03).
const pendingDaysFor = async (userId, leaveType) =>
    Number(await LeaveRequest.sum('days', {
        where: {
            employeeId: userId,
            leaveType,
            cancellationRequested: false,
            status: { [Op.in]: chain.PENDING_STATUSES }
        }
    }) || 0);

const teamApprovedLeaves = async (team) => {
    const members = await User.findAll({ where: { team } });
    const memberIds = members.map(m => m.id);
    const approved = await LeaveRequest.findAll({
        where: { employeeId: { [Op.in]: memberIds }, status: "APPROVED" }
    });
    return {
        members,
        approved: approved.map(r => ({
            userId: r.employeeId, startDate: r.startDate, endDate: r.endDate, halfDay: r.halfDay
        }))
    };
};

// Balance arithmetic lives in services/leaveRules.js (forecastBalance) so the
// apply check, the forecast endpoint and the UI all agree on one formula.

// Catalogue-driven eligibility (replaces the old fixed annual/sick_mc/sick_nomc
// allowlist). A leave type must be active, offered in the employee's country
// (an empty/null applicableCountries list means "every country"), and match
// the employee's gender when the type is gender-restricted — e.g. maternity
// leave (FEMALE-only) or NS/reservist leave (MALE-only) in Singapore.
const resolveApplicableLeaveType = async (code, user) => {
    const type = await LeaveType.findOne({ where: { code: String(code || "").trim().toLowerCase() } });
    return checkLeaveTypeEligibility(type, user);
};

// M1: who is told about a newly submitted request depends on WHO submitted it.
// An Employee's request goes to their team Supervisors; a Supervisor's own leave
// skips their own tier and goes to their team Managers; a Manager's or HR
// Admin's own leave has no team peer who could decide it without a conflict of
// interest, so it goes to the other HR Admins (the same rule canActOn enforces).
const notifyNextApprover = async (applicant, requestId, members, verb = "awaits your review") => {
    const tell = (userId, who) => notify(
        userId,
        `New leave request ${requestId} from ${applicant.name}${who} ${verb}.`,
        { type: "APPROVAL", requestId }
    );
    // Where this applicant's request lands, and therefore who to tell.
    // `members` is the applicant's own team; executive stages ignore it because
    // the Boss <-> Manager pairing is company-wide (services/approvalChain.js).
    const stage = chain.initialStatusFor(applicant.role);
    const approverRole = chain.approverRoleFor(stage);

    if (applicant.role === "MANAGER" || applicant.role === "BOSS") {
        const counterparts = await User.findAll({
            where: { role: approverRole, status: "ACTIVE", id: { [Op.ne]: applicant.id } }
        });
        for (const c of counterparts) await tell(c.id, ` (${applicant.role})`);
        return;
    }

    // EMPLOYEE, HR_ADMIN and SUPERVISOR are all decided inside their own team.
    const suffix = applicant.role === "EMPLOYEE" ? "" : ` (${applicant.role})`;
    for (const m of members.filter((m) => m.role === approverRole && m.id !== applicant.id)) {
        await tell(m.id, suffix);
    }
};

/* ---------------- shared submission checks (UC-01 / UC-05 / UC-13 / UC-18) ----------------
 * Used by BOTH POST /leave/apply and POST /leave/drafts/:id/submit so a draft can
 * never bypass a rule the direct path enforces.
 * Returns { ok: false, message } or { ok: true, days, workDays, flagged, conflicts, members, blackout }.
 */
const prepareSubmission = async (user, data, { excludeRequestId = null, leaveTypeRow = null } = {}) => {
    if (data.endDate < data.startDate) {
        return { ok: false, message: "End date must be on or after the start date." };
    }
    if (data.halfDay && data.startDate !== data.endDate) {
        return { ok: false, message: "Half-day is only allowed for single-day requests." };
    }

    // Back-dating: annual must be future-dated, sick may be retroactive (UC-05).
    const backdate = rules.backdateCheck(data.leaveType, data.startDate, todayISO());
    if (!backdate.ok) return backdate;

    // Country calendar → chargeable days (M4's calculation service).
    const { workDays } = await workDaysForUser(user, data.startDate, data.endDate);
    if (workDays.length === 0) {
        return { ok: false, message: "The selected range contains no working days." };
    }
    const days = data.halfDay ? 0.5 : workDays.length;

    // Country sick-leave policy (e.g. Thailand grants 0 days without an MC).
    const quota = rules.sickQuotaCheck(data.leaveType, await policyFor(user.country));
    if (!quota.ok) return quota;

    // UC-13 (+ M5 UC-10): a type flagged requiresMc needs a certificate, and the
    // file must be a PDF/JPG/PNG. The flag comes from the leave-type catalogue,
    // so HR can add a new MC-backed type without touching this route.
    if (leaveTypeRow?.requiresMc && !data.attachmentData) {
        return { ok: false, message: `${leaveTypeRow.name} requires an attached medical certificate.` };
    }
    const attach = rules.attachmentCheck(data);
    if (!attach.ok) return attach;

    // UC-01: you cannot be on two leaves at once.
    const overlap = rules.overlapCheck(await liveRequestsFor(user.id), {
        id: excludeRequestId,
        startDate: data.startDate,
        endDate: data.endDate,
        halfDay: data.halfDay,
        halfDayPeriod: data.halfDay ? data.halfDayPeriod : null
    });
    if (!overlap.ok) return overlap;

    // Balance (pending requests also reserve balance). M5 (UC-10): types that
    // draw from no tracked pool — unpaid, compassionate, maternity, NS — have no
    // leave_balances row at all, so there is nothing to check or deduct.
    const tracksBalance = !leaveTypeRow ||
        leaveTypeRow.affectsAnnualBalance || leaveTypeRow.affectsSickBalance;
    let forecast = null;
    if (tracksBalance) {
        const year = new Date(`${data.startDate}T00:00:00Z`).getUTCFullYear();
        const balance = await LeaveBalance.findOne({
            where: { userId: user.id, leaveType: data.leaveType, year }
        });
        if (!balance) return { ok: false, message: "No leave balance record for this year." };
        forecast = rules.forecastBalance(balance, await pendingDaysFor(user.id, data.leaveType), days);
        if (!forecast.sufficient) {
            return {
                ok: false,
                message: `Insufficient balance: requesting ${days} day(s) but only ${forecast.remainingBefore} remain (including pending requests).`
            };
        }
    }

    // M4 (UC-18): blackout periods. BLOCK rejects; SPECIAL_APPROVAL flags instead.
    let blackout = { hit: false, mode: null, periods: [] };
    try {
        const staffing = require('../services/staffingService');
        blackout = await staffing.blackoutForRange(user.country, user.team, data.startDate, data.endDate);
        if (blackout.hit && blackout.mode === "BLOCK") {
            return {
                ok: false,
                message: `Your dates fall in a restricted (blackout) period: ${blackout.periods.map(p => p.reason || `${p.startDate}→${p.endDate}`).join("; ")}. Leave cannot be applied for these dates.`
            };
        }
    } catch (_) { /* blackout table optional; ignore if unavailable */ }

    // AI-2 coverage check on the server (source of truth).
    const { members, approved } = await teamApprovedLeaves(user.team);
    const conflicts = cov.evaluateCoverage(workDays, approved, user.id, members.length);
    const flagged = (conflicts.length > 0) || (blackout.hit && blackout.mode === "SPECIAL_APPROVAL");

    return { ok: true, days, workDays, flagged, conflicts, members, blackout, forecast, tracksBalance };
};

// Keep approval responses on a strict allowlist. If M1/M5 later merge the
// official reporting-line fields, include them automatically without ever
// serializing password hashes, reset tokens or other account-security fields.
const approvalEmployeeAttributes = () => {
    const attributes = ["id", "name", "initials", "team", "role", "country"];
    for (const key of ["supervisorId", "managerId"]) {
        if (User.rawAttributes?.[key]) attributes.push(key);
    }
    return attributes;
};

const audit = (requestId, actorName, action, options = {}) =>
    AuditLog.create({ requestId, actorName, action }, options);

// One place that answers "who is told about a request that was just submitted".
// EMPLOYEE / SUPERVISOR / HR_ADMIN applicants all run the ordinary team chain,
// so they route through M3's delegation-aware approver lookup (which tells the
// original approver AND any active delegate). A Manager's or the Boss's own
// leave is decided by role company-wide and is never delegated, so it falls
// through to notifyNextApprover below, which resolves the counterpart directly.
// See services/approvalChain.js.
const notifySubmitted = async (applicant, request, members) => {
    try {
        if (["EMPLOYEE", "SUPERVISOR", "HR_ADMIN"].includes(applicant.role)) {
            if (!request.employee) request.employee = applicant;
            const approvers = await getResponsibleApprovers(request);
            await notifyMany(
                approvers,
                `New leave request REQ-${request.id} from ${applicant.name} awaits your review.`,
                {
                    type: "APPROVAL",
                    event: "LEAVE_REQUEST_SUBMITTED",
                    requestId: request.id,
                    employeeName: applicant.name,
                    startDate: request.startDate,
                    endDate: request.endDate
                }
            );
        } else {
            await notifyNextApprover(applicant, request.id, members);
        }
    } catch (_) {
        console.error(`[notification] new-request delivery failed for request ${request.id}.`);
    }
};

// Effective delegations TO this user (for canActOn / pending queue)
const loadEffectiveDelegationsTo = async (userId, options = {}) => {
    const today = todayISO();
    const rows = await Delegation.findAll({
        where: { toUserId: userId, active: true },
        include: [{ model: User, as: "fromUser", attributes: ["id", "name", "team", "role"] }],
        transaction: options.transaction
    });
    return rows.filter(d => isDelegationActive(d, today));
};

// Create a comment and its audit metadata atomically. The audit intentionally
// stores no comment body so medical or other sensitive content is not copied.
const createCommentWithAudit = async (request, actor, body, effectiveDelegations = [], options = {}) => {
    const transaction = options.transaction;
    const comment = await Comment.create({
        requestId: request.id,
        body: String(body).trim().slice(0, 500),
        authorName: actor.name,
        authorRole: actor.role,
        authorId: actor.id
    }, { transaction });

    const actingFor = chainDelegationFor(actor, request, effectiveDelegations);
    let action = `Comment posted by ${actor.role} (comment ${comment.id})`;
    if (actingFor) {
        action += `; ${actor.name} acting for ${actingFor.fromUser.name}`;
    }
    await audit(request.id, actor.name, action.slice(0, 200), { transaction });
    return comment;
};

// Comment delivery is deliberately post-commit and best effort. A provider or
// preference failure cannot roll back a valid append-only discussion entry.
const notifyCommentParticipants = async (request, actor) => {
    const participants = await getCommentParticipants(request);
    const message = `A new comment was posted on leave request REQ-${request.id} by ${actor.name}.`;
    await notifyMany(participants, message, {
        type: "COMMENT",
        event: "COMMENT_ADDED",
        requestId: request.id,
        actorName: actor.name,
        startDate: request.startDate,
        endDate: request.endDate,
        excludeUserIds: [actor.id]
    });
};

/* ---------------- UC-03: two-tier decision on a CANCELLATION of approved leave ----------------
 * Approve → Supervisor endorses, Manager finalises: status CANCELLED and the
 * deducted days are returned to the balance. Reject → the request snaps back to
 * APPROVED and the leave stands. A coverage flag needs no exception here:
 * cancelling leave frees coverage, it never reduces it.
 *
 * Runs INSIDE decideOne's transaction (M3), so the balance restore takes the
 * same row lock the deduction does and two approvers cannot restore twice.
 */
// Cancellation, partial cancellation and HR's adjustment all end the same way:
// hand a number of days back for the leave year the leave started in. Types that
// track no balance (unpaid, compassionate, maternity, NS) have no row to touch.
const restoreDays = async (request, days, transaction) => {
    const amount = Number(days);
    if (!(amount > 0)) return 0;
    const typeRow = await LeaveType.findOne({ where: { code: request.leaveType }, transaction });
    const tracksBalance = !typeRow || typeRow.affectsAnnualBalance || typeRow.affectsSickBalance;
    if (!tracksBalance) return 0;
    const balance = await LeaveBalance.findOne({
        where: {
            userId: request.employeeId,
            leaveType: request.leaveType,
            year: new Date(request.startDate).getFullYear()
        },
        transaction,
        lock: transaction.LOCK.UPDATE
    });
    if (!balance) return 0;
    balance.used = Math.max(0, Number(balance.used) - amount);
    await balance.save({ transaction });
    return amount;
};

const decideCancellationLocked = async (actor, request, approve, note, transaction) => {
    // A pending new end date means "returning early"; without one this is a
    // withdrawal of the whole leave.
    const partial = !!request.pendingEndDate;
    const label = partial ? "Early return" : "Cancellation";
    const decider = actor.role === "BOSS" ? "Boss" : "Manager";

    // Same staging as an ordinary decision: only the Supervisor stage hands on.
    if (!chain.isFinalStage(request.status)) {
        if (approve) {
            request.status = chain.nextStatusAfterApproval(request.status);
            await audit(request.id, actor.name,
                `${label} endorsed by Supervisor - routed to Manager`, { transaction });
        } else {
            request.status = "APPROVED";
            request.cancellationRequested = false;
            request.pendingEndDate = null;
            if (note) request.supervisorNote = note;
            await audit(request.id, actor.name, note
                ? `${label} refused by Supervisor: ${note.slice(0, 100)} - leave stands`
                : `${label} refused by Supervisor - leave stands`, { transaction });
        }
    } else { // Manager tier, or the Boss on a Manager's own leave — final decision
        if (approve && partial) {
            // Returning early: keep the leave, pull the end date back, and give
            // back ONLY the days no longer being taken.
            const employee = request.employee || await User.findByPk(request.employeeId, { transaction });
            const newDays = await daysForUserRange(
                employee, request.startDate, request.pendingEndDate, request.halfDay
            );
            const outcome = rules.shortenOutcome(request.days, newDays);
            const restored = await restoreDays(request, outcome.daysReturned, transaction);

            request.endDate = request.pendingEndDate;
            request.days = newDays;
            request.pendingEndDate = null;
            request.cancellationRequested = false;
            request.status = "APPROVED";   // the remaining leave stays approved
            await audit(request.id, actor.name,
                `Early return approved by ${decider} - final, leave now ends ${request.endDate}, ${restored} day(s) restored`,
                { transaction });
        } else if (approve) {
            request.status = "CANCELLED";
            request.cancellationRequested = false;
            request.pendingEndDate = null;
            const restored = await restoreDays(request, request.days, transaction);
            await audit(request.id, actor.name,
                `Cancellation approved by ${decider} - final, ${restored} day(s) restored`,
                { transaction });
        } else {
            request.status = "APPROVED";
            request.cancellationRequested = false;
            request.pendingEndDate = null;
            if (note) request.managerNote = note;
            await audit(request.id, actor.name, note
                ? `${label} refused by ${decider}: ${note.slice(0, 100)} - leave stands`
                : `${label} refused by ${decider} - leave stands`, { transaction });
        }
    }
    await request.save({ transaction });
    return {
        ok: true, status: request.status, request,
        employeeId: request.employeeId, cancellation: true, partial
    };
};

// The employee-facing wording for a cancellation outcome (sent post-commit).
// `outcome` carries the partial flag, because by the time this runs the request
// row has already had pendingEndDate cleared.
const cancellationMessage = (outcome, note) => {
    const request = outcome.request;
    const what = outcome.partial ? "early return from" : "cancellation of";
    if (request.status === "CANCELLED") {
        return `Your cancellation of request ${request.id} was approved — ${Number(request.days)} day(s) returned to your balance.`;
    }
    if (chain.PENDING_STATUSES.includes(request.status)) {
        return `Your ${what} request ${request.id} was endorsed and now awaits the ${chain.stageLabel(request.status).replace(" review", "")}.`;
    }
    if (outcome.partial && !note) {
        return `Your early return from request ${request.id} was approved — it now ends ${request.endDate} and the unused day(s) are back in your balance.`;
    }
    return `Your ${what} request ${request.id} was declined${note ? `: ${note}` : ""} — the approved leave stands.`;
};

/* ---------------- single-request decision (shared by /:id/decide and bulk-decide) ---------------- */

// Returns { ok, status?, message?, statusCode?, request? } — no res.
// rejectionReason (F3): stored on supervisorNote / managerNote and included in employee notify.
const decideOne = async (
    actor,
    request,
    approve,
    acknowledgeException,
    rejectionReason = null,
    decisionComment = null
) => {
    const requestId = request.id;
    const note = rejectionReason && String(rejectionReason).trim()
        ? String(rejectionReason).trim().slice(0, 300)
        : null;

    const outcome = await sequelize.transaction(async (transaction) => {
        // Re-read under a row lock. Concurrent decisions wait here, then see the
        // committed terminal/new-stage status and cannot deduct twice.
        const lockedRequest = await LeaveRequest.findByPk(requestId, {
            include: [{ model: User, as: "employee", attributes: approvalEmployeeAttributes() }],
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!lockedRequest) {
            return { ok: false, statusCode: 404, message: "Request not found." };
        }

        // Each approving role acts on exactly one stage (approvalChain.js):
        // Supervisor -> PENDING_SUPERVISOR, Manager -> PENDING_MANAGER,
        // Boss -> PENDING_BOSS. Anything else is a wrong-tier attempt.
        const actorStage = chain.stageForRole(actor.role);
        if (actorStage && lockedRequest.status !== actorStage) {
            const tier = actor.role.charAt(0) + actor.role.slice(1).toLowerCase();
            return { ok: false, statusCode: 400, message: `Request is not at the ${tier} tier.` };
        }

        // Authority is deliberately revalidated inside the same transaction as
        // the state change, including any active acting-approver relationship.
        const effective = await loadEffectiveDelegationsTo(actor.id, { transaction });
        if (!canActOn(actor, lockedRequest, effective)) {
            return {
                ok: false,
                statusCode: 403,
                message: "You are not authorised to act on this request."
            };
        }

        // M2 (UC-03): this pending cycle is a WITHDRAWAL of already-approved
        // leave, not a new application — both branches have a different outcome
        // and the balance moves the other way.
        if (lockedRequest.cancellationRequested) {
            const cancelOutcome = await decideCancellationLocked(
                actor, lockedRequest, approve, note, transaction
            );
            lockedRequest.stageEnteredAt = new Date();
            lockedRequest.lastReminderKey = null;
            lockedRequest.reminderSentAt = null;
            await lockedRequest.save({ transaction });
            return cancelOutcome;
        }

        const actingFor = chainDelegationFor(actor, lockedRequest, effective);
        const actionWithDelegation = (action) => actingFor
            ? `${action}; ${actor.name} acting for ${actingFor.fromUser.name}`.slice(0, 200)
            : action;

        // The Supervisor stage is the only NON-final one, so it is the only
        // branch that hands the request on rather than deciding it outright.
        if (!chain.isFinalStage(lockedRequest.status)) {
            if (approve) {
                lockedRequest.status = chain.nextStatusAfterApproval(lockedRequest.status);
                await audit(
                    lockedRequest.id,
                    actor.name,
                    actionWithDelegation(lockedRequest.flagged
                        ? "Endorsed by Supervisor - escalated for Manager special approval"
                        : "Approved by Supervisor - routed to Manager"),
                    { transaction }
                );
            } else {
                lockedRequest.status = "REJECTED";
                if (note) lockedRequest.supervisorNote = note;
                await audit(
                    lockedRequest.id,
                    actor.name,
                    actionWithDelegation(note
                        ? `Rejected by Supervisor: ${note.slice(0, 120)}`
                        : "Rejected by Supervisor"),
                    { transaction }
                );
            }
        } else {
            // Coverage acknowledgement is rechecked while the request is locked.
            if (approve && lockedRequest.flagged && !acknowledgeException) {
                return {
                    ok: false,
                    statusCode: 400,
                    message: "This request is flagged: coverage falls below threshold. Set acknowledgeException=true to approve the exception explicitly."
                };
            }

            if (approve) {
                // Types that don't track a balance (e.g. maternity/NS leave,
                // unpaid, compassionate) have no leave_balances row to deduct.
                const typeRow = await LeaveType.findOne({ where: { code: lockedRequest.leaveType }, transaction });
                const tracksBalance = !typeRow || typeRow.affectsAnnualBalance || typeRow.affectsSickBalance;
                if (tracksBalance) {
                    const year = new Date(lockedRequest.startDate).getFullYear();
                    const balance = await LeaveBalance.findOne({
                        where: {
                            userId: lockedRequest.employeeId,
                            leaveType: lockedRequest.leaveType,
                            year
                        },
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    });
                    if (!balance) {
                        return {
                            ok: false,
                            statusCode: 409,
                            message: "The employee's leave balance record is missing; final approval was not recorded."
                        };
                    }

                    balance.used = Number(balance.used) + Number(lockedRequest.days);
                    await balance.save({ transaction });
                }
                lockedRequest.status = "APPROVED";
                // The final decider is the Manager on an ordinary request and
                // the Boss on a Manager's own leave. Name whoever actually
                // decided, so the audit trail and status tracker stay truthful.
                const decider = actor.role === "BOSS" ? "Boss" : "Manager";
                await audit(
                    lockedRequest.id,
                    actor.name,
                    actionWithDelegation(lockedRequest.flagged
                        ? `Coverage exception explicitly approved by ${decider} - final`
                        : `Approved by ${decider} - final`),
                    { transaction }
                );
            } else {
                lockedRequest.status = "REJECTED";
                if (note) lockedRequest.managerNote = note;
                const decider = actor.role === "BOSS" ? "Boss" : "Manager";
                await audit(
                    lockedRequest.id,
                    actor.name,
                    actionWithDelegation(note
                        ? `Rejected by ${decider}: ${note.slice(0, 120)}`
                        : `Rejected by ${decider}`),
                    { transaction }
                );
            }
        }

        lockedRequest.stageEnteredAt = new Date();
        lockedRequest.lastReminderKey = null;
        lockedRequest.reminderSentAt = null;
        const commentCreated = !!(decisionComment && String(decisionComment).trim());
        if (commentCreated) {
            await createCommentWithAudit(
                lockedRequest,
                actor,
                decisionComment,
                effective,
                { transaction }
            );
        }
        await lockedRequest.save({ transaction });
        return {
            ok: true,
            status: lockedRequest.status,
            request: lockedRequest,
            employeeId: lockedRequest.employeeId,
            commentCreated
        };
    });

    if (!outcome.ok) return outcome;

    // External delivery and the persisted notification are post-commit. A mail
    // or notification-channel failure must never roll back a valid decision.
    let notifyMsg = `Your request ${requestId} is now ${outcome.status.replace("_", " ")}.`;
    if (outcome.cancellation) {
        notifyMsg = cancellationMessage(outcome, note);
    } else if (!approve && note) {
        notifyMsg = `Your request ${requestId} was REJECTED. Reason: ${note}`;
    }
    const decisionEvent = actor.role === "SUPERVISOR"
        ? (approve ? "SUPERVISOR_APPROVED" : "SUPERVISOR_REJECTED")
        : (approve ? "MANAGER_APPROVED" : "MANAGER_REJECTED");
    try {
        await notify(
            outcome.employeeId,
            notifyMsg.slice(0, 255),
            {
                type: "APPROVAL",
                event: decisionEvent,
                requestId,
                startDate: outcome.request.startDate,
                endDate: outcome.request.endDate,
                rejectionReason: !approve ? note : null
            }
        );
    } catch (_) {
        console.error(`[notification] post-decision delivery failed for request ${requestId}.`);
    }

    // An endorsement that moved the request to a LATER stage routes work to
    // whoever owns that stage (the employee's Manager, or that Manager's active
    // delegate) and notifies that responsible actor.
    if (chain.PENDING_STATUSES.includes(outcome.status)) {
        try {
            const managers = await getResponsibleApprovers(outcome.request);
            await notifyMany(
                managers,
                outcome.partial
                    ? `An early return from approved leave (REQ-${requestId}) is ready for your final decision.`
                    : outcome.cancellation
                    ? `A cancellation of approved leave (REQ-${requestId}) is ready for your final decision.`
                    : `Leave request REQ-${requestId} is ready for your final decision.`,
                {
                    type: "APPROVAL",
                    event: "MANAGER_REVIEW_REQUIRED",
                    requestId,
                    employeeName: outcome.request.employee?.name,
                    startDate: outcome.request.startDate,
                    endDate: outcome.request.endDate
                }
            );
        } catch (_) {
            console.error(`[notification] Manager routing delivery failed for request ${requestId}.`);
        }
    }
    if (outcome.commentCreated) {
        try {
            await notifyCommentParticipants(outcome.request, actor);
        } catch (_) {
            console.error(`[notification] decision-comment participant lookup failed for request ${requestId}.`);
        }
    }
    return outcome;
};

/* ---------------- UC-10: leave types available to the caller ---------------- */
// Drives the "Leave type" dropdown on the apply form: only types that are
// active, offered in the employee's country, and (if gender-restricted) match
// the employee's gender — e.g. maternity (FEMALE-only) or NS/reservist leave
// (MALE-only) in Singapore. Any authenticated user may call this (not just
// HR_ADMIN) since it's read-only and scoped to the caller's own profile.
router.get("/types", validateToken, async (req, res) => {
    const all = await LeaveType.findAll({ where: { active: true }, order: [['code', 'ASC']] });
    // Same helper the apply path enforces with, so this list can never offer a
    // type the server would then reject.
    const eligible = eligibleTypesFor(all, req.user);
    res.json(eligible.map((t) => ({
        code: t.code,
        name: t.name,
        requiresMc: t.requiresMc,
        affectsAnnualBalance: t.affectsAnnualBalance,
        affectsSickBalance: t.affectsSickBalance
    })));
});

/* ---------------- UC-01: apply for leave (EMPLOYEE only) ---------------- */

router.post("/apply", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        leaveType: yup.string().trim().lowercase().max(30).required(),
        startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        endDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        halfDay: yup.boolean().default(false),
        halfDayPeriod: yup.string().oneOf(["AM", "PM"]).nullable(),
        reason: yup.string().trim().min(3).max(200).required(),
        // M2 (UC-14): save as a private draft (not routed) instead of submitting.
        isDraft: yup.boolean().default(false),
        // M2 (UC-13): optional medical-certificate upload (base64 data URL).
        attachmentName: yup.string().trim().max(200).nullable(),
        attachmentType: yup.string().trim().max(60).nullable(),
        attachmentData: yup.string().nullable()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });

        // M5 (UC-10): the type must be active, offered in the employee's country
        // and allowed for their profile before any other rule runs.
        const eligibility = await resolveApplicableLeaveType(data.leaveType, req.user);
        if (!eligibility.ok) {
            return res.status(400).json({ message: eligibility.message });
        }
        const leaveTypeRow = eligibility.type;

        // M3: an idempotency key makes a retried submit return the original row
        // instead of creating a second request.
        let submissionKey = null;
        try {
            submissionKey = data.isDraft
                ? null
                : normalizeSubmissionKey(req.get('Idempotency-Key'));
        } catch (error) {
            return res.status(400).json({ message: error.message });
        }
        if (submissionKey) {
            const existing = await LeaveRequest.findOne({
                where: { employeeId: req.user.id, submissionKey }
            });
            if (existing) {
                return res.json({
                    request: existing,
                    flagged: existing.flagged,
                    conflicts: [],
                    deduplicated: true
                });
            }
        }

        // A draft is stored privately and not routed, so it only has to be
        // structurally sane — the full rule set runs when it is submitted.
        let days, flagged = false, conflicts = [], members = [], blackout = { hit: false };
        if (data.isDraft) {
            if (data.endDate < data.startDate) {
                return res.status(400).json({ message: "End date must be on or after the start date." });
            }
            if (data.halfDay && data.startDate !== data.endDate) {
                return res.status(400).json({ message: "Half-day is only allowed for single-day requests." });
            }
            const attach = rules.attachmentCheck(data);
            if (!attach.ok) return res.status(400).json({ message: attach.message });
            days = await daysForUserRange(req.user, data.startDate, data.endDate, data.halfDay);
        } else {
            const prep = await prepareSubmission(req.user, data, { leaveTypeRow });
            if (!prep.ok) return res.status(400).json({ message: prep.message });
            ({ days, flagged, conflicts, members, blackout } = prep);
        }

        // M2 (UC-14): a draft is stored privately and not routed to approvers.
        // Everything else enters the chain at the stage its applicant's role
        // dictates - see services/approvalChain.js for the full table. A
        // self-application always skips the tier the applicant occupies, so
        // nobody is ever their own approver.
        const status = data.isDraft ? "DRAFT" : chain.initialStatusFor(req.user.role);

        let request;
        try {
            request = await LeaveRequest.create({
                employeeId: req.user.id,
                leaveType: data.leaveType,
                startDate: data.startDate,
                endDate: data.endDate,
                days,
                halfDay: data.halfDay,
                halfDayPeriod: data.halfDay ? data.halfDayPeriod : null,
                reason: data.reason,
                status,
                isDraft: !!data.isDraft,
                flagged,
                attachmentName: data.attachmentName || null,
                attachmentType: data.attachmentType || null,
                attachmentData: data.attachmentData || null,
                stageEnteredAt: data.isDraft ? null : new Date(),
                submissionKey
            });
        } catch (error) {
            // Two same-key requests may race past the initial lookup. The
            // composite unique index commits one row; the loser returns it.
            if (submissionKey && error?.name === 'SequelizeUniqueConstraintError') {
                const existing = await LeaveRequest.findOne({
                    where: { employeeId: req.user.id, submissionKey }
                });
                if (existing) {
                    return res.json({
                        request: existing,
                        flagged: existing.flagged,
                        conflicts: [],
                        deduplicated: true
                    });
                }
            }
            throw error;
        }

        if (data.isDraft) {
            return res.json({ request, draft: true });
        }

        await audit(request.id, req.user.name,
            flagged ? "Submitted (coverage flag raised)" : "Submitted");

        // Post-persistence and best effort: delivery can never invalidate a
        // successfully submitted leave request.
        await notifySubmitted(req.user, request, members);

        res.json({ request, flagged, conflicts, blackout: blackout.hit ? blackout : undefined });
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

/* ---------------- AI-2: pre-submission coverage check ---------------- */

router.post("/coverage-check", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        endDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const { holidaySet, workDays } = await workDaysForUser(req.user, data.startDate, data.endDate);
        const { members, approved } = await teamApprovedLeaves(req.user.team);
        const conflicts = cov.evaluateCoverage(workDays, approved, req.user.id, members.length);

        // Human-readable explanation + nearest alternative
        const nameOf = (id) => members.find(m => m.id === id)?.name || `User ${id}`;
        const explained = conflicts.map(c => ({
            ...c,
            offNames: c.offUserIds.map(nameOf),
            explanation: `Only ${c.present} of ${members.length} present on ${c.date} (also away: ${c.offUserIds.map(nameOf).join(", ")}).`
        }));
        const alternative = conflicts.length > 0
            ? cov.suggestAlternative(data.endDate, Math.max(workDays.length, 1), approved, req.user.id, members.length, holidaySet)
            : null;

        res.json({
            workDays,
            days: workDays.length,
            teamSize: members.length,
            minPresent: cov.MIN_PRESENT,
            conflicts: explained,
            alternative
        });
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

/* ---------------- UC-14 (E): balance forecast / what-if (nothing is saved) ---------------- */

// POST /leave/forecast { leaveType, startDate, endDate, halfDay }
// Answers "what would this cost me?" before the employee commits: chargeable
// days, the holidays/weekends skipped, and the balance before vs after.
router.post("/forecast", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        leaveType: yup.string().oneOf(["annual", "sick_mc", "sick_nomc"]).required(),
        startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        endDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        halfDay: yup.boolean().default(false)
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        if (data.endDate < data.startDate) {
            return res.status(400).json({ message: "End date must be on or after the start date." });
        }

        const { holidaySet, workingDays, workDays } = await workDaysForUser(req.user, data.startDate, data.endDate);
        const days = workDays.length === 0 ? 0 : (data.halfDay ? 0.5 : workDays.length);

        const year = new Date(`${data.startDate}T00:00:00Z`).getUTCFullYear();
        const balance = await LeaveBalance.findOne({
            where: { userId: req.user.id, leaveType: data.leaveType, year }
        });
        const forecast = rules.forecastBalance(balance, await pendingDaysFor(req.user.id, data.leaveType), days);

        // Which calendar days are NOT charged, and why — the transparency the
        // client asked for ("holidays are never deducted").
        const skipped = [];
        let cur = calc.fromISO(data.startDate);
        const end = calc.fromISO(data.endDate);
        while (cur <= end) {
            const iso = calc.toISO(cur);
            if (!workDays.includes(iso)) {
                skipped.push({
                    date: iso,
                    reason: holidaySet.has(iso) ? "PUBLIC_HOLIDAY" : "NON_WORKING_DAY"
                });
            }
            cur = calc.addDays(cur, 1);
        }

        const warnings = [];
        const backdate = rules.backdateCheck(data.leaveType, data.startDate, todayISO());
        if (!backdate.ok) warnings.push(backdate.message);
        const quota = rules.sickQuotaCheck(data.leaveType, await policyFor(req.user.country));
        if (!quota.ok) warnings.push(quota.message);
        const overlap = rules.overlapCheck(await liveRequestsFor(req.user.id), {
            startDate: data.startDate, endDate: data.endDate,
            halfDay: data.halfDay, halfDayPeriod: null
        });
        if (!overlap.ok) warnings.push(overlap.message);
        if (!forecast.sufficient) {
            warnings.push(`This would take you ${Math.abs(forecast.remainingAfter)} day(s) below your available balance.`);
        }

        res.json({
            leaveType: data.leaveType,
            startDate: data.startDate,
            endDate: data.endDate,
            halfDay: !!data.halfDay,
            days,
            workDays,
            skipped,
            weekendConfig: workingDays,
            balance: forecast,
            warnings
        });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Forecast failed." });
    }
});

/* ---------------- UC-08: my requests + team calendar ---------------- */

router.get("/mine", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    // Data retention rule: 1 year of active history
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const list = await LeaveRequest.findAll({
        // Exclude private drafts (M2 UC-14) — those surface via GET /leave/drafts.
        where: { employeeId: req.user.id, status: { [Op.ne]: "DRAFT" }, createdAt: { [Op.gte]: oneYearAgo } },
        order: [['createdAt', 'DESC']],
        include: [{ model: AuditLog, order: [['createdAt', 'ASC']] }]
    });
    res.json(list);
});

/* ---------------- UC-14: drafts (save / list / submit) ---------------- */

// GET /leave/drafts — the caller's saved drafts
router.get("/drafts", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    const list = await LeaveRequest.findAll({
        where: { employeeId: req.user.id, status: "DRAFT" },
        order: [['updatedAt', 'DESC']]
    });
    res.json(list);
});

// PUT /leave/drafts/:id — edit a draft in place
router.put("/drafts/:id", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        leaveType: yup.string().trim().lowercase().max(30).optional(),
        startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).optional(),
        halfDay: yup.boolean().optional(),
        halfDayPeriod: yup.string().oneOf(["AM", "PM"]).nullable(),
        reason: yup.string().trim().max(200).optional(),
        attachmentName: yup.string().trim().max(200).nullable(),
        attachmentType: yup.string().trim().max(60).nullable(),
        attachmentData: yup.string().nullable()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        if (data.leaveType !== undefined) {
            const eligibility = await resolveApplicableLeaveType(data.leaveType, req.user);
            if (!eligibility.ok) return res.status(400).json({ message: eligibility.message });
        }
        const draft = await LeaveRequest.findByPk(req.params.id);
        if (!draft) return res.sendStatus(404);
        if (draft.employeeId !== req.user.id) return res.sendStatus(403);
        if (draft.status !== "DRAFT") return res.status(400).json({ message: "Only drafts can be edited here." });
        for (const k of ["leaveType", "startDate", "endDate", "halfDay", "halfDayPeriod", "reason", "attachmentName", "attachmentType", "attachmentData"]) {
            if (data[k] !== undefined) draft[k] = data[k];
        }
        if (draft.endDate < draft.startDate) {
            return res.status(400).json({ message: "End date must be on or after the start date." });
        }
        if (draft.halfDay && draft.startDate !== draft.endDate) {
            return res.status(400).json({ message: "Half-day is only allowed for single-day requests." });
        }
        if (!draft.halfDay) draft.halfDayPeriod = null;
        const attach = rules.attachmentCheck({
            attachmentType: draft.attachmentType, attachmentData: draft.attachmentData
        });
        if (!attach.ok) return res.status(400).json({ message: attach.message });
        // Recompute the day count: editing the dates of a draft must not leave a
        // stale `days` value behind (it drives the balance check on submit).
        draft.days = await daysForUserRange(req.user, draft.startDate, draft.endDate, draft.halfDay);
        await draft.save();
        res.json(draft);
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Invalid request." });
    }
});

// POST /leave/drafts/:id/submit — promote a draft to a live request (runs the same checks)
router.post("/drafts/:id/submit", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    const draft = await LeaveRequest.findByPk(req.params.id);
    if (!draft) return res.sendStatus(404);
    if (draft.employeeId !== req.user.id) return res.sendStatus(403);
    if (draft.status !== "DRAFT") return res.status(400).json({ message: "This request is not a draft." });
    if (!draft.reason || draft.reason.trim().length < 3) {
        return res.status(400).json({ message: "Add a reason (at least 3 characters) before submitting this draft." });
    }

    // M5 (UC-10): eligibility is re-checked at submit time too, in case the
    // catalogue's country/gender rules changed since the draft was saved.
    const eligibility = await resolveApplicableLeaveType(draft.leaveType, req.user);
    if (!eligibility.ok) return res.status(400).json({ message: eligibility.message });

    // Exactly the same rule set as POST /leave/apply — a draft cannot bypass a
    // back-date, overlap, quota, balance, blackout or coverage rule.
    const prep = await prepareSubmission(req.user, {
        leaveType: draft.leaveType,
        startDate: draft.startDate,
        endDate: draft.endDate,
        halfDay: draft.halfDay,
        halfDayPeriod: draft.halfDayPeriod,
        attachmentType: draft.attachmentType,
        attachmentData: draft.attachmentData
    }, { excludeRequestId: draft.id, leaveTypeRow: eligibility.type });
    if (!prep.ok) return res.status(400).json({ message: prep.message });
    const { days, flagged, conflicts, members } = prep;

    // Same leadership routing as /apply - see the comment there.
    draft.status = chain.initialStatusFor(req.user.role);
    draft.isDraft = false;
    draft.flagged = flagged;
    draft.days = days;   // recomputed against the current calendar
    draft.stageEnteredAt = new Date();
    draft.lastReminderKey = null;
    draft.reminderSentAt = null;
    await draft.save();
    await audit(draft.id, req.user.name, flagged ? "Submitted from draft (coverage flag raised)" : "Submitted from draft");

    await notifySubmitted(req.user, draft, members);
    res.json({ request: draft, flagged, conflicts });
});

// DELETE /leave/drafts/:id — discard a draft
router.delete("/drafts/:id", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    const draft = await LeaveRequest.findByPk(req.params.id);
    if (!draft) return res.sendStatus(404);
    if (draft.employeeId !== req.user.id) return res.sendStatus(403);
    if (draft.status !== "DRAFT") return res.status(400).json({ message: "Only drafts can be deleted." });
    await draft.destroy();
    res.json({ message: "Draft discarded." });
});

/* ---------------- UC-13: medical-certificate attachment access ---------------- */

// GET /leave/:id/attachment — owner, the team's approvers, or HR may view the MC
router.get("/:id/attachment", validateToken, async (req, res) => {
    const request = await LeaveRequest.findByPk(req.params.id, { include: [{ model: User, as: "employee" }] });
    if (!request) return res.sendStatus(404);
    if (!request.attachmentData) return res.sendStatus(404);

    const isOwner = request.employeeId === req.user.id;
    const isHr = req.user.role === "HR_ADMIN";
    const isTeamApprover = ["SUPERVISOR", "MANAGER"].includes(req.user.role)
        && request.employee && req.user.team === effectiveTeam(request);
    if (!isOwner && !isHr && !isTeamApprover) return res.sendStatus(403);

    res.json({
        name: request.attachmentName,
        type: request.attachmentType,
        data: request.attachmentData
    });
});

// POST /leave/:id/attachment — attach (or replace) the MC on a request that is
// still pending. Sick leave is often filed before the certificate is in hand
// (UC-05 is retroactive), so the employee must be able to add it afterwards
// without cancelling and re-applying.
router.post("/:id/attachment", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        attachmentName: yup.string().trim().max(200).required(),
        attachmentType: yup.string().trim().max(60).required(),
        attachmentData: yup.string().required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const request = await LeaveRequest.findByPk(req.params.id);
        if (!request) return res.sendStatus(404);
        if (request.employeeId !== req.user.id) return res.sendStatus(403);
        if (!["DRAFT", ...chain.PENDING_STATUSES].includes(request.status)) {
            return res.status(400).json({ message: "A medical certificate can only be added while the request is still open." });
        }
        if (request.cancellationRequested) {
            return res.status(400).json({ message: "This request is awaiting a cancellation decision." });
        }
        const attach = rules.attachmentCheck(data);
        if (!attach.ok) return res.status(400).json({ message: attach.message });

        const replacing = !!request.attachmentData;
        request.attachmentName = data.attachmentName;
        request.attachmentType = data.attachmentType;
        request.attachmentData = data.attachmentData;
        await request.save();
        if (request.status !== "DRAFT") {
            await audit(request.id, req.user.name,
                replacing ? "Medical certificate replaced" : "Medical certificate attached");
        }
        res.json({ message: "Medical certificate attached.", name: request.attachmentName });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Upload failed." });
    }
});

/* ---------------- UC-14 (E): .ics calendar export ---------------- */

// GET /leave/:id/ics — download approved leave as an iCalendar file for
// Google Calendar / Outlook. Owner only (it carries their reason text).
router.get("/:id/ics", validateToken, async (req, res) => {
    const request = await LeaveRequest.findByPk(req.params.id, {
        include: [{ model: User, as: "employee", attributes: ["id", "name"] }]
    });
    if (!request) return res.sendStatus(404);
    if (request.employeeId !== req.user.id) return res.sendStatus(403);
    if (request.status !== "APPROVED") {
        return res.status(400).json({ message: "Only approved leave can be exported to a calendar." });
    }

    const LABELS = {
        annual: "Annual Leave",
        sick_mc: "Sick Leave (with MC)",
        sick_nomc: "Sick Leave (without MC)"
    };
    const ics = buildIcs(request, {
        employeeName: request.employee?.name || "",
        typeLabel: LABELS[request.leaveType] || "Leave"
    });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${icsFilename(request)}"`);
    res.send(ics);
});


router.get("/balances", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    const year = await currentLeaveYear();
    const list = await LeaveBalance.findAll({
        where: { userId: req.user.id, year }
    });
    res.json(list);
});

// Team calendar: minimum scheduling data only. A caller may select only their
// own team or a team covered by a currently active same-tier delegation.
router.get("/team-calendar", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "BOSS"), async (req, res) => {
    const effective = ["SUPERVISOR", "MANAGER"].includes(req.user.role)
        ? await loadEffectiveDelegationsTo(req.user.id)
        : [];
    const contexts = authorizedTeamContexts(req.user, effective);
    const requestedTeam = req.query.team == null
        ? req.user.team
        : String(req.query.team).trim();
    const selected = contexts.find((context) => context.team === requestedTeam);
    if (!selected) {
        return res.status(403).json({ message: "You are not authorised to view this team schedule." });
    }

    const { members, approved } = await teamApprovedLeaves(selected.team);
    res.json({
        teamName: selected.team,
        actingFor: selected.actingFor,
        availableTeams: contexts.map((context) => ({
            team: context.team,
            actingFor: context.actingFor
        })),
        team: members.map((member) => ({
            id: member.id,
            name: member.name,
            initials: member.initials
        })),
        approved
    });
});

// M3 Enhanced: bulk decide — MUST be before any /:id/* routes so "bulk-decide" is not captured as :id
router.put("/bulk-decide", validateToken, requireRole("SUPERVISOR", "MANAGER", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        ids: yup.array().of(yup.number().integer()).min(1).required(),
        approve: yup.boolean().required(),
        comment: yup.string().trim().max(500).optional(),
        rejectionReason: yup.string().trim().max(300).nullable().optional(),
        acknowledgeException: yup.boolean().default(false)
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        if (!data.approve) {
            const reason = data.rejectionReason == null ? "" : String(data.rejectionReason).trim();
            if (reason.length < 5) {
                return res.status(400).json({
                    message: "Rejection reason is required for bulk rejection (minimum 5 characters)."
                });
            }
        }
        const effective = await loadEffectiveDelegationsTo(req.user.id);
        const results = [];

        for (const id of data.ids) {
            const request = await LeaveRequest.findByPk(id, {
                include: [{ model: User, as: "employee", attributes: approvalEmployeeAttributes() }]
            });
            if (!request) {
                results.push({ id, ok: false, message: "Request not found." });
                continue;
            }
            // Never on your own request (see canActOn) - even though the
            // Approver UI's own queue already excludes it, this guards
            // against an id submitted directly.
            if (request.employeeId === req.user.id) {
                results.push({ id, ok: false, message: "You cannot act on your own leave request." });
                continue;
            }
            // Authorize request visibility before returning any business detail.
            // Both original approval tiers retain chain visibility; an active
            // same-tier delegate is authorized only for the covered team.
            // decideOne revalidates canActOn inside its own transaction.
            if (!canReadCommentThread(req.user, request, effective)) {
                results.push({ id, ok: false, message: "You are not authorised to act on this request." });
                continue;
            }
            if (request.flagged === true) {
                results.push({
                    id,
                    ok: false,
                    message: "Coverage-flagged requests require individual Manager review."
                });
                continue;
            }
            // Wrong tier (and flagged/ack etc.) surface as per-id business messages from decideOne
            try {
                const outcome = await decideOne(
                    req.user, request, data.approve, data.acknowledgeException,
                    data.approve ? null : data.rejectionReason,
                    data.comment || (data.approve ? null : data.rejectionReason)
                );
                results.push(outcome.ok
                    ? { id, ok: true, status: outcome.status }
                    : { id, ok: false, message: outcome.message });
            } catch (err) {
                // Bulk actions are best-effort per request. A database or
                // notification problem for one row must not turn every other
                // selected row into a generic "bulk decision failed" toast.
                console.error(`[bulk-decide] request ${id} failed:`, err);
                results.push({
                    id,
                    ok: false,
                    message: "This request could not be processed. Refresh the queue and try it individually."
                });
            }
        }

        res.json({ results });
    }
    catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        console.error("[bulk-decide] request failed:", err);
        res.status(500).json({ message: "Bulk decision could not be completed. Please refresh and try again." });
    }
});

/* ---------------- UC-03: cancellation ----------------
 * Pending  -> cancelled immediately, balance untouched (it was never deducted).
 * Approved -> a cancellation REQUEST that routes Supervisor -> Manager again; the
 *            balance is restored only when the Manager approves the withdrawal.
 *
 * The state change runs under a row lock (M3), so a cancellation racing an
 * approval cannot both land.
 */
router.put("/:id/cancel", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    const result = await sequelize.transaction(async (transaction) => {
        const request = await LeaveRequest.findByPk(req.params.id, {
            include: [{ model: User, as: "employee", attributes: ["id", "name", "team"] }],
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!request) return { status: 404 };
        // You can cancel ONLY your own request.
        if (request.employeeId !== req.user.id) return { status: 403 };

        // Already awaiting a cancellation decision
        if (request.cancellationRequested) {
            return { status: 400, message: "A cancellation for this request is already awaiting approval." };
        }

        // 1) Still pending -> withdraw immediately, nothing to restore.
        if (chain.PENDING_STATUSES.includes(request.status)) {
            const previousStatus = request.status;
            request.status = "CANCELLED";
            request.stageEnteredAt = new Date();
            request.lastReminderKey = null;
            request.reminderSentAt = null;
            await request.save({ transaction });
            await audit(request.id, req.user.name, "Cancelled", { transaction });
            return { status: 200, mode: "WITHDRAWN", request, previousStatus, employee: request.employee };
        }

        // 2) Already approved -> route the cancellation through the two-tier chain.
        if (request.status === "APPROVED") {
            if (request.startDate < todayISO()) {
                return {
                    status: 400,
                    message: "This leave has already started or passed - ask HR to adjust it instead."
                };
            }
            request.cancellationRequested = true;
            // M1: re-enter the chain at the SAME tier the original application would
            // have started at, so a Supervisor/Manager/HR Admin withdrawing their own
            // approved leave is never sent to someone who couldn't have approved it
            // in the first place (see the routing note in POST /apply).
            request.status = chain.initialStatusFor(req.user.role);
            request.routedTeam = null;
            request.supervisorNote = null;
            request.managerNote = null;
            request.stageEnteredAt = new Date();
            request.lastReminderKey = null;
            request.reminderSentAt = null;
            await request.save({ transaction });
            await audit(request.id, req.user.name, "Cancellation requested for approved leave", { transaction });
            return { status: 200, mode: "PENDING_APPROVAL", request, employee: request.employee };
        }

        return { status: 400, message: `A ${request.status.toLowerCase()} request cannot be cancelled.` };
    });

    if (result.status === 404) return res.sendStatus(404);
    if (result.status === 403) return res.sendStatus(403);
    if (result.status !== 200) return res.status(result.status).json({ message: result.message });

    // Delivery happens post-commit: a mail failure must not undo a valid cancellation.
    if (result.mode === "WITHDRAWN") {
        try {
            const responsible = await getResponsibleApprovers({
                status: result.previousStatus,
                employeeId: result.request.employeeId,
                employee: result.employee
            });
            await notifyMany(
                responsible,
                `${req.user.name} cancelled leave request REQ-${result.request.id}; no decision is required.`,
                {
                    type: "APPROVAL",
                    event: "REQUEST_CANCELLED",
                    requestId: result.request.id,
                    employeeName: req.user.name,
                    startDate: result.request.startDate,
                    endDate: result.request.endDate
                }
            );
        } catch (_) {
            console.error(`[notification] cancellation delivery failed for request ${result.request.id}.`);
        }
        return res.json({
            cancelled: true,
            message: `REQ-${result.request.id} cancelled. Submit a new request to change dates or leave type.`
        });
    }

    // A cancellation of APPROVED leave now needs the same two-tier review.
    const teamMembers = await User.findAll({
        where: { team: result.employee?.team || req.user.team }
    });
    try {
        await notifyNextApprover(req.user, result.request.id, teamMembers,
            "is a cancellation of approved leave and needs your review");
    } catch (_) {
        console.error(`[notification] cancellation-review delivery failed for request ${result.request.id}.`);
    }
    return res.json({
        cancelled: false,
        pendingApproval: true,
        request: result.request,
        message: req.user.role === "EMPLOYEE"
            ? `Cancellation requested for REQ-${result.request.id}. Your Supervisor and Manager must approve before the ${Number(result.request.days)} day(s) return to your balance.`
            : `Cancellation requested for REQ-${result.request.id}. It must be approved before the ${Number(result.request.days)} day(s) return to your balance.`
    });
});

/* ---------------- UC-03 (extended): return early from approved leave ----------------
 * "I'm coming back on Wednesday after all." The leave is not cancelled — its end
 * date is pulled back and only the days no longer taken come off `used`. Because
 * it changes an already-approved absence it goes through the same chain a full
 * withdrawal does, entering at whichever stage approvalChain dictates for the
 * applicant's role (so a Manager's early return goes to the Boss, not a peer).
 *
 * Leave that has ALREADY started is deliberately refused here: at that point the
 * employee's own calendar is history, so it is HR's correction to make — see
 * PUT /leave/:id/hr-adjust below.
 */
router.put("/:id/shorten", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        newEndDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });

        const result = await sequelize.transaction(async (transaction) => {
            const request = await LeaveRequest.findByPk(req.params.id, {
                include: [{ model: User, as: "employee", attributes: ["id", "name", "team", "country", "role"] }],
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!request) return { status: 404 };
            if (request.employeeId !== req.user.id) return { status: 403 };

            const check = rules.shortenCheck(request, data.newEndDate, todayISO());
            if (!check.ok) return { status: 400, message: check.message };

            // What would the shorter range actually cost under this employee's
            // own country calendar (M4)? That decides how much comes back.
            const newDays = await daysForUserRange(
                req.user, request.startDate, data.newEndDate, request.halfDay
            );
            const outcome = rules.shortenOutcome(request.days, newDays);
            if (!outcome.ok) {
                return {
                    status: 400,
                    message: "That would not free up any chargeable days — weekends and public holidays are already excluded."
                };
            }
            if (outcome.fullyCancelled) {
                return {
                    status: 400,
                    message: "That removes every working day. Use Request cancellation to withdraw the whole leave instead."
                };
            }

            request.pendingEndDate = data.newEndDate;
            request.cancellationRequested = true;
            request.status = chain.initialStatusFor(req.user.role);
            request.routedTeam = null;
            request.supervisorNote = null;
            request.managerNote = null;
            request.stageEnteredAt = new Date();
            request.lastReminderKey = null;
            request.reminderSentAt = null;
            await request.save({ transaction });
            await audit(request.id, req.user.name,
                `Early return requested - would end ${data.newEndDate} instead of ${request.endDate}, releasing ${outcome.daysReturned} day(s)`,
                { transaction });

            return { status: 200, request, outcome, employee: request.employee };
        });

        if (result.status === 404) return res.sendStatus(404);
        if (result.status === 403) return res.sendStatus(403);
        if (result.status !== 200) return res.status(result.status).json({ message: result.message });

        const teamMembers = await User.findAll({
            where: { team: result.employee?.team || req.user.team }
        });
        try {
            await notifyNextApprover(req.user, result.request.id, teamMembers,
                "is an early return from approved leave and needs your review");
        } catch (_) {
            console.error(`[notification] early-return delivery failed for request ${result.request.id}.`);
        }

        res.json({
            pendingApproval: true,
            request: result.request,
            daysReturned: result.outcome.daysReturned,
            message: `Early return requested for REQ-${result.request.id}. Once approved, it will end ${result.request.pendingEndDate} and ${result.outcome.daysReturned} day(s) return to your balance.`
        });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Could not shorten this leave." });
    }
});

/* ---------------- UC-03 (extended): HR corrects leave already under way ----------------
 * The other end of the same engine. When an employee tries to cancel leave that
 * is already running, PUT /:id/cancel tells them to "ask HR to adjust it
 * instead" — this is the endpoint that makes that sentence true.
 *
 * HR is the authority of last resort here, so there is no approval chain: the
 * change applies immediately and is written to the audit trail with a reason.
 */
router.put("/:id/hr-adjust", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        newEndDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        cancelEntirely: yup.boolean().default(false),
        reason: yup.string().trim().min(5).max(300).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        if (!data.cancelEntirely && !data.newEndDate) {
            return res.status(400).json({ message: "Give a new end date, or set cancelEntirely to void the whole leave." });
        }

        const result = await sequelize.transaction(async (transaction) => {
            const request = await LeaveRequest.findByPk(req.params.id, {
                include: [{ model: User, as: "employee", attributes: ["id", "name", "team", "country", "role"] }],
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!request) return { status: 404 };
            if (request.status !== "APPROVED") {
                return { status: 400, message: "Only approved leave can be adjusted." };
            }
            if (request.cancellationRequested) {
                return { status: 400, message: "This request is already awaiting a cancellation decision." };
            }

            const employee = request.employee;

            if (data.cancelEntirely) {
                const restored = await restoreDays(request, request.days, transaction);
                request.status = "CANCELLED";
                request.pendingEndDate = null;
                await request.save({ transaction });
                await audit(request.id, req.user.name,
                    `Voided by HR: ${data.reason.slice(0, 120)} - ${restored} day(s) restored`,
                    { transaction });
                return { status: 200, request, employee, restored, voided: true };
            }

            // HR may act on leave that has already begun — that is the point.
            const check = rules.shortenCheck(request, data.newEndDate, todayISO(), { allowStarted: true });
            if (!check.ok) return { status: 400, message: check.message };

            const newDays = await daysForUserRange(
                employee, request.startDate, data.newEndDate, request.halfDay
            );
            const outcome = rules.shortenOutcome(request.days, newDays);
            if (!outcome.ok) {
                return { status: 400, message: "That change frees up no chargeable days." };
            }

            const restored = await restoreDays(request, outcome.daysReturned, transaction);
            const previousEnd = request.endDate;
            request.endDate = data.newEndDate;
            request.days = newDays;
            request.pendingEndDate = null;
            await request.save({ transaction });
            await audit(request.id, req.user.name,
                `Adjusted by HR: ends ${data.newEndDate} instead of ${previousEnd} (${data.reason.slice(0, 100)}) - ${restored} day(s) restored`,
                { transaction });

            return { status: 200, request, employee, restored, previousEnd };
        });

        if (result.status === 404) {
            return res.status(404).json({ message: `Leave request ${req.params.id} was not found.` });
        }
        if (result.status !== 200) return res.status(result.status).json({ message: result.message });

        try {
            await notify(
                result.request.employeeId,
                (result.voided
                    ? `HR voided your leave REQ-${result.request.id}: ${data.reason}. ${result.restored} day(s) returned to your balance.`
                    : `HR adjusted your leave REQ-${result.request.id} to end ${result.request.endDate}: ${data.reason}. ${result.restored} day(s) returned to your balance.`
                ).slice(0, 255),
                { type: "APPROVAL", event: "HR_ADJUSTED", requestId: result.request.id }
            );
        } catch (_) {
            console.error(`[notification] HR adjustment delivery failed for request ${result.request.id}.`);
        }

        res.json({
            request: result.request,
            daysRestored: result.restored,
            message: result.voided
                ? `REQ-${result.request.id} voided. ${result.restored} day(s) returned to ${result.employee?.name}.`
                : `REQ-${result.request.id} now ends ${result.request.endDate}. ${result.restored} day(s) returned to ${result.employee?.name}.`
        });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Could not adjust this leave." });
    }
});

/* ---------------- UC-13 (extended): certificates HR still needs to chase ----------------
 * Sick leave with no certificate attached that ought to have one — either the
 * type always requires it, or the absence ran past what self-declaration covers.
 * Read-only and HR-only: the document itself is never included, only the fact
 * that it is missing (GET /leave/:id/attachment remains the one way to see one).
 */
router.get("/mc-compliance", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const types = await LeaveType.findAll();
    const typeByCode = Object.fromEntries(types.map((t) => [t.code, t]));

    const rows = await LeaveRequest.findAll({
        where: {
            leaveType: { [Op.in]: ["sick_mc", "sick_nomc"] },
            // Every stage the chain can park a request at, plus approved leave.
            status: { [Op.in]: [...chain.PENDING_STATUSES, "APPROVED"] }
        },
        attributes: [
            "id", "employeeId", "leaveType", "startDate", "endDate",
            "days", "status", "createdAt"
        ],
        include: [{ model: User, as: "employee", attributes: ["id", "name", "team", "country"] }],
        order: [["startDate", "DESC"]]
    });

    // `attachmentData` is deliberately excluded from the query above (it is a
    // multi-megabyte column), so presence is checked separately.
    const withAttachment = new Set(
        (await LeaveRequest.findAll({
            where: {
                id: { [Op.in]: rows.length ? rows.map((r) => r.id) : [-1] },
                attachmentData: { [Op.ne]: null }
            },
            attributes: ["id"]
        })).map((r) => r.id)
    );

    const outstanding = [];
    for (const r of rows) {
        const gap = rules.mcComplianceGap(
            {
                leaveType: r.leaveType,
                days: r.days,
                status: r.status,
                attachmentData: withAttachment.has(r.id) ? "present" : null
            },
            typeByCode[r.leaveType] || null
        );
        if (!gap) continue;
        outstanding.push({
            id: r.id,
            employee: r.employee ? { id: r.employee.id, name: r.employee.name, team: r.employee.team } : null,
            leaveType: r.leaveType,
            startDate: r.startDate,
            endDate: r.endDate,
            days: Number(r.days),
            status: r.status,
            reason: gap.reason,
            detail: gap.detail
        });
    }

    res.json({
        selfDeclarationLimit: rules.MC_REQUIRED_AFTER_DAYS,
        count: outstanding.length,
        outstanding
    });
});

/* ---------------- UC-02: approval queues + decisions ---------------- */

// Supervisor queue (tier 1) or Manager queue (tier 2), including valid acting
// approver assignments. Every candidate is filtered through the SAME server-side
// authorization helper used for mutations, so the queue can never show a request
// the caller would be refused on.
//
// Each approving role has exactly one stage: Supervisor -> PENDING_SUPERVISOR,
// Manager -> PENDING_MANAGER, Boss -> PENDING_BOSS. HR Admin is NOT an approver
// any more - HR's own leave runs the ordinary chain and HR decides nobody's
// leave, so there is no HR queue to serve here.
router.get("/pending", validateToken, requireRole("SUPERVISOR", "MANAGER", "BOSS"), async (req, res) => {
    const status = chain.stageForRole(req.user.role);
    const effective = await loadEffectiveDelegationsTo(req.user.id);
    const candidates = await LeaveRequest.findAll({
        where: { status },
        order: [['createdAt', 'ASC']],
        include: [
            { model: User, as: "employee", attributes: approvalEmployeeAttributes() },
            { model: AuditLog }
        ]
    });

    const result = [];
    for (const request of candidates) {
        if (!canActOn(req.user, request, effective)) continue;
        const json = request.toJSON();
        const actingFor = chainDelegationFor(req.user, request, effective);
        if (actingFor) {
            json.actingFor = { id: actingFor.fromUser.id, name: actingFor.fromUser.name };
        }
        result.push(json);
    }

    res.json(result);
});

// Staged decision. Supervisor approve -> PENDING_MANAGER (never final).
// Manager approve -> APPROVED (+ balance deduction). Boss approve -> APPROVED,
// on a Manager's own leave. No auto-approval, and nobody decides their own.
router.put("/:id/decide", validateToken, requireRole("SUPERVISOR", "MANAGER", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        approve: yup.boolean().required(),
        acknowledgeException: yup.boolean().default(false),
        // F3: required by UI on reject; stored as supervisorNote / managerNote
        rejectionReason: yup.string().trim().max(300).nullable().optional(),
        comment: yup.string().trim().max(500).nullable().optional()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const request = await LeaveRequest.findByPk(req.params.id, {
            include: [{ model: User, as: "employee", attributes: approvalEmployeeAttributes() }]
        });
        if (!request) return res.sendStatus(404);

        // Never on your own request, regardless of role or tier.
        if (request.employeeId === req.user.id) {
            return res.status(403).json({ message: "You cannot act on your own leave request." });
        }

        // M3: team / delegation authorization. Gate whenever the caller's role
        // is the one that owns this stage - so a Manager on PENDING_MANAGER is
        // checked against team scope (and, for the Boss's own leave, against
        // the executive rule), rather than being waved through on role alone.
        // Genuinely wrong-tier attempts (e.g. a Supervisor on a PENDING_MANAGER
        // request) still fall through to decideOne's tier-mismatch message.
        const roleCanEverDecideThisTier =
            chain.stageForRole(req.user.role) === request.status;
        const effective = await loadEffectiveDelegationsTo(req.user.id);
        if (roleCanEverDecideThisTier && !canActOn(req.user, request, effective)) {
            return res.status(403).json({ message: "You are not authorised to act on this request." });
        }

        // F3: single reject requires a non-empty note (min 5 chars, max 300)
        if (!data.approve) {
            const note = data.rejectionReason != null ? String(data.rejectionReason).trim() : "";
            if (note.length < 5) {
                return res.status(400).json({
                    message: "Rejection reason is required (minimum 5 characters)."
                });
            }
            if (note.length > 300) {
                return res.status(400).json({
                    message: "Rejection reason must be at most 300 characters."
                });
            }
        }

        const outcome = await decideOne(
            req.user, request, data.approve, data.acknowledgeException,
            data.approve ? null : String(data.rejectionReason).trim(),
            data.comment || null
        );
        if (!outcome.ok) {
            return res.status(outcome.statusCode || 400).json({ message: outcome.message });
        }
        res.json({ request: outcome.request });
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

/* ---------------- UC-28: comment thread (append-only, terminal read-only) ---------------- */

router.get("/:id/comments", validateToken, async (req, res) => {
    const request = await LeaveRequest.findByPk(req.params.id, {
        include: [{ model: User, as: "employee", attributes: approvalEmployeeAttributes() }]
    });
    if (!request) return res.sendStatus(404);

    const effective = await loadEffectiveDelegationsTo(req.user.id);
    if (!canReadCommentThread(req.user, request, effective)) {
        return res.sendStatus(403);
    }

    const list = await Comment.findAll({
        where: { requestId: request.id },
        order: [['createdAt', 'ASC']]
    });
    res.json(list);
});

router.post("/:id/comments", validateToken, async (req, res) => {
    const validationSchema = yup.object({
        body: yup.string().trim().min(1).max(500).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const result = await sequelize.transaction(async (transaction) => {
            const request = await LeaveRequest.findByPk(req.params.id, {
                include: [{ model: User, as: "employee" }],
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!request) return { status: 404 };

            const effective = await loadEffectiveDelegationsTo(req.user.id, { transaction });
            if (!canReadCommentThread(req.user, request, effective)) {
                return { status: 403 };
            }
            if (!chain.PENDING_STATUSES.includes(request.status)) {
                return {
                    status: 400,
                    message: "Comments are locked once the request is decided."
                };
            }
            if (!canPostComment(req.user, request, effective)) {
                return { status: 403 };
            }

            const comment = await createCommentWithAudit(
                request,
                req.user,
                data.body,
                effective,
                { transaction }
            );
            return { status: 200, comment, request };
        });

        if (result.status === 404) return res.sendStatus(404);
        if (result.status === 403) return res.sendStatus(403);
        if (result.status !== 200) {
            return res.status(result.status).json({ message: result.message });
        }

        try {
            await notifyCommentParticipants(result.request, req.user);
        } catch (_) {
            console.error(`[notification] comment participant lookup failed for request ${result.request.id}.`);
        }
        res.json(result.comment);
    }
    catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Invalid comment." });
    }
});

module.exports = router;
