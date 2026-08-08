const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { User, LeaveRequest, LeaveBalance, PublicHoliday, AuditLog, Comment, Delegation } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
const cov = require('../services/coverage');
const { notify } = require('../services/notificationService');
const { matchesTier, isDelegationActive, canActOn, effectiveTeam } = require('../services/delegationService');
const { currentLeaveYear } = require('../services/leaveYearService');
const { todaySGT } = require('../services/dateService');

/* ---------------- helpers ---------------- */

const holidaySetFor = async (country) => {
    const rows = await PublicHoliday.findAll({ where: { country } });
    return new Set(rows.map(r => r.date));
};

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

const remaining = (b) => Number(b.entitled) + Number(b.carried) - Number(b.used);

const audit = (requestId, actorName, action) =>
    AuditLog.create({ requestId, actorName, action });

// Same UTC-vs-Singapore-time bug as announcements — see services/dateService.js.
// A delegation starting/ending "today" in SGT could otherwise be wrongly
// treated as not-yet-active (or already-ended) for up to 8 hours a day.
const todayISO = todaySGT;

// Effective delegations TO this user (for canActOn / pending queue)
const loadEffectiveDelegationsTo = async (userId) => {
    const today = todayISO();
    const rows = await Delegation.findAll({
        where: { toUserId: userId, active: true },
        include: [{ model: User, as: "fromUser", attributes: ["id", "name", "team", "role"] }]
    });
    return rows.filter(d => isDelegationActive(d, today));
};

// Participants for comment thread (guide §6.2 / Task 3):
// employee, or canActOn / same-team+matching-tier; for decided requests, same-team approvers may still view.
const isCommentParticipant = (user, request, effectiveDelegations) => {
    if (user.id === request.employeeId) return true;
    if (canActOn(user, request, effectiveDelegations)) return true;
    const team = effectiveTeam(request);
    // same team (or routed-to team) + matching tier (redundant with canActOn
    // own-team path, kept for clarity)
    if (["SUPERVISOR", "MANAGER"].includes(user.role) &&
        user.team === team &&
        matchesTier(user.role, request.status)) {
        return true;
    }
    // After decision, allow same-team (or delegated/routed-team) approvers to read the locked thread
    if (!String(request.status).startsWith("PENDING")) {
        if (["SUPERVISOR", "MANAGER"].includes(user.role) && user.team === team) {
            return true;
        }
        return effectiveDelegations.some(d =>
            d.fromUser && d.fromUser.team === team
        );
    }
    return false;
};

// Notify current-tier approvers of the request's team (for new comments from employee)
const notifyCurrentTierApprovers = async (request, message) => {
    const team = request.employee?.team;
    if (!team) return;
    const roleNeeded = request.status === "PENDING_SUPERVISOR" ? "SUPERVISOR"
        : request.status === "PENDING_MANAGER" ? "MANAGER"
        : null;
    if (!roleNeeded) return;
    const approvers = await User.findAll({ where: { team, role: roleNeeded } });
    for (const a of approvers) {
        await notify(a.id, message, { type: "COMMENT", requestId: request.id });
    }
};

// Create a comment (shared by POST /:id/comments and bulk-decide optional comment)
const createComment = async (request, actor, body) => {
    return Comment.create({
        requestId: request.id,
        body,
        authorName: actor.name,
        authorRole: actor.role,
        authorId: actor.id
    });
};

/* ---------------- single-request decision (shared by /:id/decide and bulk-decide) ---------------- */

