const { success } = require('../utils/response');
const leaveService = require('../services/leaveService');
const dashboardService = require('../services/dashboardService');
const aiService = require('../services/aiService');
const openAiService = require('../services/openAiService');

async function listLeave(req, res) {
  const data = await leaveService.listForUser(req.user, req.query);
  return success(res, data);
}

/**
 * ENH-4: GET /api/leave/balance
 * Raw balance + optional ai_summary (null if AI unavailable / no key).
 * Never blocks forever on AI — soft timeout.
 */
async function getLeaveBalance(req, res) {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const balance = await dashboardService.getMyBalance(req.user, year);

  let ai_summary = null;
  if (openAiService.isConfigured()) {
    try {
      const text = await Promise.race([
        aiService.summarizeLeaveBalance(balance, req.user.name),
        new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
      if (typeof text === 'string' && text.trim()) {
        ai_summary = text;
      }
    } catch {
      ai_summary = null;
    }
  }

  return success(res, {
    ...balance,
    ai_summary,
  });
}

async function createLeave(req, res) {
  // TODO AI-1: if body.nl_text present, call Member 4 parser first, then createLeave
  const data = await leaveService.createLeave(req.user, req.body);
  return success(res, data, 201);
}

async function getLeaveById(req, res) {
  const data = await leaveService.getById(req.user, Number(req.params.id));
  return success(res, data);
}

async function cancelLeave(req, res) {
  const data = await leaveService.cancelLeave(
    req.user,
    Number(req.params.id),
    req.body?.reason
  );
  return success(res, data);
}

async function checkOverlap(req, res) {
  const data = await leaveService.checkOverlap(
    req.user,
    req.query.start_date,
    req.query.end_date
  );
  return success(res, data);
}

module.exports = {
  listLeave,
  getLeaveBalance,
  createLeave,
  getLeaveById,
  cancelLeave,
  checkOverlap,
};
