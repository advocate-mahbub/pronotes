/**
 * One reading of a table node for every exporter (.docx, .doc/RTF): column widths in twips, where each cell
 * sits in the grid, and the borders, shading, bold and alignment the screen shows (app.css "tables").
 * Keeping this in one place means Word and the .doc file draw the same table as the page.
 */
import type { JSONContent } from '@tiptap/core';
import { BAND_SHADE, HEADER_SHADE, type CellSide, type LineStyle, type TableBorders } from '../editor/table-tools';

/** The four-column schedule (তফসিল) widths used before tables had their own widths. */
export const SCHEDULE_COLUMNS = [700, 1700, 1900, 4300];

export interface Side {
  style: 'none' | LineStyle;
  /** points */
  width: number;
  /** RRGGBB */
  color: string;
}
export interface TCell {
  node: JSONContent;
  col: number;
  span: number;
  rowspan: number;
  /** grid slot covered by a cell merged from a row above (RTF writes an empty merged cell here) */
  cont: boolean;
  header: boolean;
  bold: boolean;
  bg?: string; // RRGGBB
  valign?: 'top' | 'middle' | 'bottom';
  top: Side;
  bottom: Side;
  left: Side;
  right: Side;
  /** twips */
  width: number;
  /** sides that differ from the table's own borders (cell changes, the total row's thicker top) */
  own: { top?: Side; bottom?: Side; left?: Side; right?: Side };
}
export interface TRow {
  cells: TCell[];
  repeat: boolean;
  keep: boolean;
  /** at least, twips */
  height?: number;
}
export interface TModel {
  widths: number[];
  total: number;
  align: 'left' | 'center' | 'right';
  fit: 'auto' | 'window' | 'fixed' | null;
  /** left/right cell margin, twips */
  pad?: number;
  rows: TRow[];
  /** table-level borders (Word's tblBorders) */
  borders: { top: Side; bottom: Side; left: Side; right: Side; insideH: Side; insideV: Side };
}

const hex6 = (c: unknown, dflt: string) => (typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c) ? c.replace('#', '').toUpperCase() : dflt);
const isCell = (c: JSONContent) => c.type === 'tableCell' || c.type === 'tableHeader';

