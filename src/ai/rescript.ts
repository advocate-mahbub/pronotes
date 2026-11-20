/** Latin-letter Bangla from a speech engine, rewritten in Bengali letters by Gemini (decisions.md 82). */
import { geminiGenerate } from './gemini';
import { RESCRIPT_PROMPT } from '../voice/script';
import { cleanTranscript } from './transcribe';

/** A rewrite function for toBanglaVoice; gives up after a few seconds so typing is not held up. */
export function geminiRescript(key: string, model?: string, timeoutMs = 8000): ((latin: string) => Promise<string>) | undefined {
  if (!key) return undefined;
  return async (latin) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return cleanTranscript(await geminiGenerate(RESCRIPT_PROMPT + '\n' + latin, { key, model, signal: ac.signal, temperature: 0 }));
    } finally {
      clearTimeout(timer);
    }
  };
}
