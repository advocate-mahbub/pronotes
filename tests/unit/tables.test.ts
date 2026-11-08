import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { cellNumber, formatSum, splitRows, sortOrder, quickTableJSON, QUICK_TABLES } from '../../src/editor/table-tools';
import { tableModel, boldContent } from '../../src/export/table-model';
import { docxBuffer } from '../../src/docx-export';
import { toRtf } from '../../src/export/rtf';

const t = (text: string) => ({ type: 'text', text });
const c = (text: string, attrs: Record<string, unknown> = {}, type = 'tableCell') => ({ type, attrs, content: [{ type: 'paragraph', content: text ? [t(text)] : [] }] });
const row = (cells: object[], attrs: Record<string, unknown> = {}) => ({ type: 'tableRow', attrs, content: cells });
const doc = (table: object) => ({ type: 'doc', content: [table] });

describe('table helpers', () => {
  it('reads numbers written in cells', () => {
    expect(cellNumber('১,২৫,০০০/-')).toBe(125000);
    expect(cellNumber('৫.২৫ শতক')).toBe(5.25);
    expect(cellNumber('টাকা 300')).toBe(300);
    expect(cellNumber('দাগ ১২ ও ১৩')).toBeNull();
    expect(cellNumber('')).toBeNull();
  });
  it('writes the sum like the column', () => {
    expect(formatSum(5.75, ['২.৫০', '৩.২৫'])).toBe('৫.৭৫');
    expect(formatSum(125000, ['1,00,000', '25,000'])).toBe('1,25,000');
    expect(formatSum(1250000, ['১২,৫০,০০০'])).toBe('১২,৫০,০০০');
    expect(formatSum(12, ['5', '7'])).toBe('12');
  });
  it('splits text into rows and cells', () => {
    expect(splitRows(['ক\tখ', 'গ\tঘ\tঙ'], 'auto')).toEqual([['ক', 'খ', ''], ['গ', 'ঘ', 'ঙ']]);
    expect(splitRows(['| ক | খ |', '| গ | ঘ |'], 'auto')).toEqual([['ক', 'খ'], ['গ', 'ঘ']]);
    expect(splitRows(['ক, খ', '', 'গ,ঘ'], 'comma')).toEqual([['ক', 'খ'], ['গ', 'ঘ']]);
    expect(splitRows(['দাগ ১২   ৫ শতক'], 'spaces')).toEqual([['দাগ ১২', '৫ শতক']]);
  });
  it('sorts Bangla numbers as numbers and text in Bangla order', () => {
    expect(sortOrder(['১০', '২', '৩৩'], 'asc', 'auto')).toEqual([1, 0, 2]);
    expect(sortOrder(['১০', '২', '৩৩'], 'desc', 'auto')).toEqual([2, 0, 1]);
    expect(sortOrder(['গ', 'ক', 'খ'], 'asc', 'auto')).toEqual([1, 2, 0]);
    // stable for equal values
    expect(sortOrder(['ক', 'ক', 'খ'], 'asc', 'text')).toEqual([0, 1, 2]);
  });
  it('quick tables: header row repeats, total row when summed', () => {
    for (const q of QUICK_TABLES) {
      const j = quickTableJSON(q);
      expect((j.content[0] as { attrs?: unknown }).attrs).toEqual({ rrepeat: true });
      expect(j.content.length).toBe(1 + q.rows + (q.total !== undefined ? 1 : 0));
      expect(j.attrs.ttotal).toBe(q.total !== undefined || null);
    }
  });
  it('bold for header / first column / total keeps other marks', () => {
    const out = boldContent([{ type: 'text', text: 'ক', marks: [{ type: 'italic' }] }, { type: 'hardBreak' }]);
    expect(out?.[0].marks).toEqual([{ type: 'italic' }, { type: 'bold' }]);
    expect(out?.[1]).toEqual({ type: 'hardBreak' });
  });
});