// Returns { ok, status?, message? } — no res. Caller enforces canActOn first.
// rejectionReason (F3): stored on supervisorNote / managerNote and included in employee notify.
const decideOne = async (actor, request, approve, acknowledgeException, rejectionReason = null) => {
    const note = rejectionReason && String(rejectionReason).trim()
        ? String(rejectionReason).trim().slice(0, 300)
        : null;

    if (actor.role === "SUPERVISOR") {
        if (request.status !== "PENDING_SUPERVISOR") {
            return { ok: false, message: "Request is not at the Supervisor tier." };
        }
        if (approve) {
            // M3: if this decision was made by a delegate from a DIFFERENT team
            // than the employee's own (i.e. via delegation, not the own-team
            // path), the whole hand-off moves with them: the Manager tier will
            // route to the delegate's own team's Manager, not back to the
            // employee's original team. Same-team approvals leave this null.
            if (actor.team !== request.employee.team) {
                request.routedTeam = actor.team;
            }
            request.status = "PENDING_MANAGER";
            await audit(request.id, actor.name, request.flagged
                ? "Endorsed by Supervisor - escalated for Manager special approval"
                : "Approved by Supervisor - routed to Manager");
        } else {
            request.status = "REJECTED";
            if (note) request.supervisorNote = note;
            await audit(request.id, actor.name, note
                ? `Rejected by Supervisor: ${note.slice(0, 120)}`
                : "Rejected by Supervisor");
        }
    } else { // MANAGER
        if (request.status !== "PENDING_MANAGER") {
            return { ok: false, message: "Request is not at the Manager tier." };
        }
        // Flagged requests need an explicit coverage-exception acknowledgement
        if (approve && request.flagged && !acknowledgeException) {
            return {
                ok: false,
                message: "This request is flagged: coverage falls below threshold. Set acknowledgeException=true to approve the exception explicitly."
            };
        }
        if (approve) {
            request.status = "APPROVED";
            await audit(request.id, actor.name, request.flagged
                ? "Coverage exception explicitly approved by Manager - final"
                : "Approved by Manager - final");
            // Deduct balance on FINAL approval only
            const year = new Date(request.startDate).getFullYear();
            const balance = await LeaveBalance.findOne({
                where: { userId: request.employeeId, leaveType: request.leaveType, year }
            });
            if (balance) {
                balance.used = Number(balance.used) + Number(request.days);
                await balance.save();
            }
        } else {
            request.status = "REJECTED";
            if (note) request.managerNote = note;
            await audit(request.id, actor.name, note
                ? `Rejected by Manager: ${note.slice(0, 120)}`
                : "Rejected by Manager");
        }
    }
    await request.save();

    // F3: rejection notification includes the reason when provided
    let notifyMsg = `Your request ${request.id} is now ${request.status.replace("_", " ")}.`;
    if (!approve && note) {
        notifyMsg = `Your request ${request.id} was REJECTED. Reason: ${note}`;
    }
    await notify(
        request.employeeId,
        notifyMsg.slice(0, 255),
        { type: "APPROVAL", requestId: request.id }
    );
    return { ok: true, status: request.status };
};

/* ---------------- UC-01: apply for leave (EMPLOYEE only) ---------------- */

