// M1 (2FA): the second login step.
//
// Flow: password verified -> createPendingChallenge() returns an opaque
// challengeToken and the delivery choices -> the user picks email or SMS and
// sendCodeForChallenge() delivers a 6-digit code -> the browser posts that token
// plus the code to /user/2fa/verify -> only then is a real access token issued.
//
// Security properties:
//  - Codes are generated with crypto.randomInt (not Math.random).
//  - Only SHA-256 hashes of the code and the challenge token are stored.
//  - Comparison is timing-safe.
//  - 10-minute TTL, 5 wrong attempts burns the challenge, 3 resends max with a
//    30-second cooldown.
//  - Challenges are strictly single-use (consumedAt).
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, TwoFactorChallenge } = require('../models');
const mailer = require('./mailer');
const sms = require('./sms');
const totp = require('./totpService');

const CODE_LENGTH = 6;
const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const RESEND_COOLDOWN_SECONDS = 30;

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// Cryptographically secure zero-padded numeric code.
const generateCode = () => {
    const max = 10 ** CODE_LENGTH;
    return String(crypto.randomInt(0, max)).padStart(CODE_LENGTH, "0");
};

const timingSafeEqualHex = (a, b) => {
    const ba = Buffer.from(String(a), "hex");
    const bb = Buffer.from(String(b), "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
};

// Never disclose the full address/number back to an unauthenticated caller.
const maskEmail = (email) => {
    const [local, domain] = String(email || "").split("@");
    if (!domain) return "your email";
    const shown = local.length <= 2 ? local[0] || "" : `${local[0]}${"•".repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}`;
    return `${shown}@${domain}`;
};
const maskPhone = (phone) => {
    const digits = String(phone || "").replace(/[^\d+]/g, "");
    if (digits.length < 4) return "your phone";
    return `${digits.startsWith("+") ? "+" : ""}${"•".repeat(Math.max(digits.replace("+", "").length - 4, 2))}${digits.slice(-4)}`;
};

// Resolve the delivery target for a user's chosen method.
const destinationFor = (user, method) => {
    if (method === "SMS") {
        if (!user.phone) return { ok: false, message: "No phone number is saved on this account, so a code cannot be texted. Use email instead, or add a phone number under My account." };
        return { ok: true, to: user.phone, masked: maskPhone(user.phone) };
    }
    return { ok: true, to: user.email, masked: maskEmail(user.email) };
};

// Actually deliver the code. Returns the transport result (never throws).
const deliverCode = async (method, to, code) => {
    if (method === "SMS") {
        return sms.sendSms(
            to,
            `Your Leave Management System verification code is ${code}. It expires in ${TTL_MINUTES} minutes.`
        );
    }
    return mailer.sendTwoFactorEmail(to, code, TTL_MINUTES);
};

// Which delivery methods this user can actually use, with masked destinations.
// Shown on the "how do you want to verify?" step straight after the password.
const availableMethods = (user) => {
    const methods = [
        {
            method: "EMAIL",
            label: "Email",
            destination: maskEmail(user.email),
            available: true
        }
    ];
    methods.push({
        method: "SMS",
        label: "Text message",
        destination: user.phone ? maskPhone(user.phone) : null,
        available: !!user.phone,
        reason: user.phone ? null : "No phone number saved on this account."
    });
    // Authenticator app (Microsoft Authenticator, Google Authenticator, etc.).
    // Only usable once the user has enrolled a TOTP secret under My account;
    // shown-but-disabled otherwise so people know the option exists.
    methods.push({
        method: "AUTHENTICATOR",
        label: "Authenticator app",
        destination: user.totpEnabled ? "Microsoft / Google Authenticator" : null,
        available: !!user.totpEnabled,
        reason: user.totpEnabled ? null : "Not set up. Enable it under My account → Authenticator."
    });
    return methods;
};

// STEP 1: password accepted -> open a challenge with NO code yet. The user picks
// a delivery method next, and only then is a code generated and sent. Returns the
// opaque challengeToken plus the choices to show.
const createPendingChallenge = async (user, req) => {
    // Invalidate any earlier outstanding challenges for this user.
    await TwoFactorChallenge.update(
        { consumedAt: new Date() },
        { where: { userId: user.id, consumedAt: null } }
    );

    const challengeToken = crypto.randomBytes(32).toString('hex');
    const ip = req?.ip || req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || null;

    const challenge = await TwoFactorChallenge.create({
        userId: user.id,
        challengeTokenHash: sha256(challengeToken),
        codeHash: null,
        method: null,
        destination: null,
        expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
        ipAddress: ip ? String(ip).slice(0, 64) : null
    });

    return {
        challengeToken,
        methods: availableMethods(user),
        expiresAt: challenge.expiresAt,
        expiresInSeconds: TTL_MINUTES * 60
    };
};

// STEP 2: the user chose EMAIL or SMS -> generate + send the code on the existing
// challenge. Can be called again to switch method or resend.
const sendCodeForChallenge = async (challengeToken, method) => {
    const challenge = await findLiveChallenge(challengeToken);
    if (!challenge) {
        return { ok: false, status: 400, message: "This sign-in request has expired. Please sign in again." };
    }

    // Authenticator app: there is nothing to "send" — the user's app already
    // shows a rotating code. We only record that this is the chosen method (so
    // verifyChallenge knows to check TOTP rather than a delivered code) and
    // tell the client to prompt for it. Reset attempts so switching methods
    // gives a fresh set of tries.
    if (method === "AUTHENTICATOR") {
        const user = await User.findByPk(challenge.userId);
        if (!user) return { ok: false, status: 400, message: "Account no longer exists." };
        if (!user.totpEnabled || !user.totpSecret) {
            return { ok: false, status: 400, message: "No authenticator app is set up on this account. Use email or text instead." };
        }
        challenge.method = "AUTHENTICATOR";
        challenge.destination = "your authenticator app";
        challenge.codeHash = null;
        challenge.attempts = 0;
        await challenge.save();

        // Demo accounts (@innovare.com) don't have anyone actually holding a
        // real phone with this secret enrolled, so — exactly like the email/SMS
        // demo affordance above — show the current code on screen instead of
        // requiring one. Real accounts never get this; only a genuine
        // authenticator app ever sees their code.
        const isDemo = mailer.isDemoAddress(user.email);
        const demoCode = isDemo ? totp.currentCode(totp.decrypt(user.totpSecret)) : null;

        return {
            ok: true,
            method: "AUTHENTICATOR",
            destination: "your authenticator app",
            delivered: false,
            authenticator: true,
            expiresInSeconds: Math.max(0, Math.floor((new Date(challenge.expiresAt) - Date.now()) / 1000)),
            ...(demoCode ? { demoCode } : {}),
            message: "Open your authenticator app and enter the current 6-digit code for Innovare LMS."
        };
    }

    if (challenge.resendCount >= MAX_RESENDS) {
        return { ok: false, status: 429, message: "Too many codes requested. Please sign in again to start over." };
    }
    // The cooldown exists to stop someone spamming the same destination. Switching
    // to a DIFFERENT method is a deliberate user choice, so allow it immediately.
    const sameMethod = challenge.method === method;
    if (sameMethod && challenge.lastSentAt
        && (Date.now() - new Date(challenge.lastSentAt).getTime()) < RESEND_COOLDOWN_SECONDS * 1000) {
        const wait = Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - new Date(challenge.lastSentAt).getTime())) / 1000);
        return { ok: false, status: 429, message: `Please wait ${wait}s before requesting another code.` };
    }

    const user = await User.findByPk(challenge.userId);
    if (!user) return { ok: false, status: 400, message: "Account no longer exists." };

    const dest = destinationFor(user, method);
    if (!dest.ok) return { ok: false, status: 400, message: dest.message };

    const code = generateCode();
    challenge.method = method;
    challenge.destination = dest.masked;
    challenge.codeHash = sha256(code);
    challenge.attempts = 0;
    if (challenge.lastSentAt) challenge.resendCount += 1;
    challenge.lastSentAt = new Date();
    await challenge.save();

    const delivery = await deliverCode(method, dest.to, code);
    if (!delivery.sent) console.log(`[2fa] code for ${user.email} (${method}): ${code}`);
    // Show the code on screen when there is no transport at all, OR when a demo
    // redirect is configured. The redirect explicitly marks a demo environment,
    // and during a live presentation a slow inbox must not block the login.
    const transportMissing = delivery.reason === "no-smtp" || delivery.reason === "no-sms"
        || delivery.reason === "demo-domain" || delivery.reason === "demo-phone"
        || mailer.demoRedirectActive() || sms.demoSmsRedirectActive();

    return {
        ok: true,
        method,
        destination: dest.masked,
        delivered: !!delivery.sent,
        deliveryError: delivery.error || null,
        expiresInSeconds: Math.max(0, Math.floor((new Date(challenge.expiresAt) - Date.now()) / 1000)),
        // Demo affordance: only when no transport is configured at all.
        ...(transportMissing ? { demoCode: code } : {})
    };
};

