/**
 * Test email, WhatsApp, Telegram, and AI assistant configuration.
 * Usage: node scripts/test-channels.js
 *
 * Put keys in backend/.env first.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const openAi = require('../src/services/openAiService');
const emailService = require('../src/services/emailService');
const whatsappService = require('../src/services/whatsappService');
const telegramService = require('../src/services/telegramService');
const { buildApprovalSummary } = require('../src/services/aiSummaryService');

async function main() {
  console.log('\n=== Channel & AI test ===\n');

  // Email
  console.log('[1] Email');
  console.log('  SMTP_MODE =', process.env.SMTP_MODE || '(default)');
  try {
    const to = process.env.EMAIL_TEST_TO || process.env.SMTP_USER || 'test@example.com';
    const r = await emailService.sendEmail({
      to,
      subject: 'HR Leave — test email',
      text: 'This is a test from HR Leave Manager. No action needed.',
    });
    console.log('  result:', r);
  } catch (e) {
    console.log('  FAIL:', e.message);
  }

  // WhatsApp
  console.log('\n[2] WhatsApp');
  console.log('  provider =', whatsappService.provider());
  console.log('  enabled  =', whatsappService.enabled());
  try {
    const phone = process.env.WHATSAPP_TEST_TO || '+6590000003';
    const r = await whatsappService.sendWhatsApp(
      phone,
      'HR Leave test: WhatsApp channel OK. Open http://localhost:5173'
    );
    console.log('  result:', r);
  } catch (e) {
    console.log('  FAIL:', e.message);
  }

  // Telegram
  console.log('\n[3] Telegram');
  console.log('  enabled =', telegramService.enabled());
  console.log('  token set =', Boolean(process.env.TELEGRAM_BOT_TOKEN));
  try {
    const chatId = process.env.TELEGRAM_TEST_CHAT_ID;
    if (!telegramService.enabled()) {
      console.log('  skip: set TELEGRAM_BOT_TOKEN to test real sends');
    } else if (!chatId) {
      console.log('  skip: set TELEGRAM_TEST_CHAT_ID to send a test message');
    } else {
      const r = await telegramService.sendTelegramMessage(
        chatId,
        'HR Leave test: Telegram channel OK. Open http://localhost:5173'
      );
      console.log('  result:', r);
    }
  } catch (e) {
    console.log('  FAIL:', e.message);
  }

  // AI
  console.log('\n[4] AI-3 Assistant');
  console.log('  configured =', openAi.isConfigured());
  if (openAi.isConfigured()) {
    console.log('  config =', openAi.getConfig().baseURL, openAi.getConfig().model);
  }
  try {
    const summary = await buildApprovalSummary(
      {
        leave_type: 'annual',
        days_count: 3,
        start_date: '2026-08-10',
        end_date: '2026-08-12',
        half_day_flag: false,
        status: 'pending',
        overlap_flag: true,
        special_approval_flag: true,
        applicant: { department: 'Finance', country_code: 'SG' },
      },
      { teamOnLeaveCount: 2 }
    );
    console.log('  risk_level =', summary.risk_level);
    console.log('  generated_by =', summary.generated_by);
    console.log('  recommendation =', summary.recommendation);
    console.log('  bullets:', summary.bullets);
  } catch (e) {
    console.log('  FAIL:', e.message);
  }

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