describe('table model (what the exporters draw)', () => {
  it('uses the cells’ own widths (px → twips) and keeps them inside the page', () => {
    const m = tableModel({ type: 'table', attrs: { tfit: 'fixed' }, content: [row([c('', { colwidth: [100] }), c('', { colwidth: [200] })])] }, 9000);
    expect(m.widths).toEqual([1500, 3000]);
    const big = tableModel({ type: 'table', content: [row([c('', { colwidth: [500] }), c('', { colwidth: [500] })])] }, 9000);
    expect(big.widths.reduce((a, b) => a + b)).toBeLessThanOrEqual(9000);
  });
  it('places cells after a row-span and marks the merged slots', () => {
    const m = tableModel({ type: 'table', content: [row([c('ক', { rowspan: 2 }), c('খ')]), row([c('গ')])] }, 9000);
    expect(m.rows[1].cells.map((x) => [x.col, x.cont])).toEqual([[0, true], [1, false]]);
  });
  it('border presets: outer leaves inside lines off, hz leaves vertical lines off', () => {
    const tbl = (tborders: string) => ({ type: 'table', attrs: { tborders }, content: [row([c('ক'), c('খ')]), row([c('গ'), c('ঘ')])] });
    const o = tableModel(tbl('outer'), 9000);
    expect(o.borders.insideH.style).toBe('none');
    expect(o.borders.top.style).toBe('single');
    expect(o.rows[0].cells[0].right.style).toBe('none');
    expect(o.rows[0].cells[0].left.style).toBe('single');
    const h = tableModel(tbl('hz'), 9000);
    expect(h.borders.insideV.style).toBe('none');
    expect(h.borders.left.style).toBe('none');
    expect(h.borders.insideH.style).toBe('single');
  });
  it('shade style shades the header, banded shades every other body row; own colour wins', () => {
    const m = tableModel({ type: 'table', attrs: { tstyle: 'banded', tbanded: true }, content: [row([c('ক', {}, 'tableHeader')]), row([c('খ')]), row([c('গ')]), row([c('ঘ', { bg: '#fff2cc' })])] }, 9000);
    expect(m.rows.map((r) => r.cells[0].bg)).toEqual(['D9D9D9', 'F2F2F2', undefined, 'FFF2CC']);
  });
  it('header rows repeat from the top unless turned off', () => {
    const h = c('ক', {}, 'tableHeader');
    expect(tableModel({ type: 'table', content: [row([h]), row([h]), row([c('খ')])] }, 9000).rows.map((r) => r.repeat)).toEqual([true, true, false]);
    expect(tableModel({ type: 'table', content: [row([h], { rrepeat: false }), row([c('খ')])] }, 9000).rows[0].repeat).toBe(false);
    // a header lower down never repeats on its own
    expect(tableModel({ type: 'table', content: [row([c('খ')]), row([h])] }, 9000).rows[1].repeat).toBe(false);
  });
  it('first column and total row are bold; total gets a thicker top line', () => {
    const m = tableModel({ type: 'table', attrs: { tfirstcol: true, ttotal: true }, content: [row([c('ক'), c('১')]), row([c('মোট'), c('১')])] }, 9000);
    expect(m.rows[0].cells.map((x) => x.bold)).toEqual([true, false]);
    expect(m.rows[1].cells.map((x) => x.bold)).toEqual([true, true]);
    expect(m.rows[1].cells[1].own.top?.width).toBe(1.25);
  });
});

const RICH = doc({
  type: 'table',
  attrs: { tstyle: 'shade', talign: 'center', tline: 'double', tlinew: 1, tlinec: '#1f3864', tpad: 113, tfit: 'fixed' },
  content: [
    row([c('ক্রম', { colwidth: [60] }, 'tableHeader'), c('বিবরণ', { colwidth: [300] }, 'tableHeader')]),
    row([c('১', { valign: 'middle', bb: 'dashed' }), c('জমি', { bg: '#fff2cc' })], { rheight: 567, rkeep: true }),
    row([c('২', { rowspan: 2 }), c('ক')]),
    row([c('খ')]),
  ],
});

describe('.docx tables', () => {
  it('writes widths, alignment, borders, shading, row options and cell changes', async () => {
    const zip = await JSZip.loadAsync(await docxBuffer(RICH, 'টেবিল'));
    const x = await zip.file('word/document.xml')!.async('string');
    expect(x).toContain('<w:gridCol w:w="900"/><w:gridCol w:w="4500"/>');
    expect(x).toMatch(/<w:tblPr>[\s\S]*<w:jc w:val="center"\/>/);
    expect(x).toMatch(/<w:tblBorders><w:top w:val="double" w:color="1F3864" w:sz="8"\/>/);
    expect(x).toContain('<w:tblHeader/>');
    expect(x).toContain('<w:cantSplit/>');
    expect(x).toMatch(/<w:trHeight w:val="567" w:hRule="atLeast"\/>/);
    expect(x).toContain('w:fill="D9D9D9"'); // shaded header
    expect(x).toContain('w:fill="FFF2CC"');
    expect(x).toContain('<w:vAlign w:val="center"/>');
    expect(x).toMatch(/<w:tcBorders><w:bottom w:val="dashed"/);
    expect(x).toContain('<w:vMerge w:val="restart"/>');
    expect(x).toMatch(/<w:tblCellMar>[\s\S]*<w:left w:type="dxa" w:w="113"\/>/);
    // header text bold
    expect(x).toMatch(/<w:b\/>[\s\S]*ক্রম/);
  });
});

describe('.doc (RTF) tables', () => {
  it('writes the same table in RTF', () => {
    const r = toRtf(RICH, 'টেবিল', undefined, { kind: 'legal' });
    expect(r).toContain('\\trqc');
    expect(r).toContain('\\trhdr');
    expect(r).toContain('\\trkeep');
    expect(r).toContain('\\trrh567');
    expect(r).toContain('\\trpaddl113');
    expect(r).toContain('\\clvertalc');
    expect(r).toContain('\\clvmgf');
    expect(r).toContain('\\clvmrg');
    expect(r).toMatch(/\\clbrdrb\\brdrdash/);
    expect(r).toMatch(/\\clbrdrt\\brdrdb\\brdrw20/);
    expect(r).toMatch(/\\clcbpat\d+\\clbrdrt/); // shading before borders (LibreOffice)
    expect(r).toContain('\\cellx900');
    expect(r).toContain('\\cellx5400');
    expect(r).toContain('\\red31\\green56\\blue100;');
    // 4 rows, each closed
    expect(r.match(/\\row\n/g)?.length).toBe(4);
  });
});
