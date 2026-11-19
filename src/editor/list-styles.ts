/**
 * Numbered-list styles (decisions.md 79): the ones Bangladeshi legal writing uses — ১. (১) ক. (ক) —
 * and 1. i. a. A. Shown in the page with CSS counter styles; written into Word, text and RTF as the
 * labels themselves (Word has no Bangla numbering of its own), except plain 1. 2. which stays Word's.
 */
export const LIST_STYLES = [
  { id: 'decimal', sample: '1.' },
  { id: 'bn', sample: '১.' },
  { id: 'bn-paren', sample: '(১)' },
  { id: 'bn-alpha', sample: 'ক.' },
  { id: 'bn-alpha-paren', sample: '(ক)' },
  { id: 'lower-roman', sample: 'i.' },
  { id: 'lower-alpha', sample: 'a.' },
  { id: 'upper-alpha', sample: 'A.' },
] as const;
export type ListStyle = (typeof LIST_STYLES)[number]['id'];

/** The Bangla letters used for ক. খ. গ. … in legal drafts. */
export const BN_ALPHA = 'ক খ গ ঘ ঙ চ ছ জ ঝ ঞ ট ঠ ড ঢ ণ ত থ দ ধ ন প ফ ব ভ ম য র ল শ ষ স হ'.split(' ');
const bnDigits = (n: number) => String(n).replace(/\d/g, (d) => String.fromCharCode(0x09e6 + Number(d)));

function alpha(n: number, letters: string[]): string {
  // 1 → a, 26 → z, 27 → aa (the "alphabetic" counting CSS and Word use)
  let s = '';
  while (n > 0) { n--; s = letters[n % letters.length] + s; n = Math.floor(n / letters.length); }
  return s;
}
function roman(n: number): string {
  const t: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
}
const LATIN = 'abcdefghijklmnopqrstuvwxyz'.split('');

/** The label of item number `n` (1-based) in a list of this style. */
export function listLabel(style: string | null | undefined, n: number): string {
  switch (style) {
    case 'bn': return bnDigits(n) + '.';
    case 'bn-paren': return '(' + bnDigits(n) + ')';
    case 'bn-alpha': return alpha(n, BN_ALPHA) + '.';
    case 'bn-alpha-paren': return '(' + alpha(n, BN_ALPHA) + ')';
    case 'lower-roman': return roman(n) + '.';
    case 'lower-alpha': return alpha(n, LATIN) + '.';
    case 'upper-alpha': return alpha(n, LATIN).toUpperCase() + '.';
    default: return n + '.';
  }
}
