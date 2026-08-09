const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const {
    sequelize, User, LeavePolicy, UserSession, SecurityEvent, TwoFactorChallenge,
    LeaveRequest, LeaveBalance, AuditLog, Comment, Delegation, Notification,
    AiInteraction, AnnouncementAck, LeaveSwapRequest, ReportSchedule, UserInvitation,
    ConfigAuditLog
} = require('../models');
const yup = require("yup");
const { sign } = require('jsonwebtoken');
const { validateToken, requireRole } = require('../middlewares/auth');
const { createUserWithBalances, initialsOf } = require('../services/provisioning');
const { sendResetEmail, smtpConfigured } = require('../services/mailer');
const session = require('../services/sessionService');
const twoFactor = require('../services/twoFactorService');
const totp = require('../services/totpService');
require('dotenv').config();

// Single definition of the user object exposed to the client and embedded in the
// JWT, so the plain-login path and the 2FA path can never drift apart.
const publicUser = (user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    country: user.country,
    team: user.team,
    initials: user.initials,
    // Included so the client can render in the user's language from the very
    // first paint. Without it, anything translated that shows BEFORE
    // /user/profile resolves (e.g. the My account modal title and tab labels)
    // would flash English and then switch.
    locale: user.locale
});

const signFor = (userInfo) =>
    sign(userInfo, process.env.APP_SECRET, { expiresIn: process.env.TOKEN_EXPIRES_IN });

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
        const userInfo = publicUser(user);

        // M1 (2FA): EVERY sign-in goes through a second step. The password alone
        // never yields an access token — we open a challenge and ask HOW they want
        // to receive the code (email or text). The code is generated only after
        // that choice, in POST /user/2fa/send.
        //
        // This is deliberately unconditional rather than an opt-in setting: with
        // no per-user enrolment screen there would be nothing able to switch it
        // on, so an "optional" mode would silently mean nobody is ever challenged.
        {
            const pending = await twoFactor.createPendingChallenge(user, req);
            await session.logEvent(user.id, "TWO_FACTOR_CHALLENGED", req.ip, true);
            // The password WAS correct, so clear the failed-password counter.
            user.failedLoginCount = 0;
            user.lockedUntil = null;
            await user.save();
            return res.json({
                twoFactorRequired: true,
                stage: "CHOOSE_METHOD",
                challengeToken: pending.challengeToken,
                methods: pending.methods,
                expiresInSeconds: pending.expiresInSeconds,
                message: "Choose how you'd like to receive your verification code."
            });
        }
        // Unreachable: the block above always returns. A token is only ever
        // issued by POST /user/2fa/verify.
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
        initials: req.user.initials,
        locale: req.user.locale
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

        // Never throws — a mail failure must not break the request (the token is
        // already saved). The result tells us whether it actually went out.
        const mail = await sendResetEmail(user.email, token);

        // DEMO ONLY: with no SMTP configured there is no email to click, so we
        // return the token to keep the flow demonstrable end-to-end offline.
        // When SMTP IS configured the token NEVER leaves the server — not even
        // if sending failed, otherwise forcing a failure would harvest tokens.
        const demo = !smtpConfigured() ? { demoResetToken: token } : {};
        if (smtpConfigured() && !mail.sent) {
            console.error(`[user] reset email to ${user.email} could not be sent — see [mailer] log above.`);
        }
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
            "initials", "locale", "notifyEmail", "notifyInApp", "totpEnabled"]
    });
    if (!user) return res.sendStatus(404);
    res.json(user);
});

