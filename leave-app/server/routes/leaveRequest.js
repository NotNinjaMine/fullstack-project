const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { User, LeaveRequest, LeaveBalance, PublicHoliday, AuditLog, Notification } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
const cov = require('../services/coverage');

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

const notify = (userId, message) =>
    Notification.create({ userId, message });

/* ---------------- UC-01: apply for leave (EMPLOYEE only) ---------------- */

router.post("/apply", validateToken, requireRole("EMPLOYEE"), async (req, res) => {
    let validationSchema = yup.object({
        leaveType: yup.string().oneOf(["annual", "sick_mc", "sick_nomc"]).required(),
        startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        endDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        halfDay: yup.boolean().default(false),
        halfDayPeriod: yup.string().oneOf(["AM", "PM"]).nullable(),
        reason: yup.string().trim().min(3).max(200).required()
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

        // Balance check (pending requests also reserve balance)
        const year = new Date(data.startDate).getFullYear();
        const balance = await LeaveBalance.findOne({
            where: { userId: req.user.id, leaveType: data.leaveType, year }
        });
        if (!balance) {
            return res.status(400).json({ message: "No leave balance record for this year." });
        }
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

        // AI-2 coverage check on the server (source of truth)
        const { members, approved } = await teamApprovedLeaves(req.user.team);
        const conflicts = cov.evaluateCoverage(workDays, approved, req.user.id, members.length);
        const flagged = conflicts.length > 0;

        const request = await LeaveRequest.create({
            employeeId: req.user.id,
            leaveType: data.leaveType,
            startDate: data.startDate,
            endDate: data.endDate,
            days,
            halfDay: data.halfDay,
            halfDayPeriod: data.halfDay ? data.halfDayPeriod : null,
            reason: data.reason,
            status: "PENDING_SUPERVISOR",
            flagged
        });
        await audit(request.id, req.user.name,
            flagged ? "Submitted (coverage flag raised)" : "Submitted");

        // Notify the team supervisor(s)
        const supervisors = members.filter(m => m.role === "SUPERVISOR");
        for (const s of supervisors) {
            await notify(s.id, `New leave request ${request.id} from ${req.user.name} awaits your review.`);
        }

        res.json({ request, flagged, conflicts });
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

/* ---------------- AI-2: pre-submission coverage check ---------------- */

router.post("/coverage-check", validateToken, requireRole("EMPLOYEE"), async (req, res) => {
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

router.get("/mine", validateToken, requireRole("EMPLOYEE"), async (req, res) => {
    // Data retention rule: 1 year of active history
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const list = await LeaveRequest.findAll({
        where: { employeeId: req.user.id, createdAt: { [Op.gte]: oneYearAgo } },
        order: [['createdAt', 'DESC']],
        include: [{ model: AuditLog, order: [['createdAt', 'ASC']] }]
    });
    res.json(list);
});

router.get("/balances", validateToken, requireRole("EMPLOYEE"), async (req, res) => {
    const year = new Date().getFullYear();
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

router.put("/:id/cancel", validateToken, requireRole("EMPLOYEE"), async (req, res) => {
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

// Supervisor queue (tier 1) or Manager queue (tier 2) based on role
router.get("/pending", validateToken, requireRole("SUPERVISOR", "MANAGER"), async (req, res) => {
    const status = req.user.role === "SUPERVISOR" ? "PENDING_SUPERVISOR" : "PENDING_MANAGER";
    const members = await User.findAll({ where: { team: req.user.team } });
    const list = await LeaveRequest.findAll({
        where: {
            status,
            employeeId: { [Op.in]: members.map(m => m.id) }
        },
        order: [['createdAt', 'ASC']],
        include: [
            { model: User, as: "employee", attributes: ["id", "name", "initials"] },
            { model: AuditLog }
        ]
    });
    res.json(list);
});

// Two-tier decision. Supervisor approve -> PENDING_MANAGER (never final).
// Manager approve -> APPROVED (+ balance deduction). No auto-approval.
router.put("/:id/decide", validateToken, requireRole("SUPERVISOR", "MANAGER"), async (req, res) => {
    let validationSchema = yup.object({
        approve: yup.boolean().required(),
        acknowledgeException: yup.boolean().default(false)
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const request = await LeaveRequest.findByPk(req.params.id, {
            include: [{ model: User, as: "employee" }]
        });
        if (!request) return res.sendStatus(404);

        if (req.user.role === "SUPERVISOR") {
            if (request.status !== "PENDING_SUPERVISOR") {
                return res.status(400).json({ message: "Request is not at the Supervisor tier." });
            }
            if (data.approve) {
                request.status = "PENDING_MANAGER";
                await audit(request.id, req.user.name, request.flagged
                    ? "Endorsed by Supervisor - escalated for Manager special approval"
                    : "Approved by Supervisor - routed to Manager");
            } else {
                request.status = "REJECTED";
                await audit(request.id, req.user.name, "Rejected by Supervisor");
            }
        } else { // MANAGER
            if (request.status !== "PENDING_MANAGER") {
                return res.status(400).json({ message: "Request is not at the Manager tier." });
            }
            // Flagged requests need an explicit coverage-exception acknowledgement
            if (data.approve && request.flagged && !data.acknowledgeException) {
                return res.status(400).json({
                    message: "This request is flagged: coverage falls below threshold. Set acknowledgeException=true to approve the exception explicitly."
                });
            }
            if (data.approve) {
                request.status = "APPROVED";
                await audit(request.id, req.user.name, request.flagged
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
                await audit(request.id, req.user.name, "Rejected by Manager");
            }
        }
        await request.save();
        await notify(request.employeeId,
            `Your request ${request.id} is now ${request.status.replace("_", " ")}.`);
        res.json({ request });
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

module.exports = router;
