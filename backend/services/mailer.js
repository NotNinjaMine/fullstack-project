// M1 (UC-24/UC-25 support): sends the reset/invite link by email when SMTP is
// configured; otherwise logs the link to the console so the flow still works
// fully offline (the route handlers additionally echo the raw token in the
// API response in that case — see routes/user.js and routes/invitation.js).
const nodemailer = require('nodemailer');

const smtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
const getTransporter = () => {
    if (!transporter && smtpConfigured()) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
    }
    return transporter;
};

// Shared sender: Login.jsx tells reset links (?resetToken=) and invite links
// (?inviteToken=) apart by query param name, so each needs its own builder —
// sending an invite down the reset link would never open the accept-invite form.
const sendLink = async ({ toEmail, param, token, subject, intro }) => {
    const link = `${process.env.CLIENT_URL || ''}/?${param}=${token}`;

    if (!smtpConfigured()) {
        console.log(`[mailer] (demo mode, no SMTP configured) ${subject} link for ${toEmail}: ${link}`);
        return { demo: true };
    }

    const info = await getTransporter().sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: toEmail,
        subject: `Innovare Leave Management System — ${subject}`,
        text: `${intro} ${link}\nThis link expires soon and can only be used once.`
    });
    return { demo: false, messageId: info.messageId };
};

const sendResetEmail = (toEmail, token) => sendLink({
    toEmail, token, param: 'resetToken', subject: 'Password reset',
    intro: 'Use this link to reset your password:'
});

const sendInviteEmail = (toEmail, token) => sendLink({
    toEmail, token, param: 'inviteToken', subject: 'You are invited',
    intro: 'Use this link to activate your account:'
});

module.exports = { sendResetEmail, sendInviteEmail, smtpConfigured };
