/**
 * Voice text clean-up, ported from v8 (`corrections`, `cleanVoice`, `putVoice`).
 * Pure functions: the speech engine lives in ./controller.ts.
 * Checked against tests/golden/voice.json.
 */
import { fixNukta } from '../bornona-engine';

export interface VoiceOptions {
  /** Spoken punctuation ("দাঁড়ি", "comma", "নতুন লাইন") becomes the mark. */
  commands: boolean;
  /** ASCII digits in Bangla speech become Bangla digits. */
  banglaDigits: boolean;
  /** "ভুল = ঠিক" lines, one per line. */
  corrections: string;
}

export const DEFAULT_VOICE: VoiceOptions = { commands: true, banglaDigits: true, corrections: '' };

const NL = String.fromCharCode(10);
const MARK = String.fromCharCode(0);
export const CMDS_BN: [string, string][] = [
  ['নতুন অনুচ্ছেদ', NL + NL], ['নতুন প্যারা', NL + NL], ['নতুন লাইন', NL], ['প্রশ্নবোধক চিহ্ন', '?'], ['প্রশ্নচিহ্ন', '?'],
  ['জিজ্ঞাসা চিহ্ন', '?'], ['বিস্ময়সূচক চিহ্ন', '!'], ['বিস্ময় চিহ্ন', '!'], ['দাঁড়ি', '।'], ['দাড়ি', '।'], ['পূর্ণচ্ছেদ', '।'],
  ['সেমিকোলন', ';'], ['কোলন', ':'], ['কমা', ','], ['হাইফেন', '-'], ['বন্ধনী শুরু', '('], ['বন্ধনী শেষ', ')'],
].map(([w, p]) => [fixNukta(w), p] as [string, string]);
export const CMDS_EN: [string, string][] = [
  ['new paragraph', NL + NL], ['new line', NL], ['full stop', '.'], ['period', '.'], ['question mark', '?'],
  ['exclamation mark', '!'], ['semicolon', ';'], ['colon', ':'], ['comma', ','], ['hyphen', '-'], ['open bracket', '('], ['close bracket', ')'],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BN_DIG = '০১২৩৪৫৬৭৮৯';

/** Parse the corrections box: "ভুল = ঠিক" per line; other lines are ignored. */
export function parseCorrections(text: string): [string, string][] {
  return (text || '')
    .split(NL)
    .map((l) => l.split('='))
    .filter((p) => p.length === 2 && p[0].trim() && p[1].trim())
    .map((p) => [fixNukta(p[0].trim()), fixNukta(p[1].trim())] as [string, string]);
}

/** v8 `cleanVoice`: corrections, spoken punctuation, Bangla digits, "." → "।" after Bangla. */
export function cleanVoice(raw: string, lang: string, o: VoiceOptions): string {
  let s = ' ' + fixNukta(raw).replace(/\s+/g, ' ').trim() + ' ';
  parseCorrections(o.corrections).forEach(([a, b]) => {
    s = s.replace(new RegExp('(\\s)' + esc(a) + '(?=[\\s।,.?!;:])', 'g'), '$1' + b);
  });
  if (o.commands) {
    (lang.startsWith('bn') ? CMDS_BN.concat(CMDS_EN) : CMDS_EN).forEach(([w, p]) => {
      s = s.replace(new RegExp('(\\s)' + esc(w) + '(?=\\s)', 'gi'), '$1' + MARK + p + MARK);
    });
    s = s
      .replace(new RegExp('\\s*' + MARK + '([।,.?!;:)])' + MARK, 'g'), '$1')
      .replace(new RegExp(MARK + '\\(' + MARK + '\\s*', 'g'), ' (')
      .replace(new RegExp('\\s*' + MARK + '(\\n+)' + MARK + '\\s*', 'g'), '$1')
      .replace(new RegExp('\\s*' + MARK + '-' + MARK + '\\s*', 'g'), '-')
      .split(MARK).join('');
  }
  if (lang.startsWith('bn')) {
    if (o.banglaDigits) s = s.replace(/[0-9]/g, (d) => BN_DIG[Number(d)]);
    s = s.replace(/([\u0980-\u09FF])\.(?=\s|$)/g, '$1।');
  }
  return s.replace(/^ +| +$/g, '');
}

/**
 * v8 `putVoice` without the editor: the text to insert at the caret for a final result,
 * or '' when there is nothing to insert. `before` = text before the caret.
 */
export function voiceInsertText(before: string, raw: string, lang: string, o: VoiceOptions): string {
  let t = cleanVoice(raw, lang, o);
  if (!t) return '';
  if (lang.startsWith('en') && (!before.trim() || /[.?!]\s*$|\n\s*$/.test(before))) t = t.charAt(0).toUpperCase() + t.slice(1);
  if (lang.startsWith('en')) t = t.replace(/([.?!]\s+|\n)([a-z])/g, (_m, p1: string, c: string) => p1 + c.toUpperCase());
  const lead = before && !/\s$/.test(before) && !/^[।,.?!;:)\n]/.test(t) ? ' ' : '';
  return lead + t + (/\n$/.test(t) ? '' : ' ');
}

/** Drops the same final text when it arrives twice within 2.5 s (some engines repeat results). */
export class VoiceDeduper {
  private last = '';
  private at = 0;
  accept(cleaned: string, now = Date.now()): boolean {
    if (cleaned === this.last && now - this.at < 2500) return false;
    this.last = cleaned;
    this.at = now;
    return true;
  }
  reset(): void {
    this.last = '';
    this.at = 0;
  }
}
