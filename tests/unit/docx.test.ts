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

const xmlOf = async (doc: object, opts?: object, f?: object) => {
  const z = await JSZip.loadAsync(await docxBuffer(doc as never, 'x', f as never, opts as never));
  return { doc: await z.file('word/document.xml')!.async('string'), styles: await z.file('word/styles.xml')!.async('string'),
    numbering: (await z.file('word/numbering.xml')?.async('string')) ?? '', footer: await z.file('word/footer1.xml')?.async('string') };
};
const tx = (text: string, marks: object[] = []) => ({ type: 'text', text, marks });
const para = (content: object[], attrs: object = {}) => ({ type: 'paragraph', attrs, content });

describe('notes: headings, real Word lists, page breaks', () => {
  it('headings use Word heading styles; lists use Word numbering; checklists keep their boxes', async () => {
    const li = (text: string, attrs?: object) => ({ type: attrs ? 'taskItem' : 'listItem', attrs, content: [para([tx(text)])] });
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [tx('শুনানির নোট')] },
        { type: 'bulletList', content: [li('প্রথম')] },
        { type: 'orderedList', attrs: { start: 1 }, content: [li('দ্বিতীয়')] },
        { type: 'taskList', content: [li('তৃতীয়', { checked: true })] },
        { type: 'pageBreak' },
        para([tx('শেষ')]),
      ],
    };
    const x = await xmlOf(doc, { kind: 'note' });
    for (const s of ['শুনানির নোট', 'প্রথম', 'দ্বিতীয়', 'তৃতীয়', 'শেষ', '☑']) expect(x.doc).toContain(s);
    expect(x.doc).toContain('<w:pStyle w:val="Heading1"/>');
    expect(x.doc).toMatch(/<w:numPr>/);
    expect(x.numbering).toContain('w:val="bullet"');
    expect(x.numbering).toContain('w:val="decimal"');
    expect(x.doc).toContain('<w:br w:type="page"/>');
    // notes: A4, 1" margins, the app font
    expect(x.doc).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    expect(x.styles).toContain('Noto Sans Bengali');
  });
});

describe('direct formats from the ribbon reach Word', () => {
  it('character formats: font, size, colour, strike, super/sub, Scale, Spacing, Position, Kerning, underline style, small caps', async () => {
    const ts = { type: 'textStyle', attrs: { fontFamily: '"Kalpurush"', fontSize: '20pt', color: '#C62828', scale: 150, spacing: 2, position: 3, kern: 12, smallCaps: true } };
    const doc = { type: 'doc', content: [para([tx('বাদী', [ts, { type: 'strike' }, { type: 'underline', attrs: { ustyle: 'double' } }]), tx('2', [{ type: 'superscript' }]), tx('x', [{ type: 'highlight', attrs: { color: '#c5e1a5' } }])])] };
    const { doc: d } = await xmlOf(doc);
    for (const s of ['w:ascii="Kalpurush"', '<w:sz w:val="40"/>', '<w:color w:val="C62828"/>', '<w:strike/>', '<w:w w:val="150"/>', '<w:spacing w:val="40"/>', '<w:position w:val="6"/>', '<w:kern w:val="24"/>', '<w:smallCaps/>', '<w:u w:val="double"/>', '<w:vertAlign w:val="superscript"/>', '<w:highlight w:val="green"/>'])
      expect(d, s).toContain(s);
  });
  it('paragraph formats: alignment, indents, hanging, spacing, exact line, keep options', async () => {
    const a = { textAlign: 'center', indL: 1134, indR: 567, first: -567, spBefore: 6, spAfter: 12, lineRule: 'exact', lineVal: 18, keepNext: true, keepLines: true, breakBefore: true, widow: false };
    const { doc: d } = await xmlOf({ type: 'doc', content: [para([tx('ক')], a)] });
    for (const s of ['<w:jc w:val="center"/>', 'w:left="1134"', 'w:right="567"', 'w:hanging="567"', 'w:before="120"', 'w:after="240"', 'w:line="360"', 'w:lineRule="exact"', '<w:keepNext/>', '<w:keepLines/>', '<w:pageBreakBefore/>', '<w:widowControl w:val="false"/>'])
      expect(d, s).toContain(s);
  });
});

describe('page setup', () => {
  it('Folio landscape with narrow margins; page number centred, number only', async () => {
    const page = { paper: 'folio', width: 11906, height: 18709, orientation: 'landscape', margins: { top: 720, right: 720, bottom: 720, left: 720 }, pageNumbers: { show: true, align: 'center', style: 'number' } };
    const x = await xmlOf({ type: 'doc', content: [para([tx('ক')])] }, { page });
    expect(x.doc).toMatch(/<w:pgSz w:w="18709" w:h="11906" w:orient="landscape"\/>/);
    expect(x.doc).toContain('w:top="720"');
    expect(x.footer).toContain('<w:jc w:val="center"/>');
    expect(x.footer).not.toContain('পাতা');
  });
  it('English draft: "1." numbers, "Page X of Y", English font', async () => {
    const x = await xmlOf({ type: 'doc', content: [para([tx('The plaintiff')], { pstyle: 'numbered' })] }, { page: { lang: 'en' } });
    expect(x.doc).toContain('>1.</w:t><w:tab/>');
    expect(x.footer).toContain('Page ');
    expect(x.footer).toContain(' of ');
    expect(x.styles).toContain('Times New Roman');
  });
  it('page numbers can be turned off', async () => {
    const x = await xmlOf({ type: 'doc', content: [para([tx('ক')])] }, { page: { pageNumbers: { show: false } } });
    expect(x.footer).toBeUndefined();
  });
});
