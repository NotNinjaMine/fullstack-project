// M1 slice of the HR admin surface: the user/entitlement table (UC-20/UC-25).
// Full HR admin panel (audit log, coverage, reporting) belongs to Member 5 and
// gets layered in here once their route file lands.
const express = require('express');
const router = express.Router();
const yup = require("yup");
const { User, LeaveBalance } = require('../models');
const { validateToken, requireRole } = require('../middlewares/auth');
const { previewBulkEntitlement, commitBulkEntitlement } = require('../services/entitlementService');

// GET /admin/users — every account + this year's annual/sick balances, for
// the HR user table (status, lockout badge, unlock / force-logout controls).
// Express 4 does not catch rejections from async handlers, so every one of these
// needs its own try/catch — without it a DB error leaves the request hanging
// with no response rather than returning an error the UI can show.
router.get("/users", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    try {
        const year = new Date().getFullYear();
        const users = await User.findAll({
            attributes: ["id", "name", "email", "role", "country", "team", "status", "failedLoginCount", "lockedUntil"],
            order: [['name', 'ASC']]
        });
        const balances = await LeaveBalance.findAll({ where: { year } });
        const byUser = {};
        for (const b of balances) {
            (byUser[b.userId] ||= []).push(b);
        }
        res.json(users.map((u) => {
            const bals = byUser[u.id] || [];
            const annual = bals.find((b) => b.leaveType === "annual");
            const sick = bals.find((b) => b.leaveType === "sick_mc");
            return {
                ...u.toJSON(),
                annual: annual ? { entitled: Number(annual.entitled), remaining: Number(annual.entitled) + Number(annual.carried) - Number(annual.used) } : null,
                sick: sick ? { entitled: Number(sick.entitled), remaining: Number(sick.entitled) - Number(sick.used) } : null
            };
        }));
    } catch (err) {
        console.error(`[admin] /users failed: ${err.message}`);
        res.status(500).json({ message: "Could not load accounts." });
    }
});

/* ---------------- UC-20: bulk yearly entitlement ---------------- */

// GET /admin/entitlement/preview?year= — computed changes, no writes yet
router.get("/entitlement/preview", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    try {
        const year = Number(req.query.year) || new Date().getFullYear();
        const preview = await previewBulkEntitlement(year);
        res.json(preview);
    } catch (err) {
        console.error(`[admin] entitlement preview failed: ${err.message}`);
        res.status(500).json({ message: "Could not compute the entitlement preview." });
    }
});

// POST /admin/entitlement/commit — apply the country-minimum entitlement to every user
router.post("/entitlement/commit", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({ year: yup.number().integer().min(2000).max(2100).default(new Date().getFullYear()) });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const result = await commitBulkEntitlement(data.year, req.user.name);
        res.json({ message: `Bulk entitlement applied for ${result.year}: ${result.updated} account(s) updated.`, ...result });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Bulk entitlement update failed." });
    }
});

module.exports = router;
