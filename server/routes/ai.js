const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { User, LeaveRequest, LeaveBalance, PublicHoliday, AiInteraction, Delegation } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
const {
    parseLeaveText,
    improveRemarks,
    coverageBrief,
    draftNote,
    draftAnnouncement,
    explainStatus,
    llmProviderStatus
} = require('../services/ai');
const cov = require('../services/coverage');
const calc = require('../services/calculationService');
const { workingDaysFor } = require('../services/weekendConfigService');
const { answerQuestion } = require('../services/queryCatalogue');
const { detectAnomalies } = require('../services/anomalyDetector');
const { checkCertificate } = require('../services/mcCheck');
const { canActOn, isDelegationActive } = require('../services/delegationService');
const { todayISO } = require('../services/businessTime');
const chain = require('../services/approvalChain');

const loadEffectiveDelegationsTo = async (userId) => {
    const rows = await Delegation.findAll({
        where: { toUserId: userId, active: true },
        include: [{ model: User, as: "fromUser", attributes: ["id", "name", "team", "role", "status"] }]
    });
    const today = todayISO();
    return rows.filter((d) => d.fromUser?.status === "ACTIVE" && isDelegationActive(d, today));
};

// Request-level AI authorization. Role checks alone are insufficient because
// these payloads contain employee, leave-pattern and team-coverage details.
const loadAuthorizedAiRequest = async (requestId, actor, { allowOwnerOrHr = false } = {}) => {
    const request = await LeaveRequest.findByPk(requestId, {
        include: [{ model: User, as: "employee" }]
    });
    if (!request) return { request: null, missing: true };

    if (allowOwnerOrHr && (actor.id === request.employeeId || actor.role === "HR_ADMIN")) {
        return { request, allowed: true };
    }
    if (!["SUPERVISOR", "MANAGER", "HR_ADMIN"].includes(actor.role)) {
        return { request, allowed: false };
    }

    const effective = await loadEffectiveDelegationsTo(actor.id);
    return { request, allowed: canActOn(actor, request, effective) };
};

/* -------- AI status (for UI graceful degradation) -------- */
// On-demand status only — clients may call this once when opening the apply form.
router.get("/status", validateToken, async (req, res) => {
    const status = llmProviderStatus();
    res.json({
        llmConfigured: status.configured,
        provider: status.provider,
        model: status.model,
        // Never expose the API key. Heuristic parse always works.
        parseAlwaysAvailable: true,
        message: status.configured
            ? `Hosted LLM ready (${status.provider}).`
            : "No API key set — parse uses the offline heuristic (still works)."
    });
});

/* -------- AI-1 helper: verify parsed dates against the employee's calendar -------- */

// Adds { workingDays, warning } to each parsed segment. Pure server-side maths —
// the AI is never trusted with the calendar (M4's calculationService owns it).
const annotateWorkingDays = async (user, requests) => {
    if (!requests.length) return requests;
    const [holidayRows, workingDays] = await Promise.all([
        PublicHoliday.findAll({ where: { country: user.country } }),
        workingDaysFor(user.country)
    ]);
    const holidays = new Map(holidayRows.map((h) => [h.date, h.name]));
    const holidaySet = new Set(holidays.keys());

    return requests.map((r) => {
        if (!r.startDate || !r.endDate) {
            return { ...r, workingDays: 0, warning: "No dates recognised — pick them manually." };
        }
        const days = calc.workingDaysInRange(r.startDate, r.endDate, workingDays, holidaySet);
        let warning = null;
        if (days.length === 0) {
            warning = holidays.has(r.startDate)
                ? `${r.startDate} is a public holiday (${holidays.get(r.startDate)}) — no leave is needed.`
                : `${r.startDate} is not a working day in ${user.country}.`;
        } else if (days[0] !== r.startDate) {
            warning = `Starts on a non-working day; the first chargeable day is ${days[0]}.`;
        }
        return { ...r, workingDays: r.halfDay && days.length ? 0.5 : days.length, warning };
    });
};

