import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { toPlainText, toMarkdown } from '../../src/export/text';
import { toRtf, rtfText } from '../../src/export/rtf';
import { toHtmlDocument } from '../../src/export/html';
import { docxBuffer } from '../../src/docx-export';
import { toBijoy } from '../../src/bijoy';

const tx = (text: string, marks: object[] = []) => ({ type: 'text', text, marks });
const p = (content: object[], attrs: object = {}) => ({ type: 'paragraph', attrs, content });
const li = (text: string, attrs?: object) => ({ type: attrs ? 'taskItem' : 'listItem', attrs, content: [p([tx(text)])] });
const LEGAL = {
  type: 'doc',
  content: [
    p([tx('বণ্টনের মোকদ্দমা')], { pstyle: 'title' }),
    p([tx('বাদী '), tx('Plaintiff', [{ type: 'bold' }]), tx(' দলিল মূলে খরিদ করেন')], { pstyle: 'numbered' }),
    p([tx('দ্বিতীয় অনুচ্ছেদ')], { pstyle: 'numbered' }),
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [p([tx('দাগ')])] }, { type: 'tableHeader', content: [p([tx('পরিমাণ')])] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [p([tx('১২৩')])] }, { type: 'tableCell', content: [p([tx('৫ শতাংশ')])] }] }] },
    { type: 'pageBreak' },
    p([tx('শেষ')]),
  ],
};
const NOTE = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [tx('শুনানি')] },
    { type: 'bulletList', content: [li('প্রথম')] },
    { type: 'taskList', content: [li('কাজ', { checked: true }), li('বাকি', { checked: false })] },
    p([tx('গাঢ়', [{ type: 'bold' }]), tx(' ও '), tx('কাটা', [{ type: 'strike' }])]),
  ],
};

describe('.txt', () => {
  it('numbers, tables as tabs, page break as form feed, Windows line ends', () => {
    const s = toPlainText(LEGAL as never, { lang: 'bn', legal: true });
    expect(s.split('\r\n')).toEqual(['বণ্টনের মোকদ্দমা', '১।\tবাদী Plaintiff দলিল মূলে খরিদ করেন', '২।\tদ্বিতীয় অনুচ্ছেদ', 'দাগ\tপরিমাণ', '১২৩\t৫ শতাংশ', '\f', 'শেষ']);
    expect(toPlainText(LEGAL as never, { lang: 'en', legal: true })).toContain('1.\tবাদী');
  });
  it('notes: list markers and check boxes', () => {
    expect(toPlainText(NOTE as never, { lang: 'bn', legal: false }).split('\r\n')).toEqual(['শুনানি', '• প্রথম', '☑ কাজ', '☐ বাকি', 'গাঢ় ও কাটা']);
  });
});

describe('.md', () => {
  it('headings, bold, strike, task list, table', () => {
    const n = toMarkdown(NOTE as never, 'নোট', { lang: 'bn', legal: false });
    expect(n).toContain('# নোট');
    expect(n).toContain('## শুনানি');
    expect(n).toContain('- প্রথম');
    expect(n).toContain('- [x] কাজ');
    expect(n).toContain('**গাঢ়** ও ~~কাটা~~');
    const l = toMarkdown(LEGAL as never, 'আরজি', { lang: 'bn', legal: true });
    expect(l).toContain('# বণ্টনের মোকদ্দমা');
    expect(l).toContain('১। বাদী **Plaintiff** দলিল মূলে খরিদ করেন');
    expect(l).toContain('| দাগ | পরিমাণ |');
    expect(l).toContain('| --- | --- |');
  });
});

const balanced = (s: string) => {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '{') d++;
    if (s[i] === '}') d--;
    if (d < 0) return false;
  }
  return d === 0;
};

describe('.doc (RTF)', () => {
  it('ASCII only, balanced, Legal page, court styles, Bangla as \\u escapes, page number fields', () => {
    const r = toRtf(LEGAL as never, 'আরজি');
    expect(r.startsWith('{\\rtf1\\ansi')).toBe(true);
    expect(/^[\x00-\x7F]*$/.test(r)).toBe(true);
    expect(balanced(r)).toBe(true);
    expect(r).toContain('\\paperw12240\\paperh20160');
    expect(r).toContain('\\margt4320');
    expect(r).toContain('SutonnyOMJ');
    expect(r).toContain(rtfText('দলিল মূলে'));
    expect(r).toContain('\\li720\\fi-720');
    expect(r).toContain(rtfText('১।') + '}\\tab');
    expect(r).toContain('{\\field{\\*\\fldinst PAGE}');
    expect(r).toContain('NUMPAGES');
    expect(r).toContain('\\cellx');
    expect(r).toContain('\\page');
    expect(rtfText('ক')).toBe('\\u2453?');
    expect(rtfText('{a}\\')).toBe('\\{a\\}\\\\');
  });
  it('Bijoy (ANSI): Bangla converted, in SutonnyMJ; English kept in its own font', () => {
    const r = toRtf(LEGAL as never, 'আরজি', undefined, { ansi: { bijoyFont: 'SutonnyMJ', englishFont: 'Times New Roman' } });
    expect(balanced(r)).toBe(true);
    const fonts = r.match(/\{\\fonttbl(.*?)\}\n/)![1];
    expect(fonts).toContain('SutonnyMJ');
    expect(fonts).toContain('Times New Roman');
    expect(r).toContain(rtfText(toBijoy('দলিল মূলে খরিদ করেন')));
    expect(r).toMatch(/\\f(\d+)\\fs28\\b\\ab Plaintiff/);
    expect(r).not.toContain(rtfText('দলিল'));
  });
  it('English draft and Folio landscape', () => {
    const r = toRtf(LEGAL as never, 'x', undefined, { page: { lang: 'en', paper: 'folio', width: 11906, height: 18709, orientation: 'landscape' } });
    expect(r).toContain('\\paperw18709\\paperh11906');
    expect(r).toContain('\\landscape');
    expect(r).toContain('{\\rtlch\\fcs1\\af0\\afs28 \\ltrch\\fcs0\\f0\\fs28 1.}\\tab');
    expect(r).toContain('Times New Roman');
  });
});

describe('.docx (Bijoy ANSI)', () => {
  it('Bangla runs in SutonnyMJ as Bijoy text, English runs in the English font, numbers and footer in Bijoy', async () => {
    const z = await JSZip.loadAsync(await docxBuffer(LEGAL as never, 'x', undefined, { ansi: { bijoyFont: 'SutonnyMJ', englishFont: 'Times New Roman' } }));
    const doc = await z.file('word/document.xml')!.async('string');
    const footer = await z.file('word/footer1.xml')!.async('string');
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    expect(doc).toContain(esc(toBijoy(' দলিল মূলে খরিদ করেন')));
    expect(doc).toMatch(/w:ascii="Times New Roman"[\s\S]*?Plaintiff/);
    expect(doc).toContain(esc(toBijoy('১।')));
    expect(doc).not.toContain('দলিল');
    expect(footer).toContain(esc(toBijoy('পাতা – ')));
  });
});

describe('.html', () => {
  it('a standalone page with the paper size, margins and court styles', () => {
    const h = toHtmlDocument('<p data-pstyle="numbered">বাদী</p>', 'আরজি <১>');
    expect(h).toContain('<!doctype html>');
    expect(h).toContain('<meta charset="utf-8">');
    expect(h).toContain('<title>আরজি &lt;১&gt;</title>');
    expect(h).toContain('size: 8.500in 14.000in');
    expect(h).toContain('counter(pn, bengali)');
    expect(h).toContain('font-family: "SutonnyOMJ"');
  });
});
