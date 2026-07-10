/**
 * AI features for leave workflow (OpenRouter / OpenAI-compatible).
 * All helpers fail soft with friendly fallbacks — never break core flows.
 */

const openAi = require('./openAiService');

const FALLBACKS = {
  balance: 'Unable to generate balance summary at the moment.',
  status: 'Unable to explain this leave status right now.',
  note: 'Unable to draft a note right now. Please write your own comment.',
  parse: null, // special: return structured nulls
  coverage: 'Unable to generate a coverage brief at the moment.',
  tips: 'Unable to generate leave tips right now. Choose dates carefully and check your balance.',
  policy: 'Unable to answer that policy question right now. Please contact HR.',
};

async function chatText({ system, user, temperature = 0.3, max_tokens = 150 }) {
  const result = await openAi.chatCompletion({
    system,
    user,
    temperature,
    max_tokens,
  });
  const text = String(result.content || '').trim();
  if (!text) throw new Error('Empty AI response');
  return text;
}

/**
 * Friendly 2–3 sentence leave balance summary.
 * @param {object} userBalance
 * @param {string} userName
 */
async function summarizeLeaveBalance(userBalance, userName) {
  try {
    const balance = userBalance || {};
    const name = userName || 'This employee';

    return await chatText({
      temperature: 0.3,
      max_tokens: 100,
      system: `You write short, friendly, professional HR leave balance summaries.
Rules: exactly 2–3 sentences; use the name; do not invent numbers; no markdown.`,
      user: `Write a leave balance summary for ${name}:
- annual_balance: ${balance.annual_balance}
- annual_entitlement: ${balance.annual_entitlement}
- carried_forward: ${balance.carried_forward}
- sick_balance: ${balance.sick_balance}

Example style:
"Alice has 12.5 days of annual leave remaining out of 14 days entitlement. She also carried forward 3 days from last year. Her sick leave balance is currently at 10 days."`,
    });
  } catch (err) {
    console.warn('[aiService] summarizeLeaveBalance:', err.message);
    return FALLBACKS.balance;
  }
}

/**
 * Explain a leave request status in plain language for the employee.
 */
async function explainLeaveStatus(leaveRequest, userName) {
  try {
    const lr = leaveRequest || {};
    return await chatText({
      temperature: 0.3,
      max_tokens: 120,
      system: `You explain leave request status to employees in clear, calm HR language.
2–3 sentences. No markdown. Do not invent approvals that did not happen.`,
      user: `Explain this leave request status to ${userName || 'the employee'}:
- leave_type: ${lr.leave_type}
- status: ${lr.status}
- supervisor_status: ${lr.supervisor_status}
- manager_status: ${lr.manager_status}
- start_date: ${lr.start_date}
- end_date: ${lr.end_date}
- days_count: ${lr.days_count}
- half_day: ${lr.half_day_flag}
- overlap_flag: ${lr.overlap_flag}`,
    });
  } catch (err) {
    console.warn('[aiService] explainLeaveStatus:', err.message);
    return FALLBACKS.status;
  }
}

/**
 * Draft an approver note (approve or reject).
 * @param {'approve'|'reject'} action
 */
async function draftApproverNote(leaveRequest, action = 'approve') {
  try {
    const lr = leaveRequest || {};
    const act = action === 'reject' ? 'reject' : 'approve';
    return await chatText({
      temperature: 0.35,
      max_tokens: 80,
      system: `You draft short professional notes for leave approvers.
1–2 sentences only. No markdown. Sound fair and specific. Do not invent facts.`,
      user: `Draft a ${act} note for this leave request:
- leave_type: ${lr.leave_type}
- days_count: ${lr.days_count}
- dates: ${lr.start_date} to ${lr.end_date}
- overlap_flag: ${lr.overlap_flag}
- special_approval_flag: ${lr.special_approval_flag}
- team_on_leave_count: ${lr.team_on_leave_count}
- status: ${lr.status}
- awaiting_role: ${lr.awaiting_role}`,
    });
  } catch (err) {
    console.warn('[aiService] draftApproverNote:', err.message);
    return FALLBACKS.note;
  }
}

/**
 * AI-1 style: parse natural language into structured leave fields.
 * Returns object or nulls with fallback when AI fails.
 */
