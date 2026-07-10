/**
 * Telegram Bot API notification channel (optional).
 * Requires TELEGRAM_BOT_TOKEN. Chat ids live on users.telegram_chat_id.
 *
 * Uses native fetch (same as whatsappService) — no token logging.
 */

function botToken() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  return t && String(t).trim() ? String(t).trim() : null;
}

function enabled() {
  if (process.env.TELEGRAM_ENABLED === 'false') return false;
  return Boolean(botToken());
}

/**
 * Send a text message via Telegram Bot API sendMessage.
 * @param {string|number} chatId
 * @param {string} text
 * @returns {Promise<{ok:boolean, provider:string, id?:string, error?:string}>}
 */
async function sendTelegramMessage(chatId, text) {
  const token = botToken();
  if (!token) {
    return { ok: false, provider: 'telegram', error: 'TELEGRAM_BOT_TOKEN missing' };
  }
  if (chatId == null || String(chatId).trim() === '') {
    return { ok: false, provider: 'telegram', error: 'no chat id' };
  }

  const body = String(text || '').slice(0, 4000);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId).trim(),
        text: body,
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const errMsg =
        data.description || data.error_code || `Telegram HTTP ${res.status}`;
      throw new Error(String(errMsg));
    }

    return {
      ok: true,
      provider: 'telegram',
      id: data.result?.message_id != null ? String(data.result.message_id) : undefined,
    };
  } catch (err) {
    // Never log the bot token
    console.warn('[telegram] send failed:', err.message);
    return { ok: false, provider: 'telegram', error: err.message };
  }
}

/**
 * Send to a user row that already includes telegram_chat_id (if any).
 */
async function sendTelegramToUser(user, text) {
  if (!user) return { ok: false, error: 'no user' };
  if (!enabled()) {
    return { ok: false, provider: 'telegram', error: 'telegram disabled or token missing' };
  }
  const chatId = user.telegram_chat_id;
  if (!chatId) {
    return { ok: false, provider: 'telegram', error: 'user has no telegram_chat_id' };
  }
  return sendTelegramMessage(chatId, text);
}

module.exports = {
  sendTelegramMessage,
  sendTelegramToUser,
  enabled,
  botToken,
};
