// AI-1 Natural-Language Leave Application (+ improve-remarks helper).
//
// Provider resolution (first match wins):
//   1. OPENAI_API_KEY  — OpenAI-compatible API (OpenRouter, OpenAI, etc.)
//      uses OPENAI_BASE_URL (default OpenAI) and OPENAI_MODEL
//   2. ANTHROPIC_API_KEY — legacy Anthropic Messages API
//   3. Heuristic fallback — offline demo, no key required
//
// Both LLM paths return the same parse shape:
// { leaveType, startDate, endDate, halfDay, reason, confidence, source }
require('dotenv').config();
const llmClient = require('./llmClient');

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const toISO = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };

const nextWeekday = (base, targetIdx) => {
    const d = new Date(base);
    do { d.setDate(d.getDate() + 1); } while (d.getDay() !== targetIdx);
    return d;
};

const MONTH_RE = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";

const WORD_NUMBERS = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10
};

const monthIdxOf = (name) => MONTHS.indexOf(String(name).toLowerCase().slice(0, 3));

// Resolve a day+month with no year. Default to the current year; only roll into
// next year when that date is well in the past (>31 days), so retroactive sick
// leave ("I was out on 5 Aug", filed on the 10th) still lands in this year.
const resolveMonthDay = (day, monIdx, today) => {
    if (monIdx < 0 || !day) return null;
    const candidate = new Date(today.getFullYear(), monIdx, day);
    const daysBefore = Math.round((today - candidate) / 86400000);
    if (daysBefore > 31) return new Date(today.getFullYear() + 1, monIdx, day);
    return candidate;
};

/**
 * First explicit calendar date in a string. Understands:
 *   2026-08-20 · 20 Aug · Aug 20 · 20/8 · 20/08/2026
 * Returns { date, explicit: true } or null. dd/mm order (Singapore), not mm/dd.
 */
const parseExplicitDate = (text, today = new Date()) => {
    const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

    const dayMonth = text.match(new RegExp("(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*(?:of\\s+)?" + MONTH_RE, "i"));
    if (dayMonth) {
        const mon = dayMonth[0].match(new RegExp(MONTH_RE, "i"))[0];
        const d = resolveMonthDay(Number(dayMonth[1]), monthIdxOf(mon), today);
        if (d) return d;
    }
    const monthDay = text.match(new RegExp(MONTH_RE + "\\s*(\\d{1,2})", "i"));
    if (monthDay) {
        const mon = monthDay[0].match(new RegExp(MONTH_RE, "i"))[0];
        const d = resolveMonthDay(Number(monthDay[1]), monthIdxOf(mon), today);
        if (d) return d;
    }
    // 20/8 or 20/08/2026 — day first
    const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (slash) {
        const day = Number(slash[1]);
        const monIdx = Number(slash[2]) - 1;
        if (slash[3]) {
            const y = Number(slash[3]);
            return new Date(y < 100 ? 2000 + y : y, monIdx, day);
        }
        const d = resolveMonthDay(day, monIdx, today);
        if (d) return d;
    }
    return null;
};

