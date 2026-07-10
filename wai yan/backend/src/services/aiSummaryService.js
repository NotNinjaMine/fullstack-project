/**
 * AI-3: Approval Assistant
 * - Prefer OpenRouter / OpenAI when OPENAI_API_KEY is set
 * - Fall back to deterministic rule engine if AI fails or is off
 * Human approver always decides.
 */

const { toDateOnly } = require('../utils/dates');
const openAi = require('./openAiService');

function buildRuleBasedSummary(leave, { teamOnLeaveCount = 0 } = {}) {
  const bullets = [];
  let riskScore = 0;

  const days = Number(leave.days_count) || 0;
  const start = toDateOnly(leave.start_date);
  const end = toDateOnly(leave.end_date);

  bullets.push(
    `${String(leave.leave_type || 'leave').toUpperCase()} · ${days} working day(s) · ${start} → ${end}`
  );

  if (leave.half_day_flag) {
    bullets.push(`Half-day request (${leave.half_day_period || 'AM/PM'})`);
  }

  if (leave.overlap_flag || leave.special_approval_flag) {
    riskScore += 3;
    bullets.push('Team overlap / special approval flag is set — review coverage carefully');
  }

  if (teamOnLeaveCount >= 3) {
    riskScore += 2;
    bullets.push(`High concurrent leave load: ${teamOnLeaveCount} teammate(s) already on leave`);
  } else if (teamOnLeaveCount >= 1) {
    riskScore += 1;
    bullets.push(`${teamOnLeaveCount} other teammate(s) on leave in this period`);
  } else {
    bullets.push('No other overlapping team leave detected in department');
  }

  if (days >= 5) {
    riskScore += 1;
    bullets.push('Longer absence (≥5 working days) — confirm handover');
  }

  if (leave.status === 'cancel_pending') {
    riskScore += 1;
    bullets.push('This is a cancellation request (not a new leave application)');
  }

  if (leave.applicant?.department) {
    bullets.push(`Department: ${leave.applicant.department}`);
  }
  if (leave.applicant?.job_title) {
    bullets.push(`Job title: ${leave.applicant.job_title}`);
  }
  if (leave.applicant?.office_branch) {
    bullets.push(`Office branch: ${leave.applicant.office_branch}`);
  }
  if (leave.applicant?.employee_id) {
    bullets.push(`Employee ID: ${leave.applicant.employee_id}`);
  }

  let risk_level = 'low';
  if (riskScore >= 4) risk_level = 'high';
  else if (riskScore >= 2) risk_level = 'medium';

  let recommendation = 'Looks routine — approve if operational coverage is confirmed.';
  if (risk_level === 'high') {
    recommendation =
      'Elevated risk — confirm staffing and consider speaking with the team before approving.';
  } else if (risk_level === 'medium') {
    recommendation = 'Moderate risk — check overlap and team capacity before deciding.';
  }
  if (leave.status === 'cancel_pending') {
    recommendation =
      'Cancellation request — verify whether balance restoration applies (only if originally fully approved).';
  }

  return {
    risk_level,
    risk_score: riskScore,
    bullets,
    recommendation,
    team_on_leave_count: teamOnLeaveCount,
    decision_required: true,
    assistant_note: 'AI-3 assistant is advisory only. The human approver decides.',
    generated_by: 'rule_engine_v1',
  };
}

/**
 * OpenRouter / OpenAI structured summary.
 * No personal contact details sent to the model (PII-safe).
 */
async function buildLlmSummary(leave, { teamOnLeaveCount = 0 } = {}) {
  const payload = {
    leave_type: leave.leave_type,
    days_count: Number(leave.days_count) || 0,
    start_date: toDateOnly(leave.start_date),
    end_date: toDateOnly(leave.end_date),
    half_day: Boolean(leave.half_day_flag),
    half_day_period: leave.half_day_period || null,
    status: leave.status,
    overlap_flag: Boolean(leave.overlap_flag),
    special_approval_flag: Boolean(leave.special_approval_flag),
    department: leave.applicant?.department || null,
    job_title: leave.applicant?.job_title || null,
    office_branch: leave.applicant?.office_branch || null,
    office_country: leave.applicant?.office_country || null,
    country_code: leave.applicant?.country_code || null,
    team_on_leave_count: teamOnLeaveCount,
  };

  const system = `You are AI-3 Approval Assistant for an HR leave system.
Return ONLY valid JSON with keys:
  risk_level: "low" | "medium" | "high"
  risk_score: number 0-10
  bullets: string[] (3-6 short factual bullets)
  recommendation: string (one sentence for the human approver)
Do not invent employee names or personal contact details.
Be concise and operational. Human must make the final decision.`;

  const user = `Summarize this leave request for an approver:\n${JSON.stringify(payload, null, 2)}`;

  const result = await openAi.chatCompletion({
    system,
    user,
    temperature: 0.2,
    max_tokens: 400,
  });

  const parsed = openAi.parseJsonContent(result.content);
  const risk = ['low', 'medium', 'high'].includes(parsed.risk_level)
    ? parsed.risk_level
    : 'medium';

  return {
    risk_level: risk,
    risk_score: Number(parsed.risk_score) || 0,
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 8) : [],
    recommendation:
      parsed.recommendation ||
      'Review coverage and decide as the human approver.',
    team_on_leave_count: teamOnLeaveCount,
    decision_required: true,
    assistant_note: 'AI-3 assistant is advisory only. The human approver decides.',
    generated_by: result.model || 'openai',
    provider: 'openrouter_openai',
  };
}

/**
 * Public API — async. Uses LLM when configured, else rules.
 */
async function buildApprovalSummary(leave, opts = {}) {
  const useAi =
    process.env.AI_ASSISTANT_ENABLED !== 'false' && openAi.isConfigured();

  if (useAi) {
    try {
      return await buildLlmSummary(leave, opts);
    } catch (err) {
      console.warn('[AI-3] LLM summary failed, using rules:', err.message);
      const fallback = buildRuleBasedSummary(leave, opts);
      fallback.fallback_reason = err.message;
      fallback.generated_by = 'rule_engine_v1_fallback';
      return fallback;
    }
  }

  return buildRuleBasedSummary(leave, opts);
}

// Sync alias for any legacy callers
function buildApprovalSummarySync(leave, opts) {
  return buildRuleBasedSummary(leave, opts);
}

module.exports = {
  buildApprovalSummary,
  buildApprovalSummarySync,
  buildRuleBasedSummary,
};
