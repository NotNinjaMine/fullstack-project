const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, UserInvitation, LeavePolicy, LeaveBalance, ConfigAuditLog } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
const { createUserWithBalances } = require('../services/provisioning');
const { prorateEntitlement } = require('../services/entitlementService');
const { sendInviteEmail, smtpConfigured } = require('../services/mailer');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

/* ---------------- UC-24: HR sends an invitation ---------------- */

// POST /invitation — create the INVITED user + single-use token (48h)
router.post("/", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        name: yup.string().trim().min(3).max(50).required(),
        email: yup.string().trim().lowercase().email().max(50).required(),
        country: yup.string().length(2).uppercase().default("SG"),
        team: yup.string().max(50).default("Compliance Team A"),
        role: yup.string().oneOf(["EMPLOYEE", "SUPERVISOR", "MANAGER"]).default("EMPLOYEE"),
        startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).nullable()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });

        const existing = await User.findOne({ where: { email: data.email } });
        if (existing) return res.status(400).json({ message: "Email already exists." });

        const policy = await LeavePolicy.findOne({ where: { country: data.country } });
        if (!policy) return res.status(400).json({ message: `No policy configured for ${data.country}.` });

        // Create the account up-front as INVITED (inactive) with a random password.
        const tempPw = crypto.randomBytes(12).toString('hex');
        const { user } = await createUserWithBalances({
            name: data.name, email: data.email, password: tempPw,
            role: data.role, country: data.country, team: data.team
        });
        user.status = "INVITED";
        await user.save();

        const token = crypto.randomBytes(32).toString('hex');
        const invite = await UserInvitation.create({
            email: data.email, name: data.name, country: data.country,
            team: data.team, role: data.role, startDate: data.startDate || null,
            tokenHash: sha256(token),
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
            invitedByName: req.user.name
        });

        // Email the invite link (offline mode logs the link + returns a demo token).
        await sendInviteEmail(data.email, token);
        await ConfigAuditLog.create({
            actorName: req.user.name, action: `Invitation sent to ${data.email} (${data.role}, ${data.country})`,
            entity: "user_invitations", entityId: String(invite.id), before: null,
            after: { email: data.email, role: data.role, country: data.country }
        });

        const demo = !smtpConfigured() ? { demoInviteToken: token } : {};
        res.json({
            message: `Invitation sent to ${data.email}. The link expires in 48 hours.`,
            invitationId: invite.id,
            ...demo
        });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(err.status || 400).json({ message: err.message || "Invitation failed." });
    }
});

// GET /invitation/verify?token= — check a token before showing the onboarding form
router.get("/verify", async (req, res) => {
    const token = String(req.query.token || "");
    if (!/^[0-9a-f]{64}$/.test(token)) return res.status(400).json({ message: "Invalid token." });
    const invite = await UserInvitation.findOne({
        where: { tokenHash: sha256(token), acceptedAt: null, expiresAt: { [Op.gt]: new Date() } }
    });
    if (!invite) return res.status(400).json({ message: "This invitation is invalid or has expired." });
    res.json({
        email: invite.email, name: invite.name, country: invite.country,
        team: invite.team, role: invite.role
    });
});

// POST /invitation/accept — new employee sets a password + confirms preferences
router.post("/accept", async (req, res) => {
    let validationSchema = yup.object({
        token: yup.string().trim().length(64).matches(/^[0-9a-f]+$/).required(),
        password: yup.string().trim().min(8).max(50)
            .matches(/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/, "password at least 1 letter and 1 number").required(),
        locale: yup.string().oneOf(["en", "zh", "th", "vi", "ms", "id", "ja"]).default("en"),
        notifyEmail: yup.boolean().default(true),
        notifyInApp: yup.boolean().default(true)
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const invite = await UserInvitation.findOne({
            where: { tokenHash: sha256(data.token), acceptedAt: null, expiresAt: { [Op.gt]: new Date() } }
        });
        if (!invite) return res.status(400).json({ message: "This invitation is invalid or has expired." });

        const user = await User.findOne({ where: { email: invite.email } });
        if (!user) return res.status(400).json({ message: "The invited account no longer exists." });

        // Activate the account + set password + preferences.
        user.password = await bcrypt.hash(data.password, 10);
        user.status = "ACTIVE";
        user.locale = data.locale;
        user.notifyEmail = data.notifyEmail;
        user.notifyInApp = data.notifyInApp;
        await user.save();

        // UC-24 → UC-20: pro-rate the annual entitlement from the start date on activation.
        if (invite.startDate) {
            const policy = await LeavePolicy.findOne({ where: { country: user.country } });
            const year = new Date(invite.startDate).getFullYear();
            const bal = await LeaveBalance.findOne({
                where: { userId: user.id, leaveType: "annual", year }
            });
            if (bal && policy) {
                const prorated = prorateEntitlement(policy.annualMin, invite.startDate, year);
                bal.entitled = prorated;
                await bal.save();
            }
        }

        invite.acceptedAt = new Date();
        await invite.save();

        await ConfigAuditLog.create({
            actorName: user.name, action: `Invitation accepted: ${user.email} activated`,
            entity: "users", entityId: String(user.id), before: { status: "INVITED" }, after: { status: "ACTIVE" }
        });

        res.json({ message: "Account activated. You can now sign in." });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Activation failed." });
    }
});

// GET /invitation — HR lists invitations (status: pending / accepted / expired)
router.get("/", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const rows = await UserInvitation.findAll({ order: [['createdAt', 'DESC']] });
    const now = new Date();
    res.json(rows.map((r) => ({
        id: r.id, email: r.email, name: r.name, country: r.country, team: r.team, role: r.role,
        status: r.acceptedAt ? "ACCEPTED" : (new Date(r.expiresAt) < now ? "EXPIRED" : "PENDING"),
        invitedByName: r.invitedByName, createdAt: r.createdAt, expiresAt: r.expiresAt
    })));
});

module.exports = router;
