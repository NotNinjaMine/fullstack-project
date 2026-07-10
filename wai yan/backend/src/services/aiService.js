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
 * Soft rewrite of employee remarks as professional leave-note bodies.
 * Accepts optional form context so options can name leave type, dates, and duration.
 * @param {string} remarks
 * @param {object} [context]
 * @param {string} [context.leaveType]
 * @param {string} [context.startDate]
 * @param {string} [context.endDate]
 * @param {number|string} [context.workingDays]
 * @param {boolean} [context.halfDay]
 * @returns {Promise<string[]>}
 */
async function improveRemarks(remarks, context = {}) {
  const fallback = String(remarks || '').trim();
  if (!fallback) {
    return ['Please add a brief reason for your leave request.'];
  }

  const leaveType = context.leaveType != null ? String(context.leaveType).trim() : '';
  const startDate = context.startDate != null ? String(context.startDate).trim() : '';
  const endDate = context.endDate != null ? String(context.endDate).trim() : '';
  const workingDays =
    context.workingDays != null && context.workingDays !== ''
      ? String(context.workingDays).trim()
      : '';
  const halfDay = Boolean(context.halfDay);

  const contextLines = [];
  if (leaveType) contextLines.push(`- leave type: ${leaveType}`);
  if (startDate) contextLines.push(`- start date: ${startDate}`);
  if (endDate) contextLines.push(`- end date: ${endDate}`);
  if (workingDays) contextLines.push(`- working days: ${workingDays}`);
  if (halfDay) contextLines.push('- half day: yes');
  const contextBlock = contextLines.length
    ? `Leave form context (use when provided):\n${contextLines.join('\n')}\n\n`
    : '';

  try {
    const raw = await chatText({
      temperature: 0.5,
      max_tokens: 220,
      system: `You write the BODY of a professional workplace leave note for a leave-request form / short message to a supervisor — NOT a full email.

Output rules:
- Output ONLY a JSON array of exactly 3 strings. No markdown, no commentary, no numbering outside the JSON.
- Each string is message-body text only: no subject line, no greeting ("Dear…", "Hi…", "I hope this finds you well"), no sign-off or name ("Best regards", "Thanks,", "Sincerely").
- Do not open with stiff email scaffolding ("I am writing to inform you", "Please be advised"). Start with the leave request itself.
- Write like real workplace leave remarks: direct, courteous, natural first person.

Content rules:
- State leave type and exact dates/duration naturally when context provides them (e.g. sick leave from 11–13 July for 3 working days). Prefer human-readable dates.
- Keep the reason brief and professional. Do NOT invent details the user did not give (no fake illnesses, diagnoses, appointments, or colleague names). If the note is vague, keep the reason general ("due to personal reasons", "a family matter", "I am unwell").
- Warm but not heavy — avoid overwrought phrasing like "I regret to inform you" for routine short leave.
- End with a light courteous close (e.g. thanking them for considering the request), but no signature block.

Return THREE variations that differ by PURPOSE, not just rewording:
1) Concise & direct — one or two sentences, essentials only.
2) Courteous & standard — polite, a touch warmer, thanks for consideration.
3) Fuller & considerate — same facts plus a brief neutral handover/coverage offer only (e.g. "I'll ensure my tasks are handed over before I'm away"). Never invent a colleague's name.`,
      user: `${contextBlock}Employee's rough remarks:\n"""${String(remarks).slice(0, 400)}"""\n\nReturn a JSON array of exactly 3 distinct leave-note body strings as specified.`,
    });

    let parsed;
    try {
      parsed = openAi.parseJsonContent(raw);
    } catch {
      // Model returned plain text — treat as a single option
      parsed = null;
    }

    if (Array.isArray(parsed)) {
      const options = parsed
        .map((s) => (typeof s === 'string' ? s.trim() : String(s || '').trim()))
        .filter(Boolean)
        .slice(0, 3);
      if (options.length) return options;
    }

    // Fallback: strip common wrappers and use the whole response as one string
    const single = String(raw || '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return single ? [single] : [fallback];
  } catch (err) {
    console.warn('[aiService] improveRemarks:', err.message);
    return [fallback];
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