// PUT /user/profile — edit own contact details + preferences (country/role/team are read-only)
router.put("/profile", validateToken, async (req, res) => {
    let validationSchema = yup.object({
        name: nameRule.optional(),
        // Same normalisation as registration: accept spaces/dashes, store E.164.
        phone: yup.string().trim()
            .transform((v) => (typeof v === "string" ? v.replace(/[\s()-]/g, "") : v))
            .max(30).nullable(),
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

/* ---------------- UC-25: force-logout & unlock (any user) ---------------- */

// MANAGER is allowed here (not just HR_ADMIN) as a safety net: if the HR_ADMIN
// account itself gets locked out, a Manager can still clear it — otherwise a
// locked HR account would have no way back in.

// GET /user/locked — accounts currently locked out (for the unlock UI)
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
    const wasAdminLock = user.lockReason === "ADMIN";
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    user.lockReason = null;
    await user.save();
    await session.logEvent(user.id, "UNLOCKED", req.ip, true);
    res.json({
        message: `${user.name} unlocked and can sign in again.` +
            (wasAdminLock ? " They will need to sign in from scratch." : "")
    });
});

// PUT /user/:id/force-logout — revoke every session AND lock the account.
// Revoking alone would only end the current sessions; the person could sign
// straight back in. Locking as well means an admin signing someone out actually
// keeps them out until an admin lets them back in. It uses the same lockedUntil
// mechanism as the 3-failed-password lockout, so it appears in the same locked
// list with the same Unlock button — the difference is lockReason=ADMIN, which
// does not auto-expire.
router.put("/:id/force-logout", validateToken, requireRole("MANAGER", "HR_ADMIN"), async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.sendStatus(404);
    if (user.id === req.user.id) {
        return res.status(400).json({ message: "Use Log out to end your own session." });
    }
    const [revoked] = await UserSession.update(
        { revokedAt: new Date() },
        { where: { userId: user.id, revokedAt: null } }
    );
    // Far-future expiry = "until an admin unlocks", using the existing field.
    user.lockedUntil = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
    user.lockReason = "ADMIN";
    await user.save();
    await session.logEvent(user.id, "SESSION_REVOKED", req.ip, true);
    await session.logEvent(user.id, "LOCKED", req.ip, true);
    res.json({
        message: `${revoked} session(s) ended and ${user.name}'s account is locked until you unlock it.`,
        revoked
    });
});

/* ---------------- Account removal (deactivate / reactivate) ---------------- */

// PUT /user/:id/deactivate — remove an employee's access.
// This is a soft delete on purpose: a hard delete would cascade and destroy that
// person's leave history, approvals and audit trail, which HR needs to keep.
// A deactivated account cannot sign in and is rejected on every request.
router.put("/:id/deactivate", validateToken, requireRole("MANAGER", "HR_ADMIN"), async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.sendStatus(404);
    if (user.id === req.user.id) {
        return res.status(400).json({ message: "You cannot deactivate your own account." });
    }
    // Never allow the last active HR admin to be removed — that would leave the
    // system with nobody able to administer it.
    if (user.role === "HR_ADMIN") {
        const remaining = await User.count({
            where: { role: "HR_ADMIN", status: "ACTIVE", id: { [Op.ne]: user.id } }
        });
        if (remaining === 0) {
            return res.status(400).json({ message: "This is the only active HR admin. Add another before removing this one." });
        }
    }
    user.status = "DEACTIVATED";
    await user.save();
    const [revoked] = await UserSession.update(
        { revokedAt: new Date() },
        { where: { userId: user.id, revokedAt: null } }
    );
    await session.logEvent(user.id, "SESSION_REVOKED", req.ip, true);
    res.json({
        message: `${user.name} has been removed. Their leave history is kept for records, and ${revoked} active session(s) were ended.`,
        revoked
    });
});

