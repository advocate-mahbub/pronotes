// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Node } from '@tiptap/pm/model';
import { isBijoyFont, setAnsiFamilies, toBijoy } from '../../src/bijoy';
import { fontMatches, LOCAL_ANSI } from '../../src/fonts';
import { editorExtensions, findMatches } from '../../src/editor';

const schema = getSchema(editorExtensions({ getConfig: () => ({ bangla: true, map: {}, vowelForming: true, oldReph: false, suspended: false }) as never }));
const t = (text: string, font?: string) => ({ type: 'text', text, ...(font ? { marks: [{ type: 'textStyle', attrs: { fontFamily: `"${font}"` } }] } : {}) });
const doc = (...content: object[]) => Node.fromJSON(schema, { type: 'doc', content: [{ type: 'paragraph', content }] });

describe('which fonts are Bijoy (ANSI)', () => {
  it('by name, and fonts the user added as ANSI', () => {
    expect(isBijoyFont('SutonnyMJ')).toBe(true);
    expect(isBijoyFont('"JamunaMJ", serif')).toBe(true);
    expect(isBijoyFont('SutonnyOMJ')).toBe(false); // Unicode
    expect(isBijoyFont('Kalpurush ANSI')).toBe(false);
    setAnsiFamilies(['SutonnyMJ', 'Kalpurush ANSI']);
    expect(isBijoyFont('Kalpurush ANSI')).toBe(true);
    setAnsiFamilies([]);
  });
  it('the catalogue lists at least ten Bijoy font names, all recognised', () => {
    expect(LOCAL_ANSI.length).toBeGreaterThanOrEqual(10);
    for (const f of LOCAL_ANSI) expect(isBijoyFont(f), f).toBe(true);
  });
});

describe('font search', () => {
  it('English name parts and Bangla names, spaces ignored', () => {
    expect(fontMatches('SutonnyMJ', 'sut')).toBe(true);
    expect(fontMatches('Noto Serif Bengali', 'notoserif')).toBe(true);
    expect(fontMatches('SutonnyMJ', 'সুতন্নী')).toBe(true);
    expect(fontMatches('JamunaMJ', 'যমুনা')).toBe(true);
    expect(fontMatches('Nikosh', 'নিকোশ')).toBe(true);
    expect(fontMatches('Nikosh', 'যমুনা')).toBe(false);
    expect(fontMatches('SutonnyMJ', 'xyz')).toBe(false);
  });
});

describe('find in Bijoy text with a Unicode query', () => {
  it('finds a word in SutonnyMJ text and in Unicode text, each once', () => {
    const d = doc(t('দলিল মূলে ', undefined), t(toBijoy('দলিল মূলে খরিদ'), 'SutonnyMJ'));
    const m = findMatches(d, 'দলিল');
    expect(m.length).toBe(2);
    expect(m.map((x) => !!x.bj)).toEqual([false, true]);
    // the Bijoy match covers exactly the Bijoy spelling
    expect(d.textBetween(m[1].from, m[1].to)).toBe(toBijoy('দলিল'));
  });
  it('ে-কার words match at a word start and inside a word', () => {
    const d = doc(t(toBijoy('বেশি এবং লেখা'), 'SutonnyMJ'));
    expect(findMatches(d, 'বেশি').length).toBe(1);
    expect(findMatches(d, 'লেখা').length).toBe(1);
  });
  it('Latin letters inside Bijoy text never match an English query by accident', () => {
    const d = doc(t(toBijoy('আমার'), 'SutonnyMJ'), t(' Avgvi', 'Times New Roman'));
    expect(findMatches(d, 'Avgvi').length).toBe(1); // only the English run
  });
});