/** Relative day references: today / tomorrow / next Monday / this Friday / Friday. */
const parseRelativeDate = (text, today) => {
    if (/\bday after tomorrow\b/.test(text)) return addDays(today, 2);
    if (/\btoday\b|\btonight\b|\bthis morning\b|\bthis afternoon\b/.test(text)) return new Date(today);
    if (/\btomorrow\b|\btmr\b|\btmrw\b/.test(text)) return addDays(today, 1);
    if (/\byesterday\b/.test(text)) return addDays(today, -1);
    const wd = text.match(/\b(?:next|this|coming|on)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (wd) return nextWeekday(today, WEEKDAYS.indexOf(wd[1]));
    return null;
};

/** Monday of next week (used by "next week" / "a week off next week"). */
const nextMonday = (today) => nextWeekday(today, 1);

/**
 * AI-1 offline parser: plain English -> structured leave fields.
 * Runs entirely on the server with no API key, and is also the fallback whenever
 * the hosted LLM is unreachable. Deliberately conservative: when a signal is
 * missing it lowers `confidence` rather than inventing a value, because the
 * employee reviews every field before submitting.
 */
const heuristicParse = (raw, today = new Date()) => {
    const text = String(raw || "").toLowerCase();
    const out = {
        leaveType: "annual",
        startDate: null,
        endDate: null,
        halfDay: false,
        halfDayPeriod: null,
        reason: "",
        confidence: 0.35
    };

    /* ---------- 1. leave type ---------- */
    // Illness wording, deliberately excluding dental/optical: an elective dental
    // visit is treated as personal (annual) leave unless illness words appear too.
    const ILLNESS = /\b(sick|unwell|not\s+(?:feeling\s+)?well|ill|illness|fever|flu|cough|covid|mc|medical|migraine|headache|food\s+poisoning|stomach|diarrh\w*|vomit\w*|nausea|hospital|clinic|doctor|gp|specialist|physio|down\s+with|under\s+the\s+weather)\b/;
    const HAS_MC = /\b(mc|m\.c\.|medical\s+cert\w*|doctor'?s?\s+(?:note|letter|memo)|medical\s+(?:note|letter)|hospital\s+letter)\b/;
    // "no MC", "without an MC", "didn't get an MC" must win over the bare word "mc".
    const NO_MC = /\b(?:no|without|dont|don'?t|didn'?t|couldn'?t|cannot|can'?t|not)\b[^.!?]{0,24}\b(?:mc|m\.c\.|medical\s+cert\w*)\b/;

    const illness = ILLNESS.test(text);
    let typeSignal = false;
    if (illness) {
        typeSignal = true;
        out.leaveType = NO_MC.test(text) ? "sick_nomc" : HAS_MC.test(text) ? "sick_mc" : "sick_nomc";
    }
    // An explicit "annual leave" / "vacation" beats a stray illness word.
    if (/\b(annual\s+leave|vacation|holiday\s+leave|personal\s+leave|time\s+off)\b/.test(text)) {
        out.leaveType = "annual";
        typeSignal = true;
    }
    // Dental/optical alone stays annual (elective personal appointment).
    if (/\b(dental|dentist|optical|optometrist|braces)\b/.test(text) &&
        !/\b(sick|unwell|not\s+well|ill|fever|flu|surgery|emergency)\b/.test(text)) {
        out.leaveType = "annual";
        typeSignal = true;
    }

    /* ---------- 2. half day ---------- */
    // "am"/"pm" only *choose the half* — they never trigger one, otherwise the
    // "am" in "I am unwell" would silently halve the request.
    const halfTrigger =
        /\bhalf[-\s]?day\b/.test(text) ||
        /\bhalf\s+(?:a\s+)?day\b/.test(text) ||
        /\b(first|second)\s+half\b/.test(text) ||
        /\b(morning|afternoon)\s+(?:off|leave|only)\b/.test(text) ||
        /\b(?:off|leave|out)\s+(?:in|for)\s+the\s+(morning|afternoon)\b/.test(text) ||
        // "leave this afternoon", "out tomorrow morning" — the half is named after
        // the verb rather than before it.
        /\b(?:off|leave|out|away)\b[^.!?]{0,18}\b(morning|afternoon)\b/.test(text) ||
        /\bhalf\b/.test(text);
    if (halfTrigger) {
        out.halfDay = true;
        out.halfDayPeriod = /\bafternoon\b|\bpm\b|\bp\.m\.|second\s+half/.test(text) ? "PM" : "AM";
    }

    /* ---------- 3. dates ---------- */
    let start = null, end = null, explicitDate = false;

    // (a) "20-24 Aug" — one month, two days
    const sameMonth = text.match(
        new RegExp("(\\d{1,2})\\s*(?:-|–|to|till|until|through)\\s*(\\d{1,2})\\s*(?:of\\s+)?(" + MONTH_RE + ")", "i")
    );
    if (sameMonth) {
        const monIdx = monthIdxOf(sameMonth[3]);
        start = resolveMonthDay(Number(sameMonth[1]), monIdx, today);
        end = resolveMonthDay(Number(sameMonth[2]), monIdx, today);
        explicitDate = true;
    }

    // (b) "<something> to <something>" — split and parse each side. "and" is tried
    // too, so "out today and tomorrow" becomes a two-day range; a split whose
    // sides do not both hold a date is simply ignored ("I am sick and need leave").
    if (!start) {
        for (const sep of [/\s(?:to|till|until|through|[-–])\s|\s*(?:–|—)\s*/, /\sand\s/]) {
            const parts = text.split(sep);
            if (parts.length < 2) continue;
            const left = parseExplicitDate(parts[0], today) || parseRelativeDate(parts[0], today);
            const right = parseExplicitDate(parts[1], today) || parseRelativeDate(parts[1], today);
            if (left && right && right >= left) {
                start = left;
                end = right;
                explicitDate = !!(parseExplicitDate(parts[0], today) && parseExplicitDate(parts[1], today));
                break;
            }
        }
    }

    // (c) single date — explicit first, then relative
    if (!start) {
        const exp = parseExplicitDate(text, today);
        if (exp) { start = exp; explicitDate = true; }
        else if (/\bnext week\b/.test(text)) {
            start = nextMonday(today);
            end = addDays(start, 4);              // Mon–Fri
        } else {
            const rel = parseRelativeDate(text, today);
            if (rel) start = rel;
        }
    }

    // (d) duration: "for 3 days", "3 days off", "take two days", "a week off"
    const durationDays = () => {
        const digits = text.match(/\b(\d{1,2})\s*(?:working\s+|business\s+)?days?\b/);
        const words = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:working\s+|business\s+)?days?\b/);
        if (digits) return Number(digits[1]);
        if (words) return WORD_NUMBERS[words[1]];
        if (/\b(?:a|one)\s+week\b/.test(text)) return 5;
        if (/\btwo\s+weeks\b|\bfortnight\b/.test(text)) return 10;
        return null;
    };

    // Illness with a duration but no date ("flu, need 2 days") starts today —
    // sick leave is reported as it happens. Annual leave is never assumed.
    if (!start && illness && durationDays()) start = new Date(today);

    if (start && !end) {
        const n = durationDays();
        if (n && n > 1) end = addDays(start, n - 1);
    }

    if (start && !end) end = new Date(start);
    if (start) out.startDate = toISO(start);
    if (end) out.endDate = toISO(end);
    // A range cannot be a half day (server enforces this too).
    if (out.startDate && out.endDate && out.startDate !== out.endDate) {
        out.halfDay = false;
        out.halfDayPeriod = null;
    }

    /* ---------- 4. reason ---------- */
    // Prefer an explicit clause; ignore a "for ..." that is really a duration.
    const clause =
        raw.match(/\b(?:because|due to|as i|since i)\s+(.+)$/i) ||
        raw.match(/\b(?:to attend|attending|for)\s+(?:a\s+|an\s+|my\s+)?(.+)$/i);
    let reason = clause ? clause[1].trim() : "";
    if (/^\d|\bdays?\b\s*$/i.test(reason)) reason = "";          // "3 days", "2 days"
    if (!reason) reason = String(raw).trim();
    out.reason = reason.replace(/\s+/g, " ").replace(/[.\s]+$/, "").slice(0, 120);

    /* ---------- 5. confidence ---------- */
    // Reflects how much was actually recognised, so the UI can warn the employee.
    let confidence = 0.35;
    if (out.startDate) confidence = explicitDate ? 0.9 : 0.8;
    if (out.startDate && out.endDate && out.startDate !== out.endDate) confidence += 0.03;
    confidence += typeSignal ? 0.05 : -0.05;
    out.confidence = Math.round(Math.max(0.2, Math.min(0.97, confidence)) * 100) / 100;

    return out;
};

