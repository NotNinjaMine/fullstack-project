// Shared, best-effort email delivery for authentication, M3 notifications and
// scheduled reports. SMTP is an external side effect: every public sender
// returns a structured result and never throws provider details into a route.
require('dotenv').config();
const nodemailer = require('nodemailer');

const DEFAULT_APP_NAME = 'Annual Leave Management System';
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

const parseBoolean = (value, fallback = false) => {
    if (value === undefined || value === null || String(value).trim() === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return fallback;
};

const parseInteger = (value, fallback, min, max) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

const validEmail = (value) => {
    const email = String(value || '').trim();
    return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email);
};

const normalizedEmail = (value) => String(value || '').trim().toLowerCase();

const maskEmail = (value) => {
    const email = normalizedEmail(value);
    const at = email.indexOf('@');
    if (at <= 0) return null;
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    return `${local.slice(0, 1)}${'*'.repeat(Math.min(Math.max(local.length - 1, 2), 8))}@${domain}`;
};

const readConfig = () => {
    const host = String(process.env.SMTP_HOST || '').trim();
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '');
    const explicitEnabled = process.env.SMTP_ENABLED !== undefined;
    // Backward-compatible migration: existing local .env files that pre-date
    // SMTP_ENABLED still work when all legacy SMTP credentials are present.
    const enabled = explicitEnabled
        ? parseBoolean(process.env.SMTP_ENABLED, false)
        : !!(host && user && pass);
    const port = parseInteger(process.env.SMTP_PORT, 587, 1, 65535);
    const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);
    const fromName = String(process.env.SMTP_FROM_NAME || DEFAULT_APP_NAME).trim().slice(0, 100)
        || DEFAULT_APP_NAME;
    const fromEmail = String(
        process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || user
    ).trim();
    // Optional development-only redirect for testing event delivery when some
    // company aliases are not provisioned. It is disabled by default and is
    // always refused in production. The original recipient is retained only in
    // the outgoing message metadata; logs and return values expose a mask.
    // EMAIL_TEST_REDIRECT_TO accepts a comma-separated list so a whole group
    // can receive every code, not just one controlled inbox.
    const testRedirectRequested = parseBoolean(process.env.EMAIL_TEST_MODE, false);
    const testRedirectEnabled = testRedirectRequested && process.env.NODE_ENV !== 'production';
    const testRedirectTo = String(process.env.EMAIL_TEST_REDIRECT_TO || '')
        .split(',')
        .map(normalizedEmail)
        .filter(Boolean);

    const missing = [];
    if (enabled) {
        if (!host) missing.push('SMTP_HOST');
        if (!user) missing.push('SMTP_USER');
        if (!pass) missing.push('SMTP_PASS');
        if (!validEmail(fromEmail)) missing.push('SMTP_FROM_EMAIL');
        if (testRedirectEnabled && (testRedirectTo.length === 0 || !testRedirectTo.every(validEmail))) {
            missing.push('EMAIL_TEST_REDIRECT_TO');
        }
    }

    return {
        enabled,
        valid: enabled && missing.length === 0,
        missing,
        host,
        port,
        secure,
        user,
        pass,
        fromName,
        fromEmail,
        testRedirectEnabled,
        testRedirectTo,
        connectionTimeout: parseInteger(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10000, 1000, 120000),
        greetingTimeout: parseInteger(process.env.SMTP_GREETING_TIMEOUT_MS, 10000, 1000, 120000),
        socketTimeout: parseInteger(process.env.SMTP_SOCKET_TIMEOUT_MS, 15000, 1000, 300000)
    };
};

let transporter = null;
let warnedConfiguration = false;

const warnInvalidConfigurationOnce = (config = readConfig()) => {
    if (!config.enabled || config.valid || warnedConfiguration) return;
    warnedConfiguration = true;
    console.error(
        `[mailer] SMTP is enabled but configuration is incomplete; delivery is disabled ` +
        `(missing: ${config.missing.join(', ')}). No credentials were logged.`
    );
};

const smtpConfigured = () => {
    const config = readConfig();
    warnInvalidConfigurationOnce(config);
    return config.valid;
};

const emailEnabled = () => readConfig().enabled;

const getTransporter = () => {
    const config = readConfig();
    warnInvalidConfigurationOnce(config);
    if (!config.valid || process.env.NODE_ENV === 'test') return null;
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            requireTLS: !config.secure && config.port === 587,
            auth: { user: config.user, pass: config.pass },
            connectionTimeout: config.connectionTimeout,
            greetingTimeout: config.greetingTimeout,
            socketTimeout: config.socketTimeout
        });
    }
    return transporter;
};

