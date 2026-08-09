// Outgoing email for the whole app. THREE senders share one code path so the
// password-reset link and the employee-invitation link behave identically:
//
//   sendResetEmail        - forgot-password link  (?resetToken=...)
//   sendInviteEmail       - onboarding link       (?inviteToken=...)
//   sendNotificationEmail - M3/M5 notifications and scheduled reports
//
// If SMTP_HOST + SMTP_USER + SMTP_PASS are set in .env, a real email is sent via
// nodemailer. Otherwise the app runs in "demo mode": the link is logged to the
// server console and the calling route hands it back so the flow is still fully
// demonstrable offline.
//
// IMPORTANT: these functions never throw. A mail failure (bad credentials, no
// network, provider rejection) must not fail the surrounding request - the reset
// token and the invited account have already been written to the database by
// then, so throwing would leave the user with an opaque error and no link. The
// result object reports what happened instead.
require('dotenv').config();
const nodemailer = require('nodemailer');

const smtpConfigured = () =>
    !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

// Cached transporter - built once, reused for every message.
let transporter = null;
const getTransporter = () => {
    if (!transporter && smtpConfigured()) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
    }
    return transporter;
};

// Translates raw SMTP/network errors into something actionable, because the
// default messages ("Invalid login", "ETIMEDOUT") rarely say what to fix.
const describeMailError = (err) => {
    const code = err.code || err.responseCode || "";
    const msg = String(err.message || "");
    if (code === "EAUTH" || err.responseCode === 535 || /invalid login|username and password not accepted/i.test(msg)) {
        return "Authentication rejected. For Gmail you must use a 16-character App Password " +
               "(Google Account -> Security -> 2-Step Verification -> App passwords), not your normal " +
               "password. Check SMTP_USER and SMTP_PASS.";
    }
    if (code === "ECONNREFUSED") {
        return `Connection refused by ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}. Check SMTP_HOST and SMTP_PORT.`;
    }
    if (code === "ETIMEDOUT" || code === "ESOCKET" || /timeout/i.test(msg)) {
        return `Could not reach ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}. The port may be blocked by ` +
               "your network/firewall (school and campus Wi-Fi often block SMTP). Try port 587, or a different network.";
    }
    if (code === "EENVELOPE" || /no recipients|invalid recipient/i.test(msg)) {
        return "The recipient address was rejected. Check the email address is valid.";
    }
    if (/self.signed|certificate/i.test(msg)) {
        return "TLS certificate problem. Confirm SMTP_PORT is 587 (STARTTLS) or 465 (TLS) for your provider.";
    }
    return msg || "Unknown mail error.";
};

// Opens a real connection and authenticates WITHOUT sending anything. Used at
// startup and by the HR "test email" diagnostic so misconfiguration surfaces
// immediately instead of silently failing on the first reset/invite.
const verifyTransport = async () => {
    if (!smtpConfigured()) return { ok: false, reason: "no-smtp" };
    try {
        await getTransporter().verify();
        return { ok: true };
    } catch (err) {
        return { ok: false, reason: "verify-failed", error: describeMailError(err), raw: err.message };
    }
};

// Core sender. Returns { sent, reason?, error? } and never throws.
// DEMO_EMAIL_REDIRECT: send every outgoing email to ONE real inbox regardless of
// who it was addressed to. This exists for live demos: the seeded accounts use
// @innovare.com addresses, which is not a real domain, so mail to them would
// never arrive. Setting this lets you keep all the demo accounts (and therefore
// every role/page) exactly as they are, while still proving real delivery.
// The original recipient is preserved in the subject line and body.
// Leave it BLANK for real deployments — it must never be set in production.
const demoRedirect = () => (process.env.DEMO_EMAIL_REDIRECT || "").trim();
const demoRedirectActive = () => !!demoRedirect();

// DEMO_EMAIL_DOMAINS: domains that are NOT real mailboxes. The seeded accounts
// use @innovare.com, which does not exist — an SMTP server will usually ACCEPT
// mail for it and bounce asynchronously, so the send looks successful while
// nothing ever arrives, and the on-screen code fallback would be suppressed.
// That would lock you out of the very demo accounts you use to show the app.
//
// So: mail to these domains is never attempted, and the 2FA code / invite link
// is surfaced in-app instead. Any OTHER address — a real one you add through
// HR "Add employee" or an invitation — gets a genuine email.
// This is what lets real-email accounts and demo accounts coexist.
const demoDomains = () =>
    (process.env.DEMO_EMAIL_DOMAINS || "innovare.com")
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);

const isDemoAddress = (email) => {
    const domain = String(email || "").split("@")[1]?.toLowerCase();
    return !!domain && demoDomains().includes(domain);
};

