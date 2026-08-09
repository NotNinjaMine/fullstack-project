// M5 (AI-4 / UC-11) — HR insights chatbot query catalogue.
//
// The safety property of this feature is that the LLM never writes SQL. Its only
// job is to pick one key from a fixed catalogue; the backend runs a pre-defined
// function for that key. classifyOffline is the deterministic fallback that runs
// when no LLM key is configured, and it is also the floor the LLM path falls
// back to on any error — so if it degrades, the whole feature degrades silently.
//
// Pure function: no database, no network, no API key.

const { classifyOffline, CATALOGUE } = require("../../server/services/queryCatalogue");

const KEYS = CATALOGUE.map((t) => t.key);

describe("the catalogue itself", () => {
    test("every entry has a key, a description, keywords and a runner", () => {
        for (const t of CATALOGUE) {
            expect(typeof t.key).toBe("string");
            expect(t.key.length).toBeGreaterThan(0);
            expect(typeof t.description).toBe("string");
            expect(Array.isArray(t.keywords)).toBe(true);
            expect(t.keywords.length).toBeGreaterThan(0);
            expect(typeof t.run).toBe("function");
        }
    });

    test("keys are unique, so classification can never be ambiguous by key", () => {
        expect(new Set(KEYS).size).toBe(KEYS.length);
    });

    test("keywords are lowercase, because matching lowercases the question", () => {
        // A capitalised keyword can never match, so it would be dead config
        // that silently narrows what the chatbot can answer.
        for (const t of CATALOGUE) {
            for (const kw of t.keywords) {
                expect(kw).toBe(kw.toLowerCase());
            }
        }
    });

    test("covers the four reports plus risk flags", () => {
        expect(KEYS).toEqual(expect.arrayContaining([
            "leave_usage_by_country",
            "unused_balance_by_employee",
            "sick_leave_trend",
            "pending_overview",
            "anomaly_flags"
        ]));
    });
});

describe("classifyOffline — questions HR would actually ask", () => {
    const cases = [
        ["Which country had the highest annual leave usage?", "leave_usage_by_country"],
        ["show me leave utilisation by country", "leave_usage_by_country"],
        ["who has unused leave that will expire?", "unused_balance_by_employee"],
        ["which employees are at risk of forfeiture?", "unused_balance_by_employee"],
        ["what is the sick leave trend this year?", "sick_leave_trend"],
        ["how much sick leave was taken with an mc?", "sick_leave_trend"],
        ["how many requests are pending?", "pending_overview"],
        ["what is outstanding in the approval queue?", "pending_overview"],
        ["show me the burnout flags", "anomaly_flags"],
        ["any anomalies i should know about?", "anomaly_flags"]
    ];

    test.each(cases)("%s → %s", (question, expected) => {
        expect(classifyOffline(question)).toBe(expected);
    });
});

describe("classifyOffline — case and punctuation", () => {
    test("matching is case-insensitive", () => {
        expect(classifyOffline("WHICH COUNTRY HAS THE HIGHEST USAGE?"))
            .toBe(classifyOffline("which country has the highest usage?"));
    });

    test("a question mark does not change the result", () => {
        expect(classifyOffline("how many requests are pending"))
            .toBe(classifyOffline("how many requests are pending?"));
    });
});

describe("classifyOffline — returns null rather than guessing", () => {
    // The whole safety design rests on this. A wrong-but-confident match sends
    // HR a chart answering a question they did not ask; null sends them the
    // list of reports that do exist.
    test.each([
        ["what is the capital of France?"],
        ["hello"],
        ["tell me a joke"],
        [""],
        ["   "]
    ])("%j → null", (question) => {
        expect(classifyOffline(question)).toBeNull();
    });

    test("degrades to null on non-string input instead of throwing", () => {
        // routes/ai.js validates with Yup first, but classifyOffline is also
        // reachable from classify() on the LLM error path.
        expect(classifyOffline(null)).toBeNull();
        expect(classifyOffline(undefined)).toBeNull();
        expect(classifyOffline(12345)).toBeNull();
    });
});

describe("classifyOffline — always returns a key that exists", () => {
    test("never invents a template name", () => {
        const questions = [
            "leave usage by country", "unused balance", "sick mc trend",
            "pending queue", "risk flags", "burnout", "who rarely takes leave",
            "which country has the most leftover leave"
        ];
        for (const q of questions) {
            const key = classifyOffline(q);
            if (key !== null) expect(KEYS).toContain(key);
        }
    });

    test("a returned key always resolves to a runnable catalogue entry", () => {
        // Guards the failure where classification succeeds and answerQuestion
        // then dereferences undefined.
        const key = classifyOffline("which country had the highest usage");
        const entry = CATALOGUE.find((t) => t.key === key);
        expect(entry).toBeDefined();
        expect(typeof entry.run).toBe("function");
    });
});

describe("classifyOffline — scoring behaviour", () => {
    test("a multi-word keyword outscores a single word when both appear", () => {
        // Scoring adds one point per word in a matched keyword, so "which
        // country" (2) beats an incidental single-word hit elsewhere.
        expect(classifyOffline("which country has pending balance")).toBe("leave_usage_by_country");
    });

    test("a question matching no keyword scores zero and returns null", () => {
        expect(classifyOffline("zzz qqq")).toBeNull();
    });

    test("classification is deterministic across repeated calls", () => {
        // The offline path must be stable — it is what makes a live demo
        // repeatable when no API key is configured.
        const q = "who is at risk of forfeiting leave";
        const first = classifyOffline(q);
        for (let i = 0; i < 20; i++) expect(classifyOffline(q)).toBe(first);
    });
});
