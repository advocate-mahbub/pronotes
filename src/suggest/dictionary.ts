/**
 * Bangla word list for suggestions (owner's decision 56): words.txt from
 * github.com/habibullahnaiem/bangla-spellcheck-dict, cleaned (affixes, multi-word entries,
 * superscripts and non-Bangla entries removed; য়/ড়/ঢ় precomposed), one word per line, sorted.
 * Shipped as public/dict/bn-words.txt and loaded after the app starts; the owner's own words
 * always rank above it.
 */
let WORDS: string[] = [];

export const DICTIONARY_URL = './dict/bn-words.txt';

export function setDictionary(text: string): number {
  WORDS = text.split('\n').filter(Boolean);
  // the file is sorted by code point; keep it so even if it was edited by hand
  for (let i = 1; i < WORDS.length; i++) if (WORDS[i - 1] > WORDS[i]) { WORDS.sort(); break; }
  return WORDS.length;
}

export const dictionarySize = () => WORDS.length;
export const clearDictionary = () => { WORDS = []; };
export const inDictionary = (w: string) => {
  const i = lowerBound(w);
  return i < WORDS.length && WORDS[i] === w;
};

function lowerBound(key: string): number {
  let lo = 0;
  let hi = WORDS.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (WORDS[mid] < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Up to `limit` dictionary words that start with `prefix`, shortest first. */
export function dictionaryWords(prefix: string, limit = 24, scan = 20000): string[] {
  if (!prefix || !WORDS.length) return [];
  const out: string[] = [];
  for (let i = lowerBound(prefix), n = 0; i < WORDS.length && n < scan && WORDS[i].startsWith(prefix); i++, n++) {
    if (WORDS[i] !== prefix) out.push(WORDS[i]);
  }
  return out.sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).slice(0, limit);
}

/** Loads the list once (the service worker keeps it for offline use). The preview build carries it inline. */
let loading: Promise<number> | null = null;
export function loadDictionary(fetchImpl: typeof fetch = fetch): Promise<number> {
  if (loading) return loading;
  const inline = (globalThis as { __PN_DICT?: string }).__PN_DICT;
  loading = inline
    ? Promise.resolve(setDictionary(inline))
    : fetchImpl(DICTIONARY_URL).then((r) => (r.ok ? r.text() : '')).then(setDictionary).catch(() => 0);
  return loading;
}

/** Lets the list be loaded again after it was turned off. */
export const resetDictionaryLoad = () => { loading = null; };