// DELETE /user/:id — PERMANENTLY erase an account and everything attached to it.
//
// This is irreversible and destroys leave history, so it is deliberately harder
// to reach than "Remove": the account must ALREADY be deactivated, which forces
// a two-step decision (Remove, then Delete permanently). Use it for records
// created in error or test data — for real departures, "Remove" is correct
// because it keeps the audit trail.
//
// Dependants are cleared explicitly rather than relying on cascade, because only
// some associations declare onDelete: "cascade" — the rest would either block the
// delete on a foreign key or leave orphaned rows behind.
router.delete("/:id", validateToken, requireRole("MANAGER", "HR_ADMIN"), async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.sendStatus(404);
    if (user.id === req.user.id) {
        return res.status(400).json({ message: "You cannot delete your own account." });
    }
    if (user.status !== "DEACTIVATED") {
        return res.status(400).json({ message: "Remove the account first, then it can be permanently deleted." });
    }

    const name = user.name;
    const email = user.email;
    try {
        await sequelize.transaction(async (t) => {
            const own = { where: { userId: user.id }, transaction: t };

            // Leave requests + everything hanging off them (audit rows, comments,
            // swaps) must go before the requests themselves.
            const requests = await LeaveRequest.findAll({ where: { employeeId: user.id }, transaction: t });
            const requestIds = requests.map((r) => r.id);
            if (requestIds.length) {
                await AuditLog.destroy({ where: { requestId: { [Op.in]: requestIds } }, transaction: t });
                await Comment.destroy({ where: { requestId: { [Op.in]: requestIds } }, transaction: t });
                await LeaveSwapRequest.destroy({
                    where: { [Op.or]: [
                        { proposerRequestId: { [Op.in]: requestIds } },
                        { counterpartRequestId: { [Op.in]: requestIds } }
                    ] }, transaction: t
                });
            }
            await LeaveSwapRequest.destroy({
                where: { [Op.or]: [{ proposerUserId: user.id }, { counterpartUserId: user.id }] }, transaction: t
            });
            await Comment.destroy({ where: { authorId: user.id }, transaction: t });
            await LeaveRequest.destroy({ where: { employeeId: user.id }, transaction: t });

            // Delegations in either direction.
            await Delegation.destroy({
                where: { [Op.or]: [{ fromUserId: user.id }, { toUserId: user.id }] }, transaction: t
            });

            await ReportSchedule.destroy({ where: { ownerUserId: user.id }, transaction: t });
            await AnnouncementAck.destroy(own);
            await AiInteraction.destroy(own);
            await Notification.destroy(own);
            await LeaveBalance.destroy(own);
            await SecurityEvent.destroy(own);
            await UserSession.destroy(own);
            await TwoFactorChallenge.destroy(own);

            // Any outstanding invitation for this address is no longer meaningful.
            await UserInvitation.destroy({ where: { email: user.email }, transaction: t });

            await user.destroy({ transaction: t });
        });
    } catch (err) {
        console.error("[user] permanent delete failed:", err.message);
        return res.status(400).json({ message: `Could not delete ${name}: ${err.message}` });
    }

    // Recorded on the non-request-scoped log, which survives the deletion.
    await ConfigAuditLog.create({
        actorName: req.user.name,
        action: `Account permanently deleted: ${name} (${email})`,
        entity: "users", entityId: String(req.params.id),
        before: { name, email }, after: null
    });

    res.json({ message: `${name} and all of their records have been permanently deleted.` });
});

// PUT /user/:id/reactivate — restore a removed account.
router.put("/:id/reactivate", validateToken, requireRole("MANAGER", "HR_ADMIN"), async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.sendStatus(404);
    if (user.status !== "DEACTIVATED") {
        return res.status(400).json({ message: `${user.name} is not deactivated.` });
    }
    user.status = "ACTIVE";
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    user.lockReason = null;
    await user.save();
    res.json({ message: `${user.name} has been restored and can sign in again.` });
});

/* ================= M1 (2FA): second login step ================= */