/**
 * Offline multi-segment parse. Splits on the connectors people actually use
 * ("then", "also", ";") and parses each piece; pieces without a date are
 * discarded. Falls back to a single whole-sentence parse.
 */
const heuristicParseMany = (raw, today = new Date()) => {
    const text = String(raw || "");
    const pieces = text
        .split(/\bthen\b|\balso\b|;|(?:,\s*(?=and\s+(?:a\s+)?half))/i)
        .map((p) => p.trim())
        .filter((p) => p.length > 2);

    if (pieces.length > 1) {
        const parsed = pieces.map((p) => heuristicParse(p, today)).filter((r) => r.startDate);
        // Only treat it as multi-request when the pieces describe different days.
        const distinct = new Set(parsed.map((r) => r.startDate + "|" + r.endDate + "|" + r.halfDayPeriod));
        if (parsed.length > 1 && distinct.size > 1) return parsed.slice(0, MAX_REQUESTS);
    }
    return [heuristicParse(text, today)];
};

/** Resolve OpenAI-compatible key (OpenRouter keys often documented as OPENROUTER_API_KEY). */
const getOpenAiApiKey = () => {
    const k = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || "";
    return String(k).trim();
};

/** True when a hosted LLM key is configured (OpenRouter / OpenAI / Anthropic). */
const isLlmConfigured = () => llmClient.isConfigured();

const llmProviderStatus = () => llmClient.providerStatus();

const extractJsonObject = (text) => {
    if (!text) throw new Error("Empty LLM response");
    const clean = String(text).replace(/```json|```/g, "").trim();
    try {
        return JSON.parse(clean);
    } catch (_) {
        const m = clean.match(/\{[\s\S]*\}/);
        if (!m) throw new Error("No JSON object in LLM response");
        return JSON.parse(m[0]);
    }
};

