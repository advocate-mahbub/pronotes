import { describe, it, expect } from 'vitest';
import { DEFAULT_QUOTES, fontSeed, quoteFor, sampleFor, EMPTY_EN } from '../../src/app/font-quotes';
import { toBijoy } from '../../src/bijoy';

// decisions.md 90: font samples are verses and hadith
const rotate = { mode: 'rotate' as const, list: null };
describe('font quotes', () => {
  it('41 quotes, each with Bangla, English and a source in both languages; the first is ০', () => {
    expect(DEFAULT_QUOTES).toHaveLength(41);
    expect(DEFAULT_QUOTES[0].bn).toBe('আল্লাহ ছাড়া কোন মাবুদ নাই');
    for (const q of DEFAULT_QUOTES) { expect(q.bn && q.en && q.src && q.srcEn).toBeTruthy(); expect(q.bn).not.toMatch(/\u09af\u09bc|\u09a1\u09bc/); }
  });
  it('a font keeps its quote; different fonts spread over the list', () => {
    expect(quoteFor('SutonnyMJ', rotate)).toBe(quoteFor('SutonnyMJ', rotate));
    expect(fontSeed('Kalpurush')).toBe(fontSeed('Kalpurush'));
    const seen = new Set(['Kalpurush', 'SutonnyMJ', 'Nikosh', 'Times New Roman', 'Arial', 'SolaimanLipi', 'Hind Siliguri', 'Noto Sans Bengali'].map((f) => quoteFor(f, rotate).bn));
    expect(seen.size).toBeGreaterThan(4);
  });
  it('one quote for all, when chosen', () => {
    expect(quoteFor('Nikosh', { mode: 'one', list: null })).toBe(DEFAULT_QUOTES[0]);
  });
  it('Bangla / Bijoy / English samples, with the fallbacks for empty boxes', () => {
    const one = { mode: 'one' as const, list: [{ bn: '', en: '', src: '', srcEn: '' }] };
    expect(sampleFor('X', 'uni', one, toBijoy).text).toBe(DEFAULT_QUOTES[0].bn);
    expect(sampleFor('X', 'en', one, toBijoy).text).toBe(EMPTY_EN);
    expect(sampleFor('X', 'ansi', { mode: 'one', list: null }, toBijoy).text).toBe(toBijoy(DEFAULT_QUOTES[0].bn));
    expect(sampleFor('X', 'en', { mode: 'one', list: null }, toBijoy).text).toBe('There is no god but Allah');
  });
});
