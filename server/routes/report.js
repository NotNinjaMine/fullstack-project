const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { AuditLog, ConfigAuditLog, ReportSchedule, User, LeaveRequest } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
const reportService = require('../services/reportService');

/* ================= UC-22: reporting suite + export ================= */

// GET /report/run/:type — role-scoped report (chart + table)
router.get("/run/:type", validateToken, requireRole("SUPERVISOR", "MANAGER", "HOD", "HR_ADMIN", "BOSS"), async (req, res) => {
    try {
        const report = await reportService.runReport(req.params.type, req.user);
        res.json(report);
    } catch (err) {
        res.status(err.status || 400).json({ message: err.message || "Report failed." });
    }
});

// GET /report/export/:type?format=csv — download the report
router.get("/export/:type", validateToken, requireRole("SUPERVISOR", "MANAGER", "HOD", "HR_ADMIN", "BOSS"), async (req, res) => {
    try {
        const report = await reportService.runReport(req.params.type, req.user);
        const csv = reportService.reportToCsv(report);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${req.params.type}.csv"`);
        res.send(csv);
    } catch (err) {
        res.status(err.status || 400).json({ message: err.message || "Export failed." });
    }
});

/* ================= UC-21: audit-trail viewer (read-only) ================= */

// GET /report/audit?q=&limit= — merged leave + config audit, newest first, filterable
router.get("/audit", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const q = (req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 200, 500);

    const leaveWhere = q ? { [Op.or]: [
        { action: { [Op.like]: `%${q}%` } },
        { actorName: { [Op.like]: `%${q}%` } }
    ] } : {};
    const configWhere = q ? { [Op.or]: [
        { action: { [Op.like]: `%${q}%` } },
        { actorName: { [Op.like]: `%${q}%` } }
    ] } : {};

    const [leaveRows, configRows] = await Promise.all([
        AuditLog.findAll({ where: leaveWhere, order: [['createdAt', 'DESC']], limit }),
        ConfigAuditLog.findAll({ where: configWhere, order: [['createdAt', 'DESC']], limit })
    ]);

    const merged = [
        ...leaveRows.map(r => ({
            id: `L${r.id}`, source: "leave", action: r.action, actorName: r.actorName,
            entity: "leave_requests", entityId: r.requestId ? String(r.requestId) : null,
            createdAt: r.createdAt
        })),
        ...configRows.map(r => ({
            id: `C${r.id}`, source: "config", action: r.action, actorName: r.actorName,
            entity: r.entity, entityId: r.entityId, createdAt: r.createdAt
        }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);

    res.json(merged);
});

// GET /report/audit/export?q= — CSV of the merged audit view
router.get("/audit/export", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const q = (req.query.q || "").trim();
    const where = q ? { [Op.or]: [
        { action: { [Op.like]: `%${q}%` } }, { actorName: { [Op.like]: `%${q}%` } }
    ] } : {};
    const [leaveRows, configRows] = await Promise.all([
        AuditLog.findAll({ where, order: [['createdAt', 'DESC']], limit: 1000 }),
        ConfigAuditLog.findAll({ where, order: [['createdAt', 'DESC']], limit: 1000 })
    ]);
    const rows = [
        ...leaveRows.map(r => ({ time: r.createdAt.toISOString(), source: "leave", actor: r.actorName, action: r.action })),
        ...configRows.map(r => ({ time: r.createdAt.toISOString(), source: "config", actor: r.actorName, action: r.action }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time));
    const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = ["time,source,actor,action", ...rows.map(r => [r.time, r.source, r.actor, r.action].map(esc).join(","))].join("\n") + "\n";
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="audit-trail.csv"`);
    res.send(csv);
});

/* ================= UC-30: scheduled report delivery ================= */

router.get("/schedules", validateToken, requireRole("MANAGER", "HOD", "HR_ADMIN", "BOSS"), async (req, res) => {
    const list = await ReportSchedule.findAll({
        where: { ownerUserId: req.user.id },
        order: [['createdAt', 'DESC']]
    });
    res.json(list);
});

router.post("/schedules", validateToken, requireRole("MANAGER", "HOD", "HR_ADMIN", "BOSS"), async (req, res) => {
    let validationSchema = yup.object({
        reportType: yup.string().oneOf(["leave_utilisation", "carry_forward_summary", "sick_leave_trend", "pending_overview"]).required(),
        frequency: yup.string().oneOf(["weekly", "monthly", "quarterly"]).default("monthly"),
        format: yup.string().oneOf(["CSV", "PDF"]).default("CSV"),
        recipients: yup.array().of(yup.string().trim().email()).min(1).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const row = await ReportSchedule.create({
            ownerUserId: req.user.id, ownerName: req.user.name,
            reportType: data.reportType, frequency: data.frequency,
            format: data.format, recipients: data.recipients, active: true
        });
        res.json(row);
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Invalid request." });
    }
});

router.put("/schedules/:id/toggle", validateToken, requireRole("MANAGER", "HOD", "HR_ADMIN", "BOSS"), async (req, res) => {
    const row = await ReportSchedule.findByPk(req.params.id);
    if (!row) return res.sendStatus(404);
    if (row.ownerUserId !== req.user.id) return res.sendStatus(403);
    row.active = !row.active;
    await row.save();
    res.json({ message: row.active ? "Schedule resumed." : "Schedule paused.", active: row.active });
});

router.delete("/schedules/:id", validateToken, requireRole("MANAGER", "HOD", "HR_ADMIN", "BOSS"), async (req, res) => {
    const row = await ReportSchedule.findByPk(req.params.id);
    if (!row) return res.sendStatus(404);
    if (row.ownerUserId !== req.user.id) return res.sendStatus(403);
    await row.destroy();
    res.json({ message: "Schedule deleted." });
});

// POST /report/schedules/:id/run-now — generate + "deliver" immediately (demo)
router.post("/schedules/:id/run-now", validateToken, requireRole("MANAGER", "HOD", "HR_ADMIN", "BOSS"), async (req, res) => {
    const row = await ReportSchedule.findByPk(req.params.id);
    if (!row) return res.sendStatus(404);
    if (row.ownerUserId !== req.user.id) return res.sendStatus(403);
    try {
        const { deliverSchedule } = require('../services/reportScheduleService');
        const result = await deliverSchedule(row);
        row.lastRunAt = new Date();
        await row.save();
        res.json({ message: `Report delivered to ${row.recipients.length} recipient(s).`, ...result });
    } catch (err) {
        res.status(400).json({ message: err.message || "Delivery failed." });
    }
});

module.exports = router;
