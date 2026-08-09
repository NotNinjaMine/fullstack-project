const originalEnv = { ...process.env };
const originalFetch = global.fetch;

const loadClient = () => {
    jest.resetModules();
    return require("../services/llmClient");
};

describe("llmClient", () => {
    afterEach(() => {
        process.env = { ...originalEnv };
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    test("returns validated content for a successful OpenAI-compatible response", async () => {
        process.env.OPENAI_API_KEY = "test-placeholder";
        process.env.OPENAI_BASE_URL = "https://example.invalid/v1";
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ choices: [{ message: { content: "  safe output  " } }] })
        });
        const client = loadClient();
        await expect(client.complete({ system: "s", user: "u" })).resolves.toBe("safe output");
    });

    test("uses a safe provider error without exposing the response body", async () => {
        process.env.OPENAI_API_KEY = "test-placeholder";
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({ error: { message: "raw provider detail" } })
        });
        const client = loadClient();
        await expect(client.complete({ system: "s", user: "u" })).rejects.toMatchObject({
            code: "LLM_PROVIDER_ERROR",
            message: "Hosted AI is temporarily unavailable."
        });
    });

    test("aborts a provider call at LLM_TIMEOUT_MS", async () => {
        process.env.OPENAI_API_KEY = "test-placeholder";
        process.env.LLM_TIMEOUT_MS = "10";
        global.fetch = jest.fn((url, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener("abort", () => {
                const error = new Error("aborted");
                error.name = "AbortError";
                reject(error);
            });
        }));
        const client = loadClient();
        await expect(client.complete({ system: "s", user: "u" })).rejects.toMatchObject({
            code: "LLM_TIMEOUT",
            message: "Hosted AI timed out."
        });
    });

    test("rejects a malformed provider response", async () => {
        process.env.OPENAI_API_KEY = "test-placeholder";
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) });
        const client = loadClient();
        await expect(client.complete({ system: "s", user: "u" })).rejects.toMatchObject({
            code: "LLM_INVALID_RESPONSE",
            message: "Hosted AI returned an invalid response."
        });
    });

    test("AI parsing accepts a validated hosted response", async () => {
        process.env.OPENAI_API_KEY = "test-placeholder";
        const client = loadClient();
        jest.spyOn(client, "complete").mockResolvedValue(JSON.stringify({
            leaveType: "annual",
            startDate: "2026-08-10",
            endDate: "2026-08-10",
            halfDay: false,
            halfDayPeriod: null,
            reason: "Family appointment",
            confidence: 0.9
        }));
        const ai = require("../services/ai");
        const parsed = await ai.parseLeaveText("next Monday for a family appointment", new Date("2026-08-04T00:00:00Z"));
        expect(parsed).toMatchObject({ source: "llm", startDate: "2026-08-10", reason: "Family appointment" });
    });

    test.each([
        ["LLM_PROVIDER_ERROR", "Hosted AI is temporarily unavailable."],
        ["LLM_TIMEOUT", "Hosted AI timed out."],
        ["LLM_INVALID_RESPONSE", "Hosted AI returned an invalid response."]
    ])("AI parsing falls back deterministically for %s", async (code, message) => {
        process.env.OPENAI_API_KEY = "test-placeholder";
        const client = loadClient();
        const error = new Error(message);
        error.code = code;
        jest.spyOn(client, "complete").mockRejectedValue(error);
        const log = jest.spyOn(console, "log").mockImplementation(() => {});
        const ai = require("../services/ai");
        const parsed = await ai.parseLeaveText("tomorrow for family matters", new Date("2026-08-04T00:00:00Z"));
        expect(parsed.source).toBe("heuristic");
        expect(parsed.startDate).toBe("2026-08-05");
        expect(parsed.llmError).toBe(message);
        log.mockRestore();
    });
});
