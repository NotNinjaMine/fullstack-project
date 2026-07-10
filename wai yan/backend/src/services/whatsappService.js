/**
 * WhatsApp notification channel.
 * Providers (set WHATSAPP_PROVIDER):
 *  - twilio  → Twilio WhatsApp API
 *  - meta    → Meta WhatsApp Cloud API
 *  - console → log only (default when not configured)
 *
 * Phone numbers: E.164 without spaces, e.g. +6591234567
 */

const db = require('../config/db');

function provider() {
  return (process.env.WHATSAPP_PROVIDER || 'console').toLowerCase();
}

function enabled() {
  if (process.env.WHATSAPP_ENABLED === 'false') return false;
  const p = provider();
  if (p === 'console') return true; // always can log
  if (p === 'twilio') {
    return Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_WHATSAPP_FROM
    );
  }
  if (p === 'meta') {
    return Boolean(
      process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
    );
  }
  return false;
}

/**
 * Normalize to E.164-ish: digits with leading +
 */
function normalizePhone(phone) {
  if (!phone) return null;
  let p = String(phone).trim().replace(/[\s()-]/g, '');
  if (!p.startsWith('+')) {
    // assume SG if 8 digits
    if (/^\d{8}$/.test(p)) p = `+65${p}`;
    else if (/^\d{10,15}$/.test(p)) p = `+${p}`;
  }
  return /^\+\d{8,15}$/.test(p) ? p : null;
}

async function sendViaTwilio(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM; // e.g. whatsapp:+14155238886
  const toAddr = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const fromAddr = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({
    From: fromAddr,
    To: toAddr,
    Body: body,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error_message || `Twilio HTTP ${res.status}`);
  }
  return { ok: true, provider: 'twilio', id: data.sid };
}

async function sendViaMeta(to, body) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  // Meta expects digits only without +
  const toDigits = to.replace(/^\+/, '');

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toDigits,
        type: 'text',
        text: { body },
      }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error?.message || data.message || `Meta WhatsApp HTTP ${res.status}`
    );
  }
  return {
    ok: true,
    provider: 'meta',
    id: data.messages?.[0]?.id,
  };
}

/**
 * Send WhatsApp text. Never blocks workflow (caller should catch).
 */
async function sendWhatsApp(toPhone, body) {
  if (!enabled()) {
    return { ok: false, provider: 'off', error: 'whatsapp disabled' };
  }

  const to = normalizePhone(toPhone);
  if (!to) {
    return { ok: false, provider: provider(), error: 'invalid phone' };
  }

  // Keep WhatsApp short and free of extra PII
  const text = String(body).slice(0, 1500);
  const p = provider();

  if (p === 'console') {
    console.log(`[whatsapp:console] to=${to}\n${text}`);
    return { ok: true, provider: 'console' };
  }

  if (p === 'twilio') return sendViaTwilio(to, text);
  if (p === 'meta') return sendViaMeta(to, text);

  return { ok: false, provider: p, error: 'unknown provider' };
}

async function sendWhatsAppToUser(user, body) {
  if (!user) return { ok: false, error: 'no user' };
  if (user.notify_whatsapp === false || user.notify_whatsapp === 0) {
    return { ok: false, provider: 'skip', error: 'user disabled whatsapp' };
  }
  const phone = user.phone || user.mobile;
  if (!phone) {
    return { ok: false, provider: provider(), error: 'user has no phone' };
  }
  return sendWhatsApp(phone, body);
}

/**
 * Load user row for channel fan-out.
 */
async function getUserForNotify(userId) {
  // telegram_chat_id may be missing before migration — try full select first
  try {
    const r = await db.query(
      `SELECT id, name, email, phone, role, telegram_chat_id,
              COALESCE(notify_email, 1) AS notify_email,
              COALESCE(notify_whatsapp, 1) AS notify_whatsapp
       FROM users WHERE id = $1`,
      [userId]
    );
    return r.rows[0] || null;
  } catch (err) {
    if (!String(err.message || '').includes('telegram_chat_id')) throw err;
    const r = await db.query(
      `SELECT id, name, email, phone, role,
              COALESCE(notify_email, 1) AS notify_email,
              COALESCE(notify_whatsapp, 1) AS notify_whatsapp
       FROM users WHERE id = $1`,
      [userId]
    );
    return r.rows[0] || null;
  }
}

module.exports = {
  sendWhatsApp,
  sendWhatsAppToUser,
  getUserForNotify,
  normalizePhone,
  enabled,
  provider,
};