/* -------- AI-1: natural-language leave application parse -------- */
// Body: { text } (also accepts { input } for HLD alias).
// Response (always structured, never leaks API keys):
// { leaveType, startDate, endDate, halfDay, halfDayPeriod, reason, confidence, source }
const handleParseLeave = async (req, res) => {
    if (req.body && !req.body.text && req.body.input) req.body.text = req.body.input;
    let validationSchema = yup.object({
        text: yup.string().trim().min(3).max(500).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const result = await parseLeaveText(data.text, new Date());
        // Strip internal error detail from client payload (keep source + fields)
        const { llmError, ...publicResult } = result;
        if (llmError) {
            // Log only — client already gets source:"heuristic"
            console.log("AI-1 LLM degraded:", llmError);
        }
        // Deterministic safety net: whatever produced the dates (model or regex),
        // check them against the employee's own calendar. Language models are
        // poor at weekday arithmetic, so a parsed date can land on a weekend or
        // public holiday — the employee is told before they submit.
        publicResult.requests = await annotateWorkingDays(req.user, publicResult.requests || []);
        await AiInteraction.create({
            userId: req.user.id,
            feature: "AI-1",
            input: data.text,
            output: JSON.stringify(result)
        });
        res.json(publicResult);
    }
    catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Parse failed." });
    }
};

// Canonical path used by the Employee UI
router.post("/parse", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), handleParseLeave);
// Spec / HLD alias
router.post("/parse-leave", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), handleParseLeave);

/* -------- UC-13 (E): AI check of an uploaded medical certificate -------- */
// POST /ai/check-mc { requestId }
// OPT-IN: the employee presses a button; nothing is sent automatically. Advisory
// only — the verdict never changes the request's status or the approval routing.
router.post("/check-mc", validateToken, requireRole("EMPLOYEE"), async (req, res) => {
    let validationSchema = yup.object({
        requestId: yup.number().integer().required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const request = await LeaveRequest.findByPk(data.requestId);
        if (!request) return res.sendStatus(404);
        if (request.employeeId !== req.user.id) return res.sendStatus(403);
        if (!request.attachmentData) {
            return res.status(400).json({ message: "This request has no attached certificate." });
        }

        const result = await checkCertificate({
            dataUrl: request.attachmentData,
            fileType: request.attachmentType,
            request: { startDate: request.startDate, endDate: request.endDate }
        });

        // Log the verdict, never the image or the extracted free text.
        await AiInteraction.create({
            userId: req.user.id,
            feature: "AI-1-mc",
            input: `requestId=${request.id} dates=${request.startDate}..${request.endDate} type=${request.attachmentType}`,
            output: JSON.stringify({
                verdict: result.verdict,
                mcStart: result.extracted?.startDate || null,
                mcEnd: result.extracted?.endDate || null
            })
        });

        res.json(result);
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        console.log("MC check failed:", err.message);
        res.status(400).json({ message: "Could not check the certificate right now." });
    }
});

/* -------- Improve remarks (on-demand button only) -------- */
router.post("/improve-remarks", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        text: yup.string().trim().min(3).max(500).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const result = await improveRemarks(data.text);
        await AiInteraction.create({
            userId: req.user.id,
            feature: "AI-1-improve",
            input: data.text,
            output: JSON.stringify(result)
        });
        res.json(result);
    }
    catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Improve remarks failed." });
    }
});

