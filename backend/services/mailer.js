// M1 (UC-24/UC-25 support): delivers the password-reset and invitation links by
// real SMTP email. If SMTP isn't configured the link is logged to the console
// instead (demo mode) so the flow still works offline for teammates without
// mail credentials — see routes/user.js and routes/invitation.js.
//
// Nothing in here throws: every send returns { ok, demo, messageId, error }.
// That matters because both callers have already written to the database by the
// time they send, so a bounced email must not fail the whole request.
const nodemailer = require('nodemailer');

const smtpConfigured = () =>
    !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

// Port 465 is implicit TLS; 587/25 start plaintext and upgrade via STARTTLS.
const buildTransport = () => {
    const port = Number(process.env.SMTP_PORT) || 587;
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
};

let transporter = null;
const getTransporter = () => {
    if (!transporter && smtpConfigured()) transporter = buildTransport();
    return transporter;
};

// Used by `npm run mail:test` to prove the credentials work before relying on them.
const verifyTransport = async () => {
    if (!smtpConfigured()) {
        return { ok: false, error: "SMTP_HOST / SMTP_USER / SMTP_PASS are not all set in .env" };
    }
    try {
        await getTransporter().verify();
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
};

const fromAddress = () =>
    process.env.SMTP_FROM || `Innovare Leave Management <${process.env.SMTP_USER}>`;

const escapeHtml = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const clientBase = () => String(process.env.CLIENT_URL || "").replace(/\/+$/, "");

const htmlBody = ({ heading, greeting, intro, link, cta, expiry }) => `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="background:#134e4a;padding:20px 24px">
      <p style="margin:0;color:#5eead4;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Innovare Management</p>
      <h1 style="margin:4px 0 0;color:#ffffff;font-size:18px;font-weight:600">${escapeHtml(heading)}</h1>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 12px;color:#0f172a;font-size:14px">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.5">${escapeHtml(intro)}</p>
      <p style="margin:0 0 20px">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#0f766e;color:#ffffff;font-size:14px;font-weight:500;text-decoration:none;padding:11px 22px;border-radius:8px">${escapeHtml(cta)}</a>
      </p>
      <p style="margin:0 0 6px;color:#94a3b8;font-size:12px">${escapeHtml(expiry)} This link can only be used once.</p>
      <p style="margin:0;color:#94a3b8;font-size:12px">If the button doesn't work, paste this into your browser:<br>
        <span style="color:#0f766e;word-break:break-all">${escapeHtml(link)}</span>
      </p>
    </div>
  </div>
</div>`;

// Login.jsx distinguishes the two flows by query-param name (?resetToken= opens
// the reset form, ?inviteToken= opens the activate-account form), so each link
// must use its own param — they are not interchangeable.
const sendLink = async ({ toEmail, param, token, subject, heading, greeting, intro, cta, expiry }) => {
    const base = clientBase();
    // Without CLIENT_URL the link is relative ("/?token=…") and unclickable in an
    // email client — warn loudly rather than deliver mail nobody can act on.
    if (!base) {
        console.warn(`[mailer] CLIENT_URL is not set in .env — the ${subject} link will be relative and unusable from an email. Set CLIENT_URL to your frontend origin (e.g. http://localhost:3000).`);
    }
    const link = `${base}/?${param}=${token}`;

    if (!smtpConfigured()) {
        console.log(`[mailer] DEMO MODE (no SMTP configured) — ${subject} link for ${toEmail}:\n  ${link}`);
        return { ok: false, demo: true, link };
    }

    try {
        const info = await getTransporter().sendMail({
            from: fromAddress(),
            to: toEmail,
            subject: `Innovare Leave Management System — ${subject}`,
            text: `${greeting}\n\n${intro}\n\n${link}\n\n${expiry} This link can only be used once.`,
            html: htmlBody({ heading, greeting, intro, link, cta, expiry })
        });
        console.log(`[mailer] sent "${subject}" to ${toEmail} (id ${info.messageId})`);
        return { ok: true, demo: false, messageId: info.messageId, link };
    } catch (err) {
        console.error(`[mailer] FAILED to send "${subject}" to ${toEmail}: ${err.message}`);
        return { ok: false, demo: false, error: err.message, link };
    }
};

const sendResetEmail = (toEmail, token, name) => sendLink({
    toEmail, token,
    param: 'resetToken',
    subject: 'Password reset',
    heading: 'Reset your password',
    greeting: name ? `Hi ${name},` : 'Hi,',
    intro: 'We received a request to reset the password on your Leave Management System account. Choose a new password using the link below.',
    cta: 'Choose a new password',
    expiry: 'This link expires in 30 minutes.'
});

const sendInviteEmail = (toEmail, token, name, invitedByName) => sendLink({
    toEmail, token,
    param: 'inviteToken',
    subject: 'You have been invited',
    heading: 'Activate your account',
    greeting: name ? `Hi ${name},` : 'Hi,',
    intro: `${invitedByName ? `${invitedByName} has` : 'HR has'} invited you to the Innovare Leave Management System. Set a password using the link below to activate your account.`,
    cta: 'Activate my account',
    expiry: 'This link expires in 48 hours.'
});

module.exports = { sendResetEmail, sendInviteEmail, smtpConfigured, verifyTransport };
