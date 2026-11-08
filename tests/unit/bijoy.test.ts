// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { toBijoy, toUnicode, looksBijoy, bijoyRuns, bijoyFromHtml, runsToClipboardHtml, convertBijoyPaste } from '../../src/bijoy';

const golden = (f: string) => JSON.parse(fs.readFileSync(new URL('../golden/' + f, import.meta.url), 'utf8'));
const g = golden('bijoy.json');
const ui = golden('bijoy-ui.json');

/** v8's output with the SutonnyMJ glyph fixes the owner asked for (decision 42). */
const ownerFix = (b: string) =>
  b.replace(/([¯š])—y/g, '$1‘').replace(/([¯š])—/g, '$1Í').replace(/i“/g, 'iæ').replace(/ª“/g, 'ªæ')
    .replace(/(^|[\s(])"/g, '$1Ò').replace(/"/g, 'Ó').replace(/(^|[\s(])'/g, '$1Ô').replace(/'/g, 'Õ');
/** straight quotes come back curly (Bijoy has only Ò Ó Ô Õ) */
const curly = (u: string) => u.replace(/(^|[\s(])"/g, '$1“').replace(/"/g, '”').replace(/(^|[\s(])'/g, '$1‘').replace(/'/g, '’');

describe('Bijoy converter matches v8 (with the owner\'s glyph fixes)', () => {
  it(`Unicode → Bijoy for ${g.enc.length} words and samples`, () => {
    for (const e of g.enc) expect(toBijoy(e.u), e.u).toBe(ownerFix(e.b));
  });
  it('round trip Unicode → Bijoy → Unicode returns the original', () => {
    let n = 0;
    for (const e of g.enc) {
      expect(toUnicode(toBijoy(e.u)), e.u).toBe(curly(e.u));
      n++;
    }
    expect(n).toBeGreaterThan(940);
  });
  it('named hard words', () => {
    for (const w of ['অন্তর্বর্তীকালীন', 'উল্লেখ্য', 'পৌরসভা', 'র‍্যাব', 'কার্য', 'ঊর্ধ্ব']) expect(toUnicode(toBijoy(w))).toBe(w);
  });
  it('Bijoy → Unicode samples', () => {
    for (const d of g.dec) expect(toUnicode(d.b)).toBe(d.u);
  });
  it('Bijoy detection', () => {
    for (const l of g.looks) expect(looksBijoy(l.s), l.s).toBe(l.v);
  });
});

describe('mixed Bangla/English', () => {
  it('runs keep English text as is', () => {
    for (const r of ui.runs) expect(bijoyRuns(r.s)).toEqual(r.runs.map((x: { en: boolean; text: string }) => (x.en ? x : { ...x, text: ownerFix(x.text) })));
  });
  it('clipboard HTML puts each run in its font', () => {
    const h = runsToClipboardHtml(bijoyRuns('নাম National (Jatiya).avrolayout'), 'SutonnyMJ', 'Times New Roman');
    expect(h).toContain("font-family:'Times New Roman'\">National (Jatiya).avrolayout</span>");
    expect(h).toContain("font-family:'SutonnyMJ'");
  });
  it('Word HTML paste converts only Bijoy-font runs', () => {
    for (const p of ui.pastes) {
      const u = bijoyFromHtml(p.html);
      expect(u ?? '').toBe(p.value);
    }
  });
});

describe('paste rule (v8)', () => {
  it('Word HTML with Bijoy runs is converted like the textarea paste', () => {
    for (const p of ui.pastes) {
      const r = convertBijoyPaste('x', p.html);
      if (p.value) expect(r?.text).toBe(p.value);
      else expect(r).toBeNull();
    }
  });
  it('plain Bijoy text is converted, Unicode and English are left alone', () => {
    const bj = g.dec[0].b as string;
    expect(convertBijoyPaste(bj, '')?.text).toBe(toUnicode(bj));
    expect(convertBijoyPaste('বাদী পক্ষ', '')).toBeNull();
    expect(convertBijoyPaste('The plaintiff filed the suit on 5 May 2024.', '')).toBeNull();
    expect(convertBijoyPaste('', '<b>x</b>')).toBeNull();
  });
});
