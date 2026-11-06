/**
 * Word suggestions and learning. Ported from v8 (`suggest`, `learn`, `learnText`, `nextFor`, `saveLex`).
 * Pure logic: storage of the WordBank is the caller's job (see src/storage later).
 */
import { LEX_BN_LEGAL, LEX_BN_COMMON, LEX_EN, SEED_PHRASES } from './lexicon-data';

/** Learned data. `w`: word → count. `b`: previous word → (next word → count). Same shape as v8 `bornona.lex`. */
export interface WordBank {
  w: Record<string, number>;
  b: Record<string, Record<string, number>>;
}

export const emptyBank = (): WordBank => ({ w: {}, b: {} });

const splitL = (s: string) => [...new Set(s.split('|').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean))];

export const BASE_BN = splitL(LEX_BN_LEGAL + '|' + LEX_BN_COMMON);
export const BASE_EN = splitL(LEX_EN);

const SEED = new Map<string, Map<string, number>>();
splitL(SEED_PHRASES + '|' + LEX_BN_LEGAL + '|' + LEX_EN).forEach((ph) => {
  const ws = ph.split(' ');
  for (let i = 0; i + 1 < ws.length; i++) {
    const m = SEED.get(ws[i]) || new Map<string, number>();
    m.set(ws[i + 1], (m.get(ws[i + 1]) || 0) + 1);
    SEED.set(ws[i], m);
  }
});

const W = '[\\u0980-\\u09E5\\u09F0-\\u09FF\\u200C\\u200D]+|[A-Za-z][A-Za-z\'-]*';
const RE_TAIL = new RegExp('(' + W + ')$');
const RE_PREV = new RegExp('(' + W + ')[ \\t]+$');
const RE_WORD = new RegExp('^(?:' + W + ')$');

export function isWord(s: string): boolean {
  return RE_WORD.test(s);
}

/** Count one use of `w` (and the pair prev → w). Words shorter than 2 code points are ignored. */
export function learn(bank: WordBank, w: string, prev = ''): boolean {
  if (!w || !RE_WORD.test(w) || [...w].length < 2) return false;
  bank.w[w] = (bank.w[w] || 0) + 1;
  if (prev && RE_WORD.test(prev)) {
    const m = bank.b[prev] || (bank.b[prev] = {});
    m[w] = (m[w] || 0) + 1;
  }
  return true;
}

/** Learn the last word of `before` (called when a word is finished by a space or punctuation). */
export function learnTail(bank: WordBank, before: string): boolean {
  const m = before.match(RE_TAIL);
  if (!m) return false;
  const pm = before.slice(0, before.length - m[1].length).match(RE_PREV);
  return learn(bank, m[1], pm ? pm[1] : '');
}

/** Learn every word of a text. Returns how many words were counted. */
export function learnText(bank: WordBank, text: string): number {
  let n = 0;
  text.split(/[\n।?!;:,.()[\]{}"“”]+/).forEach((part) => {
    const ws = part.split(/\s+/).filter((x) => RE_WORD.test(x));
    ws.forEach((w, i) => {
      if ([...w].length >= 2) {
        learn(bank, w, ws[i - 1] || '');
        n++;
      }
    });
  });
  return n;
}

/** Keep the bank within limits (v8: >60 000 words → keep 55 000 most used; >40 next-words → keep 30). */
export function pruneBank(bank: WordBank): void {
  const ks = Object.keys(bank.w);
  if (ks.length > 60000) {
    ks.sort((a, b) => bank.w[a] - bank.w[b])
      .slice(0, ks.length - 55000)
      .forEach((k) => {
        delete bank.w[k];
        delete bank.b[k];
      });
  }
  for (const k in bank.b) {
    const m = bank.b[k];
    const e = Object.keys(m);
    if (e.length > 40) e.sort((a, b) => m[a] - m[b]).slice(0, e.length - 30).forEach((x) => delete m[x]);
  }
}

function nextFor(bank: WordBank, prev: string): Map<string, number> {
  const out = new Map(SEED.get(prev) || []);
  const m = bank.b[prev];
  if (m) for (const k in m) out.set(k, (out.get(k) || 0) + m[k] * 3);
  return out;
}

export interface SuggestContext {
  /** Part of the current word already typed ('' right after a space). */
  prefix: string;
  /** The word before it. */
  prev: string;
}

/** Context from the text before the caret (v8 `ctx`). */
export function contextOf(before: string): SuggestContext {
  const m = before.match(RE_TAIL);
  const prefix = m ? m[1] : '';
  const pm = before.slice(0, before.length - prefix.length).match(RE_PREV);
  return { prefix, prev: pm ? pm[1] : '' };
}

/** Suggestions for the text before the caret: up to 12 completions, or up to 10 next words. */
export function suggest(bank: WordBank, before: string): string[] {
  const c = contextOf(before);
  if (c.prefix) {
    const isEn = /^[A-Za-z]/.test(c.prefix);
    const key = isEn ? c.prefix.toLowerCase() : c.prefix;
    const cand = new Map<string, number>();
    const add = (w: string, s: number) => {
      if (w === c.prefix) return;
      const wl = isEn ? w.toLowerCase() : w;
      if (!wl.startsWith(key) || wl === key) return;
      cand.set(w, (cand.get(w) || 0) + s);
    };
    (isEn ? BASE_EN : BASE_BN).forEach((w) => add(w, 1));
    for (const w in bank.w) add(w, 2 + Math.min(bank.w[w], 40) * 2);
    if (c.prev) nextFor(bank, c.prev).forEach((s, w) => add(w, s * 25));
    let out = [...cand].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).slice(0, 12).map((x) => x[0]);
    if (isEn && /^[A-Z]/.test(c.prefix)) out = out.map((w) => w[0].toUpperCase() + w.slice(1));
    return out;
  }
  if (c.prev) return [...nextFor(bank, c.prev)].sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0]);
  return [];
}

/** Word-bank backup file (same format as v8 export). */
export interface WordBankFile {
  app: 'bornona-pad';
  version: 1;
  exported?: string;
  words: Record<string, number>;
  next?: Record<string, Record<string, number>>;
  corrections?: string;
}

/** Merge an exported file into a bank (counts are added, nothing is removed). Returns the number of new words. */
export function mergeBankFile(bank: WordBank, file: WordBankFile, fix: (s: string) => string): number {
  if (file.app !== 'bornona-pad' || !file.words) throw new Error('not a bornona-pad word bank');
  let n = 0;
  for (const w in file.words) {
    const k = fix(w);
    if (!bank.w[k]) n++;
    bank.w[k] = (bank.w[k] || 0) + (Number(file.words[w]) || 1);
  }
  for (const p in file.next || {}) {
    const m = bank.b[fix(p)] || (bank.b[fix(p)] = {});
    for (const w in file.next![p]) {
      const k = fix(w);
      m[k] = (m[k] || 0) + (Number(file.next![p][w]) || 1);
    }
  }
  return n;
}
