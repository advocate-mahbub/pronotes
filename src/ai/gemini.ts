/**
 * Google Gemini API (free tier from Google AI Studio), called straight from the device with the
 * user's own key. Nothing goes through a ProNotes server (there is none).
 * Note: on the free tier Google may use what is sent to improve its products (outside the EU/UK);
 * the app says so before every send.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

export class AiError extends Error {
  constructor(public code: 'key' | 'quota' | 'blocked' | 'network' | 'model' | 'other', message: string) {
    super(message);
  }
}

export interface GeminiOptions {
  key: string;
  model?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Audio sent with the prompt (voice typing): base64 data and its type. */
  audio?: { mime: string; data: string };
  temperature?: number;
  /** Called when the chosen model was not available and another one worked (the app remembers it). */
  onModelChange?: (model: string) => void;
  /** Wait before retrying an overloaded answer (tests use 0). */
  retryDelayMs?: number;
}

const fail = async (r: Response): Promise<never> => {
  let msg = r.statusText;
  try {
    msg = ((await r.json()) as { error?: { message?: string } }).error?.message || msg;
  } catch {
    /* not JSON */
  }
  if (r.status === 400 && /api key/i.test(msg)) throw new AiError('key', msg);
  // the model name does not exist, is retired, or this key may not use it
  if (r.status === 404 || ((r.status === 400 || r.status === 403) && /model/i.test(msg))) throw new AiError('model', msg);
  if (r.status === 401 || r.status === 403) throw new AiError('key', msg);
  if (r.status === 429) throw new AiError('quota', msg);
  throw new AiError('other', `${r.status}: ${msg}`);
};

/** Text (and audio) generation. If the model is not available to this key, the next usable model is tried. */
export async function geminiGenerate(prompt: string, o: GeminiOptions): Promise<string> {
  try {
    return await generateOnceRetry(prompt, o);
  } catch (e) {
    if (!(e instanceof AiError) || e.code !== 'model') throw e;
    const list = await geminiModels(o.key, o.fetchImpl).catch(() => [] as string[]);
    const tried = o.model || DEFAULT_GEMINI_MODEL;
    for (const m of rankModels(list).filter((x) => x !== tried).slice(0, 3)) {
      try {
        const text = await generateOnce(prompt, { ...o, model: m });
        o.onModelChange?.(m);
        return text;
      } catch (e2) {
        if (!(e2 instanceof AiError) || e2.code !== 'model') throw e2;
      }
    }
    throw e;
  }
}

/** Fast general models first: "flash" before "pro", stable before preview, newest version first. */
export function rankModels(list: string[]): string[] {
  const ver = (m: string) => parseFloat((m.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
  const score = (m: string) => (/flash/.test(m) ? 0 : 10) + (/lite/.test(m) ? 1 : 0) + (/preview|exp/.test(m) ? 5 : 0) + (/latest/.test(m) ? -0.5 : 0);
  return [...list].sort((a, b) => score(a) - score(b) || ver(b) - ver(a));
}

/** Google sometimes answers "overloaded" (500/503) at busy times: wait a moment and try once more. */
async function generateOnceRetry(prompt: string, o: GeminiOptions): Promise<string> {
  try {
    return await generateOnce(prompt, o);
  } catch (e) {
    if (!(e instanceof AiError) || e.code !== 'other' || !/^5\d\d:/.test(e.message) || o.signal?.aborted) throw e;
    await new Promise((r) => setTimeout(r, o.retryDelayMs ?? 1500));
    return generateOnce(prompt, o);
  }
}

async function generateOnce(prompt: string, o: GeminiOptions): Promise<string> {
  const f = o.fetchImpl ?? fetch;
  let r: Response;
  try {
    r = await f(`${BASE}/models/${encodeURIComponent(o.model || DEFAULT_GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': o.key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }, ...(o.audio ? [{ inline_data: { mime_type: o.audio.mime, data: o.audio.data } }] : [])] }],
        generationConfig: { temperature: o.temperature ?? 0.3 },
      }),
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
  model: 'বাছাই করা Gemini মডেল আপনার key-তে চলছে না। Settings → AI সহকারী → "key যাচাই ও মডেল তালিকা" চেপে অন্য মডেল বাছুন।',
  other: 'Gemini থেকে উত্তর আনা গেল না।',
};

/** The message for an error, with Google's own reason (short) so a problem can be reported exactly. */
export function aiErrorMessage(e: unknown): { text: string; detail: string } {
  const code = e instanceof AiError ? e.code : 'other';
  const raw = e instanceof Error ? e.message : String(e);
  const detail = code === 'network' ? '' : raw.replace(/\s+/g, ' ').trim().slice(0, 160);
  return { text: AI_ERROR_TEXT[code], detail };
}
