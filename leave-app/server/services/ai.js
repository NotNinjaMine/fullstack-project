// AI-1 Natural-Language Leave Application.
// If ANTHROPIC_API_KEY is set, calls the hosted LLM and expects STRICT JSON.
// Otherwise falls back to a deterministic heuristic parser so the demo
// works offline. Both paths return the same shape:
// { leaveType, startDate, endDate, halfDay, reason, confidence }
require('dotenv').config();

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

const parseExplicitDate = (text, today) => {
    const m1 = text.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
    const m2 = text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{1,2})/i);
    let day, monIdx;
    if (m1) { day = Number(m1[1]); monIdx = MONTHS.indexOf(m1[2].toLowerCase().slice(0, 3)); }
    else if (m2) { day = Number(m2[2]); monIdx = MONTHS.indexOf(m2[1].toLowerCase().slice(0, 3)); }
    else return null;
    const y = monIdx < today.getMonth() ? today.getFullYear() + 1 : today.getFullYear();
    return new Date(y, monIdx, day);
};

const heuristicParse = (raw, today = new Date()) => {
    const text = raw.toLowerCase();
    const out = { leaveType: "annual", startDate: null, endDate: null, halfDay: false, reason: "", confidence: 0.9 };

    if (/\bsick|unwell|fever|flu|doctor|clinic\b/.test(text)) {
        out.leaveType = /\bmc\b|medical cert/.test(text) ? "sick_mc" : "sick_nomc";
    }
    if (/half[- ]?day|morning off|afternoon off/.test(text)) out.halfDay = true;

    let start = null, end = null;
    if (/\btoday\b/.test(text)) start = new Date(today);
    else if (/\btomorrow\b/.test(text)) start = addDays(today, 1);
    else {
        const wd = text.match(/next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
        if (wd) start = nextWeekday(today, WEEKDAYS.indexOf(wd[1]));
        else {
            const explicit = parseExplicitDate(text, today);
            if (explicit) start = explicit;
        }
    }
    const toPart = text.split(/\bto\b|until|till|through/)[1];
    if (start && toPart) {
        const e2 = parseExplicitDate(toPart, today);
        const wd2 = toPart.match(/(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
        if (e2) end = e2;
        else if (wd2) end = nextWeekday(start, WEEKDAYS.indexOf(wd2[1]));
    }
    const nDays = text.match(/for\s+(\d+)\s+days?/);
    if (start && !end && nDays) end = addDays(start, Number(nDays[1]) - 1);

    if (start && !end) end = new Date(start);
    if (start) out.startDate = toISO(start);
    if (end) out.endDate = toISO(end);
    if (!start) out.confidence = 0.4;

    const because = raw.match(/because\s+(.+)$/i) || raw.match(/\bfor\s+(?!\d)(.+)$/i);
    out.reason = because ? because[1].trim() : raw.trim().slice(0, 80);
    return out;
};

const llmParse = async (raw, today = new Date()) => {
    const prompt = `You convert an employee's leave request into strict JSON.
Today is ${toISO(today)} (Singapore). Respond ONLY with JSON, no markdown, no preamble:
{"leaveType":"annual"|"sick_mc"|"sick_nomc","startDate":"YYYY-MM-DD"|null,"endDate":"YYYY-MM-DD"|null,"halfDay":boolean,"reason":string,"confidence":number}
Rules: only full or half days (no hours). "sick_mc" only if a medical certificate is mentioned.
Employee input: """${raw}"""`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 1000,
            messages: [{ role: "user", content: prompt }]
        })
    });
    const data = await response.json();
    const text = (data.content || []).map(i => i.text || "").join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
};

const parseLeaveText = async (raw, today = new Date()) => {
    if (process.env.ANTHROPIC_API_KEY) {
        try {
            return { ...(await llmParse(raw, today)), source: "llm" };
        } catch (err) {
            console.log("LLM parse failed, using heuristic fallback:", err.message);
        }
    }
    return { ...heuristicParse(raw, today), source: "heuristic" };
};

module.exports = { parseLeaveText, heuristicParse };
