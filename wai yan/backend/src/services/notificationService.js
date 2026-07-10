/**
 * UC-12 Notifications — multi-channel fan-out:
 *  1) In-app (notifications table) — always
 *  2) Email (Nodemailer / Ethereal / console)
 *  3) WhatsApp (Twilio / Meta / console)
 *  4) Telegram (Bot API) — optional, when user has telegram_chat_id
 *
 * Email / WhatsApp / Telegram bodies avoid sensitive PII (no full personal dossiers).
 */

const db = require('../config/db');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');
const telegramService = require('./telegramService');

function formatLeaveRange(start, end) {
  const { toDateOnly } = require('../utils/dates');
  return `${toDateOnly(start)} – ${toDateOnly(end)}`;
}

function appLink() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

/**
 * Look up a user for multi-channel delivery (includes telegram_chat_id).
 */
async function getUserForNotify(userId) {
  const r = await db.query(
    `SELECT id, name, email, phone, role,
            telegram_chat_id,
            COALESCE(notify_email, 1) AS notify_email,
            COALESCE(notify_whatsapp, 1) AS notify_whatsapp
     FROM users WHERE id = $1`,
    [userId]
  );
  return r.rows[0] || null;
}

/**
 * Send a Telegram message for a user id.
 * Safe no-op when chat id or bot token is missing; never throws.
 *
 * @param {number|string} userId
 * @param {string} message
 * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string, id?:string}>}
 */
