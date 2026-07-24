const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Announcement, AnnouncementAck, User, ConfigAuditLog } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');

const todayISO = () => new Date().toISOString().slice(0, 10);

// Does an announcement target this user?
const targetsUser = (a, user) => {
    if (a.targetType === "ALL") return true;
    if (a.targetType === "COUNTRY") return a.targetValue === user.country;
    if (a.targetType === "ROLE") return a.targetValue === user.role;
    return false;
};

/* ---------------- UC-26: active announcements for the current user ---------------- */

// GET /announcement/active — banners/modals to show the caller (within display window,
// targeted, and not yet acknowledged when requiresAck)
router.get("/active", validateToken, async (req, res) => {
    const today = todayISO();
    const all = await Announcement.findAll({
        where: {
            active: true,
            startDate: { [Op.lte]: today },
            endDate: { [Op.gte]: today }
        },
        order: [['createdAt', 'DESC']]
    });
    const targeted = all.filter((a) => targetsUser(a, req.user));

    // Which requiresAck ones has the user already acked?
    const ackedRows = await AnnouncementAck.findAll({
        where: { userId: req.user.id, announcementId: { [Op.in]: targeted.map((a) => a.id).length ? targeted.map((a) => a.id) : [-1] } }
    });
    const ackedSet = new Set(ackedRows.map((r) => r.announcementId));

    const result = targeted
        .filter((a) => !(a.requiresAck && ackedSet.has(a.id)))
        .map((a) => ({
            id: a.id, title: a.title, body: a.body,
            requiresAck: a.requiresAck, createdByName: a.createdByName,
            startDate: a.startDate, endDate: a.endDate
        }));
    res.json(result);
});

// POST /announcement/:id/ack — acknowledge a mandatory announcement
router.post("/:id/ack", validateToken, async (req, res) => {
    const a = await Announcement.findByPk(req.params.id);
    if (!a) return res.sendStatus(404);
    await AnnouncementAck.findOrCreate({
        where: { announcementId: a.id, userId: req.user.id },
        defaults: { announcementId: a.id, userId: req.user.id }
    });
    res.json({ message: "Acknowledged." });
});

/* ---------------- UC-26: HR compose / manage ---------------- */

// GET /announcement — HR lists all announcements with a read/ack count
router.get("/", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const list = await Announcement.findAll({ order: [['createdAt', 'DESC']] });
    const counts = await AnnouncementAck.findAll({
        attributes: ["announcementId", [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'ackCount']],
        group: ["announcementId"]
    });
    const countMap = Object.fromEntries(counts.map((c) => [c.announcementId, Number(c.get('ackCount'))]));
    res.json(list.map((a) => ({ ...a.toJSON(), ackCount: countMap[a.id] || 0 })));
});

// POST /announcement — HR creates a broadcast
router.post("/", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        title: yup.string().trim().min(3).max(120).required(),
        body: yup.string().trim().min(3).max(1000).required(),
        targetType: yup.string().oneOf(["ALL", "COUNTRY", "ROLE"]).default("ALL"),
        targetValue: yup.string().trim().max(20).nullable(),
        startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        endDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required(),
        requiresAck: yup.boolean().default(false)
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        if (data.endDate < data.startDate) {
            return res.status(400).json({ message: "endDate must be on or after startDate." });
        }
        if (data.targetType !== "ALL" && !data.targetValue) {
            return res.status(400).json({ message: "targetValue is required for COUNTRY/ROLE targeting." });
        }
        const a = await Announcement.create({
            title: data.title, body: data.body,
            targetType: data.targetType,
            targetValue: data.targetType === "ALL" ? null : data.targetValue,
            startDate: data.startDate, endDate: data.endDate,
            requiresAck: data.requiresAck, createdByName: req.user.name, active: true
        });
        await ConfigAuditLog.create({
            actorName: req.user.name, action: `Announcement created: "${a.title}"`,
            entity: "announcements", entityId: String(a.id), before: null, after: a.toJSON()
        });
        res.json(a);
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Invalid request." });
    }
});

// PUT /announcement/:id/deactivate — HR ends a broadcast early
router.put("/:id/deactivate", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const a = await Announcement.findByPk(req.params.id);
    if (!a) return res.sendStatus(404);
    a.active = false;
    await a.save();
    res.json({ message: "Announcement deactivated." });
});

module.exports = router;