// POST /user/2fa/send { challengeToken, method }
// Called after the user picks EMAIL or SMS on the choice screen. Generates the
// 6-digit code and delivers it. Can be called again to switch method or resend.
router.post("/2fa/send", async (req, res) => {
    let validationSchema = yup.object({
        challengeToken: yup.string().trim().length(64).matches(/^[0-9a-f]+$/).required(),
        method: yup.string().oneOf(["EMAIL", "SMS", "AUTHENTICATOR"]).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const result = await twoFactor.sendCodeForChallenge(data.challengeToken, data.method);
        if (!result.ok) return res.status(result.status || 400).json({ message: result.message });
        res.json({
            stage: "ENTER_CODE",
            method: result.method,
            destination: result.destination,
            delivered: result.delivered,
            deliveryError: result.deliveryError,
            expiresInSeconds: result.expiresInSeconds,
            ...(result.demoCode ? { demoCode: result.demoCode } : {}),
            // AUTHENTICATOR sets its own message (there's nothing "delivered", so
            // the generic wording below doesn't fit it); EMAIL/SMS don't set one,
            // so fall back to the generic delivered/not-delivered wording.
            message: result.message || (result.delivered
                ? `We sent a 6-digit code ${result.method === "SMS" ? "by text to" : "to"} ${result.destination}.`
                : `Enter the 6-digit code to continue.`)
        });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Could not send code." });
    }
});

// POST /user/2fa/verify { challengeToken, code }
// Completes the login started by POST /user/login. This is the ONLY place a real
// access token is issued for a 2FA-enabled account.
router.post("/2fa/verify", async (req, res) => {
    let validationSchema = yup.object({
        challengeToken: yup.string().trim().length(64).matches(/^[0-9a-f]+$/).required(),
        code: yup.string().trim().matches(/^\d{6}$/, "code must be 6 digits").required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const result = await twoFactor.verifyChallenge(data.challengeToken, data.code);
        if (!result.ok) {
            // Best-effort audit of the failed step (challenge may already be gone).
            const ch = await twoFactor.findLiveChallenge(data.challengeToken);
            if (ch) await session.logEvent(ch.userId, "TWO_FACTOR_FAILED", req.ip, false);
            return res.status(result.status || 400).json({ message: result.message });
        }

        const user = result.user;
        // Re-check account state: it may have changed while the code was in flight.
        if (user.status === "DEACTIVATED") {
            return res.status(403).json({ message: "This account has been deactivated. Contact HR." });
        }

        const userInfo = publicUser(user);
        const accessToken = signFor(userInfo);
        await session.recordSuccessfulLogin(user, accessToken, req);
        await session.logEvent(user.id, "TWO_FACTOR_SUCCESS", req.ip, true);

        res.json({ accessToken, user: userInfo });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Verification failed." });
    }
});

/* ---------------- 2FA: authenticator-app (TOTP) enrolment ----------------
 * The "Microsoft Authenticator" option. Enrolment is a one-time, self-service
 * flow done under My account:
 *   1. POST /user/2fa/totp/setup  -> server mints a secret, returns a QR code.
 *   2. user scans it with Microsoft/Google Authenticator, which starts showing
 *      a rotating 6-digit code.
 *   3. POST /user/2fa/totp/enable { code } -> proves the app is set up correctly
 *      before we switch the method on. Only now is the secret trusted.
 *   4. POST /user/2fa/totp/disable { password } -> turns it back off.
 * The secret is stored encrypted (see services/totpService) and is never
 * returned again after setup.
 */

// STEP 1: mint a fresh secret + QR. Stored as PENDING until confirmed, so an
// abandoned setup never leaves a half-enrolled account that can't sign in.
router.post("/2fa/totp/setup", validateToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return res.sendStatus(404);

        const secret = totp.generateSecret();
        user.totpPendingSecret = totp.encrypt(secret);
        await user.save();

        const otpauthUrl = totp.keyUri(user.email, secret);
        const qrDataUrl = await totp.qrDataUrl(otpauthUrl);
        res.json({
            // manualKey is the secret to type in by hand if the QR won't scan.
            manualKey: secret,
            otpauthUrl,
            qrDataUrl,
            issuer: totp.ISSUER,
            message: "Scan the QR code with your authenticator app, then enter the 6-digit code it shows to finish."
        });
    } catch (err) {
        res.status(400).json({ message: err.message || "Could not start authenticator setup." });
    }
});

// STEP 3: confirm the pending secret by verifying one code, then switch on.
router.post("/2fa/totp/enable", validateToken, async (req, res) => {
    const validationSchema = yup.object({
        code: yup.string().trim().matches(/^\d{6}$/, "code must be 6 digits").required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const user = await User.findByPk(req.user.id);
        if (!user) return res.sendStatus(404);
        if (!user.totpPendingSecret) {
            return res.status(400).json({ message: "Start setup first — no pending authenticator secret." });
        }
        const secret = totp.decrypt(user.totpPendingSecret);
        if (!totp.verify(data.code, secret)) {
            return res.status(400).json({ message: "That code isn't right. Make sure your phone's time is automatic, then try the current code." });
        }
        // Promote pending -> active.
        user.totpSecret = user.totpPendingSecret;
        user.totpPendingSecret = null;
        user.totpEnabled = true;
        await user.save();
        await session.logEvent(user.id, "TWO_FACTOR_ENABLED", req.ip, true);
        res.json({ message: "Authenticator app enabled. You can now use it to verify sign-ins.", totpEnabled: true });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Could not enable authenticator." });
    }
});

// STEP 4: turn it off. Requires the current password so a walk-up attacker on an
// open session can't quietly strip a security factor.
router.post("/2fa/totp/disable", validateToken, async (req, res) => {
    const validationSchema = yup.object({
        password: yup.string().trim().min(8).max(50).required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const user = await User.findByPk(req.user.id);
        if (!user) return res.sendStatus(404);
        const ok = await bcrypt.compare(data.password, user.password);
        if (!ok) return res.status(400).json({ message: "Password is incorrect." });

        user.totpEnabled = false;
        user.totpSecret = null;
        user.totpPendingSecret = null;
        await user.save();
        await session.logEvent(user.id, "TWO_FACTOR_DISABLED", req.ip, true);
        res.json({ message: "Authenticator app turned off. You'll verify sign-ins by email or text.", totpEnabled: false });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Could not disable authenticator." });
    }
});


module.exports = router;
