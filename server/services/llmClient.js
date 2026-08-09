// Small, mockable hosted-LLM adapter. It owns network timeouts, provider
// response validation and safe error messages; callers own deterministic fallbacks.
require("dotenv").config();

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4.1";
const OPENROUTER_DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 60000;
const MAX_OUTPUT_CHARS = 20000;

const safeError = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

const openAiKey = () => String(
    process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || ""
).trim();

const anthropicKey = () => String(process.env.ANTHROPIC_API_KEY || "").trim();

const timeoutMs = () => {
    const configured = Number(process.env.LLM_TIMEOUT_MS);
    if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_TIMEOUT_MS;
    return Math.min(Math.floor(configured), MAX_TIMEOUT_MS);
};

const providerStatus = () => {
    if (openAiKey()) {
        const baseUrl = String(process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE).replace(/\/$/, "");
        const isOpenRouter = /openrouter\.ai/i.test(baseUrl);
        return {
            configured: true,
            provider: isOpenRouter ? "openrouter" : "openai-compatible",
            model: process.env.OPENAI_MODEL || (isOpenRouter ? OPENROUTER_DEFAULT_MODEL : DEFAULT_OPENAI_MODEL),
            baseUrl
        };
    }
    if (anthropicKey()) {
        return {
            configured: true,
            provider: "anthropic",
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
            baseUrl: "https://api.anthropic.com"
        };
    }
    return {
        configured: false,
        provider: "heuristic",
        model: null,
        baseUrl: null,
        message: "No LLM key set — the offline heuristic is active."
    };
};

const isConfigured = () => providerStatus().configured;

const sanitizeCompletion = (value) => {
    if (typeof value !== "string") {
        throw safeError("LLM_INVALID_RESPONSE", "Hosted AI returned an invalid response.");
    }
    const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
    if (!clean || clean.length > MAX_OUTPUT_CHARS) {
        throw safeError("LLM_INVALID_RESPONSE", "Hosted AI returned an invalid response.");
    }
    return clean;
};

const fetchWithTimeout = async (url, options) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());
    try {
        return await globalThis.fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (error?.name === "AbortError") {
            throw safeError("LLM_TIMEOUT", "Hosted AI timed out.");
        }
        throw safeError("LLM_NETWORK_ERROR", "Hosted AI is temporarily unavailable.");
    } finally {
        clearTimeout(timer);
    }
};

const parseResponseJson = async (response) => {
    try {
        return await response.json();
    } catch (_) {
        throw safeError("LLM_INVALID_RESPONSE", "Hosted AI returned an invalid response.");
    }
};

const normalizedInput = ({ system, user, maxTokens = 400, temperature = 0.2 }) => ({
    system: String(system || "").slice(0, 12000),
    user: String(user || "").slice(0, 12000),
    maxTokens: Math.max(1, Math.min(1000, Number(maxTokens) || 400)),
    temperature: Math.max(0, Math.min(1, Number(temperature) || 0))
});

const openAiCompatible = async (input) => {
    const status = providerStatus();
    let endpoint;
    try {
        endpoint = new URL(`${status.baseUrl}/chat/completions`);
        if (!["http:", "https:"].includes(endpoint.protocol)) throw new Error("invalid protocol");
    } catch (_) {
        throw safeError("LLM_CONFIGURATION_ERROR", "Hosted AI is not configured correctly.");
    }

    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey()}`
    };
    if (status.provider === "openrouter") {
        if (process.env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
        if (process.env.OPENROUTER_APP_NAME) headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
    }

    const response = await fetchWithTimeout(endpoint.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({
            model: status.model,
            temperature: input.temperature,
            max_tokens: input.maxTokens,
            messages: [
                { role: "system", content: input.system },
                { role: "user", content: input.user }
            ]
        })
    });
    const data = await parseResponseJson(response);
    if (!response.ok) {
        throw safeError("LLM_PROVIDER_ERROR", "Hosted AI is temporarily unavailable.");
    }
    return sanitizeCompletion(data?.choices?.[0]?.message?.content);
};

const anthropic = async (input) => {
    const status = providerStatus();
    const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey(),
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
            model: status.model,
            max_tokens: input.maxTokens,
            system: input.system,
            messages: [{ role: "user", content: input.user }]
        })
    });
    const data = await parseResponseJson(response);
    if (!response.ok) {
        throw safeError("LLM_PROVIDER_ERROR", "Hosted AI is temporarily unavailable.");
    }
    const text = Array.isArray(data?.content)
        ? data.content.filter((item) => item?.type === "text").map((item) => item.text).join("\n")
        : null;
    return sanitizeCompletion(text);
};

const complete = async (options) => {
    const status = providerStatus();
    if (!status.configured) {
        throw safeError("LLM_NOT_CONFIGURED", "Hosted AI is not configured.");
    }
    const input = normalizedInput(options || {});
    return status.provider === "anthropic" ? anthropic(input) : openAiCompatible(input);
};

module.exports = {
    complete,
    isConfigured,
    providerStatus,
    timeoutMs,
    sanitizeCompletion
};
