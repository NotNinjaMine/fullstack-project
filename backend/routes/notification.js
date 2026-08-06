const express = require('express');
const router = express.Router();
const { Notification } = require('../models');
const { validateToken, requireRole } = require('../middlewares/auth');
const { runPendingReminders } = require('../services/notificationService');

/* ---------------- UC-12: list / count / mark-read ---------------- */

// GET /notification  — optional ?unread=true
router.get("/", validateToken, async (req, res) => {
    const where = { userId: req.user.id };
    if (req.query.unread === "true") {
        where.readAt = null;
    }
    const list = await Notification.findAll({
        where,
        order: [['createdAt', 'DESC']]
    });
    res.json(list);
});

// GET /notification/unread-count
router.get("/unread-count", validateToken, async (req, res) => {
    const count = await Notification.count({
        where: { userId: req.user.id, readAt: null }
    });
    res.json({ count });
});

// PUT /notification/read-all  (must be before /:id/read)
router.put("/read-all", validateToken, async (req, res) => {
    const [updated] = await Notification.update(
        { readAt: new Date() },
        { where: { userId: req.user.id, readAt: null } }
    );
    res.json({ message: "All notifications marked read.", updated });
});

// PUT /notification/:id/read
router.put("/:id/read", validateToken, async (req, res) => {
    const n = await Notification.findByPk(req.params.id);
    if (!n) return res.sendStatus(404);
    if (n.userId !== req.user.id) return res.sendStatus(403);
    n.readAt = new Date();
    await n.save();
    res.json({ message: "Marked read." });
});

// POST /notification/run-reminders — demo/manual trigger (MANAGER, HR_ADMIN)
router.post("/run-reminders", validateToken, requireRole("MANAGER", "HR_ADMIN"), async (req, res) => {
    const remindersSent = await runPendingReminders();
    res.json({ remindersSent });
});

module.exports = router;
