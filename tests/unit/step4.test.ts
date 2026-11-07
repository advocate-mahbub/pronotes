import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { docxBuffer } from '../../src/docx-export';
import { envelopePage, physicalPage, PAPERS, mm } from '../../src/docx-export/page';
import { toRtf } from '../../src/export/rtf';
import { toPlainText } from '../../src/export/text';
import { toBijoy, isBijoyFont } from '../../src/bijoy';
import { envelopeContent, RECIPIENT_INDENT } from '../../src/templates/envelope';
import { isAnsiKey } from '../../src/bornona-engine';

const ANSI = { bijoyFont: 'SutonnyMJ', englishFont: 'Times New Roman' };
const font = (f: string) => [{ type: 'textStyle', attrs: { fontFamily: `"${f}"` } }];
/** A draft with one word typed in Unicode and one typed in Bijoy (ANSI typing). */
const MIXED = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'জমি ' },
    { type: 'text', text: toBijoy('দলিল'), marks: font('SutonnyMJ') },
  ] }],
};

describe('envelope', () => {
  it('DL, #10 and C5 sizes; landscape, no page numbers', () => {
    expect(PAPERS['env-dl']).toMatchObject({ width: mm(110), height: mm(220) });
    expect(PAPERS['env-10']).toMatchObject({ width: 5940, height: 13680 });
    expect(PAPERS['env-c5']).toMatchObject({ width: mm(162), height: mm(229) });
    const e = envelopePage('env-dl');
    expect(e.orientation).toBe('landscape');
    expect(e.pageNumbers.show).toBe(false);
  });
  it('template has placeholders only, recipient indented', () => {
    const c = envelopeContent('bn');
    const text = JSON.stringify(c);
    expect(text).toContain('[নাম]');
    expect(c.content!.filter((p) => p.attrs?.indL === RECIPIENT_INDENT).length).toBe(4);
    expect(JSON.stringify(envelopeContent('en'))).toContain('[Name]');
  });
  it('turned text: upright paper, margins turned with the text', () => {
    const e = { ...envelopePage('env-dl'), margins: { top: 100, right: 200, bottom: 300, left: 400 } };
    expect(physicalPage(e)).toEqual({ w: mm(220), h: mm(110), margins: e.margins, landscape: true });
    const tb = physicalPage({ ...e, textDir: 'tb' });
    expect(tb).toMatchObject({ w: mm(110), h: mm(220), landscape: false });
    // read top → paper right; read left → paper top
    expect(tb.margins).toEqual({ top: 400, right: 100, bottom: 200, left: 300 });
    const bt = physicalPage({ ...e, textDir: 'bt' });
    expect(bt.margins).toEqual({ top: 200, right: 300, bottom: 400, left: 100 });
  });
  it('Word file: upright envelope with tbRl / btLr text direction', async () => {
    for (const [dir, val] of [['tb', 'tbRl'], ['bt', 'btLr']] as const) {
      const zip = await JSZip.loadAsync(await docxBuffer(envelopeContent() as never, 'খাম', undefined, { page: { ...envelopePage('env-dl'), textDir: dir } }));
      const xml = await zip.file('word/document.xml')!.async('string');
      expect(xml).toContain(`<w:textDirection w:val="${val}"/>`);
      expect(xml).toMatch(new RegExp(`<w:pgSz w:w="${mm(110)}" w:h="${mm(220)}"`));
      expect(xml).not.toContain('w:orient="landscape"');
    }
  });
  it('.doc (RTF): stextflow for turned text, landscape otherwise', () => {
    const page = envelopePage('env-dl');
    expect(toRtf(envelopeContent() as never, 'খাম', undefined, { page })).toContain('\\lndscpsxn');
    const r = toRtf(envelopeContent() as never, 'খাম', undefined, { page: { ...page, textDir: 'tb' } });
    expect(r).toContain('\\stextflow1');
    expect(r).toContain(`\\paperw${mm(110)}\\paperh${mm(220)}`);
    expect(r).not.toContain('\\lndscpsxn');
    // bottom to top is not written to .doc (no verified RTF code): the page stays as seen
    const bt = toRtf(envelopeContent() as never, 'খাম', undefined, { page: { ...page, textDir: 'bt' } });
    expect(bt).not.toContain('\\stextflow');
    expect(bt).toContain('\\lndscpsxn');
  });
});

describe('text typed in Bijoy (ANSI typing)', () => {
  it('Bijoy fonts are told from Unicode ones', () => {
    expect(isBijoyFont('"SutonnyMJ"')).toBe(true);
    expect(isBijoyFont('SulekhaT')).toBe(true);
    expect(isBijoyFont('SutonnyOMJ')).toBe(false);
    expect(isBijoyFont('Noto Serif Bengali')).toBe(false);
    expect(isBijoyFont('MyFont', 'MyFont')).toBe(true);
  });
  it('.txt gives it back in Unicode', () => {
    expect(toPlainText(MIXED as never, { lang: 'bn', legal: false }).trim()).toBe('জমি দলিল');
  });
  it('Bijoy .doc keeps it as is (not converted twice), Unicode part converted', () => {
    const r = toRtf(MIXED as never, 'x', undefined, { ansi: ANSI });
    const body = r.slice(r.indexOf('\\sectd'));
    // toBijoy('দলিল') appears exactly once and toBijoy(toBijoy(..)) never
    expect(body).toContain(toBijoy('দলিল'));
    expect(body).toContain(toBijoy('জমি'));
  });
  it('Bijoy Word file keeps it in SutonnyMJ', async () => {
    const zip = await JSZip.loadAsync(await docxBuffer(MIXED as never, 'x', undefined, { ansi: ANSI }));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain(toBijoy('দলিল'));
    expect(xml).toContain(toBijoy('জমি'));
  });
  it('switch keys', () => {
    const ev = (code: string, o: Record<string, boolean> = {}) => ({ code, key: '', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, ...o });
    expect(isAnsiKey(ev('KeyA', { shiftKey: true }), 'ctrl+shift+a')).toBe(true);
    expect(isAnsiKey(ev('KeyA'), 'ctrl+shift+a')).toBe(false);
    expect(isAnsiKey(ev('Period'), 'ctrl+period')).toBe(true);
    expect(isAnsiKey(ev('KeyA', { shiftKey: true }), 'none')).toBe(false);
  });
});