router.post("/apply", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        leaveType: yup.string().oneOf(["annual", "sick_mc", "sick_nomc"]).required(),
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

        if (data.endDate < data.startDate) {
            return res.status(400).json({ message: "End date must be on or after the start date." });
        }
        // Business rule: half-day only for single-day requests (no hourly increments)
        if (data.halfDay && data.startDate !== data.endDate) {
            return res.status(400).json({ message: "Half-day is only allowed for single-day requests." });
        }

        const holidaySet = await holidaySetFor(req.user.country);
        const workDays = cov.workingDaysInRange(data.startDate, data.endDate, holidaySet);
        if (workDays.length === 0) {
            return res.status(400).json({ message: "The selected range contains no working days." });
        }
        const days = data.halfDay ? 0.5 : workDays.length;

        // M2 (UC-13): sick_mc requires an attached medical certificate.
        if (data.leaveType === "sick_mc" && !data.isDraft && !data.attachmentData) {
            return res.status(400).json({ message: "Sick leave with MC requires an attached medical certificate." });
        }
        // Attachment size guard (~5MB of base64) to keep the row sane.
        if (data.attachmentData && data.attachmentData.length > 7_000_000) {
            return res.status(400).json({ message: "Attachment is too large (max ~5MB)." });
        }

        // Balance check (pending requests also reserve balance) — skipped for drafts.
        const year = new Date(data.startDate).getFullYear();
        const balance = await LeaveBalance.findOne({
            where: { userId: req.user.id, leaveType: data.leaveType, year }
        });
        if (!balance) {
            return res.status(400).json({ message: "No leave balance record for this year." });
        }
        if (!data.isDraft) {
            const pending = await LeaveRequest.sum('days', {
                where: {
                    employeeId: req.user.id,
                    leaveType: data.leaveType,
                    status: { [Op.in]: ["PENDING_SUPERVISOR", "PENDING_MANAGER"] }
                }
            }) || 0;
            if (days > remaining(balance) - Number(pending)) {
                return res.status(400).json({
                    message: `Insufficient balance: requesting ${days} day(s) but only ${remaining(balance) - Number(pending)} remain (including pending requests).`
                });
            }
        }

        // M4 (UC-18): blackout-period check (skipped for drafts). BLOCK rejects;
        // SPECIAL_APPROVAL forces the coverage flag so it routes for extra scrutiny.
        let blackout = { hit: false, mode: null, periods: [] };
        if (!data.isDraft) {
            try {
                const staffing = require('../services/staffingService');
                blackout = await staffing.blackoutForRange(req.user.country, req.user.team, data.startDate, data.endDate);
                if (blackout.hit && blackout.mode === "BLOCK") {
                    return res.status(400).json({
                        message: `Your dates fall in a restricted (blackout) period: ${blackout.periods.map(p => p.reason || `${p.startDate}→${p.endDate}`).join("; ")}. Leave cannot be applied for these dates.`
                    });
                }
            } catch (_) { /* blackout table optional; ignore if unavailable */ }
        }

        // AI-2 coverage check on the server (source of truth)
        const { members, approved } = await teamApprovedLeaves(req.user.team);
        const conflicts = cov.evaluateCoverage(workDays, approved, req.user.id, members.length);
        const flagged = (conflicts.length > 0) || (blackout.hit && blackout.mode === "SPECIAL_APPROVAL");

        // M2 (UC-14): a draft is stored privately and not routed to approvers.
        // M1: a leadership self-application skips the tier the applicant
        // themselves occupies, since there's no OTHER same-tier peer on their
        // team who could approve it without a conflict of interest. A
        // Supervisor's own leave starts at the Manager tier (their Manager
        // decides normally); a Manager's or HR Admin's own leave has no peer
        // at any team tier, so it's routed to HR Admin specifically — see
        // canActOn in services/delegationService.js for the authorization
        // side of this, and the notify() calls below for who is told.
        const status = data.isDraft ? "DRAFT"
            : req.user.role === "EMPLOYEE" ? "PENDING_SUPERVISOR"
            : "PENDING_MANAGER";

        const request = await LeaveRequest.create({
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
            attachmentData: data.attachmentData || null
        });

        if (data.isDraft) {
            return res.json({ request, draft: true });
        }

        await audit(request.id, req.user.name,
            flagged ? "Submitted (coverage flag raised)" : "Submitted");

        // Notify whoever actually owns the next approval step.
        if (req.user.role === "EMPLOYEE") {
            const supervisors = members.filter(m => m.role === "SUPERVISOR");
            for (const s of supervisors) {
                await notify(
                    s.id,
                    `New leave request ${request.id} from ${req.user.name} awaits your review.`,
                    { type: "APPROVAL", requestId: request.id }
                );
            }
        } else if (req.user.role === "SUPERVISOR") {
            // Their own team's Manager — ordinary Manager-tier approval, no
            // conflict of interest since a Manager is never the applicant here.
            const managers = members.filter(m => m.role === "MANAGER");
            for (const m of managers) {
                await notify(
                    m.id,
                    `New leave request ${request.id} from ${req.user.name} (Supervisor) awaits your review.`,
                    { type: "APPROVAL", requestId: request.id }
                );
            }
        } else {
            // Applicant is a MANAGER or HR_ADMIN — HR Admin is the designated
            // backstop approver for leadership leave (see canActOn).
            const hrAdmins = await User.findAll({ where: { role: "HR_ADMIN", id: { [Op.ne]: req.user.id } } });
            for (const h of hrAdmins) {
                await notify(
                    h.id,
                    `New leave request ${request.id} from ${req.user.name} (${req.user.role}) awaits your review.`,
                    { type: "APPROVAL", requestId: request.id }
                );
            }
        }

        res.json({ request, flagged, conflicts, blackout: blackout.hit ? blackout : undefined });
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

/* ---------------- AI-2: pre-submission coverage check ---------------- */

router.post("/coverage-check", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        endDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const holidaySet = await holidaySetFor(req.user.country);
        const workDays = cov.workingDaysInRange(data.startDate, data.endDate, holidaySet);
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

/* ---------------- UC-08: my requests + team calendar ---------------- */

router.get("/mine", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"), async (req, res) => {
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
router.get("/drafts", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"), async (req, res) => {
    const list = await LeaveRequest.findAll({
        where: { employeeId: req.user.id, status: "DRAFT" },
        order: [['updatedAt', 'DESC']]
    });
    res.json(list);
});

// PUT /leave/drafts/:id — edit a draft in place
router.put("/drafts/:id", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        leaveType: yup.string().oneOf(["annual", "sick_mc", "sick_nomc"]).optional(),
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
        const draft = await LeaveRequest.findByPk(req.params.id);
        if (!draft) return res.sendStatus(404);
        if (draft.employeeId !== req.user.id) return res.sendStatus(403);
        if (draft.status !== "DRAFT") return res.status(400).json({ message: "Only drafts can be edited here." });
        for (const k of ["leaveType", "startDate", "endDate", "halfDay", "halfDayPeriod", "reason", "attachmentName", "attachmentType", "attachmentData"]) {
            if (data[k] !== undefined) draft[k] = data[k];
        }
        await draft.save();
        res.json(draft);
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Invalid request." });
    }
});