const normalizeParseResult = (obj) => {
    const allowed = new Set(["annual", "sick_mc", "sick_nomc"]);
    const leaveType = allowed.has(obj.leaveType) ? obj.leaveType : "annual";
    const startDate = obj.startDate && /^\d{4}-\d{2}-\d{2}$/.test(obj.startDate) ? obj.startDate : null;
    let endDate = obj.endDate && /^\d{4}-\d{2}-\d{2}$/.test(obj.endDate) ? obj.endDate : null;
    if (startDate && !endDate) endDate = startDate;
    if (startDate && endDate && endDate < startDate) endDate = startDate;
    let halfDay = !!obj.halfDay && !!startDate && !!endDate && startDate === endDate;
    let halfDayPeriod = null;
    if (halfDay) {
        const p = String(obj.halfDayPeriod || "").toUpperCase();
        halfDayPeriod = p === "PM" ? "PM" : "AM";
    }
    const reason = String(obj.reason || "").trim().slice(0, 200);
    let confidence = Number(obj.confidence);
    if (Number.isNaN(confidence)) confidence = startDate ? 0.75 : 0.4;
    confidence = Math.max(0, Math.min(1, confidence));
    return { leaveType, startDate, endDate, halfDay, halfDayPeriod, reason, confidence };
};

const MAX_REQUESTS = 5;

/**
 * Normalise whatever the model returned into a predictable bundle:
 *   { requests: [<normalised segment>, ...], language }
 * Accepts the new {requests:[...]} shape, a bare array, or a single legacy
 * object, so a model that ignores the schema still produces something usable.
 */
const normalizeParseBundle = (obj) => {
    let list = [];
    if (Array.isArray(obj)) list = obj;
    else if (Array.isArray(obj?.requests)) list = obj.requests;
    else if (obj && typeof obj === "object") list = [obj];

    const language = typeof obj?.language === "string" && /^[a-z]{2}$/i.test(obj.language)
        ? obj.language.toLowerCase()
        : "en";

    const seen = new Set();
    const requests = [];
    for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const r = normalizeParseResult(item);
        // Drop empty duplicates; keep dateless entries only if nothing else parsed.
        const key = [r.leaveType, r.startDate, r.endDate, r.halfDay, r.halfDayPeriod].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        requests.push(r);
        if (requests.length >= MAX_REQUESTS) break;
    }
    const dated = requests.filter((r) => r.startDate);
    return { requests: dated.length ? dated : requests.slice(0, 1), language };
};

const PARSE_SYSTEM = `You convert an employee's leave request into strict JSON only.
Respond with a single JSON object, no markdown, no preamble.

Schema:
{"requests":[{"leaveType":"annual"|"sick_mc"|"sick_nomc","startDate":"YYYY-MM-DD"|null,"endDate":"YYYY-MM-DD"|null,"halfDay":boolean,"halfDayPeriod":"AM"|"PM"|null,"reason":string,"confidence":number}],"language":"ISO 639-1 code of the employee's input"}

Rules:
- ONE entry per distinct period of leave. "Monday off, then a half day on Friday"
  is TWO entries. A single continuous range is ONE entry.
- Never merge separate periods into one range, and never invent periods.
- Only full or half days (no hours).
- leaveType: annual for vacation/personal/dental; sick_mc only when an MC or
  medical certificate is mentioned; sick_nomc for illness without one.
- halfDay true only for a single calendar day. halfDayPeriod is AM or PM when
  halfDay is true, else null. "afternoon" is PM, "morning" is AM.
- Dates are relative to Today and must be YYYY-MM-DD. endDate defaults to startDate.
- confidence is 0..1 per entry, based on how sure you are of that entry's dates.
- The employee may write in ANY language (English, Chinese, Malay, Thai,
  Vietnamese, Bahasa, Japanese, Tagalog, Burmese...). Understand it, set
  "language" to its ISO 639-1 code, and ALWAYS write "reason" in English because
  the supervisor reads it.
- If no leave period can be identified, return {"requests":[],"language":"xx"}.`;