async function parseNaturalLanguageLeave(text, { today } = {}) {
  const fallback = {
    leave_type: null,
    start_date: null,
    end_date: null,
    half_day_flag: false,
    half_day_period: null,
    remarks: text || null,
    confidence: 0,
    parse_notes: 'Unable to parse leave request with AI. Please fill the form manually.',
  };

  try {
    const todayStr = today || new Date().toISOString().slice(0, 10);
    const raw = await chatText({
      temperature: 0.2,
      max_tokens: 200,
      system: `You extract structured leave request fields from natural language.
Return ONLY valid JSON (no markdown) with keys:
leave_type: "annual"|"sick"|"unpaid"|"other"|null
start_date: YYYY-MM-DD|null
end_date: YYYY-MM-DD|null
half_day_flag: boolean
half_day_period: "AM"|"PM"|null
remarks: string|null
confidence: number 0-1
parse_notes: short string
If ambiguous, set fields null and lower confidence. Use today=${todayStr} for relative dates like "next Monday".`,
      user: `Parse this leave request:\n"""${String(text || '').slice(0, 500)}"""`,
    });

    const parsed = openAi.parseJsonContent(raw);
    const types = new Set(['annual', 'sick', 'unpaid', 'other']);
    return {
      leave_type: types.has(parsed.leave_type) ? parsed.leave_type : null,
      start_date: parsed.start_date || null,
      end_date: parsed.end_date || parsed.start_date || null,
      half_day_flag: Boolean(parsed.half_day_flag),
      half_day_period:
        parsed.half_day_period === 'AM' || parsed.half_day_period === 'PM'
          ? parsed.half_day_period
          : null,
      remarks: parsed.remarks || text || null,
      confidence: Number(parsed.confidence) || 0,
      parse_notes: parsed.parse_notes || null,
    };
  } catch (err) {
    console.warn('[aiService] parseNaturalLanguageLeave:', err.message);
    return fallback;
  }
}

/**
 * Short team coverage brief for managers (who's away + risks).
 */
async function summarizeTeamCoverage(people, range = {}) {
  try {
    const list = Array.isArray(people) ? people.slice(0, 20) : [];
    return await chatText({
      temperature: 0.3,
      max_tokens: 140,
      system: `You are an HR operations assistant. Write a 2–3 sentence coverage brief for a manager.
Be practical. Mention count of people away, any overlaps if obvious, and one planning tip.
No markdown. Do not invent people not in the list.`,
      user: `Date range: ${range.start_date || '?'} to ${range.end_date || '?'}
People away (JSON): ${JSON.stringify(list)}`,
    });
  } catch (err) {
    console.warn('[aiService] summarizeTeamCoverage:', err.message);
    return FALLBACKS.coverage;
  }
}

/**
 * Tips before applying leave (balance + dates context).
 */
async function suggestLeaveTips(context = {}) {
  try {
    return await chatText({
      temperature: 0.4,
      max_tokens: 120,
      system: `Give 2–3 short practical tips for an employee applying for leave.
Friendly professional tone. No markdown lists if possible; short paragraphs or numbered 1) 2) 3).
Do not invent company policies beyond provided context.`,
      user: `Context JSON: ${JSON.stringify({
        leave_type: context.leave_type,
        start_date: context.start_date,
        end_date: context.end_date,
        half_day_flag: context.half_day_flag,
        annual_balance: context.annual_balance,
        sick_balance: context.sick_balance,
        has_overlap: context.has_overlap,
        country_code: context.country_code,
      })}`,
    });
  } catch (err) {
    console.warn('[aiService] suggestLeaveTips:', err.message);
    return FALLBACKS.tips;
  }
}

/**
 * Answer a simple leave-policy question with grounded context.
 */
async function answerPolicyQuestion(question, context = {}) {
  try {
    return await chatText({
      temperature: 0.3,
      max_tokens: 160,
      system: `You answer employee leave questions for an internal HR leave system.
Be accurate to the provided context only. If unknown, say to contact HR.
2–4 short sentences. No markdown.`,
      user: `Question: ${question}

System context (may be partial):
- Two-tier approval: supervisor then manager (no auto-approve)
- Balance deducted only on final manager approval
- Half-day must be single calendar day
- Weekends/public holidays excluded from days_count
- User country: ${context.country_code || 'unknown'}
- Annual balance: ${context.annual_balance ?? 'unknown'}
- Sick balance: ${context.sick_balance ?? 'unknown'}`,
    });
  } catch (err) {
    console.warn('[aiService] answerPolicyQuestion:', err.message);
    return FALLBACKS.policy;
  }
}

/**
 * Soft rewrite of employee remarks (professional tone).
 */
async function improveRemarks(remarks) {
  const fallback = remarks || '';
  if (!String(remarks || '').trim()) {
    return 'Please add a brief reason for your leave request.';
  }
  try {
    return await chatText({
      temperature: 0.4,
      max_tokens: 80,
      system: `Rewrite leave remarks to be brief, professional, and polite. 1–2 sentences. Keep original meaning. No markdown.`,
      user: `Rewrite:\n"""${String(remarks).slice(0, 400)}"""`,
    });
  } catch (err) {
    console.warn('[aiService] improveRemarks:', err.message);
    return fallback;
  }
}

module.exports = {
  summarizeLeaveBalance,
  explainLeaveStatus,
  draftApproverNote,
  parseNaturalLanguageLeave,
  summarizeTeamCoverage,
  suggestLeaveTips,
  answerPolicyQuestion,
  improveRemarks,
};