// POST /leave/drafts/:id/submit — promote a draft to a live request (runs the same checks)
router.post("/drafts/:id/submit", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"), async (req, res) => {
    const draft = await LeaveRequest.findByPk(req.params.id);
    if (!draft) return res.sendStatus(404);
    if (draft.employeeId !== req.user.id) return res.sendStatus(403);
    if (draft.status !== "DRAFT") return res.status(400).json({ message: "This request is not a draft." });

    if (draft.endDate < draft.startDate) {
        return res.status(400).json({ message: "End date must be on or after the start date." });
    }
    const holidaySet = await holidaySetFor(req.user.country);
    const workDays = cov.workingDaysInRange(draft.startDate, draft.endDate, holidaySet);
    if (workDays.length === 0) {
        return res.status(400).json({ message: "The selected range contains no working days." });
    }
    if (draft.leaveType === "sick_mc" && !draft.attachmentData) {
        return res.status(400).json({ message: "Sick leave with MC requires an attached medical certificate." });
    }

    const year = new Date(draft.startDate).getFullYear();
    const balance = await LeaveBalance.findOne({ where: { userId: req.user.id, leaveType: draft.leaveType, year } });
    if (!balance) return res.status(400).json({ message: "No leave balance record for this year." });
    const pending = await LeaveRequest.sum('days', {
        where: { employeeId: req.user.id, leaveType: draft.leaveType, status: { [Op.in]: ["PENDING_SUPERVISOR", "PENDING_MANAGER"] } }
    }) || 0;
    if (Number(draft.days) > remaining(balance) - Number(pending)) {
        return res.status(400).json({ message: `Insufficient balance to submit this draft.` });
    }

    // Blackout + coverage checks (same as /apply)
    let blackout = { hit: false, mode: null, periods: [] };
    try {
        const staffing = require('../services/staffingService');
        blackout = await staffing.blackoutForRange(req.user.country, req.user.team, draft.startDate, draft.endDate);
        if (blackout.hit && blackout.mode === "BLOCK") {
            return res.status(400).json({ message: `Dates fall in a blackout period and cannot be submitted.` });
        }
    } catch (_) { /* optional */ }

    const { members, approved } = await teamApprovedLeaves(req.user.team);
    const conflicts = cov.evaluateCoverage(workDays, approved, req.user.id, members.length);
    const flagged = (conflicts.length > 0) || (blackout.hit && blackout.mode === "SPECIAL_APPROVAL");

    // Same leadership routing as /apply — see the comment there.
    draft.status = req.user.role === "EMPLOYEE" ? "PENDING_SUPERVISOR" : "PENDING_MANAGER";
    draft.isDraft = false;
    draft.flagged = flagged;
    await draft.save();
    await audit(draft.id, req.user.name, flagged ? "Submitted from draft (coverage flag raised)" : "Submitted from draft");

    if (req.user.role === "EMPLOYEE") {
        const supervisors = members.filter(m => m.role === "SUPERVISOR");
        for (const s of supervisors) {
            await notify(s.id, `New leave request ${draft.id} from ${req.user.name} awaits your review.`, { type: "APPROVAL", requestId: draft.id });
        }
    } else if (req.user.role === "SUPERVISOR") {
        const managers = members.filter(m => m.role === "MANAGER");
        for (const m of managers) {
            await notify(m.id, `New leave request ${draft.id} from ${req.user.name} (Supervisor) awaits your review.`, { type: "APPROVAL", requestId: draft.id });
        }
    } else {
        const hrAdmins = await User.findAll({ where: { role: "HR_ADMIN", id: { [Op.ne]: req.user.id } } });
        for (const h of hrAdmins) {
            await notify(h.id, `New leave request ${draft.id} from ${req.user.name} (${req.user.role}) awaits your review.`, { type: "APPROVAL", requestId: draft.id });
        }
    }
    res.json({ request: draft, flagged, conflicts });
});

