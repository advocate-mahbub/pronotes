/**
 * The ½ key: "১/২" (or "1/2"), typed just before the caret, becomes a fraction (decisions.md 74).
 * Bangla: the digits stay Bangla, the numerator raised and the denominator lowered around ⁄ (in the
 * editor, with superscript and subscript); English, and plain boxes that cannot raise or lower text: the
 * ready-made sign (½ ¾ ⅓ …) or, where Unicode has none, superscript and subscript digits (⁵⁄₁₆).
 * "২ ১/২" becomes "২½": the space between a whole number and its fraction goes.
 */
const BN = '০১২৩৪৫৬৭৮৯';
const toAscii = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN.indexOf(d)));
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
export const FRACTION_SLASH = '⁄';
const VULGAR: Record<string, string> = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘',
  '1/6': '⅙', '5/6': '⅚', '1/7': '⅐', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞', '1/9': '⅑', '1/10': '⅒',
};

export interface FoundFraction { whole: string; num: string; den: string; length: number }
/** "… ২ ১/২" or "… ১/২" at the end of the text before the caret. */
export function findFraction(before: string): FoundFraction | null {
  const m = before.match(/(?:([০-৯0-9]+) )?([০-৯0-9]+)\/([০-৯0-9]+)$/);
  if (!m || /^0+$/.test(toAscii(m[3]))) return null;
  return { whole: m[1] ?? '', num: m[2], den: m[3], length: m[0].length };
}

/** The one-piece form: ½, or ⁵⁄₁₆ where Unicode has no ready-made sign (with the whole number before it). */
export function plainFraction(f: FoundFraction): string {
  const n = toAscii(f.num), d = toAscii(f.den);
  const v = VULGAR[`${Number(n)}/${Number(d)}`];
  const body = v ?? [...n].map((c) => SUP[+c]).join('') + FRACTION_SLASH + [...d].map((c) => SUBS[+c]).join('');
  return f.whole + body;
}

/** Back from any of these forms to "a/b" (and "w a/b"), for reading numbers (the title chart). */
export function unFraction(s: string): string {
  const back: Record<string, string> = Object.fromEntries(Object.entries(VULGAR).map(([k, v]) => [v, k]));
  return s
    .replace(/([০-৯0-9])?([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒])/g, (_, w, v) => (w ? w + ' ' : '') + back[v])
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (x) => [...x].map((c) => SUP.indexOf(c)).join(''))
    .replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (x) => [...x].map((c) => SUBS.indexOf(c)).join(''))
    .replace(new RegExp(FRACTION_SLASH, 'g'), '/');
}
