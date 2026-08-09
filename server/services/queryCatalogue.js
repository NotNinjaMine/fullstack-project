// M5 (AI-4): HR insights chatbot. SAFETY: the LLM never generates SQL. Its only
// job is to classify a question against a FIXED catalogue of parameterised queries
// and extract parameters; the backend runs the matched pre-defined query. If no
// template matches, we return the closest available reports rather than guessing.
// Matching is done offline (keyword scoring) by default, matching the app's
// offline-first pattern; when an LLM key is set it refines the classification.
const reportService = require('./reportService');
const { detectAnomalies } = require('./anomalyDetector');
const { currentLeaveYear } = require('./leaveYearService');
const ai = require('./ai');

// The fixed catalogue. Each entry maps to a pre-defined query runner.
const CATALOGUE = [
    {
        key: "leave_usage_by_country",
        description: "Leave usage / utilisation grouped by country",
        keywords: ["country", "usage", "utilisation", "utilization", "highest", "which country", "by country"],
        run: async (caller) => {
            const ids = await reportService.visibleUserIds(caller);
            const rep = await reportService.leaveUtilisationByCountry(ids);
            const top = rep.table[0];
            const answer = top
                ? `${top.countryName} has the highest annual-leave usage at ${top.days} day(s)` +
                  (rep.table[1] ? `, ahead of ${rep.table[1].countryName} (${rep.table[1].days}).` : ".")
                : "No approved leave found in the visible scope yet.";
            return { answer, chart: rep.chart, table: rep.table };
        }
    },
    {
        key: "unused_balance_by_employee",
        description: "Employees with unused annual balance at risk of forfeiture",
        keywords: ["unused", "forfeit", "forfeiture", "remaining", "balance", "carry", "expire", "leftover", "more than"],
        run: async (caller) => {
            const ids = await reportService.visibleUserIds(caller);
            const rep = await reportService.carryForwardSummary(ids, await currentLeaveYear());
            const atRisk = rep.table.filter((r) => r.willForfeit > 0);
            const answer = atRisk.length
                ? `${atRisk.length} employee(s) risk forfeiting leave at year-end. Highest: ${atRisk[0].name} (${atRisk[0].willForfeit} day(s) over the 5-day cap).`
                : "No employees are currently at risk of forfeiting leave beyond the 5-day cap.";
            return { answer, chart: rep.chart, table: rep.table };
        }
    },
    {
        key: "sick_leave_trend",
        description: "Sick-leave usage split by MC vs no-MC",
        keywords: ["sick", "medical", "mc", "illness", "trend"],
        run: async (caller) => {
            const ids = await reportService.visibleUserIds(caller);
            const rep = await reportService.sickLeaveTrend(ids);
            const total = rep.table.reduce((s, r) => s + Number(r.days), 0);
            const answer = `Total sick leave in scope: ${total} day(s) (${rep.table[0].days} with MC, ${rep.table[1].days} without MC).`;
            return { answer, chart: rep.chart, table: rep.table };
        }
    },
    {
        key: "pending_overview",
        description: "How many requests are pending, by tier",
        keywords: ["pending", "awaiting", "queue", "outstanding", "most pending", "how many pending"],
        run: async (caller) => {
            const ids = await reportService.visibleUserIds(caller);
            const rep = await reportService.pendingOverview(ids);
            const sup = rep.table[0].count, mgr = rep.table[1].count;
            const answer = `${sup + mgr} request(s) pending: ${sup} awaiting a Supervisor, ${mgr} awaiting a Manager.`;
            return { answer, chart: rep.chart, table: rep.table };
        }
    },
    {
        key: "anomaly_flags",
        description: "Risk flags: forfeiture, burnout, clustering, coverage gaps",
        keywords: ["risk", "anomaly", "flag", "burnout", "concern", "alert", "at risk", "who rarely"],
        run: async (caller) => {
            const result = await detectAnomalies();
            const answer = result.count
                ? `${result.count} flag(s) detected. Top: ${result.flags[0].message}`
                : "No anomalies detected right now.";
            return { answer, table: result.flags };
        }
    }
];

// Offline keyword scoring → best template key (or null).
const classifyOffline = (question) => {
    const q = String(question || "").toLowerCase();
    let best = null, bestScore = 0;
    for (const t of CATALOGUE) {
        let score = 0;
        for (const kw of t.keywords) if (q.includes(kw)) score += kw.split(" ").length;
        if (score > bestScore) { bestScore = score; best = t.key; }
    }
    return bestScore > 0 ? best : null;
};

const CLASSIFY_SYSTEM = `You are a strict classifier for an HR analytics assistant.
Choose the single best template key for the user's question, or null if none fit.
Respond with JSON only: {"key": <one of the keys or null>}.
You must NEVER write SQL or invent data — only pick a key.`;

// LLM-refined classification (optional). Falls back to offline on any error.
const classify = async (question) => {
    const offline = classifyOffline(question);
    if (!ai.isLlmConfigured()) return { key: offline, source: "offline" };
    try {
        const keys = CATALOGUE.map((t) => `${t.key}: ${t.description}`).join("\n");
        const text = await ai.llmComplete({
            system: CLASSIFY_SYSTEM,
            user: `Templates:\n${keys}\n\nQuestion: "${question}"\nReturn JSON {"key": "..."} or {"key": null}.`,
            maxTokens: 60,
            temperature: 0
        });
        const obj = ai.extractJsonObject(text);
        const key = CATALOGUE.some((t) => t.key === obj.key) ? obj.key : offline;
        return { key, source: "llm" };
    } catch (err) {
        return { key: offline, source: "offline", llmError: err.message };
    }
};

// Answer a question: classify → run matched pre-defined query. No free SQL, ever.
const answerQuestion = async (question, caller) => {
    const { key, source, llmError } = await classify(question);
    if (!key) {
        return {
            matchedTemplate: null,
            source,
            answer: "I don't have a matching report for that. Try asking about leave usage by country, unused/forfeiture balances, sick-leave trend, pending requests, or risk flags.",
            suggestions: CATALOGUE.map((t) => ({ key: t.key, description: t.description })),
            llmError
        };
    }
    const template = CATALOGUE.find((t) => t.key === key);
    const result = await template.run(caller);
    return { matchedTemplate: key, source, ...result, llmError };
};

module.exports = { answerQuestion, classify, classifyOffline, CATALOGUE };