/** OpenAI-compatible chat completions (OpenRouter, OpenAI, local gateways). */
const openAiCompatibleChat = async ({ system, user, images = [], maxTokens = 400, temperature = 0.2 }) => {
    const apiKey = getOpenAiApiKey();
    if (!apiKey) throw new Error("OPENAI_API_KEY (or OPENROUTER_API_KEY) not set");

    const base = (process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE).replace(/\/$/, "");
    const isOpenRouter = /openrouter\.ai/i.test(base);
    const model = process.env.OPENAI_MODEL
        || (isOpenRouter ? OPENROUTER_DEFAULT_MODEL : DEFAULT_OPENAI_MODEL);

    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
    };
    // OpenRouter optional ranking headers (harmless elsewhere)
    if (isOpenRouter) {
        if (process.env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
        if (process.env.OPENROUTER_APP_NAME) headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
    }

    const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            temperature,
            max_tokens: maxTokens,
            messages: [
                { role: "system", content: system },
                // Vision: a user turn becomes content blocks when images are
                // attached (data: URLs are accepted directly by the API).
                images.length
                    ? {
                        role: "user",
                        content: [
                            { type: "text", text: user },
                            ...images.map((url) => ({ type: "image_url", image_url: { url } }))
                        ]
                    }
                    : { role: "user", content: user }
            ]
        })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const msg = data?.error?.message || data?.message || `LLM HTTP ${response.status}`;
        throw new Error(msg);
    }
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty completion content");
    return text;
};

const anthropicChat = async ({ system, user, images = [], maxTokens = 400 }) => {
    if (images.length) throw new Error("Image input is only wired for the OpenAI-compatible provider.");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: user }]
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error?.message || `Anthropic HTTP ${response.status}`);
    }
    return (data.content || []).map(i => i.text || "").join("\n");
};

// M3 owns the hosted-LLM transport (services/llmClient.js): it adds the request
// timeout, response sanitisation and the safe, non-leaking error codes that the
// AI routes surface. Text-only calls go through it.
//
// It is required lazily and called as `llmClient.complete(...)` rather than
// destructured, so a test that stubs the module's `complete` export is actually
// honoured (see tests/aiClient.test.js).
//
// Vision calls stay on the local OpenAI-compatible path: llmClient has no image
// support, and the MC checker (UC-13) sends the certificate as an image.
const llmComplete = async ({ system, user, images = [], maxTokens = 400, temperature = 0.2 }) => {
    if (images.length) {
        if (!getOpenAiApiKey()) {
            throw new Error("Image input requires an OpenAI-compatible provider.");
        }
        return openAiCompatibleChat({ system, user, images, maxTokens, temperature });
    }
    const llmClient = require('./llmClient');
    return llmClient.complete({ system, user, maxTokens, temperature });
};

const llmParse = async (raw, today = new Date()) => {
    // Spelling out the weekday (and the next 7 days) removes the single biggest
    // source of LLM date errors: "next Monday" was coming back as a Saturday.
    const upcoming = Array.from({ length: 8 }, (_, i) => {
        const d = addDays(today, i);
        return `${WEEKDAYS[d.getDay()].replace(/^./, (c) => c.toUpperCase())} ${toISO(d)}`;
    }).join(", ");
    const user = `Today is ${WEEKDAYS[today.getDay()].replace(/^./, (c) => c.toUpperCase())} ${toISO(today)} (timezone +08:00 Singapore).
Calendar for reference: ${upcoming}.
"next <weekday>" means the first such weekday strictly after today.
Employee input: """${raw}"""`;
    const text = await llmComplete({
        system: PARSE_SYSTEM,
        user,
        maxTokens: 700,          // room for several segments
        temperature: 0.1
    });
    return normalizeParseBundle(extractJsonObject(text));
};

/**
 * AI-1 entry point. Returns the FIRST segment's fields at the top level (so the
 * existing apply form keeps working untouched) plus:
 *   requests: [...]  every segment found — one sentence can hold several
 *   language:        ISO code of what the employee typed
 *   source:          "llm" | "heuristic"
 */
const parseLeaveText = async (raw, today = new Date()) => {
    if (isLlmConfigured()) {
        try {
            const bundle = await llmParse(raw, today);
            const first = bundle.requests[0] || normalizeParseResult({});
            return { ...first, requests: bundle.requests, language: bundle.language, source: "llm" };
        } catch (err) {
            console.log("LLM parse failed, using heuristic fallback:", err.message);
            const requests = heuristicParseMany(raw, today);
            return {
                ...requests[0], requests, language: "en",
                source: "heuristic", llmError: err.message
            };
        }
    }
    const requests = heuristicParseMany(raw, today);
    return { ...requests[0], requests, language: "en", source: "heuristic" };
};

/**
 * AI: polish a short leave reason for supervisors (on-demand).
 * Returns { improved, source }.
 */