/* -------- UC-26 (AI): draft an announcement banner from a short brief -------- */
// POST /ai/draft-announcement { brief, targetType?, targetValue?, tone? }
// HR-only, on-demand. Returns a DRAFT title/body that is loaded into the
// (still fully editable) announcement form — nothing is published here. The
// publish step remains the existing POST /announcement, so the human stays the
// only thing that can broadcast to staff.
router.post("/draft-announcement", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        brief: yup.string().trim().min(3).max(800).required(),
        targetType: yup.string().oneOf(["ALL", "COUNTRY", "ROLE"]).notRequired(),
        targetValue: yup.string().trim().max(20).notRequired(),
        tone: yup.string().oneOf(["NEUTRAL", "URGENT", "FRIENDLY"]).notRequired()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const result = await draftAnnouncement(data);
        await AiInteraction.create({
            userId: req.user.id,
            feature: "AI-6-announcement",
            input: data.brief,
            output: JSON.stringify(result)
        });
        res.json(result);
    }
    catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Could not draft the announcement." });
    }
});

/* -------- M3 supervisor AI: coverage brief (on-demand, advisory only) -------- */
// GET /ai/coverage-brief — natural-language triage of the caller's pending queue.
// Never auto-approves. Uses only the caller's own-team queue at their tier.
router.get("/coverage-brief", validateToken, requireRole("SUPERVISOR", "MANAGER", "BOSS"), async (req, res) => {
    try {
        const status = chain.stageForRole(req.user.role);
        // A Supervisor's and a Manager's queue is their own team. The Boss's is
        // every Manager in the company, so it is scoped by role, not by team -
        // filtering to req.user.team would hide most of their queue.
        const isBoss = req.user.role === "BOSS";
        const members = await User.findAll({
            where: isBoss ? { role: "MANAGER" } : { team: req.user.team }
        });
        const memberIds = members.map(m => m.id).filter((id) => id !== req.user.id);
        const pending = await LeaveRequest.findAll({
            where: {
                status,
                employeeId: { [Op.in]: memberIds.length ? memberIds : [-1] }
            },
            order: [['createdAt', 'ASC']],
            include: [{ model: User, as: "employee", attributes: ["id", "name", "initials"] }]
        });

        const now = Date.now();
        const snapshot = {
            team: isBoss ? "All teams" : req.user.team,
            role: req.user.role,
            tier: status,
            pending: pending.map(r => ({
                id: r.id,
                employeeName: r.employee?.name,
                leaveType: r.leaveType,
                startDate: r.startDate,
                endDate: r.endDate,
                days: Number(r.days),
                halfDay: r.halfDay,
                flagged: r.flagged,
                reason: String(r.reason || "").slice(0, 120),
                waitingHours: Math.max(0, Math.floor((now - new Date(r.stageEnteredAt || r.createdAt).getTime()) / 3600000))
            }))
        };

        const result = await coverageBrief(snapshot);
        const { llmError, ...publicResult } = result;
        if (llmError) console.log("coverage-brief degraded:", llmError);

        await AiInteraction.create({
            userId: req.user.id,
            feature: "AI-coverage-brief",
            input: `queue:${pending.length}@${status}`,
            output: JSON.stringify(publicResult)
        });

        res.json({
            ...publicResult,
            queueSize: pending.length,
            tier: status,
            team: req.user.team,
            advisoryOnly: true
        });
    }
    catch (err) {
        res.status(400).json({ message: err.message || "Coverage brief failed." });
    }
});

/* -------- M3: draft approve/reject note (on-demand, advisory) -------- */
// POST /ai/draft-note  body: { requestId, mode: "approve"|"reject" }
router.post("/draft-note", validateToken, requireRole("SUPERVISOR", "MANAGER", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        requestId: yup.number().integer().required(),
        mode: yup.string().oneOf(["approve", "reject"]).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const access = await loadAuthorizedAiRequest(data.requestId, req.user);
        if (access.missing) return res.sendStatus(404);
        if (!access.allowed) return res.status(403).end();
        const request = access.request;

        const result = await draftNote({
            mode: data.mode,
            actorRole: req.user.role,
            request: {
                leaveType: request.leaveType,
                startDate: request.startDate,
                endDate: request.endDate,
                days: Number(request.days),
                halfDay: request.halfDay,
                reason: request.reason,
                flagged: request.flagged,
                status: request.status,
                employeeName: request.employee?.name
            }
        });
        const { llmError, ...publicResult } = result;
        if (llmError) console.log("draft-note degraded:", llmError);

        await AiInteraction.create({
            userId: req.user.id,
            feature: "AI-draft-note",
            input: `request:${data.requestId}:${data.mode}`,
            output: JSON.stringify(publicResult)
        });

        res.json({ ...publicResult, advisoryOnly: true });
    }
    catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Draft note failed." });
    }
});

