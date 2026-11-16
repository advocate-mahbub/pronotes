// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { toBijoy, toUnicode, looksBijoy, bijoyRuns, bijoyFromHtml, runsToClipboardHtml, convertBijoyPaste } from '../../src/bijoy';

const golden = (f: string) => JSON.parse(fs.readFileSync(new URL('../golden/' + f, import.meta.url), 'utf8'));
const g = golden('bijoy.json');
const ui = golden('bijoy-ui.json');

/** v8's output with the SutonnyMJ glyph fixes the owner asked for (decision 42). */
const ownerFix = (b: string) =>
  b.replace(/([“‘])†/g, '$1‡') // ে-কার after a letter drawn with “ ‘ (রু …) is in-word (owner, 17 Nov 2026)
    .replace(/([¯š])—y/g, '$1‘').replace(/([¯š])—/g, '$1Í').replace(/i“/g, 'iæ').replace(/ª“/g, 'ªæ')
    .replace(/(^|[\s(])"/g, '$1Ò').replace(/"/g, 'Ó').replace(/(^|[\s(])'/g, '$1Ô').replace(/'/g, 'Õ')
    // র-ফলা shape by letter, as in the approved Bijoy Classic layout (owner, 16 Nov 2026)
    .replace(/(®ú|[cMk])«/g, '$1Ö').replace(/([^dnQ³¼Üîù])«/g, '$1ª');
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
  it('র-ফলা takes the shape SutonnyMJ uses for each letter (প্র cÖ, গ্র MÖ, শ্র kÖ …)', () => {
    const cases: [string, string][] = [
      ['প্র', 'cÖ'], ['গ্র', 'MÖ'], ['শ্র', 'kÖ'], ['প্রতি', 'cÖwZ'], ['গ্রাম', 'MÖvg'], ['শ্রেণি', '†kÖwY'], ['ষ্প্র', '®úÖ'],
      ['হ্রাস', 'n«vm'], ['ফ্রান্স', 'd«vÝ'],
      ['দ্রুত', '`ªæZ'], ['ব্রিটিশ', 'weªwUk'], ['ট্রেন', '†Uªb'], ['খ্রিস্টান', 'wLª÷vb'], ['স্প্রে', '†¯úª'],
      ['ক্রয়', 'µq'], ['ত্রুটি', 'ÎywU'],
    ];
    for (const [u, b] of cases) {
      expect(toBijoy(u), u).toBe(b);
      expect(toUnicode(b), b).toBe(u);
    }
  });
  it('ে-কার after রু (and other letters drawn with “ ‘) stays the in-word ‡', () => {
    const cases: [string, string][] = [['ফারুকের', 'dviæ‡Ki'], ['রুকে', 'iæ‡K'], ['গুরুতে', '¸iæ‡Z'], ['শুরুতেই', 'ïiæ‡ZB'], ['কে', '†K'], ['“কে”', 'Ò†KÓ']];
    for (const [u, b] of cases) {
      expect(toBijoy(u), u).toBe(b);
      expect(toUnicode(b), b).toBe(u);
    }
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
