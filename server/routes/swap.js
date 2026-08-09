const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize, User, LeaveRequest, LeaveSwapRequest, AuditLog, PublicHoliday } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
const { notify } = require('../services/notificationService');
const rules = require('../services/leaveRules');
const calc = require('../services/calculationService');
const { workingDaysFor } = require('../services/weekendConfigService');

const SWAP_TTL_MS = 48 * 60 * 60 * 1000;

// Day count a user would spend on a date range under THEIR country's calendar.
// Teammates can sit in different countries (the demo team spans SG/VN/TH), so a
// swap that looks equal-length can still cost the two employees different days —
// which would silently move their balances. UC-27 says balances never change.
const daysForUser = async (user, startDate, endDate, halfDay) => {
    const [holidayRows, workingDays] = await Promise.all([
        PublicHoliday.findAll({ where: { country: user.country } }),
        workingDaysFor(user.country)
    ]);
    const holidaySet = new Set(holidayRows.map((h) => h.date));
    return calc.computeDays(startDate, endDate, !!halfDay, workingDays, holidaySet);
};
const audit = (requestId, actorName, action, opts = {}) =>
    AuditLog.create({ requestId, actorName, action }, opts);

// Auto-expire any stale PENDING_ACCEPT proposals on read (cheap, no cron needed).
const expireStale = async () => {
    await LeaveSwapRequest.update(
        { status: "EXPIRED" },
        { where: { status: "PENDING_ACCEPT", expiresAt: { [Op.lt]: new Date() } } }
    );
};

/* ---------------- UC-27: propose a swap ---------------- */

// GET /swap/eligible — teammates' approved leave available to swap with.
// Returns request id + name + dates only (no leave type — mirrors team-calendar privacy).
router.get("/eligible", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    const members = await User.findAll({ where: { team: req.user.team }, attributes: ["id", "name"] });
    const nameOf = (id) => members.find((m) => m.id === id)?.name || `User ${id}`;
    const memberIds = members.map((m) => m.id).filter((id) => id !== req.user.id);
    const rows = await LeaveRequest.findAll({
        where: {
            employeeId: { [Op.in]: memberIds.length ? memberIds : [-1] },
            status: "APPROVED",
            cancellationRequested: false,
            // Only future leave can be swapped.
            startDate: { [Op.gt]: rules.sgtTodayISO() }
        },
        attributes: ["id", "employeeId", "startDate", "endDate", "halfDay", "days"],
        order: [["startDate", "ASC"]]
    });
    // `days` is included so the UI can offer only equal-length entries — a swap
    // must not change either balance (UC-27).
    res.json(rows.map((r) => ({
        id: r.id, name: nameOf(r.employeeId),
        startDate: r.startDate, endDate: r.endDate, halfDay: r.halfDay,
        days: Number(r.days)
    })));
});

// POST /swap  { myRequestId, counterpartRequestId }
router.post("/", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        myRequestId: yup.number().integer().required(),
        counterpartRequestId: yup.number().integer().required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });

        const mine = await LeaveRequest.findByPk(data.myRequestId, { include: [{ model: User, as: "employee" }] });
        const theirs = await LeaveRequest.findByPk(data.counterpartRequestId, { include: [{ model: User, as: "employee" }] });
        if (!mine || !theirs) return res.sendStatus(404);

        if (mine.employeeId !== req.user.id) {
            return res.status(403).json({ message: "You can only propose swaps for your own leave." });
        }
        if (mine.status !== "APPROVED" || theirs.status !== "APPROVED") {
            return res.status(400).json({ message: "Both leave entries must be approved to swap." });
        }
        // Same team (same Supervisor) required
        if (mine.employee.team !== theirs.employee.team) {
            return res.status(400).json({ message: "Swaps are only allowed within the same team." });
        }
        if (mine.employeeId === theirs.employeeId) {
            return res.status(400).json({ message: "Choose a teammate's leave to swap with." });
        }
        if (mine.cancellationRequested || theirs.cancellationRequested) {
            return res.status(400).json({ message: "One of these entries is awaiting a cancellation decision." });
        }

        // Same cost for both sides, future-dated, and no balance drift across
        // different country calendars (UC-27: dates swap, days do not).
        const compat = rules.swapCompatible({
            mine, theirs,
            todayISO: rules.sgtTodayISO(),
            proposerDaysOnTheirDates: await daysForUser(mine.employee, theirs.startDate, theirs.endDate, theirs.halfDay),
            counterpartDaysOnMyDates: await daysForUser(theirs.employee, mine.startDate, mine.endDate, mine.halfDay)
        });
        if (!compat.ok) return res.status(400).json({ message: compat.message });

        // Don't stack proposals on the same pair of entries.
        const existing = await LeaveSwapRequest.findOne({
            where: {
                proposerRequestId: mine.id,
                counterpartRequestId: theirs.id,
                status: { [Op.in]: ["PENDING_ACCEPT", "ACCEPTED", "PENDING_APPROVAL"] }
            }
        });
        if (existing) {
            return res.status(400).json({ message: "A swap for these two entries is already in progress." });
        }

        const swap = await LeaveSwapRequest.create({
            proposerRequestId: mine.id,
            counterpartRequestId: theirs.id,
            proposerUserId: mine.employeeId,
            counterpartUserId: theirs.employeeId,
            proposerStart: mine.startDate, proposerEnd: mine.endDate,
            counterpartStart: theirs.startDate, counterpartEnd: theirs.endDate,
            status: "PENDING_ACCEPT",
            expiresAt: new Date(Date.now() + SWAP_TTL_MS)
        });

        await notify(theirs.employeeId,
            `${req.user.name} proposed a leave-date swap with you (expires in 48h).`,
            { type: "SWAP", requestId: theirs.id });

        res.json(swap);
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Swap proposal failed." });
    }
});