// Look up a live challenge by its opaque token.
const findLiveChallenge = async (challengeToken) => {
    if (!/^[0-9a-f]{64}$/.test(String(challengeToken || ""))) return null;
    return TwoFactorChallenge.findOne({
        where: {
            challengeTokenHash: sha256(challengeToken),
            consumedAt: null,
            expiresAt: { [Op.gt]: new Date() }
        }
    });
};

// Verify a submitted code. Returns { ok, user } or { ok:false, status, message }.
const verifyChallenge = async (challengeToken, code) => {
    const challenge = await findLiveChallenge(challengeToken);
    if (!challenge) {
        return { ok: false, status: 400, message: "This verification request is invalid or has expired. Please sign in again." };
    }

    // A method must have been chosen. For EMAIL/SMS that means a code was sent
    // (codeHash set); for AUTHENTICATOR it just means the method was recorded.
    if (challenge.method !== "AUTHENTICATOR" && !challenge.codeHash) {
        return { ok: false, status: 400, message: "No code has been sent yet. Choose email or text message first." };
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
        challenge.consumedAt = new Date();
        await challenge.save();
        return { ok: false, status: 429, message: "Too many incorrect codes. Please sign in again to get a new code." };
    }

    const submitted = String(code || "").trim();

    // Decide whether the submitted code is valid, per method.
    let valid;
    if (challenge.method === "AUTHENTICATOR") {
        const user = await User.findByPk(challenge.userId);
        if (!user) return { ok: false, status: 400, message: "Account no longer exists." };
        const secret = user.totpEnabled ? totp.decrypt(user.totpSecret) : null;
        valid = totp.verify(submitted, secret);
    } else {
        valid = timingSafeEqualHex(sha256(submitted), challenge.codeHash);
    }

    if (!valid) {
        challenge.attempts += 1;
        await challenge.save();
        const left = MAX_ATTEMPTS - challenge.attempts;
        if (left <= 0) {
            challenge.consumedAt = new Date();
            await challenge.save();
            return { ok: false, status: 429, message: "Too many incorrect codes. Please sign in again to get a new code." };
        }
        const noun = challenge.method === "AUTHENTICATOR" ? "code from your authenticator app" : "code";
        return { ok: false, status: 400, message: `That ${noun} is not correct. ${left} attempt${left === 1 ? "" : "s"} remaining.` };
    }

    // Correct — burn the challenge so it cannot be replayed.
    challenge.consumedAt = new Date();
    await challenge.save();

    const user = await User.findByPk(challenge.userId);
    if (!user) return { ok: false, status: 400, message: "Account no longer exists." };
    return { ok: true, user, challenge };
};

module.exports = {
    CODE_LENGTH, TTL_MINUTES, MAX_ATTEMPTS, MAX_RESENDS, RESEND_COOLDOWN_SECONDS,
    generateCode, sha256, maskEmail, maskPhone, destinationFor,
    availableMethods, createPendingChallenge, sendCodeForChallenge,
    verifyChallenge, findLiveChallenge
};
