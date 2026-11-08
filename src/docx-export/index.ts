/**
 * .docx export. Legal drafts follow the owner's court format (styles PN*: Legal paper, 3" top margin,
 * SutonnyOMJ 14 pt, titles 23 pt, 1.5 lines, Bangla paragraph numbers, schedule tables, page number footer);
 * the page setup and every direct format from the ribbon (font, size, colour, Scale, Spacing, Position,
 * indents, line spacing, keep options …) are written in Word's own units. Plain notes get simple styles.
 */
import {
  AlignmentType, BorderStyle, Document, Footer, LevelFormat, LineRuleType, Packer, PageBreak, PageNumber, PageOrientation, Paragraph,
  Tab, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType, type IParagraphOptions, type IRunOptions, type ParagraphChild,
} from 'docx';
import type { JSONContent } from '@tiptap/core';
import { bijoyRuns, toBijoy, isBijoyFont, nodeFont } from '../bijoy';
import { STYLE_TWIPS, type ParagraphStyle } from '../editor/legal-format';
import { DEFAULT_FORMAT, NOTE_FONT, NOTE_SIZE, type DocFormat } from './format';
import { DEFAULT_PAGE, FOOTER_DIST, HEADER_DIST, NOTE_PAGE, normalizePage, pageNumberParts, pageSize, paraNumber, physicalPage, type PageSetup } from './page';

export { DEFAULT_FORMAT, type DocFormat };
export * from './page';

/** Page geometry of the default (court) page in twips. */
export const PAGE = {
  width: DEFAULT_PAGE.width, height: DEFAULT_PAGE.height, ...DEFAULT_PAGE.margins, header: HEADER_DIST, footer: FOOTER_DIST,
};
/** Schedule table column widths (twips) for a 4-column table on the court page (scaled on other pages). */
export const SCHEDULE_COLUMNS = [700, 1700, 1900, 4300];

const STYLE_ID: Record<ParagraphStyle, string> = {
  normal: 'PNNormal', numbered: 'PNNumbered', heading: 'PNHeading', title: 'PNTitle', party: 'PNParty', party2: 'PNParty2', right: 'PNRight',
};

const HIGHLIGHT: Record<string, IRunOptions['highlight']> = {
  '#fff59d': 'yellow', '#c5e1a5': 'green', '#b3e5fc': 'cyan', '#f8bbd0': 'magenta', '#ffcc80': 'darkYellow', '#e0e0e0': 'lightGray',
};
const UNDERLINE: Record<string, 'single' | 'double' | 'dotted' | 'wave'> = { single: 'single', double: 'double', dotted: 'dotted', wavy: 'wave' };

interface Ctx {
  lang: 'bn' | 'en';
  legal: boolean;
  counter: { n: number };
  /** Ordered-list instance number (each list restarts at 1). */
  listInstance: { n: number };
  textWidth: number;
}

const hex = (c: unknown) => (typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c) ? c.replace('#', '').toUpperCase() : undefined);
const pt = (v: unknown) => {
  const n = parseFloat(String(v ?? ''));
  return isNaN(n) ? undefined : n;
};