/* ---------------- UC-27: my swaps (proposed + incoming) ---------------- */

router.get("/mine", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    await expireStale();
    const includeUsers = [
        { model: User, as: "proposer", attributes: ["id", "name"] },
        { model: User, as: "counterpart", attributes: ["id", "name"] }
    ];
    const proposed = await LeaveSwapRequest.findAll({
        where: { proposerUserId: req.user.id }, include: includeUsers, order: [['createdAt', 'DESC']]
    });
    const incoming = await LeaveSwapRequest.findAll({
        where: { counterpartUserId: req.user.id }, include: includeUsers, order: [['createdAt', 'DESC']]
    });
    res.json({ proposed, incoming });
});

/* ---------------- UC-27: counterpart accepts / declines ---------------- */

router.put("/:id/accept", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    const swap = await LeaveSwapRequest.findByPk(req.params.id);
    if (!swap) return res.sendStatus(404);
    if (swap.counterpartUserId !== req.user.id) return res.sendStatus(403);
    if (swap.status !== "PENDING_ACCEPT") {
        return res.status(400).json({ message: "This proposal is no longer open." });
    }
    if (new Date(swap.expiresAt) < new Date()) {
        swap.status = "EXPIRED"; await swap.save();
        return res.status(400).json({ message: "This proposal has expired." });
    }
    swap.status = "PENDING_APPROVAL";
    await swap.save();

    // Route to the team supervisor for approval
    const proposer = await User.findByPk(swap.proposerUserId);
    const supervisors = await User.findAll({ where: { team: proposer.team, role: "SUPERVISOR" } });
    for (const s of supervisors) {
        await notify(s.id, `A leave swap between ${proposer.name} and ${req.user.name} awaits your approval.`, { type: "SWAP" });
    }
    await notify(swap.proposerUserId, `${req.user.name} accepted your swap — it now awaits approval.`, { type: "SWAP" });
    res.json({ message: "Swap accepted. Routed for two-tier approval.", swap });
});

router.put("/:id/decline", validateToken, requireRole("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN", "BOSS"), async (req, res) => {
    const swap = await LeaveSwapRequest.findByPk(req.params.id);
    if (!swap) return res.sendStatus(404);
    if (swap.counterpartUserId !== req.user.id) return res.sendStatus(403);
    if (swap.status !== "PENDING_ACCEPT") {
        return res.status(400).json({ message: "This proposal is no longer open." });
    }
    swap.status = "DECLINED";
    await swap.save();
    await notify(swap.proposerUserId, `Your swap proposal was declined. Original leave is unchanged.`, { type: "SWAP" });
    res.json({ message: "Swap declined.", swap });
});

/* ---------------- UC-27: approver queue + decision ---------------- */

// GET /swap/pending — swaps awaiting approval for the caller's team
router.get("/pending", validateToken, requireRole("SUPERVISOR", "MANAGER", "BOSS"), async (req, res) => {
    await expireStale();
    const members = await User.findAll({ where: { team: req.user.team }, attributes: ["id"] });
    const memberIds = members.map((m) => m.id);
    const list = await LeaveSwapRequest.findAll({
        where: {
            status: "PENDING_APPROVAL",
            proposerUserId: { [Op.in]: memberIds.length ? memberIds : [-1] }
        },
        include: [
            { model: User, as: "proposer", attributes: ["id", "name", "team"] },
            { model: User, as: "counterpart", attributes: ["id", "name", "team"] }
        ],
        order: [['createdAt', 'ASC']]
    });
    // Leave swaps keep the ordinary two-tier team flow: Supervisor endorses,
    // Manager finalises. The Boss uses the Manager's page, so they act at the
    // Manager tier here too - a swap is a team scheduling matter, not something
    // the Boss/Manager leave chain applies to.
    const finalTier = ["MANAGER", "BOSS"].includes(req.user.role);
    const filtered = finalTier
        ? list.filter((s) => s.supervisorStatus === "APPROVED")
        : list.filter((s) => s.supervisorStatus === "PENDING");
    res.json(filtered);
});

