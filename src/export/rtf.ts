/**
 * Word 97–2003 compatible document (.doc) written as RTF. Word 2003, 2007 and later, LibreOffice and
 * WordPad open it as a normal Word document; "Save As .doc" in Word makes a binary .doc from it.
 * The same writer makes the Bijoy (ANSI) variant: Bangla runs converted to Bijoy in SutonnyMJ,
 * English runs in an English font.
 */
import type { JSONContent } from '@tiptap/core';
import { bijoyRuns, toBijoy, isBijoyFont } from '../bijoy';
import { DEFAULT_FORMAT, NOTE_FONT, NOTE_SIZE, type DocFormat } from '../docx-export/format';
import { DEFAULT_PAGE, FOOTER_DIST, HEADER_DIST, NOTE_PAGE, normalizePage, pageNumberParts, pageSize, paraNumber, physicalPage, type PageSetup } from '../docx-export/page';
import { STYLE_TWIPS } from '../editor/legal-format';

export interface RtfOptions {
  kind?: 'note' | 'legal' | 'chart';
  page?: Partial<PageSetup> | null;
  /** Bijoy (ANSI) output: Bangla in `bijoyFont`, English in `englishFont`. */
  ansi?: { bijoyFont: string; englishFont: string } | null;
}

/** Windows-1252 bytes for the characters that differ from Latin-1 (0x80–0x9F). */
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89,
  0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f,
};
const hex2 = (b: number) => "\\'" + b.toString(16).padStart(2, '0');

/** Escape text for RTF: ASCII as is, others as \uN with a Windows-1252 (or ?) fallback for old readers. */
export function rtfText(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
    else if (ch === '\t') out += '\\tab ';
    else if (ch === '\n') out += '\\line ';
    else if (c < 0x80) out += ch;
    else if (c > 0xffff) {
      // surrogate pair
      const hi = Math.floor((c - 0x10000) / 0x400) + 0xd800;
      const lo = ((c - 0x10000) % 0x400) + 0xdc00;
      out += `\\u${hi - 65536}?\\u${lo - 65536}?`;
    } else {
      const fb = c >= 0xa0 && c <= 0xff ? hex2(c) : CP1252[c] !== undefined ? hex2(CP1252[c]) : '?';
      out += `\\u${c > 32767 ? c - 65536 : c}${fb}`;
    }
  }
  return out;
}

interface Ctx {
  legal: boolean;
  lang: 'bn' | 'en';
  baseFont: string;
  size: number;
  lineMult: number;
  fonts: string[];
  colors: string[];
  counter: { n: number };
  ansi: RtfOptions['ansi'];
  textWidth: number;
}

const fontIdx = (c: Ctx, name: string) => {
  let i = c.fonts.indexOf(name);
  if (i < 0) i = c.fonts.push(name) - 1;
  return i;
};
const colorIdx = (c: Ctx, hex: string) => {
  const h = hex.replace('#', '').toUpperCase();
  let i = c.colors.indexOf(h);
  if (i < 0) i = c.colors.push(h) - 1;
  return i + 1; // colour 0 = auto
};

const HIGHLIGHT: Record<string, string> = { '#fff59d': 'FFFF00', '#c5e1a5': '00FF00', '#b3e5fc': '00FFFF', '#f8bbd0': 'FF00FF', '#ffcc80': '808000', '#e0e0e0': 'C0C0C0' };