export function tableModel(n: JSONContent, textWidth: number): TModel {
  const a = (n.attrs || {}) as Record<string, unknown>;
  const rowsIn = (n.content || []).filter((r) => r.type === 'tableRow');

  // grid positions (rowspans push later cells to the right)
  const taken: boolean[][] = rowsIn.map(() => []);
  const placed: { node: JSONContent; row: number; col: number; span: number; rowspan: number }[][] = rowsIn.map(() => []);
  let cols = 1;
  rowsIn.forEach((r, ri) => {
    let col = 0;
    for (const c of (r.content || []).filter(isCell)) {
      while (taken[ri][col]) col++;
      const span = Math.max(1, Number(c.attrs?.colspan ?? 1));
      const rowspan = Math.max(1, Math.min(rowsIn.length - ri, Number(c.attrs?.rowspan ?? 1)));
      for (let y = ri; y < ri + rowspan; y++) for (let x = col; x < col + span; x++) taken[y][x] = true;
      placed[ri].push({ node: c, row: ri, col, span, rowspan });
      col += span;
      cols = Math.max(cols, col);
    }
  });

  // column widths: the cells' own widths (px on screen → twips), else the old defaults
  const own: (number | undefined)[] = Array(cols).fill(undefined);
  for (const row of placed)
    for (const p of row) {
      const cw = p.node.attrs?.colwidth as number[] | null | undefined;
      if (Array.isArray(cw)) cw.forEach((px, k) => { if (px > 0 && own[p.col + k] === undefined) own[p.col + k] = Math.round(px * 15); });
    }
  const fit = (['auto', 'window', 'fixed'] as const).find((f) => f === a.tfit) ?? null;
  const total = Math.min(textWidth, 8600);
  let widths: number[];
  if (fit !== 'auto' && fit !== 'window' && own.every((w) => w !== undefined)) widths = own as number[];
  else if (own.some((w) => w !== undefined) && fit !== 'auto' && fit !== 'window') {
    const known = own.reduce<number>((s, w) => s + (w ?? 0), 0);
    const rest = own.filter((w) => w === undefined).length;
    const each = Math.max(400, Math.floor((total - known) / rest));
    widths = own.map((w) => w ?? each);
  } else if (cols === 4) widths = SCHEDULE_COLUMNS.map((w) => Math.round((w * total) / 8600));
  else widths = Array.from({ length: cols }, () => Math.floor(total / cols));
  if (fit === 'window') {
    const s = widths.reduce((x, y) => x + y, 0);
    widths = widths.map((w) => Math.floor((w * textWidth) / s));
  }
  const sum = widths.reduce((x, y) => x + y, 0);
  if (sum > textWidth) widths = widths.map((w) => Math.floor((w * textWidth) / sum));

  // borders
  const preset = ((a.tborders as TableBorders) || 'all') as TableBorders;
  const line: Side = { style: ((a.tline as LineStyle) || 'single') as LineStyle, width: Number(a.tlinew) || 0.5, color: hex6(a.tlinec, '000000') };
  const none: Side = { ...line, style: 'none' };
  const lastRow = rowsIn.length - 1;
  const edge = (outer: boolean, vertical: boolean): Side => {
    const on =
      preset === 'all' ? true : preset === 'none' ? false : preset === 'outer' ? outer : preset === 'inner' ? !outer : /* hz */ !vertical;
    return on ? line : none;
  };
  const side = (own: unknown, dflt: Side): Side => {
    const v = own as CellSide | null | undefined;
    if (!v) return dflt;
    return v === 'none' ? none : { ...line, style: v };
  };

  // header rows that repeat: the top rows, as long as each one asks for it (header rows do unless turned off)
  let repeating = true;
  const styled = a.tstyle === 'shade' || a.tstyle === 'banded';
  const rows: TRow[] = rowsIn.map((r, ri) => {
    const ra = (r.attrs || {}) as Record<string, unknown>;
    const cellsIn = (r.content || []).filter(isCell);
    const allHeader = cellsIn.length > 0 && cellsIn.every((c) => c.type === 'tableHeader');
    const wants = ra.rrepeat === true || (ra.rrepeat !== false && allHeader);
    repeating = repeating && wants;
    const cells: TCell[] = [];
    // merged-from-above slots, in grid order with this row's own cells
    const conts: TCell[] = [];
    for (let up = 0; up < ri; up++)
      for (const p of placed[up])
        if (p.row + p.rowspan > ri) conts.push(makeCell(p, ri, true));
    const mine = placed[ri].map((p) => makeCell(p, ri, false));
    cells.push(...[...conts, ...mine].sort((x, y) => x.col - y.col));
    return { cells, repeat: repeating, keep: ra.rkeep === true, height: Number(ra.rheight) > 0 ? Number(ra.rheight) : undefined };
  });

  function makeCell(p: (typeof placed)[number][number], ri: number, cont: boolean): TCell {
    const ca = (p.node.attrs || {}) as Record<string, unknown>;
    const header = p.node.type === 'tableHeader';
    const lastCol = p.col + p.span >= cols;
    const bottomRow = p.row + p.rowspan - 1;
    const isTotal = a.ttotal === true && ri === lastRow;
    const own: TCell['own'] = {};
    const pick = (k: 'top' | 'bottom' | 'left' | 'right', attr: unknown, dflt: Side): Side => {
      const v = side(attr, dflt);
      if (attr) own[k] = v;
      return v;
    };
    let top = pick('top', ca.bt, edge(p.row === 0, false));
    if (isTotal && top.style !== 'none') own.top = top = { ...top, width: top.width + 0.75 };
    const bg = ca.bg
      ? hex6(ca.bg, '')
      : header && styled
        ? HEADER_SHADE.slice(1).toUpperCase()
        : a.tbanded === true && !header && ri % 2 === 1
          ? BAND_SHADE.slice(1).toUpperCase()
          : undefined;
    return {
      node: p.node,
      col: p.col,
      span: p.span,
      rowspan: p.rowspan,
      cont,
      header,
      bold: header || (a.tfirstcol === true && p.col === 0) || isTotal,
      bg: bg || undefined,
      valign: (['top', 'middle', 'bottom'] as const).find((v) => v === ca.valign),
      top,
      bottom: pick('bottom', ca.bb, edge(bottomRow === lastRow, false)),
      left: pick('left', ca.bl, edge(p.col === 0, true)),
      right: pick('right', ca.br, edge(lastCol, true)),
      width: widths.slice(p.col, p.col + p.span).reduce((x, y) => x + y, 0),
      own,
    };
  }

  return {
    widths,
    total: widths.reduce((x, y) => x + y, 0),
    align: a.talign === 'center' || a.talign === 'right' ? a.talign : 'left',
    fit,
    pad: a.tpad != null && Number(a.tpad) >= 0 ? Number(a.tpad) : undefined,
    rows,
    borders: { top: edge(true, false), bottom: edge(true, false), left: edge(true, true), right: edge(true, true), insideH: edge(false, false), insideV: edge(false, true) },
  };
}

/** Adds bold to every text run (header cells, first column, total row). */
export function boldContent(content: JSONContent[] | undefined): JSONContent[] | undefined {
  return content?.map((x) =>
    x.type === 'text' ? (x.marks?.some((m) => m.type === 'bold') ? x : { ...x, marks: [...(x.marks || []), { type: 'bold' }] }) : x.content ? { ...x, content: boldContent(x.content) } : x,
  );
}
