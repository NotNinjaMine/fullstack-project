const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, LeavePolicy, UserSession, SecurityEvent } = require('../models');
const yup = require("yup");
const { sign } = require('jsonwebtoken');
const { validateToken, requireRole } = require('../middlewares/auth');
const { createUserWithBalances, initialsOf } = require('../services/provisioning');
const { sendResetEmail, smtpConfigured } = require('../services/mailer');
const session = require('../services/sessionService');
require('dotenv').config();

/* ---------------- shared validation pieces ---------------- */

const nameRule = yup.string().trim().min(3).max(50).required()
    .matches(/^[a-zA-Z '-,.]+$/,
        "name only allow letters, spaces and characters: ' - , .");
const emailRule = yup.string().trim().lowercase().email().max(50).required();
const passwordRule = yup.string().trim().min(8).max(50).required()
    .matches(/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/,
        "password at least 1 letter and 1 number");

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* ---------------- self-registration ---------------- */
// Now also provisions leave balances per the user's COUNTRY policy, so a new
// account immediately sees the correct entitlement + holiday calendar.
router.post("/register", async (req, res) => {
    let data = req.body;
    let validationSchema = yup.object({
        name: nameRule,
        email: emailRule,
        password: passwordRule,
        role: yup.string().oneOf(["EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"]).default("EMPLOYEE"),
        country: yup.string().length(2).uppercase().default("SG"),
        team: yup.string().max(50).default("Compliance Team A")
    });
    try {
        data = await validationSchema.validate(data, { abortEarly: false });

        let user = await User.findOne({ where: { email: data.email } });
        if (user) {
            res.status(400).json({ message: "Email already exists." });
            return;
        }

        const { user: result, policy } = await createUserWithBalances(data);
        res.json({
            message: `Email ${result.email} was registered successfully. ` +
                `Annual entitlement set to ${policy.annualMin} day(s) per ${policy.countryName} policy.`
        });
    }
    catch (err) {
        res.status(err.status || 400).json(err.errors ? { errors: err.errors } : { message: err.message });
    }
});

/* ---------------- login + session ---------------- */

router.post("/login", async (req, res) => {
    let data = req.body;
    let validationSchema = yup.object({
        email: emailRule,
        password: yup.string().trim().min(8).max(50).required()
    });
    try {
        data = await validationSchema.validate(data, { abortEarly: false });

        let errorMsg = "Email or password is not correct.";
        let user = await User.findOne({ where: { email: data.email } });
        if (!user) {
            res.status(400).json({ message: errorMsg });
            return;
        }

        // M1 (UC-25): account lockout after 3 consecutive failures (15 minutes).
        if (session.isLocked(user)) {
            return res.status(423).json({
                message: `Account locked after too many failed attempts. Try again after ${new Date(user.lockedUntil).toLocaleTimeString("en-SG")}, or ask HR to unlock.`
            });
        }
        // M1 (UC-24): invited accounts must complete registration first.
        if (user.status === "INVITED") {
            return res.status(403).json({ message: "This account has not been activated. Please use your invitation link to set a password." });
        }
        if (user.status === "DEACTIVATED") {
            return res.status(403).json({ message: "This account has been deactivated. Contact HR." });
        }

        let match = await bcrypt.compare(data.password, user.password);
        if (!match) {
            const result = await session.recordFailedLogin(user, req.ip);
            if (result.locked) {
                return res.status(423).json({ message: "Too many failed attempts — account locked for 15 minutes." });
            }
            res.status(400).json({ message: errorMsg });
            return;
        }

        // ROLE is inside the signed token, so requireRole can enforce RBAC.
        let userInfo = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            country: user.country,
            team: user.team,
            initials: user.initials
        };
        let accessToken = sign(userInfo, process.env.APP_SECRET,
            { expiresIn: process.env.TOKEN_EXPIRES_IN });

        // M1 (UC-25): clear failures, record a session + LOGIN security event.
        await session.recordSuccessfulLogin(user, accessToken, req);

        res.json({
            accessToken: accessToken,
            user: userInfo
        });
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

router.get("/auth", validateToken, (req, res) => {
    let userInfo = {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        country: req.user.country,
        team: req.user.team,
        initials: req.user.initials
    };
    res.json({
        user: userInfo
    });
});

/* ---------------- forgot / reset password ---------------- */
// Standard flow (HLD §6.2 POST /api/auth/forgot-password):
//  1. POST /user/forgot-password { email } -> single-use token (30 min TTL).
//     Only the SHA-256 hash is stored; the raw token is emailed via SMTP.
//     The response is IDENTICAL whether or not the email exists, so the
//     endpoint cannot be used to probe which addresses have accounts.
//  2. POST /user/reset-password { token, password } -> verifies + rotates.

router.post("/forgot-password", async (req, res) => {
    let validationSchema = yup.object({ email: emailRule });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const genericMsg = "If that email is registered, a reset link has been sent. The link expires in 30 minutes.";

        const user = await User.findOne({ where: { email: data.email } });
        if (!user) {
            return res.json({ message: genericMsg });
        }

        const token = crypto.randomBytes(32).toString('hex');
        user.resetTokenHash = sha256(token);
        user.resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);
        await user.save();

        await sendResetEmail(user.email, token);

        // DEMO ONLY: with no SMTP configured there is no email to click, so we
        // return the token to keep the flow demonstrable end-to-end offline.
        // In production (SMTP configured) the token NEVER leaves the server.
        const demo = !smtpConfigured() ? { demoResetToken: token } : {};
        res.json({ message: genericMsg, ...demo });
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

router.post("/reset-password", async (req, res) => {
    let validationSchema = yup.object({
        token: yup.string().trim().length(64).matches(/^[0-9a-f]+$/).required(),
        password: passwordRule
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });

        const user = await User.findOne({
            where: {
                resetTokenHash: sha256(data.token),
                resetTokenExpires: { [Op.gt]: new Date() }
            }
        });
        if (!user) {
            return res.status(400).json({ message: "This reset link is invalid or has expired. Please request a new one." });
        }

        user.password = await bcrypt.hash(data.password, 10);
        user.resetTokenHash = null;      // single use
        user.resetTokenExpires = null;
        await user.save();

        res.json({ message: "Password updated. You can now sign in with your new password." });
    }
    catch (err) {
        res.status(400).json({ errors: err.errors });
    }
});

/* ---------------- country policies (for forms + info panels) ---------------- */

router.get("/policies", validateToken, async (req, res) => {
    const list = await LeavePolicy.findAll({ order: [['countryName', 'ASC']] });
    res.json(list);
});

/* ---------------- Supervisor/Manager: add a new employee ---------------- */
// UC-05 subset requested by the client: approvers can onboard staff directly.
//  - SUPERVISOR may add EMPLOYEE accounts to their OWN team.
//  - MANAGER / HR_ADMIN may add EMPLOYEE or SUPERVISOR, to any team.
// The new account's balances are created from the chosen COUNTRY's policy
// (annual entitlement clamped to [annualMin, annualMax]; sick from policy).

router.post("/employees", validateToken, requireRole("SUPERVISOR", "MANAGER", "HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        name: nameRule,
        email: emailRule,
        tempPassword: passwordRule,
        country: yup.string().length(2).uppercase().required(),
        role: yup.string().oneOf(["EMPLOYEE", "SUPERVISOR"]).default("EMPLOYEE"),
        team: yup.string().max(50).default(""),
        annualEntitlement: yup.number().min(0).max(60).nullable()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });

        // Role escalation guard: supervisors can only create EMPLOYEEs,
        // and only inside their own team.
        if (req.user.role === "SUPERVISOR") {
            if (data.role !== "EMPLOYEE") {
                return res.status(403).json({ message: "Supervisors can only add EMPLOYEE accounts. Ask a Manager to add supervisors." });
            }
            data.team = req.user.team;
        }
        if (!data.team) data.team = req.user.team;

        const existing = await User.findOne({ where: { email: data.email } });
        if (existing) {
            return res.status(400).json({ message: "Email already exists." });
        }

        const { user, policy } = await createUserWithBalances({
            name: data.name,
            email: data.email,
            password: data.tempPassword,
            role: data.role,
            country: data.country,
            team: data.team,
            annualEntitlement: data.annualEntitlement
        });

        res.json({
            message: `${user.name} added to ${user.team} (${policy.countryName}).`,
            user: {
                id: user.id, name: user.name, email: user.email, role: user.role,
                country: user.country, team: user.team, initials: user.initials
            },
            policyApplied: {
                country: policy.country,
                countryName: policy.countryName,
                annualMin: policy.annualMin,
                annualMax: policy.annualMax,
                sickMc: policy.sickMc,
                sickNoMc: policy.sickNoMc
            }
        });
    }
    catch (err) {
        res.status(err.status || 400).json(err.errors ? { errors: err.errors } : { message: err.message });
    }
});