/** One text run: character formatting + text (split into Bijoy/English parts in ANSI mode). */
function run(n: JSONContent, c: Ctx, extra = ''): string {
  let fmt = '';
  let font = c.baseFont;
  /** font set on this run itself (not the document default) */
  let markFont = '';
  let size = c.size;
  for (const m of n.marks || []) {
    const a = (m.attrs || {}) as Record<string, unknown>;
    switch (m.type) {
      case 'bold': fmt += '\\b\\ab'; break;
      case 'italic': fmt += '\\i\\ai'; break;
      case 'underline': fmt += { double: '\\uldb', dotted: '\\uld', wavy: '\\ulwave' }[String(a.ustyle)] ?? '\\ul'; break;
      case 'strike': fmt += '\\strike'; break;
      case 'superscript': fmt += '\\super'; break;
      case 'subscript': fmt += '\\sub'; break;
      case 'highlight': fmt += '\\highlight' + colorIdx(c, HIGHLIGHT[String(a.color || '').toLowerCase()] ?? 'FFFF00'); break;
      case 'textStyle':
        if (typeof a.color === 'string' && /^#?[0-9a-f]{6}$/i.test(a.color)) fmt += '\\cf' + colorIdx(c, a.color);
        if (a.fontSize) size = parseFloat(String(a.fontSize)) || size;
        if (a.fontFamily) font = markFont = String(a.fontFamily).replace(/["']/g, '').split(',')[0].trim();
        if (a.scale != null && Number(a.scale) !== 100) fmt += '\\charscalex' + Math.round(Number(a.scale));
        if (a.spacing != null && Number(a.spacing) !== 0) fmt += '\\expndtw' + Math.round(Number(a.spacing) * 20);
        if (a.position != null && Number(a.position) !== 0) fmt += (Number(a.position) > 0 ? '\\up' : '\\dn') + Math.round(Math.abs(Number(a.position)) * 2);
        if (a.kern != null) fmt += '\\kerning' + Math.round(Number(a.kern) * 2);
        if (a.smallCaps) fmt += '\\scaps';
        break;
    }
  }
  const hs = Math.round(size * 2);
  const piece = (text: string, f: string) => {
    const fi = fontIdx(c, f);
    return `{\\rtlch\\fcs1\\af${fi}\\afs${hs} \\ltrch\\fcs0\\f${fi}\\fs${hs}${fmt}${extra} ${rtfText(text)}}`;
  };
  const text = n.type === 'hardBreak' ? '\n' : n.text ?? '';
  if (!c.ansi || isBijoyFont(markFont, c.ansi.bijoyFont)) return piece(text, font);
  return bijoyRuns(text).map((r) => piece(r.text, r.en ? c.ansi!.englishFont : c.ansi!.bijoyFont)).join('');
}

const runs = (nodes: JSONContent[] = [], c: Ctx) => nodes.map((n) => run(n, c)).join('');
const plainRun = (text: string, c: Ctx) => run({ type: 'text', text }, c);

/** Paragraph properties: the legal style's own values, then direct formatting on top. */
function pPr(a: Record<string, unknown> = {}, c: Ctx, inTable = false): string {
  const ps = c.legal ? String(a.pstyle || 'normal') : 'note';
  let align = c.legal ? 'j' : 'l';
  let li = 0;
  let fi = 0;
  if (ps === 'normal') fi = STYLE_TWIPS.firstLine;
  if (ps === 'numbered') [li, fi] = [STYLE_TWIPS.hanging, -STYLE_TWIPS.hanging];
  if (ps === 'party') li = STYLE_TWIPS.party;
  if (ps === 'party2') li = STYLE_TWIPS.party2;
  if (ps === 'heading' || ps === 'title') align = 'c';
  if (ps === 'right') align = 'r';
  if (inTable) [li, fi, align] = [0, 0, 'l'];
  const ta = { left: 'l', center: 'c', right: 'r', justify: 'j' }[String(a.textAlign)];
  if (ta) align = ta;
  if (a.indL != null) li = Number(a.indL);
  if (a.first != null) fi = Number(a.first);
  const ri = a.indR != null ? Number(a.indR) : 0;
  let s = `\\pard\\plain\\q${align}\\li${li}\\fi${fi}\\ri${ri}`;
  if (inTable) s += '\\intbl';
  const sb = a.spBefore != null ? Math.round(Number(a.spBefore) * 20) : 0;
  const sa = a.spAfter != null ? Math.round(Number(a.spAfter) * 20) : inTable ? 0 : 120;
  s += `\\sb${sb}\\sa${sa}`;
  if (a.lineRule && a.lineVal != null) {
    const v = Number(a.lineVal);
    s += a.lineRule === 'auto' ? `\\sl${Math.round(v * 240)}\\slmult1` : a.lineRule === 'exact' ? `\\sl-${Math.round(v * 20)}\\slmult0` : `\\sl${Math.round(v * 20)}\\slmult0`;
  } else s += `\\sl${Math.round((inTable ? 1 : c.lineMult) * 240)}\\slmult1`;
  if (a.keepNext) s += '\\keepn';
  if (a.keepLines) s += '\\keep';
  if (a.breakBefore) s += '\\pagebb';
  s += a.widow === false ? '\\nowidctlpar' : '\\widctlpar';
  return s + ' ';
}

function paragraph(n: JSONContent, c: Ctx, inTable = false): string {
  const a = (n.attrs || {}) as Record<string, unknown>;
  const ps = c.legal ? String(a.pstyle || 'normal') : '';
  let pre = '';
  let extra = '';
  if (ps === 'numbered') pre = plainRun(paraNumber(++c.counter.n, c.lang), c) + '\\tab ';
  if (ps === 'heading' || ps === 'title') extra = '\\b\\ab';
  const body = (n.content || []).map((x) => run(x, ps === 'title' ? { ...c, size: titleSize } : c, extra)).join('');
  return pPr(a, c, inTable) + pre + body + (inTable ? '' : '\\par\n');
}
let titleSize = DEFAULT_FORMAT.titleSize;

function table(n: JSONContent, c: Ctx): string {
  const rows = (n.content || []).filter((r) => r.type === 'tableRow');
  const cols = Math.max(1, ...rows.map((r) => (r.content || []).reduce((s, x) => s + Number(x.attrs?.colspan ?? 1), 0)));
  const total = Math.min(c.textWidth, 8600);
  const sched = [700, 1700, 1900, 4300];
  const widths = cols === 4 ? sched.map((w) => Math.round((w * total) / 8600)) : Array.from({ length: cols }, () => Math.floor(total / cols));
  const brd = '\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10';
  let out = '';
  for (const r of rows) {
    let x = 0;
    let def = '\\trowd\\trgaph108\\trleft0' + ((r.content || []).every((cl) => cl.type === 'tableHeader') ? '\\trhdr' : '');
    let col = 0;
    for (const cell of r.content || []) {
      const span = Number(cell.attrs?.colspan ?? 1);
      for (let k = 0; k < span; k++) x += widths[col++] ?? widths[widths.length - 1];
      def += brd + '\\cellx' + x;
    }
    out += def + '\n';
    for (const cell of r.content || []) {
      const paras = cell.content?.length ? cell.content : [{ type: 'paragraph' }];
      out += paras
        .map((p, i) => {
          const ph = cell.type === 'tableHeader' ? { ...(p.attrs || {}), textAlign: (p.attrs?.textAlign as string) || 'center' } : p.attrs;
          return paragraph({ ...p, attrs: ph }, c, true) + (i < paras.length - 1 ? '\\par ' : '');
        })
        .join('') + '\\cell\n';
    }
    out += '\\row\n';
  }
  return out + '\\pard\\plain\\par\n';
}

function blocks(nodes: JSONContent[], c: Ctx, depth = 0): string {
  let out = '';
  for (const n of nodes) {
    switch (n.type) {
      case 'paragraph':
        out += paragraph(n, c);
        break;
      case 'heading': {
        const k = { 1: 1.6, 2: 1.3, 3: 1.12 }[Number(n.attrs?.level ?? 1) as 1 | 2 | 3] ?? 1.3;
        const save = c.size;
        c.size = Math.round(save * k * 2) / 2;
        out += pPr({ ...n.attrs, spBefore: 12, spAfter: 6, keepNext: true }, { ...c, legal: false }) + (n.content || []).map((x) => run(x, c, '\\b\\ab')).join('') + '\\par\n';
        c.size = save;
        break;
      }
      case 'table':
        out += table(n, c);
        break;
      case 'pageBreak':
        out += '\\pard\\plain\\page\\par\n';
        break;
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        (n.content || []).forEach((li, i) => {
          const mark = n.type === 'bulletList' ? '•' : n.type === 'taskList' ? (li.attrs?.checked ? '☑' : '☐') : Number(n.attrs?.start ?? 1) + i + '.';
          const [first, ...rest] = li.content || [];
          out += pPr({ indL: 720 * (depth + 1), first: -360, spAfter: 0, textAlign: 'left' }, { ...c, legal: false }) + plainRun(mark, c) + '\\tab ' + runs(first?.content, c) + '\\par\n';
          out += blocks(rest, c, depth + 1);
        });
        break;
    }
  }
  return out;
}

/** The whole document as RTF text (ASCII only, so it can be saved as is). */
export function toRtf(doc: JSONContent, title: string, f: DocFormat = DEFAULT_FORMAT, o: RtfOptions = {}): string {
  const legal = (o.kind ?? 'legal') !== 'note';
  const page = normalizePage(o.page, legal ? DEFAULT_PAGE : NOTE_PAGE);
  const { w } = pageSize(page);
  titleSize = f.titleSize ?? DEFAULT_FORMAT.titleSize;
  const baseFont = o.ansi ? o.ansi.bijoyFont : !legal ? NOTE_FONT : page.lang === 'en' ? f.fontEn || DEFAULT_FORMAT.fontEn : f.font;
  const c: Ctx = {
    legal, lang: page.lang, baseFont, size: legal ? f.size : NOTE_SIZE, lineMult: legal ? f.lineSpacing : 1.3,
    fonts: [baseFont], colors: [], counter: { n: 0 }, ansi: o.ansi ?? null, textWidth: w - page.margins.left - page.margins.right,
  };
  const body = blocks(doc.content || [], c);

  let footer = '';
  if (page.pageNumbers.show) {
    const parts = pageNumberParts(page);
    const q = { left: 'l', center: 'c', right: 'r' }[page.pageNumbers.align];
    const field = (name: string) => `{\\field{\\*\\fldinst ${name}}{\\fldrslt 1}}`;
    footer = `{\\footer\\pard\\plain\\q${q} ` + (parts.before ? plainRun(parts.before, c) : '') + field('PAGE') + (parts.between !== null ? plainRun(parts.between, c) + field('NUMPAGES') : '') + '\\par}\n';
  }
  const fonttbl = '{\\fonttbl' + c.fonts.map((name, i) => `{\\f${i}\\fnil\\fcharset0 ${rtfText(name)};}`).join('') + '}';
  const colortbl = '{\\colortbl;' + c.colors.map((x) => `\\red${parseInt(x.slice(0, 2), 16)}\\green${parseInt(x.slice(2, 4), 16)}\\blue${parseInt(x.slice(4, 6), 16)};`).join('') + '}';
  const info = `{\\info{\\title ${rtfText(title)}}{\\author ProNotes}}`;
  // turned text (envelope fed narrow side first): upright paper, text flow turned (\\stextflow1 = tbRl).
  // Bottom-to-top has no RTF code we could verify, so a .doc keeps that page as it is seen (decision 37).
  const ph = physicalPage(page.textDir === 'bt' ? { ...page, textDir: 'lr' } : page);
  const flow = page.textDir === 'tb' ? '\\stextflow1' : '';
  const pm = ph.margins;
  const sect = `\\paperw${ph.w}\\paperh${ph.h}\\margl${pm.left}\\margr${pm.right}\\margt${pm.top}\\margb${pm.bottom}` +
    `\\headery${HEADER_DIST}\\footery${FOOTER_DIST}${ph.landscape ? '\\landscape' : ''}\\sectd${flow}\\pgwsxn${ph.w}\\pghsxn${ph.h}${ph.landscape ? '\\lndscpsxn' : ''}`;
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1\n${fonttbl}\n${colortbl}\n${info}\n${sect}\n${footer}${body}}`;
}

/** Bijoy text for a page-number label etc. (exported for tests). */
export const bijoy = toBijoy;
