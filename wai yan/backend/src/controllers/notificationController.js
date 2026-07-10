const { success } = require('../utils/response');
const notificationQueryService = require('../services/notificationQueryService');

async function listNotifications(req, res) {
  const data = await notificationQueryService.listForUser(
    req.user.id,
    req.query.unread === 'true'
  );
  return success(res, data);
}

async function markRead(req, res) {
  const data = await notificationQueryService.markRead(
    req.user.id,
    Number(req.params.id)
  );
  return success(res, data);
}

async function markAllRead(req, res) {
  const data = await notificationQueryService.markAllRead(req.user.id);
  return success(res, data);
}

module.exports = { listNotifications, markRead, markAllRead };