// DELETE /leave/drafts/:id — discard a draft
router.delete("/drafts/:id", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"), async (req, res) => {
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


router.get("/balances", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"), async (req, res) => {
    const year = await currentLeaveYear();
    const list = await LeaveBalance.findAll({
        where: { userId: req.user.id, year }
    });
    res.json(list);
});

// Team calendar: dates only for staff (UC-08 access rules)
router.get("/team-calendar", validateToken, async (req, res) => {
    const { members, approved } = await teamApprovedLeaves(req.user.team);
    res.json({
        team: members.map(m => ({ id: m.id, name: m.name, initials: m.initials })),
        approved  // no leave types exposed - dates only
    });
});

// M3 Enhanced: bulk decide — MUST be before any /:id/* routes so "bulk-decide" is not captured as :id
router.put("/bulk-decide", validateToken, requireRole("SUPERVISOR", "MANAGER"), async (req, res) => {
    let validationSchema = yup.object({
        ids: yup.array().of(yup.number().integer()).min(1).required(),
        approve: yup.boolean().required(),
        comment: yup.string().trim().max(500).optional(),
        rejectionReason: yup.string().trim().max(300).nullable().optional(),
        acknowledgeException: yup.boolean().default(false)
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const effective = await loadEffectiveDelegationsTo(req.user.id);
        const results = [];

        for (const id of data.ids) {
            const request = await LeaveRequest.findByPk(id, {
                include: [{ model: User, as: "employee" }]
            });
            if (!request) {
                results.push({ id, ok: false, message: "Request not found." });
                continue;
            }
            // Never on your own request (see canActOn) — even though the
            // Approver UI's own queue already excludes it, this guards
            // against an id submitted directly.
            if (request.employeeId === req.user.id) {
                results.push({ id, ok: false, message: "You cannot act on your own leave request." });
                continue;
            }
            // Right tier but not own-team / not an effective delegate → authz failure
            if (matchesTier(req.user.role, request.status) && !canActOn(req.user, request, effective)) {
                results.push({ id, ok: false, message: "You are not authorised to act on this request." });
                continue;
            }
            // Wrong tier (and flagged/ack etc.) surface as per-id business messages from decideOne
            const outcome = await decideOne(
                req.user, request, data.approve, data.acknowledgeException,
                data.approve ? null : (data.rejectionReason || null)
            );
            if (outcome.ok && data.comment) {
                await createComment(request, req.user, data.comment);
            }
            results.push({ id, ...outcome });
        }

        res.json({ results });
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

router.put("/:id/cancel", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"), async (req, res) => {
    const request = await LeaveRequest.findByPk(req.params.id);
    if (!request) return res.sendStatus(404);
    // Employees can cancel ONLY their own pending requests
    if (request.employeeId !== req.user.id) return res.sendStatus(403);
    if (!["PENDING_SUPERVISOR", "PENDING_MANAGER"].includes(request.status)) {
        return res.status(400).json({ message: "Only pending requests can be cancelled." });
    }
    request.status = "CANCELLED";
    await request.save();
    await audit(request.id, req.user.name, "Cancelled");
    res.json({ message: `${req.params.id} cancelled. Submit a new request to change dates or leave type.` });
});

/* ---------------- UC-02: approval queues + decisions ---------------- */

// Supervisor queue (tier 1) or Manager queue (tier 2) based on role,
// plus any queue delegated to the caller (M3).
router.get("/pending", validateToken, requireRole("SUPERVISOR", "MANAGER", "HR_ADMIN"), async (req, res) => {
    // HR Admin has its own queue: leadership requests (a Manager or another
    // HR Admin applying for their own leave) that are routed here because no
    // team peer can approve those without a conflict of interest — see
    // canActOn in services/delegationService.js. This is a different shape of
    // queue than the team-based one below, so it's handled separately.
    if (req.user.role === "HR_ADMIN") {
        const list = await LeaveRequest.findAll({
            where: {
                status: "PENDING_MANAGER",
                employeeId: { [Op.ne]: req.user.id }
            },
            order: [['createdAt', 'ASC']],
            include: [
                { model: User, as: "employee", attributes: ["id", "name", "initials", "team", "role"] },
                { model: AuditLog }
            ]
        });
        const leadership = list.filter(r => ["MANAGER", "HR_ADMIN"].includes(r.employee?.role));
        return res.json(leadership.map(r => r.toJSON()));
    }

    const status = req.user.role === "SUPERVISOR" ? "PENDING_SUPERVISOR" : "PENDING_MANAGER";
    const members = await User.findAll({ where: { team: req.user.team } });
    // A request belongs to my own queue if either:
    //  - routedTeam explicitly hands it to my team (a delegate approved the prior
    //    tier from a different team, and that team is mine), or
    //  - routedTeam is unset (normal path) and the employee is on my team.
    // Also never my own request (see canActOn), and — at the Manager tier — never
    // a fellow Manager's or an HR Admin's own leave, which belongs to HR Admin's
    // queue above instead, regardless of team.
    const ownList = await LeaveRequest.findAll({
        where: {
            status,
            employeeId: { [Op.ne]: req.user.id },
            [Op.or]: [
                { routedTeam: req.user.team },
                { routedTeam: null, employeeId: { [Op.in]: members.map(m => m.id) } }
            ]
        },
        order: [['createdAt', 'ASC']],
        include: [
            { model: User, as: "employee", attributes: ["id", "name", "initials", "team", "role"] },
            { model: AuditLog }
        ]
    });

    const seen = new Set();
    const result = [];
    for (const r of ownList) {
        if (status === "PENDING_MANAGER" && ["MANAGER", "HR_ADMIN"].includes(r.employee?.role)) continue;
        seen.add(r.id);
        result.push(r.toJSON());
    }

    // M3: delegated queues
    const effective = await loadEffectiveDelegationsTo(req.user.id);
    for (const d of effective) {
        // Only same-tier delegations produce a queue the caller can act on (canActOn)
        if (!matchesTier(d.fromUser.role, status)) continue;
        const delMembers = await User.findAll({ where: { team: d.fromUser.team } });
        const delList = await LeaveRequest.findAll({
            where: {
                status,
                employeeId: { [Op.ne]: req.user.id },
                [Op.or]: [
                    { routedTeam: d.fromUser.team },
                    ...(delMembers.length
                        ? [{ routedTeam: null, employeeId: { [Op.in]: delMembers.map(m => m.id) } }]
                        : [])
                ]
            },
            order: [['createdAt', 'ASC']],
            include: [
                { model: User, as: "employee", attributes: ["id", "name", "initials", "team", "role"] },
                { model: AuditLog }
            ]
        });
        for (const r of delList) {
            if (seen.has(r.id)) continue;
            if (status === "PENDING_MANAGER" && ["MANAGER", "HR_ADMIN"].includes(r.employee?.role)) continue;
            seen.add(r.id);
            const json = r.toJSON();
            json.actingFor = { id: d.fromUser.id, name: d.fromUser.name };
            result.push(json);
        }
    }

    res.json(result);
});

// Two-tier decision. Supervisor approve -> PENDING_MANAGER (never final).
// Manager approve -> APPROVED (+ balance deduction). No auto-approval.
// HR_ADMIN can also decide — but ONLY on leadership requests (a Manager's or
// another HR Admin's own leave) routed to them via canActOn; a normal
// employee's request is never in HR Admin's authority here.
router.put("/:id/decide", validateToken, requireRole("SUPERVISOR", "MANAGER", "HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        approve: yup.boolean().required(),
        acknowledgeException: yup.boolean().default(false),
        // F3: required by UI on reject; stored as supervisorNote / managerNote
        rejectionReason: yup.string().trim().max(300).nullable().optional()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const request = await LeaveRequest.findByPk(req.params.id, {
            include: [{ model: User, as: "employee" }]
        });
        if (!request) return res.sendStatus(404);

        // Never on your own request, regardless of role or tier.
        if (request.employeeId === req.user.id) {
            return res.status(403).json({ message: "You cannot act on your own leave request." });
        }

        // M3: team / delegation authorization. Gate whenever the caller's role
        // is one decideOne would EVER act on for this tier — a Supervisor on
        // PENDING_SUPERVISOR, or anyone decideOne treats as manager-tier
        // (MANAGER or HR_ADMIN) on PENDING_MANAGER, INCLUDING leadership
        // requests. Without gating leadership requests here too, a plain
        // Manager's role already generically matches PENDING_MANAGER and
        // decideOne has no concept of "this one is HR Admin-only" — it would
        // silently accept the decision. Genuinely wrong-tier attempts (e.g. a
        // Supervisor on a PENDING_MANAGER request) still fall through to
        // decideOne's own tier-mismatch message.
        const roleCanEverDecideThisTier =
            (request.status === "PENDING_SUPERVISOR" && req.user.role === "SUPERVISOR") ||
            (request.status === "PENDING_MANAGER" && req.user.role !== "SUPERVISOR");
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
            data.approve ? null : String(data.rejectionReason).trim()
        );
        if (!outcome.ok) {
            return res.status(400).json({ message: outcome.message });
        }
        res.json({ request });
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

/* ---------------- UC-28: comment thread (append-only, locked when decided) ---------------- */

router.get("/:id/comments", validateToken, async (req, res) => {
    const request = await LeaveRequest.findByPk(req.params.id, {
        include: [{ model: User, as: "employee", attributes: ["id", "name", "team"] }]
    });
    if (!request) return res.sendStatus(404);

    const effective = await loadEffectiveDelegationsTo(req.user.id);
    if (!isCommentParticipant(req.user, request, effective)) {
        return res.sendStatus(403);
    }

    const list = await Comment.findAll({
        where: { requestId: request.id },
        order: [['createdAt', 'ASC']]
    });
    res.json(list);
});

router.post("/:id/comments", validateToken, async (req, res) => {
    let validationSchema = yup.object({
        body: yup.string().trim().min(1).max(500).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const request = await LeaveRequest.findByPk(req.params.id, {
            include: [{ model: User, as: "employee", attributes: ["id", "name", "team"] }]
        });
        if (!request) return res.sendStatus(404);

        const effective = await loadEffectiveDelegationsTo(req.user.id);
        if (!isCommentParticipant(req.user, request, effective)) {
            return res.sendStatus(403);
        }

        if (!["PENDING_SUPERVISOR", "PENDING_MANAGER"].includes(request.status)) {
            return res.status(400).json({ message: "Comments are locked once the request is decided." });
        }

        const comment = await createComment(request, req.user, data.body);

        // Notify the other party
        if (req.user.id === request.employeeId) {
            await notifyCurrentTierApprovers(
                request,
                `New comment on request ${request.id} from ${req.user.name}.`
            );
        } else {
            await notify(
                request.employeeId,
                `New comment on request ${request.id} from ${req.user.name}.`,
                { type: "COMMENT", requestId: request.id }
            );
        }

        res.json(comment);
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

module.exports = router;
