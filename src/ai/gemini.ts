/**
 * Google Gemini API (free tier from Google AI Studio), called straight from the device with the
 * user's own key. Nothing goes through a ProNotes server (there is none).
 * Note: on the free tier Google may use what is sent to improve its products (outside the EU/UK);
 * the app says so before every send.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

export class AiError extends Error {
  constructor(public code: 'key' | 'quota' | 'blocked' | 'network' | 'other', message: string) {
    super(message);
  }
}

export interface GeminiOptions {
  key: string;
  model?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

const fail = async (r: Response): Promise<never> => {
  let msg = r.statusText;
  try {
    msg = ((await r.json()) as { error?: { message?: string } }).error?.message || msg;
  } catch {
    /* not JSON */
  }
  if (r.status === 400 && /api key/i.test(msg)) throw new AiError('key', msg);
  if (r.status === 401 || r.status === 403) throw new AiError('key', msg);
  if (r.status === 429) throw new AiError('quota', msg);
  throw new AiError('other', `${r.status}: ${msg}`);
};

export async function geminiGenerate(prompt: string, o: GeminiOptions): Promise<string> {
  const f = o.fetchImpl ?? fetch;
  let r: Response;
  try {
    r = await f(`${BASE}/models/${encodeURIComponent(o.model || DEFAULT_GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': o.key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } }),
      signal: o.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AiError('network', String(e));
  }
  if (!r.ok) await fail(r);
  const j = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (j.promptFeedback?.blockReason) throw new AiError('blocked', j.promptFeedback.blockReason);
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text) throw new AiError('blocked', j.candidates?.[0]?.finishReason || 'empty');
  return text;
}

/** Text models the key can use (for the model list in Settings). */
export async function geminiModels(key: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  let r: Response;
  try {
    r = await fetchImpl(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  } catch (e) {
    throw new AiError('network', String(e));
  }
  if (!r.ok) await fail(r);
  const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (j.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name) && !/embedding|image|tts|audio|live/.test(m.name))
    .map((m) => m.name.replace(/^models\//, ''));
}

/** What the user is told for each error (Bangla source text; translated by the app). */
export const AI_ERROR_TEXT: Record<AiError['code'], string> = {
  key: 'Gemini key ঠিক নেই। Settings → AI সহকারী-তে key দেখুন।',
  quota: 'Gemini-র ফ্রি সীমা আপাতত শেষ। কিছুক্ষণ পরে চেষ্টা করুন, বা Claude-এ কপি করে নিন।',
  blocked: 'Gemini এই লেখার উত্তর দেয়নি। Claude-এ কপি করে চেষ্টা করুন।',
  network: 'ইন্টারনেট নেই বা Gemini-তে পৌঁছানো গেল না।',
  other: 'Gemini থেকে উত্তর আনা গেল না।',
};
