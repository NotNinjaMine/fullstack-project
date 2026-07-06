const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { User, LeaveRequest, LeaveBalance, PublicHoliday, AiInteraction } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
const { parseLeaveText } = require('../services/ai');
const cov = require('../services/coverage');

/* -------- AI-1: natural-language leave application parse -------- */

router.post("/parse", validateToken, requireRole("EMPLOYEE"), async (req, res) => {
    let validationSchema = yup.object({
        text: yup.string().trim().min(3).max(500).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const result = await parseLeaveText(data.text, new Date());
        // Log every AI interaction (ai_interactions table)
        await AiInteraction.create({
            userId: req.user.id,
            feature: "AI-1",
            input: data.text,
            output: JSON.stringify(result)
        });
        res.json(result);
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

/* -------- AI-3: approval summary card for one pending request -------- */

router.get("/summary/:requestId", validateToken, requireRole("SUPERVISOR", "MANAGER"), async (req, res) => {
    const request = await LeaveRequest.findByPk(req.params.requestId, {
        include: [{ model: User, as: "employee" }]
    });
    if (!request) return res.sendStatus(404);

    const employee = request.employee;

    // 12-month history pattern (computed from real data, not mocks)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const history = await LeaveRequest.findAll({
        where: {
            employeeId: employee.id,
            id: { [Op.ne]: request.id },
            createdAt: { [Op.gte]: oneYearAgo }
        }
    });
    const takenYTD = history
        .filter(r => r.status === "APPROVED")
        .reduce((s, r) => s + Number(r.days), 0);
    const rejectedYTD = history.filter(r => r.status === "REJECTED").length;
    const adjWeekend = history.filter(r => {
        const s = new Date(r.startDate).getDay();
        const e = new Date(r.endDate).getDay();
        return s === 1 || e === 5; // starts Monday or ends Friday
    }).length;
    const noticeDays = Math.max(0, Math.round(
        (new Date(request.startDate) - new Date(request.createdAt)) / (1000 * 60 * 60 * 24)));

    // Team coverage per requested working day
    const holidays = await PublicHoliday.findAll({ where: { country: employee.country } });
    const holidaySet = new Set(holidays.map(h => h.date));
    const workDays = cov.workingDaysInRange(request.startDate, request.endDate, holidaySet);
    const members = await User.findAll({ where: { team: employee.team } });
    const approved = await LeaveRequest.findAll({
        where: { employeeId: { [Op.in]: members.map(m => m.id) }, status: "APPROVED" }
    });
    const approvedMapped = approved.map(r => ({
        userId: r.employeeId, startDate: r.startDate, endDate: r.endDate
    }));
    const nameOf = (id) => members.find(m => m.id === id)?.name || `User ${id}`;
    const coveragePerDay = workDays.map(iso => {
        const off = cov.offOn(iso, approvedMapped, employee.id);
        return { date: iso, present: members.length - off.length - 1, offNames: off.map(nameOf) };
    });
    const conflicts = coveragePerDay.filter(c => c.present < cov.MIN_PRESENT);

    // Pattern bullets
    const patterns = [
        `${takenYTD} day(s) taken YTD - ${history.length} request(s) in 12 months - ${rejectedYTD} rejected.`
    ];
    if (adjWeekend >= 3) patterns.push(
        `Pattern: ${adjWeekend} recent requests adjacent to a weekend - worth a friendly check-in, not a blocker.`);
    if (noticeDays <= 2 && request.leaveType === "annual") patterns.push(
        `Short notice: submitted only ${noticeDays} day(s) before the leave starts.`);
    if (request.leaveType === "sick_mc") patterns.push(
        "Sick leave with MC - verify the medical certificate is attached before final approval.");
    if (request.leaveType === "sick_nomc") patterns.push(
        "Sick leave without MC - capped at 2 day(s)/year under company policy.");

    // Recommendation (advisory only - decision stays with the approver)
    let rec;
    if (conflicts.length > 0) {
        rec = {
            action: "ESCALATE",
            label: "Escalate - Manager special approval required",
            rationale: `Coverage falls below ${cov.MIN_PRESENT}-of-${members.length} on ${conflicts.length} day(s) (${conflicts.map(c => c.date).join(", ")}). Per policy the Manager must explicitly approve the coverage exception.`
        };
    } else if (adjWeekend >= 3 || (noticeDays <= 2 && request.leaveType === "annual")) {
        rec = {
            action: "APPROVE_NOTE",
            label: "Approve, with a note",
            rationale: "No coverage impact and balance is sufficient. Flagged pattern above is informational - recommend approving and mentioning it in your next 1:1."
        };
    } else {
        rec = {
            action: "APPROVE",
            label: "Approve",
            rationale: `No teammate overlap on any requested day, ${noticeDays} day(s) of notice, and history shows no unusual pattern. Safe to approve.`
        };
    }

    const summary = {
        employee: { id: employee.id, name: employee.name, initials: employee.initials },
        teamSize: members.length,
        minPresent: cov.MIN_PRESENT,
        patterns,
        coveragePerDay,
        conflicts,
        noticeDays,
        recommendation: rec
    };

    await AiInteraction.create({
        userId: req.user.id,
        feature: "AI-3",
        input: `request:${request.id}`,
        output: JSON.stringify(summary)
    });

    res.json(summary);
});

module.exports = router;
