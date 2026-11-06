import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { emptyBank, suggest, learnText, learnTail, mergeBankFile, pruneBank } from '../../src/suggest';
import { fixNukta } from '../../src/bornona-engine';

const g = JSON.parse(fs.readFileSync(new URL('../golden/suggest.json', import.meta.url), 'utf8'));

describe('suggestions match v8', () => {
  it('with an empty word bank', () => {
    const bank = emptyBank();
    for (const [pre, chips] of Object.entries(g.fresh)) expect(suggest(bank, pre), pre).toEqual(chips);
  });
  it('after learning a text', () => {
    const bank = emptyBank();
    learnText(bank, g.learnText);
    expect(bank).toEqual(g.lex);
    for (const [pre, chips] of Object.entries(g.learned)) expect(suggest(bank, pre), pre).toEqual(chips);
  });
});

describe('learning', () => {
  it('learns the finished word with its previous word', () => {
    const bank = emptyBank();
    learnTail(bank, 'বাদী মোকদ্দমা');
    expect(bank.w['মোকদ্দমা']).toBe(1);
    expect(bank.b['বাদী']['মোকদ্দমা']).toBe(1);
  });
  it('merges an exported v8 word bank file', () => {
    const bank = emptyBank();
    const n = mergeBankFile(bank, { app: 'bornona-pad', version: 1, words: { 'দলিল': 3, 'নতুনয়': 1 }, next: { 'দলিল': { 'মূলে': 2 } } }, fixNukta);
    expect(n).toBe(2);
    expect(bank.w['নতুনয়']).toBe(1);
    expect(() => mergeBankFile(bank, { app: 'x' } as never, fixNukta)).toThrow();
  });
  it('prunes long next-word lists to 30', () => {
    const bank = emptyBank();
    bank.b['ক'] = Object.fromEntries(Array.from({ length: 41 }, (_, i) => ['w' + i, i + 1]));
    pruneBank(bank);
    expect(Object.keys(bank.b['ক']).length).toBe(30);
  });
});