/* -------- M3: explain pending status (on-demand, advisory) -------- */
// POST /ai/explain-status  body: { requestId }
router.post("/explain-status", validateToken, async (req, res) => {
    let validationSchema = yup.object({
        requestId: yup.number().integer().required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const access = await loadAuthorizedAiRequest(data.requestId, req.user, { allowOwnerOrHr: true });
        if (access.missing) return res.sendStatus(404);
        if (!access.allowed) return res.status(403).end();
        const request = access.request;

        const waitingHours = Math.max(
            0,
            Math.floor((Date.now() - new Date(request.stageEnteredAt || request.createdAt).getTime()) / 3600000)
        );
        const tierRole = chain.approverRoleFor(request.status);
        const tierLabel = tierRole
            ? `${tierRole.charAt(0)}${tierRole.slice(1).toLowerCase()} tier`
            : request.status;

        const result = await explainStatus({
            request: {
                status: request.status,
                flagged: request.flagged,
                leaveType: request.leaveType,
                startDate: request.startDate,
                endDate: request.endDate
            },
            waitingHours,
            tierLabel
        });
        const { llmError, ...publicResult } = result;
        if (llmError) console.log("explain-status degraded:", llmError);

        await AiInteraction.create({
            userId: req.user.id,
            feature: "AI-explain-status",
            input: `request:${data.requestId}`,
            output: JSON.stringify(publicResult)
        });

        res.json({
            ...publicResult,
            requestId: request.id,
            status: request.status,
            waitingHours,
            advisoryOnly: true
        });
    }
    catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Explain status failed." });
    }
});

/* -------- AI-3: approval summary card for one pending request -------- */

router.get("/summary/:requestId", validateToken, requireRole("SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    const access = await loadAuthorizedAiRequest(req.params.requestId, req.user);
    if (access.missing) return res.sendStatus(404);
    if (!access.allowed) return res.status(403).end();
    const request = access.request;

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

/* -------- AI-4: HR insights chatbot (fixed query catalogue, no free SQL) -------- */
// POST /ai/insights  body: { question }
// Roles: HR_ADMIN (full), SUPERVISOR/MANAGER/HOD (scoped to their team, per UC-11).
router.post("/insights", validateToken, requireRole("HR_ADMIN", "MANAGER", "HOD", "SUPERVISOR", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        question: yup.string().trim().min(2).max(300).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const result = await answerQuestion(data.question, req.user);
        const { llmError, ...publicResult } = result;
        if (llmError) console.log("AI-4 classify degraded:", llmError);

        await AiInteraction.create({
            userId: req.user.id,
            feature: "AI-4",
            input: data.question,
            output: JSON.stringify(publicResult).slice(0, 4000)
        });
        res.json({ ...publicResult, advisoryOnly: true });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Insights failed." });
    }
});

/* -------- AI-5: anomaly & risk flags for the HR dashboard -------- */
// GET /ai/anomalies — HR_ADMIN only. Rule-based, advisory only.
router.get("/anomalies", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    try {
        const result = await detectAnomalies();
        await AiInteraction.create({
            userId: req.user.id,
            feature: "AI-5",
            input: "dashboard",
            output: JSON.stringify({ count: result.count }).slice(0, 4000)
        });
        res.json(result);
    } catch (err) {
        res.status(400).json({ message: err.message || "Anomaly detection failed." });
    }
});

module.exports = router;
