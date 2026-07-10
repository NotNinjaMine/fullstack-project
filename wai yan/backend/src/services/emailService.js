/**
 * Email channel (UC-12) via Nodemailer.
 * Supports real SMTP or Ethereal test accounts when SMTP_MODE=ethereal.
 * Bodies must stay free of sensitive PII (names/emails of third parties).
 */

const nodemailer = require('nodemailer');

let transporterPromise = null;

async function createTransporter() {
  const mode = (process.env.SMTP_MODE || 'smtp').toLowerCase();

  if (mode === 'off' || process.env.EMAIL_ENABLED === 'false') {
    return null;
  }

  // Dev: free Ethereal inbox (view at ethereal.email)
  if (mode === 'ethereal') {
    const testAccount = await nodemailer.createTestAccount();
    console.log('[email] Ethereal test account ready');
    console.log('[email] user:', testAccount.user);
    console.log('[email] pass:', testAccount.pass);
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  // Console-only (no network)
  if (mode === 'console') {
    return null;
  }

  // GoDaddy Professional Email / Workspace Email preset
  // Official SMTP: smtpout.secureserver.net · SSL port 465 (or 587 TLS)
  let host = process.env.SMTP_HOST;
  let port = Number(process.env.SMTP_PORT || 587);
  let secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (mode === 'godaddy') {
    host = host || 'smtpout.secureserver.net';
    port = Number(process.env.SMTP_PORT || 465);
    secure = process.env.SMTP_SECURE !== 'false' && (port === 465 || process.env.SMTP_SECURE === 'true');
    if (port === 587) secure = false; // STARTTLS
    console.log(`[email] GoDaddy SMTP → ${host}:${port} secure=${secure}`);
  }

  if (!host) {
    console.warn('[email] SMTP_HOST empty — falling back to console mode');
    return null;
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[email] SMTP_USER / SMTP_PASS missing — cannot authenticate');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Helpful on some Windows / corporate networks
    tls: {
      // keep verification on for production; set SMTP_TLS_REJECT_UNAUTHORIZED=false only if needed
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
    },
  });
}

function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = createTransporter().catch((err) => {
      console.error('[email] transporter init failed:', err.message);
      transporterPromise = null;
      return null;
    });
  }
  return transporterPromise;
}

/**
 * Send email. Safe to call fire-and-forget.
 * @returns {{ ok: boolean, mode: string, messageId?: string, previewUrl?: string }}
 */
async function sendEmail({ to, subject, text, html }) {
  if (!to) {
    return { ok: false, mode: 'skip', error: 'missing recipient' };
  }

  const transport = await getTransporter();
  if (!transport) {
    console.log(`[email:console] to=${to}\nsubject=${subject}\n${text}`);
    return { ok: true, mode: 'console' };
  }

  const from = process.env.SMTP_FROM || 'HR Leave System <noreply@company.com>';
  const info = await transport.sendMail({
    from,
    to,
    subject,
    text,
    html: html || undefined,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log('[email] Ethereal preview:', previewUrl);
  } else {
    console.log('[email] sent messageId=', info.messageId, 'to=', to);
  }

  return {
    ok: true,
    mode: process.env.SMTP_MODE || 'smtp',
    messageId: info.messageId,
    previewUrl: previewUrl || undefined,
  };
}

async function sendEmailToUser(user, { subject, text, html }) {
  if (!user?.email) return { ok: false, mode: 'skip', error: 'no email' };
  if (user.notify_email === false || user.notify_email === 0) {
    return { ok: false, mode: 'skip', error: 'user disabled email' };
  }
  return sendEmail({ to: user.email, subject, text, html });
}

module.exports = {
  sendEmail,
  sendEmailToUser,
  getTransporter,
};
