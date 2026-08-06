const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { User, LeaveBalance, ConfigAuditLog, UserInvitation } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
const { createUserWithBalances } = require('../services/provisioning');
const { runCarryForward, previewCarryForward } = require('../services/carryForwardService');
const entitlement = require('../services/entitlementService');
const { currentLeaveYear } = require('../services/leaveYearService');

const configAudit = (actorName, action, entity, entityId, before, after) =>
    ConfigAuditLog.create({ actorName, action, entity, entityId, before, after });

const remaining = (b) => Number(b.entitled) + Number(b.carried) - Number(b.used);

/* ================= UC-10a: employee records (Member 1) =================
   Add/view staff and CSV import. Reassigned from Member 5 to Member 1, since
   these endpoints read/write the same User records as onboarding (UC-24) and
   account recovery (UC-25) — see routes/invitation.js and PUT /:id/unlock in
   routes/user.js. Policy and leave-type configuration below remain UC-10b
   (Member 5). ========================================================= */

// Remove placeholder accounts for invitations that were never accepted and have
// now expired. Creating an invitation also creates an INVITED account so the
// invitee appears in the directory as "Invited (pending)" — but once the 48-hour
// window closes that invite can never be used, so leaving the row there shows a
// pending invite that will never complete. Deleting is safe because the account
// was never activated: no leave history, approvals or audit trail to preserve.
//
// Done lazily on read, mirroring expireStale() in routes/swap.js, so there is no
// scheduler to keep alive.
const purgeExpiredInvitePlaceholders = async () => {
    const expired = await UserInvitation.findAll({
        where: {
            acceptedAt: null,
            cancelledAt: null,
            expiresAt: { [Op.lt]: new Date() }
        }
    });
    let removed = 0;
    for (const invite of expired) {
        const placeholder = await User.findOne({ where: { email: invite.email } });
        if (placeholder && placeholder.status === "INVITED") {
            await LeaveBalance.destroy({ where: { userId: placeholder.id } });
            await placeholder.destroy();
            removed++;
        }
    }
    if (removed) console.log(`[admin] removed ${removed} expired invitation placeholder account(s)`);
    return removed;
};

// GET /admin/employees — full staff list with current-year balances.
// Managers are included alongside HR because they already hold the account-admin
// powers this list drives (PUT /user/:id/unlock and /force-logout both allow
// MANAGER), and their recovery panel renders the SAME table from this one source
// so the two views can never show different data.
router.get("/employees", validateToken, requireRole("HR_ADMIN", "MANAGER"), async (req, res) => {
    await purgeExpiredInvitePlaceholders();
    const year = await currentLeaveYear();
    const users = await User.findAll({
        attributes: ["id", "name", "email", "role", "country", "team", "initials", "status", "lockedUntil", "lockReason", "failedLoginCount"],
        order: [['name', 'ASC']]
    });
    const balances = await LeaveBalance.findAll({ where: { year } });
    const byUser = {};
    for (const b of balances) {
        (byUser[b.userId] = byUser[b.userId] || []).push({
            leaveType: b.leaveType, entitled: Number(b.entitled),
            carried: Number(b.carried), used: Number(b.used), remaining: remaining(b)
        });
    }
    res.json(users.map(u => ({ ...u.toJSON(), balances: byUser[u.id] || [] })));
});

// POST /admin/employees — HR creates any role/country (provisioned from policy)
router.post("/employees", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        name: yup.string().trim().min(3).max(50).required(),
        email: yup.string().trim().lowercase().email().max(50).required(),
        tempPassword: yup.string().trim().min(8).max(50).required()
            .matches(/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/, "password at least 1 letter and 1 number"),
        role: yup.string().oneOf(["EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"]).default("EMPLOYEE"),
        country: yup.string().length(2).uppercase().required(),
        team: yup.string().max(50).default("Compliance Team A"),
        annualEntitlement: yup.number().min(0).max(60).nullable()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const existing = await User.findOne({ where: { email: data.email } });
        if (existing) return res.status(400).json({ message: "Email already exists." });

        const { user, policy } = await createUserWithBalances({
            name: data.name, email: data.email, password: data.tempPassword,
            role: data.role, country: data.country, team: data.team,
            annualEntitlement: data.annualEntitlement
        });
        await configAudit(req.user.name, `Employee created: ${user.email} (${user.role}, ${user.country})`,
            "users", String(user.id), null, { email: user.email, role: user.role, country: user.country });
        res.json({
            message: `${user.name} added to ${user.team} (${policy.countryName}).`,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, country: user.country, team: user.team, initials: user.initials }
        });
    } catch (err) {
        res.status(err.status || 400).json(err.errors ? { errors: err.errors } : { message: err.message });
    }
});