const improveRemarks = async (raw) => {
    const input = String(raw || "").trim();
    if (!input) throw new Error("Remarks text is required.");

    if (!isLlmConfigured()) {
        // Offline polish: trim, capitalize first letter, ensure period
        let improved = input.replace(/\s+/g, " ").trim();
        improved = improved.charAt(0).toUpperCase() + improved.slice(1);
        if (!/^I (would like to request leave|am requesting leave)\b/i.test(improved)) {
            improved = `I would like to request leave ${improved ? `for ${improved.replace(/^[^.?!,;:\-\s]+\s*/, "")}` : "."}`.replace(/\s+/g, " ").trim();
        }
        if (!/[.!?]$/.test(improved)) improved += ".";
        return { improved: improved.slice(0, 200), source: "heuristic" };
    }

    try {
        const text = await llmComplete({
            system: `You rewrite leave-request remarks for a supervisor.
    Return ONLY a single plain sentence or short leave request (no quotes, no JSON), max 120 characters.
    Write it like a formal leave letter, starting with a direct request such as "I would like to request leave..." when appropriate.
    Use direct formal English suitable for a professional leave application.
    Do not use advice, recommendation, or commentary language.
    Keep facts; be clear, polite, professional, and concise. Do not invent medical details.
    If the input is already a request, polish it without changing the meaning.`,
            user: `Original remarks: """${input}"""`,
            maxTokens: 120,
            temperature: 0.3
        });
        let improved = String(text).replace(/^["']|["']$/g, "").trim().slice(0, 200);
        if (!improved) improved = input;
        return { improved, source: "llm" };
    } catch (err) {
        console.log("LLM improve-remarks failed:", err.message);
        let improved = input.replace(/\s+/g, " ").trim();
        improved = improved.charAt(0).toUpperCase() + improved.slice(1);
        if (!/[.!?]$/.test(improved)) improved += ".";
        return { improved: improved.slice(0, 200), source: "heuristic", llmError: err.message };
    }
};

/**
 * Supervisor triage brief (advisory only).
 * facts: plain JSON-serializable snapshot of the pending queue (no secrets).
 * Returns { brief, bullets?, source }.
 */
const coverageBrief = async (facts) => {
    const safe = facts && typeof facts === "object" ? facts : {};
    const count = Array.isArray(safe.pending) ? safe.pending.length : 0;
    const flagged = Array.isArray(safe.pending)
        ? safe.pending.filter((p) => p.flagged).length
        : 0;
    const overdue = Array.isArray(safe.pending)
        ? safe.pending.filter((p) => (p.waitingHours || 0) >= 24).length
        : 0;

    const heuristic = () => {
        if (count === 0) {
            return {
                brief: "Your approval queue is clear — no pending requests at your tier right now.",
                bullets: ["Queue empty"],
                source: "heuristic"
            };
        }
        const bullets = [
            `${count} request(s) waiting at your tier (${safe.tier || "pending"}).`,
            flagged > 0
                ? `${flagged} flagged for low team coverage — may need Manager exception handling.`
                : "No coverage flags in the current queue.",
            overdue > 0
                ? `${overdue} request(s) waiting ≥24 hours — prioritize or send a reminder.`
                : "No items older than 24 hours."
        ];
        if (safe.team) bullets.push(`Team: ${safe.team}.`);
        return {
            brief: bullets.join(" "),
            bullets,
            source: "heuristic"
        };
    };

    if (!isLlmConfigured()) return heuristic();

    try {
        const text = await llmComplete({
            system: `You are an advisory assistant for leave approvers.
Given a JSON snapshot of a pending leave queue, write a short professional triage brief.
Rules:
- Advisory ONLY — never approve, reject, or change routing/balance.
- 2–4 short sentences max, plus optional bullet list (max 5 bullets).
- Focus on coverage risks, urgency (age), flagged items, and bulk-triage tips.
- Be concise and neutral. No medical advice.
Respond ONLY with JSON: {"brief":string,"bullets":string[]}`,
            user: `Queue snapshot:\n${JSON.stringify(safe).slice(0, 6000)}`,
            maxTokens: 280,
            temperature: 0.25
        });
        const obj = extractJsonObject(text);
        const brief = String(obj.brief || "").trim();
        const bullets = Array.isArray(obj.bullets)
            ? obj.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 5)
            : [];
        if (!brief) return heuristic();
        return { brief: brief.slice(0, 800), bullets, source: "llm" };
    } catch (err) {
        console.log("coverageBrief LLM failed:", err.message);
        const h = heuristic();
        return { ...h, llmError: err.message };
    }
};

/**
 * Draft an approval or rejection note for a supervisor/manager.
 * Returns { note, source }. Never decides the request.
 */
const draftNote = async ({ mode, request, actorRole }) => {
    const m = mode === "reject" ? "reject" : "approve";
    const r = request || {};
    const role = actorRole || "SUPERVISOR";

    const heuristic = () => {
        const name = r.employeeName || "the employee";
        const dates = r.startDate && r.endDate
            ? (r.startDate === r.endDate ? r.startDate : `${r.startDate} to ${r.endDate}`)
            : "the requested dates";
        if (m === "reject") {
            return {
                note: `Unable to approve leave for ${name} (${dates}) due to team coverage / operational constraints. Please discuss alternatives with your supervisor.`,
                source: "heuristic"
            };
        }
        if (role === "SUPERVISOR") {
            return {
                note: `Endorsed for ${name} (${dates}). Please ensure handover is complete before leave starts.`,
                source: "heuristic"
            };
        }
        return {
            note: `Approved leave for ${name} (${dates}). Enjoy the time off — ensure coverage arrangements are confirmed.`,
            source: "heuristic"
        };
    };

    if (!isLlmConfigured()) return heuristic();

    try {
        const text = await llmComplete({
            system: `You draft short professional notes for leave approvers.
Return ONLY plain text (one or two sentences), no JSON, no quotes.
Rules:
- Advisory draft only — the human must review and edit.
- mode=approve: warm, clear endorsement/approval note.
- mode=reject: firm but respectful; do not invent specific medical facts.
- Max 180 characters. Match the actor role tone (Supervisor endorses; Manager may finalize).`,
            user: `mode=${m}
actorRole=${role}
request=${JSON.stringify({
                leaveType: r.leaveType,
                startDate: r.startDate,
                endDate: r.endDate,
                days: r.days,
                halfDay: r.halfDay,
                reason: r.reason,
                flagged: r.flagged,
                employeeName: r.employeeName,
                status: r.status
            })}`,
            maxTokens: 120,
            temperature: 0.3
        });
        let note = String(text).replace(/^["']|["']$/g, "").trim().slice(0, 300);
        if (!note) return heuristic();
        return { note, source: "llm" };
    } catch (err) {
        console.log("draftNote LLM failed:", err.message);
        const h = heuristic();
        return { ...h, llmError: err.message };
    }
};

/**
 * UC-26 (AI): draft an announcement banner from a one-line brief.
 *
 * HR types what they want to say in plain words ("office closed 24-26 Dec, no
 * leave approvals over that period") and this returns a ready-to-publish
 * title + body plus a suggested audience and display window. It is a DRAFT:
 * the form stays fully editable and nothing is published until HR clicks
 * Publish, so the LLM never broadcasts anything on its own.
 *
 * Degrades gracefully: with no LLM configured (or on any provider error) it
 * falls back to a deterministic heuristic so the button always does something.
 *
 * Returns { title, body, targetType, targetValue, requiresAck, source }.
 */
const ANNOUNCEMENT_TITLE_MAX = 120;   // matches Announcement.title column
const ANNOUNCEMENT_BODY_MAX = 1000;   // matches Announcement.body column

const draftAnnouncement = async ({ brief, targetType, targetValue, tone } = {}) => {
    const input = String(brief || "").trim();
    if (input.length < 3) throw new Error("Describe the announcement in a few words first.");

    const wantedTone = ["NEUTRAL", "URGENT", "FRIENDLY"].includes(String(tone || "").toUpperCase())
        ? String(tone).toUpperCase()
        : "NEUTRAL";
    const audience = ["ALL", "COUNTRY", "ROLE"].includes(String(targetType || "").toUpperCase())
        ? String(targetType).toUpperCase()
        : "ALL";

    // Deterministic fallback: turn the brief into a sentence-cased title and a
    // short body. Never throws, never invents dates that weren't in the brief.
    const heuristic = () => {
        const clean = input.replace(/\s+/g, " ").trim();
        // First clause makes the headline; ";" counts as a break so a two-part
        // brief doesn't produce a title chopped off mid-word.
        const firstClause = clean.split(/(?<=[.!?;])\s|;\s*/)[0] || clean;
        let title = firstClause.replace(/[.!?;]+$/, "").trim();
        if (title.length > 70) {
            const cut = title.slice(0, 69);
            const lastSpace = cut.lastIndexOf(" ");
            title = `${(lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim()}…`;
        }
        title = title.charAt(0).toUpperCase() + title.slice(1);
        let body = clean.charAt(0).toUpperCase() + clean.slice(1);
        if (!/[.!?]$/.test(body)) body += ".";
        body = `${body} Please plan your leave accordingly and contact HR if you have any questions.`;
        return {
            title: title.slice(0, ANNOUNCEMENT_TITLE_MAX),
            body: body.slice(0, ANNOUNCEMENT_BODY_MAX),
            targetType: audience,
            targetValue: audience === "ALL" ? "" : String(targetValue || ""),
            requiresAck: /\b(mandatory|must|required|acknowledge|policy change|deadline)\b/i.test(clean),
            source: "heuristic"
        };
    };

    if (!isLlmConfigured()) return heuristic();

    try {
        const text = await llmComplete({
            system: `You write internal HR announcement banners for a company leave-management system.

Return ONLY a JSON object, no prose, no markdown fences, with exactly these keys:
{"title": string, "body": string, "requiresAck": boolean}

Rules:
- title: a short headline, max 70 characters, sentence case, no trailing period, no emoji.
- body: 1-3 short sentences, max 400 characters, addressed to staff as "you". Plain professional English suitable for Singapore/Vietnam/Thailand offices. No markdown, no bullet points, no emoji, no signature.
- Use ONLY facts present in the brief. Never invent dates, policy numbers, names or figures that are not there.
- If the brief mentions dates, keep them exactly as written.
- requiresAck: true only if the announcement is a mandatory policy change, a compliance deadline, or something staff must confirm they have read; otherwise false.
- Do not give personal, medical, legal or financial advice.`,
            user: `tone=${wantedTone}
audience=${audience}${audience === "ALL" ? "" : ` (${targetValue || "unspecified"})`}
brief="""${input.slice(0, 800)}"""`,
            maxTokens: 400,
            temperature: 0.4
        });

        const obj = extractJsonObject(text);
        const title = String(obj?.title || "").replace(/^["']|["']$/g, "").trim();
        const body = String(obj?.body || "").replace(/^["']|["']$/g, "").trim();
        if (!title || !body) return heuristic();

        return {
            title: title.slice(0, ANNOUNCEMENT_TITLE_MAX),
            body: body.slice(0, ANNOUNCEMENT_BODY_MAX),
            targetType: audience,
            targetValue: audience === "ALL" ? "" : String(targetValue || ""),
            requiresAck: !!obj?.requiresAck,
            source: "llm"
        };
    } catch (err) {
        console.log("draftAnnouncement LLM failed:", err.message);
        return { ...heuristic(), llmError: err.message };
    }
};

/**
 * Explain why a leave request is still pending (advisory).
 * Returns { explanation, source }.
 */
const explainStatus = async ({ request, waitingHours, tierLabel }) => {
    const r = request || {};
    const hours = Number(waitingHours) || 0;

    const heuristic = () => {
        const parts = [];
        if (r.status === "PENDING_SUPERVISOR") {
            parts.push("Waiting for Supervisor endorsement (tier 1 of 2).");
        } else if (r.status === "PENDING_BOSS") {
            parts.push("Waiting for the Boss's decision - a Manager's own leave is decided there.");
        } else if (r.status === "PENDING_MANAGER") {
            parts.push("Supervisor has endorsed; waiting for Manager final decision (tier 2 of 2).");
        } else {
            parts.push(`Current status: ${r.status || "unknown"}.`);
        }
        if (r.flagged) {
            parts.push("Flagged for low team coverage — Manager must explicitly acknowledge any coverage exception before final approval.");
        }
        if (hours >= 24) {
            parts.push(`Pending for about ${hours} hours (≥24h reminder may apply).`);
        } else {
            parts.push(`Pending for about ${hours} hours.`);
        }
        parts.push("AI does not change routing or deadlines — this is an explanation only.");
        return { explanation: parts.join(" "), source: "heuristic" };
    };

    if (!isLlmConfigured()) return heuristic();

    try {
        const text = await llmComplete({
            system: `Explain leave request status for employees/approvers in plain professional English.
2–4 short sentences. Advisory only — never claim the system auto-approved or auto-rejected.
Cover: which tier is waiting, coverage flags, and typical next step.
Return ONLY plain text.`,
            user: JSON.stringify({
                status: r.status,
                tierLabel,
                waitingHours: hours,
                flagged: r.flagged,
                leaveType: r.leaveType,
                startDate: r.startDate,
                endDate: r.endDate
            }),
            maxTokens: 180,
            temperature: 0.25
        });
        const explanation = String(text).trim().slice(0, 600);
        if (!explanation) return heuristic();
        return { explanation, source: "llm" };
    } catch (err) {
        console.log("explainStatus LLM failed:", err.message);
        const h = heuristic();
        return { ...h, llmError: err.message };
    }
};

module.exports = {
    parseLeaveText,
    heuristicParse,
    heuristicParseMany,
    normalizeParseBundle,
    improveRemarks,
    coverageBrief,
    draftNote,
    draftAnnouncement,
    explainStatus,
    isLlmConfigured,
    llmProviderStatus,
    // M5 (AI-4): shared LLM plumbing so the query catalogue can (optionally) use
    // the same provider adapter. Exported additively; no behaviour change.
    llmComplete,
    extractJsonObject
};
