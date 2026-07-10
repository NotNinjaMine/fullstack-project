const { success } = require('../utils/response');
const { appError } = require('../middleware/errorHandler');
const aiService = require('../services/aiService');
const dashboardService = require('../services/dashboardService');
const leaveService = require('../services/leaveService');

/** GET /api/ai/balance-summary */
async function balanceSummary(req, res) {
  const balance = await dashboardService.getMyBalance(req.user);
  const text = await aiService.summarizeLeaveBalance(balance, req.user.name);
  return success(res, { summary: text, balance });
}

/** POST /api/ai/explain-status { leave_id } or leave object fields */
async function explainStatus(req, res) {
  let leave = req.body?.leave || null;
  if (req.body?.leave_id) {
    leave = await leaveService.getById(req.user, Number(req.body.leave_id));
  }
  if (!leave) {
    throw appError('VALIDATION_ERROR', 'leave_id or leave object is required');
  }
  const text = await aiService.explainLeaveStatus(leave, req.user.name);
  return success(res, { explanation: text });
}

/** POST /api/ai/draft-note { leave, action: 'approve'|'reject' } */
async function draftNote(req, res) {
  const action = req.body?.action === 'reject' ? 'reject' : 'approve';
  const leave = req.body?.leave;
  if (!leave || !leave.id) {
    throw appError('VALIDATION_ERROR', 'leave object with id is required');
  }
  const note = await aiService.draftApproverNote(leave, action);
  return success(res, { note, action });
}

/** POST /api/ai/parse-leave { text } — AI-1 natural language */
async function parseLeave(req, res) {
  const text = req.body?.text;
  if (!text || !String(text).trim()) {
    throw appError('VALIDATION_ERROR', 'text is required');
  }
  const parsed = await aiService.parseNaturalLanguageLeave(String(text).trim());
  return success(res, parsed);
}

/** GET /api/ai/coverage-brief?start_date=&end_date= */
async function coverageBrief(req, res) {
  const away = await dashboardService.getWhosAway(req.user, req.query);
  const brief = await aiService.summarizeTeamCoverage(away.people, {
    start_date: away.start_date,
    end_date: away.end_date,
  });
  return success(res, {
    brief,
    range: { start_date: away.start_date, end_date: away.end_date },
    people_count: away.people.length,
  });
}

/** POST /api/ai/leave-tips { leave_type, start_date, ... } */
async function leaveTips(req, res) {
  const balance = await dashboardService.getMyBalance(req.user);
  const tips = await aiService.suggestLeaveTips({
    ...(req.body || {}),
    annual_balance: balance.annual_balance,
    sick_balance: balance.sick_balance,
    country_code: req.user.country_code,
  });
  return success(res, { tips });
}

/** POST /api/ai/policy-qa { question } */
async function policyQa(req, res) {
  const question = req.body?.question;
  if (!question || !String(question).trim()) {
    throw appError('VALIDATION_ERROR', 'question is required');
  }
  const balance = await dashboardService.getMyBalance(req.user);
  const answer = await aiService.answerPolicyQuestion(String(question).trim(), {
    country_code: req.user.country_code,
    annual_balance: balance.annual_balance,
    sick_balance: balance.sick_balance,
  });
  return success(res, { answer });
}

/** POST /api/ai/improve-remarks { remarks, leaveType?, startDate?, endDate?, workingDays?, halfDay? } → { suggestions: string[] } */
async function improveRemarks(req, res) {
  const body = req.body || {};
  const remarks = body.remarks ?? '';
  const context = {
    leaveType: body.leaveType ?? body.leave_type,
    startDate: body.startDate ?? body.start_date,
    endDate: body.endDate ?? body.end_date,
    workingDays: body.workingDays ?? body.working_days,
    halfDay: body.halfDay ?? body.half_day,
  };
  const suggestions = await aiService.improveRemarks(remarks, context);
  const list = Array.isArray(suggestions) ? suggestions : [String(suggestions || '')].filter(Boolean);
  return success(res, { suggestions: list });
}

module.exports = {
  balanceSummary,
  explainStatus,
  draftNote,
  parseLeave,
  coverageBrief,
  leaveTips,
  policyQa,
  improveRemarks,
};
