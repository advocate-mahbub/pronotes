/**
 * The on-screen keyboard's gestures, the parts that are plain logic (kept apart so they can be tested
 * without a screen). The keyboard itself (OnScreenKeyboard.tsx) wires them to the finger.
 */
import { charFor, type LayoutMap } from '../bornona-engine';

/** How far (px) a finger moves before a press turns into a gesture, and how long a long-press takes (ms). */
export const MOVE = 12;
export const FLICK = 18;
export const LONG = 420;
/** Space trackpad: px of finger movement per character, and per line. */
export const STEP_X = 9;
export const STEP_Y = 22;
/** Two spaces within this time (ms) make "। " (or ". "). */
export const DOUBLE_SPACE = 450;

const SPACE = /[\s ]/;
/** Letters and digits of any script (Bangla marks included), the things a "word" is made of. */
const WORDCH = /[\p{L}\p{M}\p{N}‌‍]/u;

/**
 * How many characters "delete the word before the caret" removes: the spaces right before it, then the
 * word; when the caret sits right after punctuation, just that mark (and the spaces before it).
 */
export function wordDeleteCount(before: string): number {
  const cs = Array.from(before);
  let i = cs.length;
  while (i > 0 && SPACE.test(cs[i - 1])) i--;
  if (i > 0 && !WORDCH.test(cs[i - 1])) i--; // a lone mark: । , . ? …
  else while (i > 0 && WORDCH.test(cs[i - 1])) i--;
  return cs.slice(i).join('').length; // UTF-16 length, the unit the editor counts in
}

/** Double space → "। ": only right after a word (not after a space, a mark, or at the start of a line). */
export function doubleSpaceDari(before: string): boolean {
  if (!before.endsWith(' ')) return false;
  const prev = Array.from(before.slice(0, -1)).pop();
  return Boolean(prev && WORDCH.test(prev));
}

/**
 * What a long-press offers: the key's other characters (normal, Shift, AltGr, Shift+AltGr), the one it
 * would type now first, no repeats, nothing empty.
 */
export function keyAlternatives(map: LayoutMap, code: string, bangla: boolean, shift: boolean): string[] {
  const now = charFor(map, code, shift, false, bangla);
  const all = [now, charFor(map, code, !shift, false, bangla)];
  if (bangla) all.push(charFor(map, code, false, true, true), charFor(map, code, true, true, true));
  return all.filter((c, i) => c && all.indexOf(c) === i);
}

/** One-handed keyboard (phones): which side, or the whole width. */
export type Hand = 'left' | 'right' | null;