// PUT /swap/:id/decide { approve }
router.put("/:id/decide", validateToken, requireRole("SUPERVISOR", "MANAGER", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({ approve: yup.boolean().required() });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const swap = await LeaveSwapRequest.findByPk(req.params.id, {
            include: [{ model: User, as: "proposer", attributes: ["id", "name", "team"] }]
        });
        if (!swap) return res.sendStatus(404);
        if (swap.status !== "PENDING_APPROVAL") {
            return res.status(400).json({ message: "This swap is not awaiting approval." });
        }
        // Team check
        if (swap.proposer.team !== req.user.team) return res.sendStatus(403);

        if (req.user.role === "SUPERVISOR") {
            if (swap.supervisorStatus !== "PENDING") {
                return res.status(400).json({ message: "Supervisor has already decided this swap." });
            }
            if (!data.approve) {
                swap.status = "REJECTED"; swap.supervisorStatus = "REJECTED";
                await swap.save();
                await notify(swap.proposerUserId, "Your swap was rejected by the Supervisor.", { type: "SWAP" });
                await notify(swap.counterpartUserId, "The swap was rejected by the Supervisor.", { type: "SWAP" });
                return res.json({ message: "Swap rejected.", swap });
            }
            swap.supervisorStatus = "APPROVED";
            await swap.save();
            const managers = await User.findAll({ where: { team: swap.proposer.team, role: "MANAGER" } });
            for (const m of managers) await notify(m.id, "A leave swap awaits your final approval.", { type: "SWAP" });
            return res.json({ message: "Swap endorsed — routed to Manager.", swap });
        }

        // MANAGER (or the Boss, who shares that page) — final decision.
        // On approve, swap BOTH requests' dates atomically.
        if (swap.supervisorStatus !== "APPROVED") {
            return res.status(400).json({ message: "Supervisor must endorse the swap first." });
        }
        if (!data.approve) {
            swap.status = "REJECTED";
            await swap.save();
            await notify(swap.proposerUserId, "Your swap was rejected by the Manager. Original leave unchanged.", { type: "SWAP" });
            await notify(swap.counterpartUserId, "The swap was rejected by the Manager. Original leave unchanged.", { type: "SWAP" });
            return res.json({ message: "Swap rejected.", swap });
        }

        // Atomic paired update — either both change or neither.
        await sequelize.transaction(async (t) => {
            const a = await LeaveRequest.findByPk(swap.proposerRequestId, { transaction: t });
            const b = await LeaveRequest.findByPk(swap.counterpartRequestId, { transaction: t });
            if (!a || !b) throw new Error("A leave entry no longer exists.");
            // Re-verify at decision time: either entry may have been cancelled or
            // withdrawn while the swap sat in the queue.
            if (a.status !== "APPROVED" || b.status !== "APPROVED") {
                throw new Error("One of the leave entries is no longer approved — the swap cannot be applied.");
            }
            if (a.cancellationRequested || b.cancellationRequested) {
                throw new Error("One of the leave entries is awaiting a cancellation decision.");
            }
            if (Number(a.days) !== Number(b.days)) {
                throw new Error("The two entries no longer cost the same number of days — the swap would change a balance.");
            }
            // Swap the date ranges (day counts/balances unchanged)
            const aStart = a.startDate, aEnd = a.endDate;
            a.startDate = b.startDate; a.endDate = b.endDate;
            b.startDate = aStart; b.endDate = aEnd;
            await a.save({ transaction: t });
            await b.save({ transaction: t });
            swap.status = "APPROVED";
            await swap.save({ transaction: t });
            await audit(a.id, req.user.name, "Leave dates swapped (approved swap)", { transaction: t });
            await audit(b.id, req.user.name, "Leave dates swapped (approved swap)", { transaction: t });
        });

        await notify(swap.proposerUserId, "Your leave swap is approved — dates swapped, balance unchanged.", { type: "SWAP" });
        await notify(swap.counterpartUserId, "The leave swap is approved — dates swapped, balance unchanged.", { type: "SWAP" });
        res.json({ message: "Swap approved — dates updated atomically.", swap });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Swap decision failed." });
    }
});

module.exports = router;
