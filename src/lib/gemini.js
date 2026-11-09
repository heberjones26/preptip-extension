// Optional one-click path for "Build a tip with AI": ask Gemini with the teacher's own free API key.
// The key lives in this browser and is only ever sent to Google. It goes in the x-goog-api-key header,
// never in the URL, so it can't end up in an address, a log or an error message.
//
// Uses the long-standing generateContent route. The model ids change over time, so if one is retired
// (404) we fall through to the next; keep this list short and current (free-tier text models are
// listed at https://ai.google.dev/gemini-api/docs/pricing).

export const GEMINI_KEY_URL = 'https://aistudio.google.com/apikey';
// Lightest first: measured with a real key, a full tip takes ~1s on flash-lite and ~10s on flash, with
// comparable results. The second is only tried if the first id has been retired (404).
export const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// An error with a message written for a teacher. `status` is the HTTP status, or a word like
// 'network' / 'timeout' / 'empty'. `message` (what gets logged) never contains Google's text.
export class GeminiError extends Error {
  constructor(status, friendly) {
    super(`Gemini request failed (${status})`);
    this.name = 'GeminiError';
    this.status = status;
    this.friendly = friendly;
  }
}

// Fixed by the user's own typing, not a bug on our side: don't put these in the error log.
export function isUserFixable(err) {
  return err instanceof GeminiError && [400, 401, 403, 429].includes(err.status);
}

export function looksLikeKey(key) {
  return typeof key === 'string' && /^\S{20,200}$/.test(key.trim());
}

export function geminiRequest(model, prompt, key) {
  return {
    url: `${ENDPOINT}/${model}:generateContent`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.trim() },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json', maxOutputTokens: 4096 }
      })
    }
  };
}

// The generated text from a response. Reads the generateContent shape, and also the newer
// "steps / model_output" shape in case Google serves that from the same route.
export function geminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const text = parts.filter((p) => typeof p?.text === 'string' && !p.thought).map((p) => p.text).join('');
    if (text) return text;
  }
  const out = Array.isArray(data?.steps) ? data.steps.find((s) => s?.type === 'model_output') : null;
  const item = Array.isArray(out?.content) ? out.content.find((c) => typeof c?.text === 'string') : null;
  return item ? item.text : '';
}

function failure(status, body) {
  if (status === 400 && /api key/i.test(body?.error?.message || '')) {
    return new GeminiError(400, 'Google didn’t accept that key. Copy it again from Google AI Studio and try once more.');
  }
  if (status === 400) return new GeminiError(400, 'Gemini couldn’t use that request. Try rewording what you want to do.');
  if (status === 401 || status === 403) {
    return new GeminiError(status, 'Google rejected that key. Make sure it’s a Gemini key from Google AI Studio.');
  }
  if (status === 404) return new GeminiError(404, 'Gemini isn’t available right now. Try again later, or use copy and paste.');
  if (status === 429) {
    return new GeminiError(429, 'You’ve hit Gemini’s free limit for now. Wait a minute and try again, or use copy and paste.');
  }
  if (status === 'blocked') return new GeminiError('blocked', 'Gemini wouldn’t answer that one. Try rewording it, or use copy and paste.');
  if (status === 'empty') return new GeminiError('empty', 'Gemini didn’t send an answer. Try again, or use copy and paste.');
  return new GeminiError(status, 'Gemini is busy right now. Try again in a moment, or use copy and paste.');
}

// Returns the model's text. Throws a GeminiError whose `friendly` message is safe to show.
export async function generateWithGemini({ key, prompt, fetchImpl = (...a) => fetch(...a), timeoutMs = 30000, models = GEMINI_MODELS }) {
  if (!looksLikeKey(key)) throw new GeminiError('key', 'Paste your Gemini key first.');
  let retired = null;

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const { url, init } = geminiRequest(model, prompt, key);
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      if (res.status === 404) { retired = failure(404); continue; } // that model id is gone: try the next
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw failure(res.status, body);
      if (body?.promptFeedback?.blockReason) throw failure('blocked');
      const text = geminiText(body);
      if (!text) throw failure('empty');
      return text;
    } catch (err) {
      if (err instanceof GeminiError) throw err;
      if (err?.name === 'AbortError') throw new GeminiError('timeout', 'Gemini took too long to answer. Try again, or use copy and paste.');
      throw new GeminiError('network', 'We couldn’t reach Gemini. Check your connection and try again.');
    } finally {
      clearTimeout(timer);
    }
  }
  throw retired || failure('empty');
}
