/**
 * OpenAI-compatible client (works with OpenRouter, OpenAI, Azure-style base URLs).
 *
 * OpenRouter example:
 *   OPENAI_API_KEY=sk-or-v1-...
 *   OPENAI_BASE_URL=https://openrouter.ai/api/v1
 *   OPENAI_MODEL=openai/gpt-4o-mini
 */

function isConfigured() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);
}

function getConfig() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  const baseURL = (
    process.env.OPENAI_BASE_URL ||
    process.env.OPENROUTER_BASE_URL ||
    'https://openrouter.ai/api/v1'
  ).replace(/\/$/, '');
  const model =
    process.env.OPENAI_MODEL ||
    process.env.OPENROUTER_MODEL ||
    'openai/gpt-4o-mini';
  return { apiKey, baseURL, model };
}

/**
 * Chat completion → text content
 */
async function chatCompletion({
  system,
  user,
  temperature = 0.3,
  max_tokens = 500,
  response_format = null,
}) {
  if (!isConfigured()) {
    throw new Error('OPENAI_API_KEY / OPENROUTER_API_KEY not set');
  }

  const { apiKey, baseURL, model } = getConfig();
  const body = {
    model,
    temperature,
    max_tokens,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: user },
    ],
  };
  if (response_format) {
    body.response_format = response_format;
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  // OpenRouter optional ranking headers
  if (baseURL.includes('openrouter.ai')) {
    headers['HTTP-Referer'] =
      process.env.OPENROUTER_SITE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME || 'HR Leave Manager';
  }

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.error?.message || data.message || `OpenAI HTTP ${res.status}`;
    throw new Error(msg);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty completion content');
  return {
    content,
    model: data.model || model,
    usage: data.usage,
  };
}

/**
 * Parse JSON from model output (strips ``` fences if present).
 */
function parseJsonContent(content) {
  let text = String(content).trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return JSON.parse(text);
}

module.exports = {
  isConfigured,
  getConfig,
  chatCompletion,
  parseJsonContent,
};
