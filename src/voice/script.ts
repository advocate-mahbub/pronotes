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
  'নিচের লেখাটা মুখে বলা বাংলা কথা, কিন্তু ভুল করে ইংরেজি অক্ষরে (বাংলিশে) বা হিন্দিতে লেখা হয়েছে।',
  'অনুবাদ করবেন না: বক্তা বাংলায় যা বলেছিলেন, সেটাই বাংলা অক্ষরে, বাংলাদেশের প্রমিত বানানে লিখে দিন। হিন্দি শব্দ এলে তার জায়গায় বক্তার বলা বাংলা শব্দ।',
  'যে শব্দ সত্যিই ইংরেজি (নাম, প্রযুক্তির শব্দ), সেটা ইংরেজি অক্ষরেই থাকবে। শুধু লেখাটা দিন, আর কিছু নয়।',
  '',
  'লেখা:',
].join('\n');

/**
 * Romanised Bangla (and the Hindi a speech engine slips into) written in Latin letters: a sentence with
 * no Bengali letters with at least two of these everyday words, more than plain English ones
 * (decisions.md 87). "Okay, but the cut." stays: it has none of them.
 */
const ROMAN_BN = new Set(('ami amar amra amader tumi tomar tomra apni apnar apnara se tar tara ora o ke ki keno kemon kothay kokhon koto ' +
  'kotha bolo boli bolchi bolchen bolte bolben korbo kori korchi korchen korte koren korun kore koreche korechi hobe hoy hoyeche hocche ' +
  'ache achhe achi achhi achen achhen nai nei na ar abar abr theek thik thikache bhalo valo bhai apa eta ota oita ei oi sheta seta ekhon ' +
  'tahole tahle kintu jodi tobe din den dao dibo debo jabe jabo jai ashbe ashe asen dekho dekhen shono shunun bujhte bujhchi bujhchen ' +
  'parchi parcho parchho parben parbo parbe lagbe lage khub onek ekta ekti eto shob sob kichu kono hai hain kya kyun mein hum tum aap ' +
  'nahi nahin raha rahe tha thi bahut accha acha achha haan han kaise kaisa').split(' '));
const EN_COMMON = new Set(('the a an is are was were be been being to of and in on at by as for from with about this that these those it its ' +
  'you your i me my we our us they them their he him his she her but or if so just very really there here all some any okay ok yes no not ' +
  'what how why where when who have has had do does did can will would should could get got go going know think want like head').split(' '));
export function looksRomanBangla(sentence: string): boolean {
  if (/\p{Script=Bengali}/u.test(sentence)) return false;
  const words = sentence.toLowerCase().match(/[a-z]+/g) ?? [];
  if (!words.length) return false;
  const bn = words.filter((w) => ROMAN_BN.has(w)).length;
  const en = words.filter((w) => EN_COMMON.has(w)).length;
  // two such words at least, and more of them than plain English ones
  return bn >= 2 && bn > en;
}

/** The text cut after each ।?!. (with the space after it), so every piece can be judged on its own. */
export function voiceSentences(s: string): string[] {
  return s.match(/[^।?!.]+[।?!.]*\s*|[।?!.]+\s*/g) ?? (s ? [s] : []);
}

/**
 * Makes voice text right for its language (decisions.md 82, 88). Never Devanagari or other foreign letters,
 * in any language. In Bangla, each sentence on its own: one that came in Hindi, or in romanised Bangla, is
 * rewritten in Bengali letters when a way to rewrite is given (it may fail or take too long; then the
 * sentence stays as it came, Hindi letters turned Bengali). Plain English sentences stay English.
 */
export async function toBanglaVoice(raw: string, lang: string, rewrite?: (latin: string) => Promise<string>): Promise<string> {
  if (!lang.startsWith('bn')) return banglaScript(raw).text;
  const all = banglaScript(raw);
  const pieces = voiceSentences(raw);
  const tasks = pieces.map(async (piece) => {
    const plain = banglaScript(piece).text;
    const hindi = /\p{Script=Devanagari}/u.test(piece);
    // all of it in Latin letters (the old rule), or a sentence that is Hindi or romanised Bangla
    const wrong = hindi || (all.latin && /\p{L}/u.test(piece)) || looksRomanBangla(piece);
    if (!wrong || !rewrite) return plain;
    try {
      const out = (await rewrite(piece.trim())).trim();
      if (!out || !/\p{Script=Bengali}/u.test(out)) return plain;
      const trail = /\s$/.test(piece) ? ' ' : '';
      return banglaScript(out).text + trail;
    } catch {
      return plain;
    }
  });
  return (await Promise.all(tasks)).join('').replace(/[ \t]{2,}/g, ' ');
}
