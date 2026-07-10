const db = require('../config/db');
const { appError } = require('../middleware/errorHandler');

async function listForUser(userId, unreadOnly = false) {
  const params = [userId];
  let extra = '';
  if (unreadOnly) {
    extra = 'AND read_flag = FALSE';
  }

  const result = await db.query(
    `SELECT id, type, message, read_flag, leave_request_id, created_at
     FROM notifications
     WHERE user_id = $1 ${extra}
     ORDER BY created_at DESC
     LIMIT 100`,
    params
  );

  return result.rows;
}

async function markRead(userId, id) {
  const result = await db.query(
    `UPDATE notifications
     SET read_flag = TRUE
     WHERE id = $1 AND user_id = $2
     RETURNING id, read_flag`,
    [id, userId]
  );

  if (result.rows.length === 0) {
    throw appError('NOT_FOUND', 'Notification not found');
  }

  return result.rows[0];
}

async function markAllRead(userId) {
  const result = await db.query(
    `UPDATE notifications
     SET read_flag = TRUE
     WHERE user_id = $1 AND read_flag = FALSE
     RETURNING id`,
    [userId]
  );

  return { updated_count: result.rowCount };
}

module.exports = {
  listForUser,
  markRead,
  markAllRead,
};