function runOptions(n: JSONContent): IRunOptions {
  const o: Record<string, unknown> = { text: n.text };
  for (const m of n.marks || []) {
    const a = (m.attrs || {}) as Record<string, unknown>;
    switch (m.type) {
      case 'bold': o.bold = true; o.boldComplexScript = true; break;
      case 'italic': o.italics = true; o.italicsComplexScript = true; break;
      case 'underline': o.underline = { type: UNDERLINE[String(a.ustyle || 'single')] ?? 'single' }; break;
      case 'strike': o.strike = true; break;
      case 'superscript': o.superScript = true; break;
      case 'subscript': o.subScript = true; break;
      case 'highlight': {
        const c = String(a.color || '').toLowerCase();
        o.highlight = HIGHLIGHT[c] ?? 'yellow';
        break;
      }
      case 'textStyle': {
        const color = hex(a.color);
        if (color) o.color = color;
        const size = pt(a.fontSize);
        if (size) {
          o.size = Math.round(size * 2);
          o.sizeComplexScript = Math.round(size * 2);
        }
        if (a.fontFamily) {
          const f = String(a.fontFamily).replace(/["']/g, '').split(',')[0].trim();
          o.font = { ascii: f, hAnsi: f, cs: f, eastAsia: f };
        }
        if (a.scale != null && Number(a.scale) !== 100) o.scale = Math.round(Number(a.scale));
        if (a.spacing != null && Number(a.spacing) !== 0) o.characterSpacing = Math.round(Number(a.spacing) * 20);
        // half-points as a plain number: Word 2007 does not read unit strings here
        if (a.position != null && Number(a.position) !== 0) o.position = Math.round(Number(a.position) * 2);
        if (a.kern != null) o.kern = Math.round(Number(a.kern) * 2);
        if (a.smallCaps) o.smallCaps = true;
        break;
      }
    }
  }
  return o as IRunOptions;
}

/** Bijoy (ANSI) output: set while one document is built. */
let ANSI: { bijoyFont: string; englishFont: string } | null = null;
const fontObj = (f: string) => ({ ascii: f, hAnsi: f, cs: f, eastAsia: f });
/** Text written by the app itself (numbers, footer): Bijoy-encoded in ANSI output. */
const own = (s: string) => (ANSI ? toBijoy(s) : s);

function runs(nodes: JSONContent[] = []): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  let prev = '';
  for (const n of nodes) {
    const before = prev;
    prev = n.type === 'text' ? n.text ?? '' : '';
    if (n.type === 'hardBreak') out.push(new TextRun({ break: 1 }));
    else if (n.type === 'text' && n.text) {
      const o = runOptions(n);
      // text typed in Bijoy (ANSI typing) is already Bijoy: keep it in its own font
      if (!ANSI || isBijoyFont(nodeFont(n), ANSI.bijoyFont)) out.push(new TextRun(o));
      else for (const r of bijoyRuns(n.text, before)) out.push(new TextRun({ ...o, text: r.text, font: fontObj(r.en ? ANSI.englishFont : ANSI.bijoyFont) }));
    }
  }
  return out;
}

/** Direct paragraph formatting from the ribbon and the Paragraph panel. */
function paragraphOptions(a: Record<string, unknown> = {}): Partial<IParagraphOptions> {
  const o: Record<string, unknown> = {};
  const align = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED }[String(a.textAlign)];
  if (align) o.alignment = align;
  const ind: Record<string, number> = {};
  const first = a.first as number | null;
  if (a.indL != null) ind.left = Number(a.indL);
  if (a.indR != null) ind.right = Number(a.indR);
  if (first != null) {
    if (first < 0) ind.hanging = -first;
    else ind.firstLine = first;
  }
  if (Object.keys(ind).length) o.indent = ind;
  const sp: Record<string, unknown> = {};
  if (a.spBefore != null) sp.before = Math.round(Number(a.spBefore) * 20);
  if (a.spAfter != null) sp.after = Math.round(Number(a.spAfter) * 20);
  if (a.lineRule && a.lineVal != null) {
    const v = Number(a.lineVal);
    if (a.lineRule === 'auto') Object.assign(sp, { line: Math.round(v * 240), lineRule: LineRuleType.AUTO });
    else Object.assign(sp, { line: Math.round(v * 20), lineRule: a.lineRule === 'exact' ? LineRuleType.EXACT : LineRuleType.AT_LEAST });
  }
  if (Object.keys(sp).length) o.spacing = sp;
  if (a.keepNext) o.keepNext = true;
  if (a.keepLines) o.keepLines = true;
  if (a.breakBefore) o.pageBreakBefore = true;
  if (a.widow === false) o.widowControl = false;
  return o as Partial<IParagraphOptions>;
}

function paragraph(n: JSONContent, ctx: Ctx, extra: Partial<IParagraphOptions> = {}): Paragraph {
  const a = (n.attrs || {}) as Record<string, unknown>;
  const children = runs(n.content);
  let style: string | undefined;
  if (ctx.legal) {
    const ps = ((a.pstyle as ParagraphStyle) || 'normal') as ParagraphStyle;
    style = STYLE_ID[ps] ?? STYLE_ID.normal;
    if (ps === 'numbered') {
      ctx.counter.n++;
      children.unshift(new TextRun({ children: [own(paraNumber(ctx.counter.n, ctx.lang)), new Tab()] }));
    }
  } else style = 'PNNote';
  return new Paragraph({ style, ...paragraphOptions(a), ...extra, children });
}

