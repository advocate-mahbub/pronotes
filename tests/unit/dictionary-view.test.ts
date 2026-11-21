import { describe, it, expect } from 'vitest';
import { reflow, groupEntries, withoutHead } from '../../src/app/LawDictionary';
import type { DictionaryEntry } from '../../src/storage';

// decisions.md 92
describe('dictionary view', () => {
  it('PDF line breaks become one paragraph', () => {
    expect(reflow('A right of\nway over\n  land.')).toBe('A right of way over land.');
    expect(reflow('way-\nleave')).toBe('way-leave');
  });
  it('the headword and part of speech at the start are not repeated', () => {
    expect(withoutHead('easement n. A right enjoyed', 'easement')).toBe('A right enjoyed');
    expect(withoutHead('A rule of evidence.', 'estoppel')).toBe('A rule of evidence.');
  });
  it('copies of one headword are one word', () => {
    const e = (id: string, t: string) => ({ id, title: t, normalizedTitle: t.toLowerCase(), language: 'en' } as DictionaryEntry);
    expect(groupEntries([e('1', 'Easement'), e('2', 'easement'), e('3', 'estoppel')]).map((g) => g.map((x) => x.id))).toEqual([['1', '2'], ['3']]);
  });
});
