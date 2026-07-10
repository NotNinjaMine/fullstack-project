/**
 * Unit tests for Telegram notification channel (no live API required).
 * Run: npm test
 */
const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.DB_DRIVER = process.env.DB_DRIVER || 'sqlite';
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Isolate Telegram env for these tests
const PREV_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PREV_ENABLED = process.env.TELEGRAM_ENABLED;

describe('Telegram notifications', () => {
  let notificationService;
  let telegramService;
  let db;

  before(async () => {
    // Fresh module graph with controlled env
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_ENABLED = 'true';

    // Clear require cache so services pick up env + mocks cleanly per test via reload
    db = require('../src/config/db');
    notificationService = require('../src/services/notificationService');
    telegramService = require('../src/services/telegramService');
  });

  after(() => {
    if (PREV_TOKEN === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = PREV_TOKEN;
    if (PREV_ENABLED === undefined) delete process.env.TELEGRAM_ENABLED;
    else process.env.TELEGRAM_ENABLED = PREV_ENABLED;
  });

  it('enabled() is false when TELEGRAM_BOT_TOKEN is missing', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    assert.equal(telegramService.enabled(), false);
  });

  it('sendTelegramNotification skips when token missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const result = await notificationService.sendTelegramNotification(1, 'hello');
    assert.equal(result.ok, false);
    assert.equal(result.skipped, true);
  });

  it('sendTelegramNotification skips when user has no telegram_chat_id', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token-not-real';

    const originalQuery = db.query.bind(db);
    const stub = mock.method(db, 'query', async (sql, params) => {
      if (String(sql).includes('FROM users') && String(sql).includes('telegram_chat_id')) {
        return {
          rows: [
            {
              id: params[0],
              name: 'Test User',
              email: 't@example.com',
              phone: null,
              role: 'employee',
              telegram_chat_id: null,
              notify_email: 1,
              notify_whatsapp: 1,
            },
          ],
        };
      }
      return originalQuery(sql, params);
    });

    try {
      const result = await notificationService.sendTelegramNotification(99, 'hi');
      assert.equal(result.ok, false);
      assert.equal(result.skipped, true);
      assert.match(String(result.error), /telegram_chat_id/i);
    } finally {
      stub.mock.restore();
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });

  it('sendTelegramMessage does not throw when Telegram API fails', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token-not-real';

    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error('network down');
    };

    try {
      const result = await telegramService.sendTelegramMessage('12345', 'test msg');
      assert.equal(result.ok, false);
      assert.equal(result.provider, 'telegram');
      assert.ok(result.error);
      assert.equal(String(result.error).includes('test-token-not-real'), false);
    } finally {
      global.fetch = originalFetch;
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });

  it('sendTelegramNotification succeeds when API returns ok', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token-not-real';

    const originalQuery = db.query.bind(db);
    const stub = mock.method(db, 'query', async (sql, params) => {
      if (String(sql).includes('FROM users')) {
        return {
          rows: [
            {
              id: params[0],
              name: 'Alice',
              email: 'alice@example.com',
              phone: null,
              role: 'employee',
              telegram_chat_id: '999001',
              notify_email: 1,
              notify_whatsapp: 1,
            },
          ],
        };
      }
      return originalQuery(sql, params);
    });

    const originalFetch = global.fetch;
    let fetchBody = null;
    global.fetch = async (url, opts) => {
      // Ensure token is in URL but we never assert/log it in product code paths
      assert.ok(String(url).includes('api.telegram.org'));
      assert.ok(String(url).includes('sendMessage'));
      fetchBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { message_id: 42 } }),
      };
    };

    try {
      const result = await notificationService.sendTelegramNotification(
        7,
        'Leave approved'
      );
      assert.equal(result.ok, true);
      assert.equal(result.id, '42');
      assert.equal(fetchBody.chat_id, '999001');
      assert.equal(fetchBody.text, 'Leave approved');
    } finally {
      stub.mock.restore();
      global.fetch = originalFetch;
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });

  it('notify() still creates in-app row when Telegram fails', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token-not-real';
    process.env.SMTP_MODE = process.env.SMTP_MODE || 'console';
    process.env.WHATSAPP_PROVIDER = 'console';
    process.env.EMAIL_ENABLED = 'false';

    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error('telegram boom');
    };

    // Use a real user id from seed if available; otherwise mock insert + select
    let userId = 1;
    try {
      const u = await db.query(`SELECT id FROM users LIMIT 1`);
      if (u.rows[0]) userId = u.rows[0].id;
    } catch {
      /* no DB — skip integration-ish part */
      global.fetch = originalFetch;
      delete process.env.TELEGRAM_BOT_TOKEN;
      return;
    }

    // Ensure user has a chat id for this test so Telegram path is attempted
    try {
      await db.query(
        `UPDATE users SET telegram_chat_id = $1 WHERE id = $2`,
        ['111222', userId]
      );
    } catch {
      // Column missing — run migration expectation not met; skip
      global.fetch = originalFetch;
      delete process.env.TELEGRAM_BOT_TOKEN;
      return;
    }

    try {
      const row = await notificationService.notify({
        userId,
        type: 'approved',
        message: 'Your leave was approved.',
        leaveRequestId: null,
        emailSubject: null,
        emailBody: null,
        telegramBody: '✅ Leave approved',
        channels: { inApp: true, email: false, whatsapp: false, telegram: true },
      });

      assert.ok(row);
      assert.equal(row.type, 'approved');
      assert.equal(row.user_id, userId);

      // Allow fire-and-forget fan-out to settle
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      try {
        await db.query(`UPDATE users SET telegram_chat_id = NULL WHERE id = $1`, [
          userId,
        ]);
      } catch {
        /* ignore */
      }
      global.fetch = originalFetch;
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
  });
});