/* ---------------- UC-23: self-service profile & preferences ---------------- */

// GET /user/profile — the caller's own profile + preferences
router.get("/profile", validateToken, async (req, res) => {
    const user = await User.findByPk(req.user.id, {
        attributes: ["id", "name", "email", "phone", "role", "country", "team",
            "initials", "locale", "notifyEmail", "notifyInApp"]
    });
    if (!user) return res.sendStatus(404);
    res.json(user);
});

// PUT /user/profile — edit own contact details + preferences (country/role/team are read-only)
router.put("/profile", validateToken, async (req, res) => {
    let validationSchema = yup.object({
        name: nameRule.optional(),
        phone: yup.string().trim().max(30).nullable(),
        locale: yup.string().oneOf(["en", "zh", "th", "vi", "ms", "id", "ja"]).optional(),
        notifyEmail: yup.boolean().optional(),
        notifyInApp: yup.boolean().optional()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const user = await User.findByPk(req.user.id);
        if (!user) return res.sendStatus(404);
        if (data.name !== undefined) {
            user.name = data.name;
            user.initials = initialsOf(data.name);
        }
        if (data.phone !== undefined) user.phone = data.phone;
        if (data.locale !== undefined) user.locale = data.locale;
        if (data.notifyEmail !== undefined) user.notifyEmail = data.notifyEmail;
        if (data.notifyInApp !== undefined) user.notifyInApp = data.notifyInApp;
        await user.save();
        res.json({
            message: "Profile updated.",
            user: {
                id: user.id, name: user.name, email: user.email, phone: user.phone,
                role: user.role, country: user.country, team: user.team, initials: user.initials,
                locale: user.locale, notifyEmail: user.notifyEmail, notifyInApp: user.notifyInApp
            }
        });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Invalid request." });
    }
});

// PUT /user/password — change own password (records a PASSWORD_CHANGE security event)
router.put("/password", validateToken, async (req, res) => {
    let validationSchema = yup.object({
        currentPassword: yup.string().trim().min(8).max(50).required(),
        newPassword: passwordRule
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const user = await User.findByPk(req.user.id);
        if (!user) return res.sendStatus(404);
        const ok = await bcrypt.compare(data.currentPassword, user.password);
        if (!ok) return res.status(400).json({ message: "Current password is incorrect." });
        user.password = await bcrypt.hash(data.newPassword, 10);
        await user.save();
        await session.logEvent(user.id, "PASSWORD_CHANGE", req.ip, true);
        res.json({ message: "Password changed successfully." });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Invalid request." });
    }
});

/* ---------------- UC-25: session management & security log ---------------- */

// GET /user/sessions — the caller's active (non-revoked) sessions
router.get("/sessions", validateToken, async (req, res) => {
    const list = await UserSession.findAll({
        where: { userId: req.user.id, revokedAt: null },
        order: [['lastActive', 'DESC']],
        attributes: ["id", "deviceInfo", "ipAddress", "lastActive", "createdAt"]
    });
    res.json(list);
});

// PUT /user/sessions/:id/revoke — revoke one of the caller's own sessions
router.put("/sessions/:id/revoke", validateToken, async (req, res) => {
    const s = await UserSession.findByPk(req.params.id);
    if (!s) return res.sendStatus(404);
    if (s.userId !== req.user.id) return res.sendStatus(403);
    s.revokedAt = new Date();
    await s.save();
    await session.logEvent(req.user.id, "SESSION_REVOKED", req.ip, true);
    res.json({ message: "Session revoked." });
});

// GET /user/security-log — the caller's security events (past year)
router.get("/security-log", validateToken, async (req, res) => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const list = await SecurityEvent.findAll({
        where: { userId: req.user.id, createdAt: { [Op.gte]: oneYearAgo } },
        order: [['createdAt', 'DESC']],
        limit: 200
    });
    res.json(list);
});

/* ---------------- UC-25: HR force-logout & unlock (any user) ---------------- */
// MANAGER is included here (not just HR_ADMIN) so that if the HR_ADMIN account
// itself gets locked out, a Manager can still clear it — otherwise a locked HR
// account would have no path back in at all.

// GET /user/locked — accounts currently locked out (for the Manager/HR unlock UI)
router.get("/locked", validateToken, requireRole("MANAGER", "HR_ADMIN"), async (req, res) => {
    const list = await User.findAll({
        where: { lockedUntil: { [Op.gt]: new Date() } },
        attributes: ["id", "name", "email", "role", "team", "lockedUntil"]
    });
    res.json(list);
});

// PUT /user/:id/unlock — clears a lockout
router.put("/:id/unlock", validateToken, requireRole("MANAGER", "HR_ADMIN"), async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.sendStatus(404);
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    await user.save();
    await session.logEvent(user.id, "UNLOCKED", req.ip, true);
    res.json({ message: `${user.name} unlocked.` });
});

// PUT /user/:id/force-logout — revokes all of a user's sessions
router.put("/:id/force-logout", validateToken, requireRole("MANAGER", "HR_ADMIN"), async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.sendStatus(404);
    const [revoked] = await UserSession.update(
        { revokedAt: new Date() },
        { where: { userId: user.id, revokedAt: null } }
    );
    await session.logEvent(user.id, "SESSION_REVOKED", req.ip, true);
    res.json({ message: `${revoked} session(s) revoked for ${user.name}.`, revoked });
});

module.exports = router;