const sendMail = async ({ to, subject, text, html }) => {
    if (!smtpConfigured()) {
        console.log(`[mailer] SMTP not configured (demo mode) - would email ${to}: ${subject}`);
        return { sent: false, reason: "no-smtp" };
    }
    // Placeholder demo address with no explicit redirect: don't attempt delivery.
    if (isDemoAddress(to) && !demoRedirectActive()) {
        console.log(`[mailer] ${to} is a demo address (${demoDomains().join(", ")}) - not sending; code/link shown in-app instead`);
        return { sent: false, reason: "demo-domain" };
    }
    // Redirect for demos (see note above) — the intended recipient is kept visible.
    const redirect = demoRedirect();
    const actualTo = redirect || to;
    const actualSubject = redirect ? `[demo → ${to}] ${subject}` : subject;
    const actualText = redirect
        ? `--- DEMO REDIRECT ---\nThis email was addressed to: ${to}\nIt was redirected here because DEMO_EMAIL_REDIRECT is set.\n---------------------\n\n${text}`
        : text;
    const actualHtml = html
        ? (redirect
            ? `<p style="font:13px sans-serif;color:#b45309;background:#fffbeb;border:1px solid #fcd34d;padding:8px;border-radius:6px">
                 <strong>Demo redirect</strong> — this email was addressed to ${to} and redirected here.</p>${html}`
            : html)
        : undefined;
    try {
        await getTransporter().sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: actualTo,
            subject: actualSubject,
            text: actualText,
            ...(actualHtml ? { html: actualHtml } : {})
        });
        console.log(
            redirect
                ? `[mailer] sent "${subject}" (for ${to}) -> redirected to ${actualTo}`
                : `[mailer] sent "${subject}" to ${to}`
        );
        return { sent: true, redirectedTo: redirect || null };
    } catch (err) {
        // Non-fatal by design - see the note at the top of this file.
        const friendly = describeMailError(err);
        console.error(`[mailer] FAILED to email ${actualTo}: ${friendly}`);
        return { sent: false, reason: "send-failed", error: friendly };
    }
};

// Builds the absolute link the recipient clicks. Login.jsx distinguishes the two
// flows by query-param name (?resetToken= vs ?inviteToken=), so each flow must
// use its own param or the wrong form opens.
const buildLink = (param, token) => {
    const appUrl = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/+$/, "");
    return `${appUrl}/?${param}=${token}`;
};

// Shared link-email sender used by BOTH the reset and invitation flows.
const sendLinkEmail = async ({ toEmail, param, token, subject, body, validFor, cta = "Open link" }) => {
    const link = buildLink(param, token);
    // Sent as HTML with a real anchor, because these links are ~99 characters —
    // longer than the 78-character line length recommended for plain-text email.
    // Mail servers hard-wrap plain text at that limit, which splits the token in
    // half and breaks the link. HTML is encoded with soft line breaks that the
    // receiving client reassembles, so the URL arrives intact. The plain-text
    // version is kept as a fallback for clients that don't render HTML.
    const html = `
      <div style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:520px">
        <p>${body}</p>
        <p style="margin:24px 0">
          <a href="${link}"
             style="background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">
            ${cta}
          </a>
        </p>
        <p style="font-size:13px;color:#64748b">
          This link is valid for ${validFor} and can only be used once.
        </p>
        <p style="font-size:13px;color:#64748b">
          If the button doesn't work, copy and paste this address into your browser:<br>
          <span style="word-break:break-all;color:#0f766e">${link}</span>
        </p>
        <p style="font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:24px">
          If you weren't expecting this email, you can safely ignore it.
        </p>
      </div>`;
    const result = await sendMail({
        to: toEmail,
        subject,
        text: `${body}\n\nOpen this link (valid for ${validFor}):\n${link}\n\n` +
              `This link can only be used once. If you weren't expecting this email, you can safely ignore it.`,
        html
    });
    if (!result.sent) {
        // Log the link so it stays recoverable from the server console either way.
        console.log(`[mailer]   link for ${toEmail}: ${link}`);
    }
    return { ...result, link };
};

// Forgot-password link (30-minute TTL, set by routes/user.js).
const sendResetEmail = (toEmail, resetToken) => sendLinkEmail({
    toEmail,
    param: "resetToken",
    token: resetToken,
    subject: "Reset your Leave Management System password",
    body: "We received a request to reset your Leave Management System password.",
    validFor: "30 minutes",
    cta: "Reset my password"
});

// Employee invitation / onboarding link (48-hour TTL, set by routes/invitation.js).
const sendInviteEmail = (toEmail, inviteToken) => sendLinkEmail({
    toEmail,
    param: "inviteToken",
    token: inviteToken,
    subject: "You're invited to the Leave Management System",
    body: "You have been invited to activate your Leave Management System account. " +
          "Open the link below to set your password and choose your preferences.",
    validFor: "48 hours",
    cta: "Activate my account"
});

// General notification email (M3 approvals/comments/reminders, M5 reports).
const sendNotificationEmail = (toEmail, subject, text) =>
    sendMail({ to: toEmail, subject, text });

// Human-readable status for the startup banner / diagnostics.
const mailerStatus = () => {
    if (!smtpConfigured()) {
        return "email DISABLED (no SMTP_* in .env) - reset & invite links are logged here and returned in the API response for the demo";
    }
    const base = `email ENABLED via ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587} as ${process.env.SMTP_USER}`;
    return demoRedirectActive()
        ? `${base}  |  DEMO REDIRECT ON -> ALL mail goes to ${demoRedirect()}`
        : base;
};

// 2FA verification code (short TTL, set by services/twoFactorService.js).
const sendTwoFactorEmail = (toEmail, code, ttlMinutes = 10) => sendMail({
    to: toEmail,
    subject: `Your verification code: ${code}`,
    text: `Your Leave Management System verification code is:\n\n    ${code}\n\n` +
          `It expires in ${ttlMinutes} minutes and can only be used once.\n\n` +
          `If you did not just try to sign in, someone may have your password — ` +
          `change it as soon as you can and tell HR.`
});

module.exports = {
    sendResetEmail,
    sendInviteEmail,
    sendNotificationEmail,
    sendTwoFactorEmail,
    smtpConfigured,
    mailerStatus,
    verifyTransport,
    describeMailError,
    demoRedirect,
    demoRedirectActive,
    demoDomains,
    isDemoAddress
};
