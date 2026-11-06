/**
 * .docx export in the owner's court format: Legal paper, 3" top margin, SutonnyOMJ 14 pt (titles 23 pt),
 * 1.5 lines, justified text, Bangla paragraph numbers, schedule tables, "পাতা – X/Y" footer at the right.
 */
import {
  AlignmentType, BorderStyle, Document, Footer, LineRuleType, Packer, PageNumber, Paragraph, Tab, Table, TableCell,
  TableLayoutType, TableRow, TextRun, WidthType, type IRunOptions, type ParagraphChild,
} from 'docx';
import type { JSONContent } from '@tiptap/core';
import { STYLE_TWIPS, type ParagraphStyle } from '../editor/legal-format';
import { toBanglaDigits } from '../bornona-engine';

import { DEFAULT_FORMAT, type DocFormat } from './format';

export { DEFAULT_FORMAT, type DocFormat };

/** Page geometry in twips (from the owner's draft). */
export const PAGE = { width: 12240, height: 20160, top: 4320, right: 1440, bottom: 2160, left: 2160, header: 706, footer: 1440 };
/** Schedule table column widths (twips) for a 4-column table. */
export const SCHEDULE_COLUMNS = [700, 1700, 1900, 4300];
const TEXT_WIDTH = 8600;

const STYLE_ID: Record<ParagraphStyle, string> = {
  normal: 'PNNormal', numbered: 'PNNumbered', heading: 'PNHeading', title: 'PNTitle', party: 'PNParty', party2: 'PNParty2', right: 'PNRight',
};

function runs(nodes: JSONContent[] = []): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes) {
    if (n.type === 'hardBreak') {
      out.push(new TextRun({ break: 1 }));
      continue;
    }
    if (n.type !== 'text' || !n.text) continue;
    const m = new Set((n.marks || []).map((x) => x.type));
    const o: IRunOptions = {
      text: n.text,
      bold: m.has('bold') || undefined,
      italics: m.has('italic') || undefined,
      underline: m.has('underline') ? {} : undefined,
      highlight: m.has('highlight') ? 'yellow' : undefined,
    };
    out.push(new TextRun(o));
  }
  return out;
}

function paragraph(n: JSONContent, counter: { n: number }): Paragraph {
  const style = ((n.attrs?.pstyle as ParagraphStyle) || 'normal') as ParagraphStyle;
  const children = runs(n.content);
  if (style === 'numbered') {
    counter.n++;
    children.unshift(new TextRun({ children: [toBanglaDigits(counter.n) + '।', new Tab()] }));
  }
  return new Paragraph({ style: STYLE_ID[style] ?? STYLE_ID.normal, children });
}

function table(n: JSONContent, counter: { n: number }): Table {
  const rows = (n.content || []).filter((r) => r.type === 'tableRow');
  const cols = Math.max(1, ...rows.map((r) => (r.content || []).length));
  const widths = cols === 4 ? SCHEDULE_COLUMNS : Array.from({ length: cols }, () => Math.floor(TEXT_WIDTH / cols));
  const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: rows.map(
      (r) =>
        new TableRow({
          tableHeader: (r.content || []).every((c) => c.type === 'tableHeader') || undefined,
          children: (r.content || []).map(
            (c, i) =>
              new TableCell({
                width: { size: widths[i] ?? widths[widths.length - 1], type: WidthType.DXA },
                children: (c.content?.length ? c.content : [{ type: 'paragraph' }]).map((p) =>
                  p.type === 'paragraph' ? cellParagraph(p, counter, c.type === 'tableHeader') : new Paragraph(''),
                ),
              }),
          ),
        }),
    ),
  });
}

function cellParagraph(p: JSONContent, counter: { n: number }, header: boolean): Paragraph {
  const style = (p.attrs?.pstyle as ParagraphStyle) || 'normal';
  if (style === 'numbered') return paragraph(p, counter);
  return new Paragraph({ style: 'PNCell', alignment: header ? AlignmentType.CENTER : undefined, children: header ? runs(p.content).map((r) => r) : runs(p.content) });
}

/** Build the Word document for an editor JSON document. */
export function buildDocx(doc: JSONContent, title: string, f: DocFormat = DEFAULT_FORMAT): Document {
  const counter = { n: 0 };
  const body: (Paragraph | Table)[] = [];
  for (const n of doc.content || []) {
    if (n.type === 'paragraph') body.push(paragraph(n, counter));
    else if (n.type === 'table') body.push(table(n, counter), new Paragraph({ style: 'PNCell', children: [] }));
  }
  if (!body.length) body.push(new Paragraph(''));
  const halfPt = Math.round(f.size * 2);
  const font = { ascii: f.font, hAnsi: f.font, cs: f.font, eastAsia: f.font };
  const just = { alignment: AlignmentType.JUSTIFIED };
  const style = (id: string, name: string, paragraph: object, run: object = {}) => ({ id, name, basedOn: 'Normal', next: id, quickFormat: true, paragraph, run });
  return new Document({
    title,
    creator: 'ProNotes',
    styles: {
      default: {
        document: {
          run: { font, size: halfPt, sizeComplexScript: halfPt },
          paragraph: { spacing: { line: Math.round(f.lineSpacing * 240), lineRule: LineRuleType.AUTO, after: 120 } },
        },
      },
      paragraphStyles: [
        style('PNNormal', 'ProNotes সাধারণ', { ...just, indent: { firstLine: STYLE_TWIPS.firstLine } }),
        style('PNNumbered', 'ProNotes ক্রমিক', { ...just, indent: { left: STYLE_TWIPS.hanging, hanging: STYLE_TWIPS.hanging } }),
        style('PNHeading', 'ProNotes শিরোনাম', { alignment: AlignmentType.CENTER }, { bold: true }),
        style('PNTitle', 'ProNotes বড় শিরোনাম', { alignment: AlignmentType.CENTER }, { bold: true, size: Math.round((f.titleSize ?? 23) * 2), sizeComplexScript: Math.round((f.titleSize ?? 23) * 2) }),
        style('PNParty', 'ProNotes পক্ষ', { ...just, indent: { left: STYLE_TWIPS.party } }),
        style('PNParty2', 'ProNotes পক্ষ ২', { ...just, indent: { left: STYLE_TWIPS.party2 } }),
        style('PNRight', 'ProNotes ডানে', { alignment: AlignmentType.RIGHT }),
        style('PNCell', 'ProNotes টেবিল', { spacing: { line: 240, lineRule: LineRuleType.AUTO, after: 0 } }),
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: { top: PAGE.top, right: PAGE.right, bottom: PAGE.bottom, left: PAGE.left, header: PAGE.header, footer: PAGE.footer },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun('পাতা – '), new TextRun({ children: [PageNumber.CURRENT] }), new TextRun('/'), new TextRun({ children: [PageNumber.TOTAL_PAGES] })],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
}

export const docxBlob = (doc: JSONContent, title: string, f?: DocFormat) => Packer.toBlob(buildDocx(doc, title, f));
export const docxBuffer = (doc: JSONContent, title: string, f?: DocFormat) => Packer.toBuffer(buildDocx(doc, title, f));

/** File name for a draft title (keeps Bangla, removes characters Windows/iOS do not allow). */
export function docxFileName(title: string): string {
  return (title.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim() || 'ProNotes') + '.docx';
}
