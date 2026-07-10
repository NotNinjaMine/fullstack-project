/**
 * UC-12: 24-hour pending approval reminder.
 * Reminder ONLY — never auto-approves.
 */

const db = require('../config/db');
const notificationService = require('./notificationService');

/**
 * Find leave requests awaiting action for > 24 hours and notify the current approver.
 * Dedupes by checking if an approval_reminder was already sent in the last 24h for that request.
 */
async function sendPendingReminders() {
  // Portable datetime: works on SQLite (datetime) and Postgres (cast/timestamp)
  const isSqlite = db.driver === 'sqlite';
  const olderThan24h = isSqlite
    ? "datetime(lr.updated_at) <= datetime('now', '-24 hours')"
    : "lr.updated_at <= NOW() - INTERVAL '24 hours'";
  const notifSince24h = isSqlite
    ? "datetime(n.created_at) >= datetime('now', '-24 hours')"
    : "n.created_at >= NOW() - INTERVAL '24 hours'";

  const result = await db.query(
    `SELECT lr.id, lr.leave_type, lr.start_date, lr.end_date, lr.status,
            lr.supervisor_id, lr.manager_id, lr.supervisor_status, lr.manager_status,
            lr.updated_at
     FROM leave_requests lr
     WHERE lr.status IN ('pending', 'supervisor_approved', 'cancel_pending')
       AND ${olderThan24h}
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.leave_request_id = lr.id
           AND n.type = 'approval_reminder'
           AND ${notifSince24h}
       )
     ORDER BY lr.updated_at ASC
     LIMIT 100`
  );

  let sent = 0;

  for (const leave of result.rows) {
    let approverId = null;

    if (
      leave.status === 'pending' ||
      (leave.status === 'cancel_pending' && leave.supervisor_status === 'pending')
    ) {
      approverId = leave.supervisor_id;
    } else if (
      leave.status === 'supervisor_approved' ||
      (leave.status === 'cancel_pending' && leave.supervisor_status === 'approved')
    ) {
      approverId = leave.manager_id;
    }

    if (!approverId) continue;

    const { toDateOnly } = require('../utils/dates');
    const range = `${toDateOnly(leave.start_date)} – ${toDateOnly(leave.end_date)}`;

    // eslint-disable-next-line no-await-in-loop
    await notificationService.notify({
      userId: approverId,
      type: 'approval_reminder',
      message: `Reminder: a ${leave.leave_type} leave request (${range}) is still awaiting your action.`,
      leaveRequestId: leave.id,
      emailSubject: 'Leave approval reminder',
      emailBody:
        'A leave request has been pending your action for over 24 hours. Sign in to review. This is a reminder only — no automatic approval.',
    });

    sent += 1;
  }

  return { checked: result.rows.length, sent };
}

/**
 * Start interval job. Interval from REMINDER_INTERVAL_MS (default 1 hour).
 */
function startReminderJob() {
  const intervalMs = Number(process.env.REMINDER_INTERVAL_MS || 60 * 60 * 1000);

  const run = async () => {
    try {
      const result = await sendPendingReminders();
      if (result.sent > 0) {
        console.log(`[reminder] sent ${result.sent} reminder(s)`);
      }
    } catch (err) {
      console.error('[reminder] job failed:', err.message);
    }
  };

  // Initial delay so DB is ready after boot
  setTimeout(run, 15_000);
  const timer = setInterval(run, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  console.log(`[reminder] job scheduled every ${intervalMs}ms (never auto-approves)`);
  return timer;
}

module.exports = {
  sendPendingReminders,
  startReminderJob,
};
