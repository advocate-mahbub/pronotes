/**
 * Bangla voice text stays in Bengali letters (decisions.md 82). Speech engines sometimes answer Bangla speech
 * in another script: Hindi letters (Devanagari), Latin ("amar sonar bangla"), even Chinese or Japanese.
 * - Devanagari → Bengali letter by letter (the two blocks are laid out alike; a few letters Bengali lacks
 *   are mapped to the nearest one). Exact and offline.
 * - Letters of any other script but Bengali and Latin are dropped.
 * - All-Latin text (no Bengali letter at all) is marked, so it can be rewritten in Bengali letters
 *   (by Gemini, which keeps real English words in English).
 */
const DEV_EXTRA: Record<number, number> = {
  0x0904: 0x098f, 0x090d: 0x098f, 0x090e: 0x098f, 0x0911: 0x0993, 0x0912: 0x0993, 0x0929: 0x09a8, 0x0931: 0x09b0,
  0x0933: 0x09b2, 0x0934: 0x09b2, 0x0935: 0x09ac, 0x0945: 0x09c7, 0x0946: 0x09c7, 0x0949: 0x09cb, 0x094a: 0x09cb,
  0x0958: 0x0995, 0x0959: 0x0996, 0x095a: 0x0997, 0x095b: 0x099c, 0x095e: 0x09ab,
};
const isBengali = (c: string) => /\p{Script=Bengali}/u.test(c);

export function devanagariToBengali(s: string): string {
  return s.replace(/[ऀ-ॣ०-ॿ]/g, (c) => {
    const cp = c.codePointAt(0)!;
    if (DEV_EXTRA[cp]) return String.fromCodePoint(DEV_EXTRA[cp]);
    const b = String.fromCodePoint(cp + 0x80);
    return isBengali(b) ? b : '';
  });
}

export interface ScriptResult {
  text: string;
  /** Only Latin letters, no Bengali: Bangla written in English letters (or one English word). */
  latin: boolean;
  /** Letters of another script that were dropped. */
  dropped: number;
}

/** For Bangla voice only (lang bn-…); English voice text is left as it is. */
export function banglaScript(raw: string): ScriptResult {
  let dropped = 0;
  const text = devanagariToBengali(raw)
    .replace(/[\p{L}\p{M}]/gu, (c) => {
      if (/\p{Script=Bengali}|\p{Script=Latin}|\p{Script=Common}|\p{Script=Inherited}/u.test(c)) return c;
      dropped++;
      return '';
    })
    .replace(/[ \t]{2,}/g, ' ');
  const bn = (text.match(/\p{Script=Bengali}/gu) ?? []).length;
  const la = (text.match(/\p{Script=Latin}/gu) ?? []).length;
  return { text, latin: bn === 0 && la > 0, dropped };
}

/** The prompt that rewrites Latin-letter Bangla in Bengali letters, without translating. */
export const RESCRIPT_PROMPT = [
  'নিচের লেখাটা মুখে বলা বাংলা কথা, কিন্তু ভুল করে ইংরেজি অক্ষরে লেখা হয়েছে।',
  'অনুবাদ করবেন না: একই কথা বাংলা অক্ষরে, বাংলাদেশের প্রমিত বানানে লিখে দিন।',
  'যে শব্দ সত্যিই ইংরেজি (নাম, প্রযুক্তির শব্দ), সেটা ইংরেজি অক্ষরেই থাকবে। শুধু লেখাটা দিন, আর কিছু নয়।',
  '',
  'লেখা:',
].join('\n');

/**
 * Makes Bangla voice text Bengali: the steps above, and for all-Latin text the rewrite (when a way to
 * rewrite is given; it may fail or take too long, then the text stays as it came).
 */
export async function toBanglaVoice(raw: string, lang: string, rewrite?: (latin: string) => Promise<string>): Promise<string> {
  if (!lang.startsWith('bn')) return raw;
  const r = banglaScript(raw);
  if (!r.latin || !rewrite) return r.text;
  try {
    const out = (await rewrite(r.text)).trim();
    return out && /\p{Script=Bengali}/u.test(out) ? banglaScript(out).text : r.text;
  } catch {
    return r.text;
  }
}