async function sendTelegramNotification(userId, message) {
  try {
    if (!telegramService.enabled()) {
      return { ok: false, skipped: true, error: 'TELEGRAM_BOT_TOKEN missing or disabled' };
    }

    const user = await getUserForNotify(userId);
    if (!user) {
      return { ok: false, skipped: true, error: 'user not found' };
    }
    if (!user.telegram_chat_id) {
      return { ok: false, skipped: true, error: 'no telegram_chat_id' };
    }

    const result = await telegramService.sendTelegramMessage(
      user.telegram_chat_id,
      message
    );
    return result;
  } catch (err) {
    // Never log bot token; never break callers
    console.warn('[telegram] sendTelegramNotification error:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Create in-app row + optional email + WhatsApp + Telegram.
 */
async function notify(
  {
    userId,
    type,
    message,
    leaveRequestId = null,
    emailSubject = null,
    emailBody = null,
    whatsappBody = null,
    telegramBody = null,
    channels = { inApp: true, email: true, whatsapp: true, telegram: true },
  },
  client = db
) {
  let notification = null;

  if (channels.inApp !== false) {
    const result = await client.query(
      `INSERT INTO notifications (user_id, type, message, leave_request_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, type, message, leaveRequestId]
    );
    notification = result.rows[0];
  }

  // Channel fan-out after commit-safe: still fire-and-forget so workflow is not blocked
  const fanOut = async () => {
    try {
      // Prefer local lookup (includes telegram_chat_id); fall back to WhatsApp helper
      let user = null;
      try {
        user = await getUserForNotify(userId);
      } catch (colErr) {
        // Pre-migration DBs without telegram_chat_id column
        if (String(colErr.message || '').includes('telegram_chat_id')) {
          user = await whatsappService.getUserForNotify(userId);
        } else {
          throw colErr;
        }
      }
      if (!user) return;

      if (channels.email !== false && emailSubject && emailBody) {
        await emailService.sendEmailToUser(user, {
          subject: emailSubject,
          text: `${emailBody}\n\nOpen the leave system: ${appLink()}`,
          html: `<p>${emailBody}</p><p><a href="${appLink()}">Open Leave Manager</a></p>`,
        });
      }

      if (channels.whatsapp !== false) {
        const wa =
          whatsappBody ||
          `${message}\n\nOpen: ${appLink()}`;
        if (wa) {
          await whatsappService.sendWhatsAppToUser(user, wa);
        }
      }

      // Optional Telegram: only when user linked a chat id
      if (channels.telegram !== false) {
        const tg =
          telegramBody ||
          whatsappBody ||
          `${message}\n\nOpen: ${appLink()}`;
        if (tg && user.telegram_chat_id) {
          await sendTelegramNotification(userId, tg);
        }
      }
    } catch (err) {
      console.warn('[notify] channel fan-out error:', err.message);
    }
  };

  // Don't await — keep leave transactions fast
  fanOut().catch(() => {});

  return notification;
}

async function notifyLeaveSubmitted(leave, supervisorId, client = db) {
  const range = formatLeaveRange(leave.start_date, leave.end_date);
  const tg = `📋 New leave request\nType: ${leave.leave_type}\nDates: ${range}\nAction needed: supervisor review\n${appLink()}/approvals`;
  return notify(
    {
      userId: supervisorId,
      type: 'leave_submitted',
      message: `A new ${leave.leave_type} leave request (${range}) awaits your review.`,
      leaveRequestId: leave.id,
      emailSubject: 'Leave approval required',
      emailBody:
        'A new leave request requires your approval. Sign in to the leave system to review. (No personal details in this email.)',
      whatsappBody: `HR Leave: New ${leave.leave_type} leave (${range}) needs your approval. ${appLink()}/approvals`,
      telegramBody: tg,
    },
    client
  );
}

async function notifySupervisorDecision(leave, managerId, approved, client = db) {
  const range = formatLeaveRange(leave.start_date, leave.end_date);
  const tg = approved
    ? `✅ Supervisor approved\nType: ${leave.leave_type}\nDates: ${range}\nAction needed: manager decision\n${appLink()}/approvals`
    : `❌ Leave rejected (supervisor)\nType: ${leave.leave_type}\nDates: ${range}\n${appLink()}/leave`;
  return notify(
    {
      userId: managerId,
      type: approved ? 'supervisor_approved' : 'supervisor_rejected',
      message: approved
        ? `Supervisor approved a ${leave.leave_type} leave request (${range}). Awaiting manager decision.`
        : `A leave request was rejected by the supervisor (${range}).`,
      leaveRequestId: leave.id,
      emailSubject: approved
        ? 'Leave ready for manager review'
        : 'Leave rejected by supervisor',
      emailBody: approved
        ? 'A leave request has been supervisor-approved and needs manager review. Sign in to continue.'
        : 'A leave request was rejected at supervisor stage. Sign in for details.',
      whatsappBody: approved
        ? `HR Leave: Supervisor approved ${leave.leave_type} leave (${range}). Your manager decision is needed. ${appLink()}/approvals`
        : `HR Leave: A leave request (${range}) was rejected by the supervisor.`,
      telegramBody: tg,
    },
    client
  );
}

async function notifyFinalDecision(leave, employeeId, approved, client = db) {
  const range = formatLeaveRange(leave.start_date, leave.end_date);
  const reason = String(
    leave.manager_note || leave.supervisor_note || leave.rejection_note || ''
  ).trim();
  const reasonLine = reason ? ` Reason: ${reason}` : '';
  const tg = approved
    ? `✅ Leave approved\nType: ${leave.leave_type}\nDates: ${range}\n${appLink()}/leave`
    : `❌ Leave rejected\nType: ${leave.leave_type}\nDates: ${range}${reason ? `\nReason: ${reason}` : ''}\n${appLink()}/leave`;
  return notify(
    {
      userId: employeeId,
      type: approved ? 'approved' : 'rejected',
      message: approved
        ? `Your ${leave.leave_type} leave (${range}) has been approved.`
        : `Your ${leave.leave_type} leave (${range}) has been rejected.${reasonLine}`,
      leaveRequestId: leave.id,
      emailSubject: approved ? 'Leave request approved' : 'Leave request rejected',
      emailBody: approved
        ? 'Your leave request has been approved. Sign in to view details.'
        : `Your leave request has been rejected.${reasonLine} Sign in to view details.`,
      whatsappBody: approved
        ? `HR Leave: Your ${leave.leave_type} leave (${range}) was APPROVED. ${appLink()}/leave`
        : `HR Leave: Your ${leave.leave_type} leave (${range}) was REJECTED.${reasonLine} ${appLink()}/leave`,
      telegramBody: tg,
    },
    client
  );
}

async function notifyOverlapWarning(userId, leaveId, client = db) {
  return notify(
    {
      userId,
      type: 'overlap_warning',
      message: 'Your leave request overlaps with other team members on leave.',
      leaveRequestId: leaveId,
      // In-app only by default for soft warning
      channels: { inApp: true, email: false, whatsapp: false, telegram: false },
    },
    client
  );
}

async function notifyCancelPending(leave, recipientIds, client = db) {
  const range = formatLeaveRange(leave.start_date, leave.end_date);
  const tg = `⚠️ Cancellation pending\nType: ${leave.leave_type}\nDates: ${range}\nAction needed: approval\n${appLink()}/approvals`;
  const results = [];
  for (const userId of recipientIds) {
    // eslint-disable-next-line no-await-in-loop
    results.push(
      await notify(
        {
          userId,
          type: 'cancel_pending',
          message: `A cancellation request for ${leave.leave_type} leave (${range}) requires approval.`,
          leaveRequestId: leave.id,
          emailSubject: 'Leave cancellation approval required',
          emailBody:
            'A leave cancellation requires your approval. Sign in to the leave system to review.',
          whatsappBody: `HR Leave: Cancellation for ${leave.leave_type} leave (${range}) needs approval. ${appLink()}/approvals`,
          telegramBody: tg,
        },
        client
      )
    );
  }
  return results;
}

module.exports = {
  notify,
  notifyLeaveSubmitted,
  notifySupervisorDecision,
  notifyFinalDecision,
  notifyOverlapWarning,
  notifyCancelPending,
  sendTelegramNotification,
  getUserForNotify,
};