// POST /admin/employees/import — CSV staff import (name,email,role,country,team[,annual])
router.post("/employees/import", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        csv: yup.string().trim().min(1).required(),
        defaultPassword: yup.string().trim().min(8).max(50)
            .matches(/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/, "password at least 1 letter and 1 number")
            .default("Welcome123")
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const lines = data.csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        // Optional header row
        let startIdx = 0;
        if (/name/i.test(lines[0]) && /email/i.test(lines[0])) startIdx = 1;

        const results = [];
        for (let i = startIdx; i < lines.length; i++) {
            const [name, email, role, country, team, annual] = lines[i].split(",").map(s => (s || "").trim());
            if (!name || !email) { results.push({ line: i + 1, ok: false, message: "name and email required" }); continue; }
            try {
                const exists = await User.findOne({ where: { email: email.toLowerCase() } });
                if (exists) { results.push({ email, ok: false, message: "already exists" }); continue; }
                const { user } = await createUserWithBalances({
                    name, email: email.toLowerCase(), password: data.defaultPassword,
                    role: (role || "EMPLOYEE").toUpperCase(),
                    country: (country || "SG").toUpperCase(),
                    team: team || "Compliance Team A",
                    annualEntitlement: annual ? Number(annual) : null
                });
                results.push({ email: user.email, ok: true });
            } catch (e) {
                results.push({ email, ok: false, message: e.message });
            }
        }
        const created = results.filter(r => r.ok).length;
        await configAudit(req.user.name, `CSV import: ${created} employee(s) created`, "users", null, null, { created });
        res.json({ created, results });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Import failed." });
    }
});

/* ================= NOT IN THIS BUILD =================
 * Country policy management, leave-type configuration and the HR dashboard
 * summary (UC-10 config half, Member 5) lived here in the full system. They
 * are removed from this Member 1 deliverable; nothing in this build calls
 * them. Policies are still READ via GET /user/policies (needed to provision a
 * new employee's entitlement from their country).
 */


/* ================= UC-04: year-end carry-forward ================= */

// GET /admin/carry-forward/preview?fromYear= — what the run WOULD do (no writes).
router.get("/carry-forward/preview", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    try {
        const fromYear = Number(req.query.fromYear) || await currentLeaveYear();
        const preview = await previewCarryForward(fromYear);
        res.json(preview);
    } catch (err) {
        res.status(400).json({ message: err.message || "Could not build preview." });
    }
});

// POST /admin/carry-forward/trigger — manual run for the live demo
router.post("/carry-forward/trigger", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    try {
        const activeYear = await currentLeaveYear();
        let validationSchema = yup.object({
            fromYear: yup.number().integer().min(2000).max(2100).default(activeYear)
        });
        const data = await validationSchema.validate(req.body || {}, { abortEarly: false });
        const result = await runCarryForward(data.fromYear, req.user.name);
        // Summary notification to the triggering HR admin
        res.json({
            message: `Carry-forward ${result.fromYear}→${result.toYear} complete for ${result.summary.length} employee(s).`,
            ...result
        });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Carry-forward failed." });
    }
});

/* ================= UC-20: bulk entitlement + pro-ration ================= */

// GET /admin/entitlement/preview?year=
router.get("/entitlement/preview", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const year = Number(req.query.year) || await currentLeaveYear();
    const preview = await entitlement.previewBulkEntitlement(year);
    res.json(preview);
});

// POST /admin/entitlement/commit { year }
router.post("/entitlement/commit", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    try {
        const activeYear = await currentLeaveYear();
        let validationSchema = yup.object({
            year: yup.number().integer().min(2000).max(2100).default(activeYear)
        });
        const data = await validationSchema.validate(req.body || {}, { abortEarly: false });
        const result = await entitlement.commitBulkEntitlement(data.year, req.user.name);
        res.json({ message: `Entitlements updated for ${result.updated} employee(s) in ${result.year}.`, ...result });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Commit failed." });
    }
});

// POST /admin/entitlement/prorate { fullEntitlement, startDate } — preview a pro-ration
router.post("/entitlement/prorate", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        fullEntitlement: yup.number().min(0).max(60).required(),
        startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const prorated = entitlement.prorateEntitlement(data.fullEntitlement, data.startDate);
        res.json({ fullEntitlement: data.fullEntitlement, startDate: data.startDate, prorated });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Invalid request." });
    }
});

module.exports = router;
