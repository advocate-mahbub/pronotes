import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { docxBuffer, docxFileName, PAGE } from '../../src/docx-export';

const t = (text: string, marks?: string[]) => ({ type: 'text', text, ...(marks ? { marks: marks.map((m) => ({ type: m })) } : {}) });
const p = (pstyle: string, ...content: object[]) => ({ type: 'paragraph', attrs: { pstyle }, content });
const cell = (type: string, text: string) => ({ type, content: [p('normal', t(text))] });
export const SAMPLE = {
  type: 'doc',
  content: [
    p('heading', t('বিজ্ঞ যুগ্ম জেলা জজ আদালত, ঢাকা')),
    p('title', t('স্বত্ব ঘোষণার মোকদ্দমা')),
    p('party', t('বাদী: ক খ', ['bold'])),
    p('party2', t('পিতা: গ ঘ')),
    p('right', t('…বাদী')),
    p('normal', t('বাদী পক্ষ সবিনয় নিবেদন এই যে,')),
    p('numbered', t('নালিশী সম্পত্তি দলিল মূলে খরিদ করেন।')),
    p('numbered', t('উক্ত '), t('সম্পত্তি', ['underline']), t(' এখতিয়ার', ['highlight'])),
    { type: 'table', content: [
      { type: 'tableRow', content: [cell('tableHeader', 'ক্রম'), cell('tableHeader', 'মৌজা'), cell('tableHeader', 'দাগ'), cell('tableHeader', 'বিবরণ')] },
      { type: 'tableRow', content: [cell('tableCell', '১'), cell('tableCell', 'ক'), cell('tableCell', '১২৩'), cell('tableCell', '৫ শতাংশ')] },
    ] },
    p('numbered', t('তৃতীয় অনুচ্ছেদ')),
  ],
};

async function unzip() {
  const zip = await JSZip.loadAsync(await docxBuffer(SAMPLE, 'নমুনা'));
  const read = (f: string) => zip.file(f)!.async('string');
  return { doc: await read('word/document.xml'), styles: await read('word/styles.xml'), footer: await read('word/footer1.xml') };
}

describe('.docx export matches the court format', () => {
  it('Legal paper and margins (twips)', async () => {
    const { doc } = await unzip();
    expect(doc).toContain(`<w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"`);
    expect(doc).toMatch(/<w:pgMar w:top="4320" w:right="1440" w:bottom="2160" w:left="2160" w:header="706" w:footer="1440"/);
  });
  it('SutonnyOMJ 14 pt (also for complex script), 1.5 lines, 6 pt after', async () => {
    const { styles } = await unzip();
    expect(styles).toMatch(/<w:rFonts w:ascii="SutonnyOMJ" w:cs="SutonnyOMJ" w:eastAsia="SutonnyOMJ" w:hAnsi="SutonnyOMJ"\/>/);
    const defaults = styles.slice(styles.indexOf('<w:docDefaults>'), styles.indexOf('</w:docDefaults>'));
    expect(defaults).toContain('<w:sz w:val="28"/>');
    expect(defaults).toContain('<w:szCs w:val="28"/>');
    expect(styles).toMatch(/<w:spacing w:after="120" w:line="360" w:lineRule="auto"\/>/);
  });
  it('paragraph styles: indents and alignment', async () => {
    const { styles } = await unzip();
    const s = (id: string) => styles.slice(styles.indexOf(`w:styleId="${id}"`), styles.indexOf('</w:style>', styles.indexOf(`w:styleId="${id}"`)));
    expect(s('PNNormal')).toContain('<w:jc w:val="both"/>');
    expect(s('PNNormal')).toContain('<w:ind w:firstLine="720"/>');
    expect(s('PNNumbered')).toMatch(/<w:ind w:left="720" w:hanging="720"\/>/);
    expect(s('PNHeading')).toContain('<w:jc w:val="center"/>');
    expect(s('PNHeading')).toContain('<w:b/>');
    expect(s('PNParty')).toContain('<w:ind w:left="3280"/>');
    expect(s('PNParty2')).toContain('<w:ind w:left="3680"/>');
    expect(s('PNRight')).toContain('<w:jc w:val="right"/>');
    expect(s('PNTitle')).toContain('<w:sz w:val="46"/>');
    expect(s('PNTitle')).toContain('<w:szCs w:val="46"/>');
  });
  it('Bangla paragraph numbers continue across a table; tab after the number', async () => {
    const { doc } = await unzip();
    const nums = [...doc.matchAll(/<w:t xml:space="preserve">([০-৯]+।)<\/w:t><w:tab\/>/g)].map((m) => m[1]);
    expect(nums).toEqual(['১।', '২।', '৩।']);
  });
  it('marks: bold, underline, highlight', async () => {
    const { doc } = await unzip();
    expect(doc).toMatch(/<w:b\/>[\s\S]*?বাদী: ক খ/);
    expect(doc).toMatch(/<w:u w:val="single"\/>[\s\S]*?সম্পত্তি/);
    expect(doc).toMatch(/<w:highlight w:val="yellow"\/>[\s\S]*?এখতিয়ার/);
  });
  it('schedule table: 4 columns 700/1700/1900/4300 with single borders', async () => {
    const { doc } = await unzip();
    expect(doc).toContain('<w:gridCol w:w="700"/><w:gridCol w:w="1700"/><w:gridCol w:w="1900"/><w:gridCol w:w="4300"/>');
    expect(doc).toMatch(/<w:tblBorders><w:top w:val="single"/);
  });
  it('footer at the right: পাতা – PAGE/NUMPAGES', async () => {
    const { footer } = await unzip();
    expect(footer).toContain('পাতা – ');
    expect(footer).toMatch(/PAGE[\s\S]*NUMPAGES/);
    expect(footer).toContain('<w:jc w:val="right"/>');
  });
  it('safe file names', () => {
    expect(docxFileName('আরজি: স্বত্ব/দখল')).toBe('আরজি স্বত্ব দখল.docx');
    expect(docxFileName('  ')).toBe('ProNotes.docx');
  });
});