const errorCategory = (err) => {
    const code = String(err?.code || '').toUpperCase();
    const responseCode = Number(err?.responseCode || 0);
    const message = String(err?.message || '');
    if (code === 'EAUTH' || responseCode === 535 || /invalid login|authentication/i.test(message)) {
        return 'SMTP_AUTH_FAILED';
    }
    if (code === 'ETIMEDOUT' || code === 'ESOCKET' || /timeout/i.test(message)) {
        return 'SMTP_TIMEOUT';
    }
    if (code === 'ECONNREFUSED' || code === 'ECONNECTION') return 'SMTP_CONNECTION_FAILED';
    if (code === 'EENVELOPE' || /recipient/i.test(message)) return 'RECIPIENT_REJECTED';
    if (/certificate|self.signed|tls/i.test(message)) return 'SMTP_TLS_FAILED';
    return 'SMTP_DELIVERY_FAILED';
};

const describeMailError = (err) => {
    const category = typeof err === 'string' ? err : errorCategory(err);
    const messages = {
        SMTP_AUTH_FAILED: 'The email provider rejected authentication. Check the SMTP account and app password.',
        SMTP_TIMEOUT: 'The email provider connection timed out. Check the network and SMTP timeout settings.',
        SMTP_CONNECTION_FAILED: 'The email provider could not be reached. Check the SMTP host, port and network.',
        RECIPIENT_REJECTED: 'The email provider rejected the recipient address.',
        SMTP_TLS_FAILED: 'A secure connection to the email provider could not be established.',
        SMTP_DELIVERY_FAILED: 'The email provider could not deliver the message.'
    };
    return messages[category] || messages.SMTP_DELIVERY_FAILED;
};

