import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { setDictionary, dictionaryWords, inDictionary, dictionarySize, suggest, emptyBank, loadDictionary, resetDictionaryLoad, clearDictionary } from '../../src/suggest';

const text = fs.readFileSync('public/dict/bn-words.txt', 'utf8');

describe('Bangla word list file (decision 56)', () => {
  const words = text.split('\n').filter(Boolean);
  it('is clean: one Bangla word per line, sorted, no duplicates, precomposed য়/ড়/ঢ়', () => {
    expect(words.length).toBeGreaterThan(170000);
    expect(new Set(words).size).toBe(words.length);
    for (let i = 1; i < words.length; i++) expect(words[i - 1] < words[i]).toBe(true);
    const bad = words.filter((w) => !/^[\u0980-\u09FF\u200C\u200D]{2,}$/.test(w));
    expect(bad).toEqual([]);
    expect(words.filter((w) => /\u09AF\u09BC|\u09A1\u09BC|\u09A2\u09BC/.test(w))).toEqual([]);
  });
  it('has the everyday legal words', () => {
    setDictionary(text);
    for (const w of ['দলিল', 'খতিয়ান', 'মোকদ্দমা', 'বিবাদী', 'এখতিয়ার', 'ওয়ারিশ', 'হিস্যা', 'তফসিল', 'আরজি']) expect(inDictionary(w), w).toBe(true);
  });
});

describe('dictionary in suggestions', () => {
  beforeAll(() => setDictionary(['উসকানি', 'উসকে', 'উসকানিমূলক', 'কলম', 'কলমি'].sort().join('\n')));
  it('prefix lookup, shortest first, not the word itself', () => {
    expect(dictionarySize()).toBe(5);
    expect(dictionaryWords('উস')).toEqual(['উসকে', 'উসকানি', 'উসকানিমূলক']);
    expect(dictionaryWords('কলম')).toEqual(['কলমি']);
    expect(dictionaryWords('')).toEqual([]);
  });
  it('the owner’s own words come first; one letter does not pull in the dictionary; can be turned off', () => {
    const bank = emptyBank();
    bank.w['উসকানিদাতা'] = 3;
    expect(suggest(bank, 'উস')[0]).toBe('উসকানিদাতা');
    expect(suggest(bank, 'উস')).toContain('উসকে');
    expect(suggest(emptyBank(), 'উ')).not.toContain('উসকে');
    expect(suggest(bank, 'উস', { dictionary: false })).not.toContain('উসকে');
  });
  it('loads from the inline copy (preview) or the file, once', async () => {
    clearDictionary(); resetDictionaryLoad();
    (globalThis as { __PN_DICT?: string }).__PN_DICT = 'কক\nখখ';
    expect(await loadDictionary()).toBe(2);
    delete (globalThis as { __PN_DICT?: string }).__PN_DICT;
    clearDictionary(); resetDictionaryLoad();
    let calls = 0;
    const f = (async () => { calls++; return new Response('গগ\nঘঘ\nঙঙ'); }) as unknown as typeof fetch;
    expect(await loadDictionary(f)).toBe(3);
    expect(await loadDictionary(f)).toBe(3);
    expect(calls).toBe(1);
  });
});
