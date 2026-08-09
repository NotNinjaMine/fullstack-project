const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, UserInvitation, LeavePolicy, LeaveBalance, ConfigAuditLog } = require('../models');
const yup = require("yup");
const { validateToken, requireRole } = require('../middlewares/auth');
const { TEAMS, DEFAULT_TEAM } = require('../config/teams');
const { createUserWithBalances, initialsOf } = require('../services/provisioning');
const { prorateEntitlement } = require('../services/entitlementService');
const { sendInviteEmail, smtpConfigured } = require('../services/mailer');
const totp = require('../services/totpService');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

/* ---------------- UC-24: HR sends an invitation ---------------- */

// POST /invitation — create the INVITED user + single-use token (48h)
router.post("/", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    let validationSchema = yup.object({
        name: yup.string().trim().min(3).max(50).required(),
        email: yup.string().trim().lowercase().email().max(50).required(),
        country: yup.string().length(2).uppercase().default("SG"),
        // Closed list — the invite form renders these from GET /coverage/options,
        // so an invited hire always lands in a real team and a real country
        // (which is what gives them the right public-holiday calendar).
        team: yup.string().oneOf(TEAMS, `Team must be one of: ${TEAMS.join(", ")}`).default(DEFAULT_TEAM),
        role: yup.string().oneOf(["EMPLOYEE", "SUPERVISOR", "MANAGER"]).default("EMPLOYEE"),
        startDate: yup.string().matches(/^\d{4}-\d{2}-\d{2}$/).nullable()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });

        // Re-invitable cases. A plain "email already exists" block would strand HR:
        // an invitation that expired (or was cancelled) leaves behind a placeholder
        // INVITED account, so a second attempt at the same address would be refused
        // forever. Clear that placeholder and let the invitation be re-issued.
        // A real, activated account is still refused - use the staff list instead.
        const existing = await User.findOne({ where: { email: data.email } });
        if (existing) {
            if (existing.status !== "INVITED") {
                return res.status(400).json({
                    message: `${data.email} already has an active account. Remove them from the staff list first if you need to re-invite.`
                });
            }
            // Still INVITED: only clear it if the outstanding invitation can no
            // longer be used (expired or cancelled). A live pending invite should
            // be resent from the Invitations list rather than silently duplicated.
            const live = await UserInvitation.findOne({
                where: {
                    email: data.email,
                    acceptedAt: null,
                    cancelledAt: null,
                    expiresAt: { [Op.gt]: new Date() }
                }
            });
            if (live) {
                return res.status(400).json({
                    message: `${data.email} already has an invitation pending until ${new Date(live.expiresAt).toLocaleString("en-SG")}. Use Resend on that invitation instead.`
                });
            }
            await LeaveBalance.destroy({ where: { userId: existing.id } });
            await existing.destroy();
        }

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

        // Email the invite link. Never throws — if it fails we still return the
        // link to HR (who is an authenticated admin) so the invitation is never
        // lost and can be passed to the new hire manually.
        const mail = await sendInviteEmail(data.email, token);

        await ConfigAuditLog.create({
            actorName: req.user.name, action: `Invitation sent to ${data.email} (${data.role}, ${data.country})`,
            entity: "user_invitations", entityId: String(invite.id), before: null,
            after: { email: data.email, role: data.role, country: data.country }
        });

        const emailed = mail.sent;
        res.json({
            message: emailed
                ? `Invitation emailed to ${data.email}. The link expires in 48 hours.`
                : `Invitation created for ${data.email}. Email is not configured or failed, so share the link below — it expires in 48 hours.`,
            invitationId: invite.id,
            emailed,
            // Only present when the email did not actually go out.
            ...(emailed ? {} : { demoInviteToken: token, inviteLink: mail.link }),
            ...(mail.error ? { emailError: mail.error } : {})
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

/* ---------------- UC-24: optional authenticator-app setup during onboarding ----------------
 * Lets a new hire enrol the "Authenticator app" 2FA option right on the
 * account-creation page, instead of having to sign in first and find it under
 * My account afterwards. Authorised by the SAME invite token as the rest of
 * this page (no JWT exists yet - the account isn't active until /accept
 * runs), so both routes re-check it's still live (not accepted, not
 * cancelled, not expired) exactly like /verify above.
 */

// POST /invitation/totp/setup { token } - mint a secret + QR for this invitee.
router.post("/totp/setup", async (req, res) => {
    const token = String(req.body.token || "");
    if (!/^[0-9a-f]{64}$/.test(token)) return res.status(400).json({ message: "Invalid token." });
    try {
        const invite = await UserInvitation.findOne({
            where: { tokenHash: sha256(token), acceptedAt: null, cancelledAt: null, expiresAt: { [Op.gt]: new Date() } }
        });
        if (!invite) return res.status(400).json({ message: "This invitation is invalid or has expired." });
        const user = await User.findOne({ where: { email: invite.email } });
        if (!user) return res.status(400).json({ message: "The invited account no longer exists." });

        const secret = totp.generateSecret();
        user.totpPendingSecret = totp.encrypt(secret);
        await user.save();

        const otpauthUrl = totp.keyUri(user.email, secret);
        const qrDataUrl = await totp.qrDataUrl(otpauthUrl);
        res.json({
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

// POST /invitation/totp/enable { token, code } - confirm the pending secret
// with the current 6-digit code (so we're sure the right app was scanned),
// then switch it on. Signing in later uses this same full 6-digit code - see
// services/twoFactorService.verifyChallenge.
router.post("/totp/enable", async (req, res) => {
    let validationSchema = yup.object({
        token: yup.string().trim().length(64).matches(/^[0-9a-f]+$/).required(),
        code: yup.string().trim().matches(/^\d{6}$/, "code must be 6 digits").required()
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const invite = await UserInvitation.findOne({
            where: { tokenHash: sha256(data.token), acceptedAt: null, cancelledAt: null, expiresAt: { [Op.gt]: new Date() } }
        });
        if (!invite) return res.status(400).json({ message: "This invitation is invalid or has expired." });
        const user = await User.findOne({ where: { email: invite.email } });
        if (!user) return res.status(400).json({ message: "The invited account no longer exists." });
        if (!user.totpPendingSecret) {
            return res.status(400).json({ message: "Start setup first - no pending authenticator secret." });
        }

        const secret = totp.decrypt(user.totpPendingSecret);
        if (!totp.verify(data.code, secret)) {
            return res.status(400).json({ message: "That code isn't right. Make sure your phone's time is automatic, then try the current code." });
        }
        user.totpSecret = user.totpPendingSecret;
        user.totpPendingSecret = null;
        user.totpEnabled = true;
        await user.save();
        res.json({ message: "Authenticator app enabled. You'll be able to use it to sign in.", totpEnabled: true });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Could not enable authenticator." });
    }
});

// POST /invitation/accept — new employee sets a password + confirms their details
router.post("/accept", async (req, res) => {
    let validationSchema = yup.object({
        token: yup.string().trim().length(64).matches(/^[0-9a-f]+$/).required(),
        password: yup.string().trim().min(8).max(50)
            .matches(/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/, "password at least 1 letter and 1 number").required(),
        // The registration page pre-fills the name HR entered and lets the new
        // hire correct it (e.g. a preferred spelling) before the account exists.
        name: yup.string().trim().min(3).max(50)
            .matches(/^[a-zA-Z '-,.]+$/, "name only allow letters, spaces and characters: ' - , .")
            .notRequired(),
        // Optional, but required for the "text me a code" 2FA option to be usable:
        // without a number on the account there is nowhere to send an SMS.
        // E.164 so it works with a real SMS provider (e.g. +6591234567).
        // Normalised before validating so "+65 8765 1234" and "+65-8765-1234"
        // are accepted - people write numbers with spaces and dashes, and being
        // strict about it only produces a confusing error. Stored E.164.
        phone: yup.string().trim()
            .transform((v) => (typeof v === "string" ? v.replace(/[\s()-]/g, "") : v))
            .matches(/^\+[1-9]\d{6,14}$/, "phone must include the country code, e.g. +6591234567")
            .max(30).nullable().notRequired(),
        locale: yup.string().oneOf(["en", "zh", "th", "vi", "ms", "id", "ja"]).default("en"),
        notifyEmail: yup.boolean().default(true),
        notifyInApp: yup.boolean().default(true)
    });
    try {
        const data = await validationSchema.validate(req.body, { abortEarly: false });
        const invite = await UserInvitation.findOne({
            where: { tokenHash: sha256(data.token), acceptedAt: null, cancelledAt: null, expiresAt: { [Op.gt]: new Date() } }
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
        if (data.name) {
            user.name = data.name;
            user.initials = initialsOf(data.name);
        }
        // Saved so the "text me a code" 2FA option has somewhere to send to.
        if (data.phone) user.phone = data.phone;
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

        res.json({
            message: "Account activated. You can now sign in.",
            twoFactor: {
                email: true,
                sms: !!user.phone,
                note: user.phone
                    ? "At sign-in you can choose to receive your verification code by email or text message."
                    : "At sign-in your verification code will be emailed. Add a phone number under My account to enable text messages."
            }
        });
    } catch (err) {
        if (err.errors) return res.status(400).json({ errors: err.errors });
        res.status(400).json({ message: err.message || "Activation failed." });
    }
});

// PUT /invitation/:id/resend — issue a FRESH token and email the link again.
// Use this when the first email didn't arrive or the 48-hour window lapsed. The
// old token is replaced, so only the newest link works.
router.put("/:id/resend", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const invite = await UserInvitation.findByPk(req.params.id);
    if (!invite) return res.sendStatus(404);
    if (invite.acceptedAt) {
        return res.status(400).json({ message: "That invitation has already been accepted." });
    }
    if (invite.cancelledAt) {
        return res.status(400).json({ message: "That invitation was cancelled. Send a new invitation instead." });
    }

    // The placeholder account may have been purged when the invite expired, so
    // recreate it if needed - otherwise accepting the new link would have no
    // account to activate.
    let placeholder = await User.findOne({ where: { email: invite.email } });
    if (!placeholder) {
        const tempPw = crypto.randomBytes(12).toString('hex');
        const created = await createUserWithBalances({
            name: invite.name, email: invite.email, password: tempPw,
            role: invite.role, country: invite.country, team: invite.team
        });
        placeholder = created.user;
        placeholder.status = "INVITED";
        await placeholder.save();
    } else if (placeholder.status !== "INVITED") {
        return res.status(400).json({ message: `${invite.email} already has an active account.` });
    }

    const token = crypto.randomBytes(32).toString('hex');
    invite.tokenHash = sha256(token);
    invite.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await invite.save();

    const mail = await sendInviteEmail(invite.email, token);
    await ConfigAuditLog.create({
        actorName: req.user.name,
        action: `Invitation resent to ${invite.email}`,
        entity: "user_invitations", entityId: String(invite.id),
        before: null, after: { resentAt: new Date().toISOString() }
    });

    const emailed = mail.sent;
    res.json({
        message: emailed
            ? `A new invitation link was emailed to ${invite.email}. It expires in 48 hours.`
            : `A new invitation link was created for ${invite.email}. Email is not configured or failed, so share the link below.`,
        emailed,
        ...(emailed ? {} : { demoInviteToken: token, inviteLink: mail.link }),
        ...(mail.error ? { emailError: mail.error } : {})
    });
});

// PUT /invitation/:id/cancel — withdraw an invitation that hasn't been accepted.
//
// Creating an invitation also creates a placeholder account in INVITED state, so
// the invitee appears in the staff directory as "Invited (pending)". Cancelling
// therefore has to delete that placeholder too, otherwise the directory would
// keep showing a pending invite that no longer exists. Deleting is safe here
// precisely because the account was never activated - it has no leave history,
// approvals or audit trail to preserve (unlike deactivating a real employee).
router.put("/:id/cancel", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const invite = await UserInvitation.findByPk(req.params.id);
    if (!invite) return res.sendStatus(404);
    if (invite.acceptedAt) {
        return res.status(400).json({ message: "That invitation has already been accepted. Remove the employee from the staff list instead." });
    }
    if (invite.cancelledAt) {
        return res.status(400).json({ message: "That invitation is already cancelled." });
    }

    invite.cancelledAt = new Date();
    await invite.save();

    // Remove the never-activated placeholder account, if it is still INVITED.
    let removedAccount = false;
    const placeholder = await User.findOne({ where: { email: invite.email } });
    if (placeholder && placeholder.status === "INVITED") {
        await LeaveBalance.destroy({ where: { userId: placeholder.id } });
        await placeholder.destroy();
        removedAccount = true;
    }

    await ConfigAuditLog.create({
        actorName: req.user.name,
        action: `Invitation cancelled for ${invite.email}${removedAccount ? " (pending account removed)" : ""}`,
        entity: "user_invitations", entityId: String(invite.id),
        before: { status: "PENDING" }, after: { status: "CANCELLED" }
    });

    res.json({
        message: `Invitation for ${invite.email} cancelled${removedAccount ? " and the pending account removed." : "."}`,
        removedAccount
    });
});

// GET /invitation — HR lists invitations (pending / accepted / expired / cancelled)
router.get("/", validateToken, requireRole("HR_ADMIN"), async (req, res) => {
    const rows = await UserInvitation.findAll({ order: [['createdAt', 'DESC']] });
    const now = new Date();
    res.json(rows.map((r) => ({
        id: r.id, email: r.email, name: r.name, country: r.country, team: r.team, role: r.role,
        status: r.cancelledAt ? "CANCELLED"
            : r.acceptedAt ? "ACCEPTED"
            : (new Date(r.expiresAt) < now ? "EXPIRED" : "PENDING"),
        invitedByName: r.invitedByName, createdAt: r.createdAt, expiresAt: r.expiresAt
    })));
});

module.exports = router;