function heading(n: JSONContent): Paragraph {
  const level = Math.min(3, Math.max(1, Number(n.attrs?.level ?? 1)));
  return new Paragraph({ style: 'Heading' + level, ...paragraphOptions(n.attrs), children: runs(n.content) });
}

function table(n: JSONContent, ctx: Ctx): Table {
  const rows = (n.content || []).filter((r) => r.type === 'tableRow');
  const cols = Math.max(1, ...rows.map((r) => (r.content || []).reduce((s, c) => s + Number(c.attrs?.colspan ?? 1), 0)));
  const total = Math.min(ctx.textWidth, 8600);
  const widths = cols === 4 ? SCHEDULE_COLUMNS.map((w) => Math.round((w * total) / 8600)) : Array.from({ length: cols }, () => Math.floor(total / cols));
  const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: widths.reduce((x, y) => x + y, 0), type: WidthType.DXA },
    columnWidths: widths,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: rows.map(
      (r) =>
        new TableRow({
          tableHeader: (r.content || []).every((c) => c.type === 'tableHeader') || undefined,
          children: (r.content || []).map(
            (c, i) =>
              new TableCell({
                columnSpan: Number(c.attrs?.colspan ?? 1) > 1 ? Number(c.attrs?.colspan) : undefined,
                rowSpan: Number(c.attrs?.rowspan ?? 1) > 1 ? Number(c.attrs?.rowspan) : undefined,
                width: { size: widths[i] ?? widths[widths.length - 1], type: WidthType.DXA },
                children: (c.content?.length ? c.content : [{ type: 'paragraph' }]).map((p) => cellParagraph(p, ctx, c.type === 'tableHeader')),
              }),
          ),
        }),
    ),
  });
}

function cellParagraph(p: JSONContent, ctx: Ctx, header: boolean): Paragraph {
  if (p.type !== 'paragraph') return new Paragraph({ style: 'PNCell', children: runs(p.content) });
  if (ctx.legal && p.attrs?.pstyle === 'numbered') return paragraph(p, ctx);
  return new Paragraph({ style: 'PNCell', alignment: header ? AlignmentType.CENTER : undefined, ...paragraphOptions(p.attrs), children: runs(p.content) });
}

function blocks(nodes: JSONContent[], ctx: Ctx, body: (Paragraph | Table)[], depth = 0) {
  for (const n of nodes) {
    switch (n.type) {
      case 'paragraph':
        body.push(paragraph(n, ctx));
        break;
      case 'heading':
        body.push(heading(n));
        break;
      case 'table':
        body.push(table(n, ctx), new Paragraph({ style: 'PNCell', children: [] }));
        break;
      case 'pageBreak':
        body.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case 'bulletList':
      case 'orderedList': {
        const reference = n.type === 'bulletList' ? 'pn-bullet' : 'pn-decimal';
        const instance = n.type === 'orderedList' ? ++ctx.listInstance.n : 0;
        for (const li of n.content || []) {
          const [first, ...rest] = li.content || [];
          if (first?.type === 'paragraph') body.push(paragraph(first, ctx, { numbering: { reference, level: Math.min(depth, 2), instance } }));
          blocks(rest, ctx, body, depth + 1);
        }
        break;
      }
      case 'taskList':
        for (const li of n.content || []) {
          const [first, ...rest] = li.content || [];
          const box = new TextRun({ children: [li.attrs?.checked ? '☑' : '☐', new Tab()] });
          body.push(new Paragraph({ style: ctx.legal ? 'PNCell' : 'PNNote', indent: { left: 360 * (depth + 1), hanging: 360 }, children: [box, ...runs(first?.content)] }));
          blocks(rest, ctx, body, depth + 1);
        }
        break;
    }
  }
}

export interface ExportOptions {
  kind?: 'note' | 'legal' | 'chart';
  page?: Partial<PageSetup> | null;
  /** Bijoy (ANSI) Word file: Bangla in `bijoyFont` (SutonnyMJ), English in `englishFont`. */
  ansi?: { bijoyFont: string; englishFont: string } | null;
}