const safeHeader = (value, fallback) => {
    const cleaned = String(value || '')
        .replace(/[\r\n\0]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
    return cleaned || fallback;
};

const safeContext = (context = {}) => ({
    event: safeHeader(context.eventType || 'GENERAL', 'GENERAL').replace(/[^A-Z0-9_-]/gi, '_'),
    user: Number.isInteger(Number(context.userId)) ? Number(context.userId) : 'none',
    request: Number.isInteger(Number(context.requestId)) ? Number(context.requestId) : 'none'
});

const verifyTransport = async () => {
    const config = readConfig();
    if (!config.enabled) return { ok: false, reason: 'EMAIL_DISABLED' };
    if (!config.valid) {
        warnInvalidConfigurationOnce(config);
        return {
            ok: false,
            reason: 'EMAIL_CONFIG_INVALID',
            error: 'Email is enabled but its server configuration is incomplete.'
        };
    }
    if (process.env.NODE_ENV === 'test') return { ok: false, reason: 'EMAIL_TEST_MODE' };
    try {
        await getTransporter().verify();
        return { ok: true };
    } catch (err) {
        const category = errorCategory(err);
        return { ok: false, reason: 'VERIFY_FAILED', category, error: describeMailError(category) };
    }
};

// Core sender. It accepts only server-generated subject/body values and never
// throws. Callers may safely invoke it after a business transaction commits.
const sendMail = async ({ to, subject, text, html, context = {} }) => {
    const config = readConfig();
    const recipient = normalizedEmail(to);
    const safe = safeContext(context);

    if (!validEmail(recipient)) {
        console.error(`[mailer] skipped category=INVALID_RECIPIENT event=${safe.event} user=${safe.user} request=${safe.request}.`);
        return { sent: false, skipped: true, reason: 'INVALID_RECIPIENT' };
    }
    if (!config.enabled) return { sent: false, skipped: true, reason: 'EMAIL_DISABLED' };
    if (!config.valid) {
        warnInvalidConfigurationOnce(config);
        return { sent: false, skipped: true, reason: 'EMAIL_CONFIG_INVALID' };
    }
    // Defense in depth: automated tests never create or use a live transport,
    // even if a developer accidentally leaves SMTP variables in the shell.
    if (process.env.NODE_ENV === 'test') {
        return { sent: false, skipped: true, reason: 'EMAIL_TEST_MODE' };
    }

    try {
        const redirected = config.testRedirectEnabled;
        const deliveryRecipient = redirected ? config.testRedirectTo.join(', ') : recipient;
        const info = await getTransporter().sendMail({
            from: { name: config.fromName, address: config.fromEmail },
            to: deliveryRecipient,
            subject: safeHeader(subject, DEFAULT_APP_NAME),
            text: String(text || '').slice(0, 20000),
            ...(html ? { html: String(html).slice(0, 50000) } : {}),
            ...(redirected ? {
                headers: {
                    'X-Leave-System-Test-Redirect': 'true',
                    'X-Leave-System-Original-Recipient': recipient
                }
            } : {})
        });
        return {
            sent: true,
            skipped: false,
            ...(redirected ? {
                redirected: true,
                originalRecipient: maskEmail(recipient)
            } : {}),
            ...(info?.messageId ? { messageId: String(info.messageId).slice(0, 255) } : {})
        };
    } catch (err) {
        const category = errorCategory(err);
        console.error(`[mailer] send failed category=${category} event=${safe.event} user=${safe.user} request=${safe.request}.`);
        return {
            sent: false,
            skipped: false,
            reason: 'SEND_FAILED',
            category,
            error: describeMailError(category)
        };
    }
};

const clientBaseUrl = () => {
    try {
        const parsed = new URL(process.env.CLIENT_URL || 'http://localhost:5173');
        if (!['http:', 'https:'].includes(parsed.protocol)) return 'http://localhost:5173';
        return parsed.toString().replace(/\/+$/, '');
    } catch (_) {
        return 'http://localhost:5173';
    }
};

const buildLink = (param, token) => {
    const url = new URL(clientBaseUrl());
    url.searchParams.set(param, String(token));
    return url.toString();
};

const sendLinkEmail = async ({ toEmail, param, token, subject, body, validFor, eventType }) => {
    const link = buildLink(param, token);
    const result = await sendMail({
        to: toEmail,
        subject,
        text: `${body}\n\nOpen this link (valid for ${validFor}):\n${link}\n\n` +
              `This link can only be used once. If you were not expecting this email, you can safely ignore it.`,
        context: { eventType }
    });
    // The authenticated calling flow decides whether a demo link may be shown.
    // It is never written to a log here.
    return { ...result, link };
};

const sendResetEmail = (toEmail, resetToken) => sendLinkEmail({
    toEmail,
    param: 'resetToken',
    token: resetToken,
    subject: 'Reset your Leave Management System password',
    body: 'We received a request to reset your Leave Management System password.',
    validFor: '30 minutes',
    eventType: 'PASSWORD_RESET'
});

const sendInviteEmail = (toEmail, inviteToken) => sendLinkEmail({
    toEmail,
    param: 'inviteToken',
    token: inviteToken,
    subject: "You're invited to the Leave Management System",
    body: 'You have been invited to activate your Leave Management System account. ' +
          'Open the link below to set your password and choose your preferences.',
    validFor: '48 hours',
    eventType: 'INVITATION'
});

// Backward-compatible signature used by M3 and M5. The optional fourth
// argument carries HTML and safe log context for the M3 orchestration service.
const sendNotificationEmail = (toEmail, subject, text, options = {}) => sendMail({
    to: toEmail,
    subject,
    text,
    html: options.html,
    context: options.context || {}
});

const mailerStatus = () => {
    const config = readConfig();
    if (!config.enabled) return 'email DISABLED (SMTP_ENABLED=false)';
    if (!config.valid) return 'email DISABLED (SMTP configuration is incomplete)';
    if (process.env.NODE_ENV === 'test') return 'email DISABLED (test safety mode)';
    if (config.testRedirectEnabled) {
        return `email ENABLED in development test-redirect mode via configured SMTP server on port ${config.port}`;
    }
    return `email ENABLED via configured SMTP server on port ${config.port}`;
};

const sendTwoFactorEmail = (toEmail, code, ttlMinutes = 10) => sendMail({
    to: toEmail,
    subject: 'Your Leave Management System verification code',
    text: `Your Leave Management System verification code is:\n\n    ${code}\n\n` +
          `It expires in ${ttlMinutes} minutes and can only be used once.\n\n` +
          `If you did not just try to sign in, change your password and contact HR.`,
    context: { eventType: 'TWO_FACTOR' }
});

const sendTestEmail = (toEmail) => sendMail({
    to: toEmail,
    subject: 'Leave Management System — test email',
    text: 'This is a test email from the Annual Leave Management System.\n\n' +
          'If you received it, outgoing email is configured correctly.',
    context: { eventType: 'SMTP_TEST' }
});

// Test-only reset so isolated unit tests can change environment variables
// without reusing a transporter created by an earlier test.
const resetForTests = () => {
    transporter = null;
    warnedConfiguration = false;
};

module.exports = {
    sendMail,
    sendResetEmail,
    sendInviteEmail,
    sendNotificationEmail,
    sendTwoFactorEmail,
    sendTestEmail,
    smtpConfigured,
    emailEnabled,
    mailerStatus,
    verifyTransport,
    describeMailError,
    errorCategory,
    validEmail,
    normalizedEmail,
    maskEmail,
    readConfig,
    resetForTests
};