/** Build the Word document for an editor JSON document. */
export function buildDocx(doc: JSONContent, title: string, f: DocFormat = DEFAULT_FORMAT, opts: ExportOptions = {}): Document {
  const legal = (opts.kind ?? 'legal') !== 'note';
  const page = normalizePage(opts.page, legal ? DEFAULT_PAGE : NOTE_PAGE);
  const { w } = pageSize(page);
  const textWidth = w - page.margins.left - page.margins.right;
  const ctx: Ctx = { lang: page.lang, legal, counter: { n: 0 }, listInstance: { n: 0 }, textWidth };
  const body: (Paragraph | Table)[] = [];
  ANSI = opts.ansi ?? null;
  try {
    blocks(doc.content || [], ctx, body);
  } finally {
    ANSI = null;
  }
  if (!body.length) body.push(new Paragraph(''));

  const fontName = opts.ansi ? opts.ansi.bijoyFont : !legal ? NOTE_FONT : page.lang === 'en' ? f.fontEn || DEFAULT_FORMAT.fontEn : f.font;
  const size = legal ? f.size : NOTE_SIZE;
  const halfPt = Math.round(size * 2);
  const font = { ascii: fontName, hAnsi: fontName, cs: fontName, eastAsia: fontName };
  const just = { alignment: AlignmentType.JUSTIFIED };
  const style = (id: string, name: string, paragraph: object, run: object = {}) => ({ id, name, basedOn: 'Normal', next: id, quickFormat: true, paragraph, run });
  const hsize = (k: number) => ({ bold: true, size: Math.round(halfPt * k), sizeComplexScript: Math.round(halfPt * k) });

  const parts = pageNumberParts(page);
  const align = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT }[page.pageNumbers.align];
  const footerChildren: ParagraphChild[] = [];
  const lbl = (s: string) => (opts.ansi ? toBijoy(s) : s);
  if (parts.before) footerChildren.push(new TextRun(lbl(parts.before)));
  footerChildren.push(new TextRun({ children: [PageNumber.CURRENT] }));
  if (parts.between !== null) footerChildren.push(new TextRun(lbl(parts.between)), new TextRun({ children: [PageNumber.TOTAL_PAGES] }));

  const bullet = (lvl: number) => ({ level: lvl, format: LevelFormat.BULLET, text: ['•', '◦', '▪'][lvl], alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (lvl + 1), hanging: 360 } } } });
  const decimal = (lvl: number) => ({ level: lvl, format: LevelFormat.DECIMAL, text: `%${lvl + 1}.`, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (lvl + 1), hanging: 360 } } } });

  const turned = !!page.textDir && page.textDir !== 'lr';
  const phys = physicalPage(page);
  return new Document({
    title,
    creator: 'ProNotes',
    numbering: {
      config: [
        { reference: 'pn-bullet', levels: [0, 1, 2].map(bullet) },
        { reference: 'pn-decimal', levels: [0, 1, 2].map(decimal) },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font, size: halfPt, sizeComplexScript: halfPt },
          paragraph: { spacing: { line: Math.round((legal ? f.lineSpacing : 1.3) * 240), lineRule: LineRuleType.AUTO, after: 120 } },
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
        style('PNNote', 'ProNotes নোট', {}),
        { id: 'Heading1', name: 'heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true }, run: hsize(1.6) },
        { id: 'Heading2', name: 'heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true }, run: hsize(1.3) },
        { id: 'Heading3', name: 'heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, paragraph: { spacing: { before: 160, after: 80 }, keepNext: true }, run: hsize(1.12) },
      ],
    },
    sections: [
      {
        properties: {
          page: turned
            ? {
                // envelope fed narrow side first: upright paper, the text turned on it
                size: { width: phys.w, height: phys.h, orientation: PageOrientation.PORTRAIT },
                margin: { ...phys.margins, header: HEADER_DIST, footer: FOOTER_DIST },
                textDirection: (page.textDir === 'tb' ? 'tbRl' : 'btLr') as never,
              }
            : {
                // docx swaps width and height itself for landscape, so it gets the portrait size
                size: { width: page.width, height: page.height, orientation: page.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
                margin: { ...page.margins, header: HEADER_DIST, footer: FOOTER_DIST },
              },
        },
        footers: page.pageNumbers.show ? { default: new Footer({ children: [new Paragraph({ alignment: align, children: footerChildren })] }) } : undefined,
        children: body,
      },
    ],
  });
}

export const docxBlob = (doc: JSONContent, title: string, f?: DocFormat, opts?: ExportOptions) => Packer.toBlob(buildDocx(doc, title, f, opts));
export const docxBuffer = (doc: JSONContent, title: string, f?: DocFormat, opts?: ExportOptions) => Packer.toBuffer(buildDocx(doc, title, f, opts));

export { docxFileName } from './name';
