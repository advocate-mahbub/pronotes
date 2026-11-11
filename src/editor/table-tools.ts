/**
 * Table formatting and table tools (Word's Table Design / Table Layout, the parts useful in drafts):
 * styles, borders, shading, cell alignment, sizes, header rows repeated on every page, rows kept
 * on one page, text ⇄ table, quick tables, split table, sort, column sum.
 *
 * Sizes are kept in Word units (twips) so the Word/.doc files match the screen (1 twip = 1/15 px).
 * The pure helpers at the top have no editor dependency and are unit tested.
 */
import { TableView } from '@tiptap/extension-table';
import { Extension, type CommandProps } from '@tiptap/core';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { CellSelection, TableMap, selectedRect } from '@tiptap/pm/tables';
import { TextSelection, type EditorState } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';

/* ---------- attribute values ---------- */

export type TableBorders = 'all' | 'outer' | 'inner' | 'none' | 'hz';
export type LineStyle = 'single' | 'double' | 'dashed';
export type CellSide = 'none' | LineStyle;
export type TableStyleId = 'grid' | 'shade' | 'banded' | 'outer' | 'clean' | 'court';

/** Ready-made looks: each sets borders, header shading and banding. */
export const TABLE_STYLES: { id: TableStyleId; label: string; borders: TableBorders; banded: boolean }[] = [
  { id: 'court', label: 'আদালতের (সব দাগ, মোটা হেডার)', borders: 'all', banded: false },
  { id: 'grid', label: 'সব দাগ', borders: 'all', banded: false },
  { id: 'shade', label: 'ছায়া দেওয়া হেডার', borders: 'all', banded: false },
  { id: 'banded', label: 'এক সারি পর পর রং', borders: 'all', banded: true },
  { id: 'outer', label: 'শুধু বাইরের দাগ', borders: 'outer', banded: false },
  { id: 'clean', label: 'দাগহীন', borders: 'none', banded: false },
];

export const HEADER_SHADE = '#d9d9d9';
export const BAND_SHADE = '#f2f2f2';
/** Points → twips for line widths in Word (eighths of a point) and RTF (twips). */
export const LINE_WIDTHS = [0.5, 1, 1.5, 2.25];

/* ---------- pure helpers ---------- */

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const toEn = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
const toBn = (s: string) => s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]);

/** A number written in a cell (Bangla or English digits, commas, "/-", "টাকা", "শতক"…), or null. */
export function cellNumber(text: string): number | null {
  const s = toEn(text).replace(/[,\s]/g, '').replace(/\/-$/, '');
  const m = s.match(/^[^\d-]*(-?\d+(?:\.\d+)?)[^\d]*$/);
  return m ? Number(m[1]) : null;
}

/** The sum written like the column: Bangla digits if the column uses them, decimals as needed. */
export function formatSum(sum: number, samples: string[]): string {
  const bangla = samples.filter((s) => /[০-৯]/.test(s)).length >= samples.filter((s) => /\d/.test(s)).length && samples.some((s) => /[০-৯]/.test(s));
  const decimals = Math.min(4, Math.max(0, ...samples.map((s) => (toEn(s).match(/\.(\d+)/)?.[1].length ?? 0))));
  let out = sum.toFixed(decimals);
  if (samples.some((s) => /\d,\d/.test(toEn(s)))) {
    const [i, d] = out.split('.');
    const head = i.length > 3 ? i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + i.slice(-3) : i;
    out = head + (d ? '.' + d : '');
  }
  return bangla ? toBn(out) : out;
}

/** Split lines of text into cells. `auto` picks tab, then |, then comma, then 2+ spaces. */
export type Delimiter = 'auto' | 'tab' | 'comma' | 'pipe' | 'spaces';
export function splitRows(lines: string[], d: Delimiter): string[][] {
  const pick = (): Exclude<Delimiter, 'auto'> => {
    const all = lines.join('\n');
    if (all.includes('\t')) return 'tab';
    if (all.includes('|')) return 'pipe';
    if (/[,،]/.test(all)) return 'comma';
    return 'spaces';
  };
  const k = d === 'auto' ? pick() : d;
  const re = { tab: /\t/, comma: /\s*[,،]\s*/, pipe: /\s*\|\s*/, spaces: /\s{2,}/ }[k];
  const rows = lines.filter((l) => l.trim()).map((l) => l.replace(/^\s*\|\s*|\s*\|\s*$/g, k === 'pipe' ? '' : '$&').split(re).map((c) => c.trim()));
  const cols = Math.max(1, ...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array(cols - r.length).fill('')]);
}

/** Order of rows for sorting by one column: numbers as numbers, text in Bangla order. */
export function sortOrder(values: string[], dir: 'asc' | 'desc', as: 'auto' | 'text' | 'number'): number[] {
  const nums = values.map(cellNumber);
  const numeric = as === 'number' || (as === 'auto' && values.every((v, i) => !v.trim() || nums[i] !== null));
  const coll = new Intl.Collator(['bn', 'en'], { numeric: true, sensitivity: 'base' });
  const idx = values.map((_, i) => i);
  idx.sort((a, b) => {
    let c: number;
    if (numeric) c = (nums[a] ?? Infinity) - (nums[b] ?? Infinity);
    else c = coll.compare(values[a].trim(), values[b].trim());
    return (dir === 'asc' ? c : -c) || a - b;
  });
  return idx;
}

/* ---------- quick tables (placeholders only) ---------- */

export interface QuickTable {
  id: string;
  label: string;
  head: string[];
  rows: number;
  total?: number; // column index summed in a total row
}
export const QUICK_TABLES: QuickTable[] = [
  { id: 'schedule', label: 'তফসিল', head: ['ক্রম', 'মৌজা ও জে.এল. নং', 'খতিয়ান নং', 'দাগ নং', 'জমির পরিমাণ (শতক)'], rows: 3, total: 4 },
  { id: 'chain', label: 'দলিলের ধারাবাহিকতা', head: ['ক্রম', 'দলিল নং ও সন', 'তারিখ', 'দাতা', 'গ্রহীতা', 'পরিমাণ (শতক)'], rows: 3 },
  { id: 'heirs', label: 'ওয়ারিশ ও হিস্যা', head: ['ক্রম', 'ওয়ারিশের নাম', 'সম্পর্ক', 'হিস্যা', 'জমির পরিমাণ (শতক)'], rows: 4, total: 4 },
  { id: 'dates', label: 'তারিখ ও ঘটনা', head: ['ক্রম', 'তারিখ', 'ঘটনা', 'মন্তব্য'], rows: 4 },
  { id: 'witness', label: 'সাক্ষীর তালিকা', head: ['ক্রম', 'সাক্ষীর নাম', 'পিতা/স্বামী', 'ঠিকানা', 'কী বিষয়ে'], rows: 3 },
  { id: 'costs', label: 'খরচের হিসাব', head: ['ক্রম', 'খাত', 'তারিখ', 'টাকা'], rows: 4, total: 3 },
];

const num = (i: number) => toBn(String(i)) + '।';

/** Tiptap JSON for a quick table. */
export function quickTableJSON(q: QuickTable) {
  const cell = (type: 'tableCell' | 'tableHeader', text: string) => ({ type, content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }] });
  const rows = [
    { type: 'tableRow', attrs: { rrepeat: true }, content: q.head.map((h) => cell('tableHeader', h)) },
    ...Array.from({ length: q.rows }, (_, r) => ({ type: 'tableRow', content: q.head.map((_, c) => cell('tableCell', c === 0 ? num(r + 1) : '')) })),
  ];
  if (q.total !== undefined) rows.push({ type: 'tableRow', content: q.head.map((_, c) => cell('tableCell', c === 0 ? 'মোট' : '')) });
  return { type: 'table', attrs: { tstyle: 'court', tborders: 'all', ttotal: q.total !== undefined || null }, content: rows };
}

/* ---------- attributes ---------- */

const bool = (name: string) => ({
  default: null,
  parseHTML: (el: HTMLElement) => (el.getAttribute(name) === 'true' ? true : null),
});
const twipsPx = (t: number) => +(t / 15).toFixed(2);
const SIDE_CSS: Record<CellSide, string> = { none: 'none', single: 'solid', double: 'double', dashed: 'dashed' };

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableTools: {
      setTableAttrs: (attrs: Record<string, unknown>) => ReturnType;
      /** Start a new undo step with this transaction. */
      newUndoStep: () => ReturnType;
      applyTableStyle: (id: TableStyleId) => ReturnType;
      setCellsAttrs: (attrs: Record<string, unknown>) => ReturnType;
      setRowsAttrs: (attrs: Record<string, unknown>) => ReturnType;
      setCellSides: (sides: { t?: boolean; b?: boolean; l?: boolean; r?: boolean }, value: CellSide | null) => ReturnType;
      setCellAlign: (v: 'top' | 'middle' | 'bottom' | null, h: 'left' | 'center' | 'right' | null) => ReturnType;
      selectTablePart: (part: 'cell' | 'row' | 'column' | 'table') => ReturnType;
      clearCells: () => ReturnType;
      setColumnWidth: (twips: number) => ReturnType;
      distributeColumns: () => ReturnType;
      distributeRows: (twips: number) => ReturnType;
      autoFit: (mode: 'contents' | 'window' | 'fixed', widthsTwips?: number[]) => ReturnType;
      splitTable: () => ReturnType;
      textToTable: (d: Delimiter, header: boolean) => ReturnType;
      tableToText: () => ReturnType;
      sortTable: (col: number, dir: 'asc' | 'desc', as: 'auto' | 'text' | 'number') => ReturnType;
      sumColumn: () => ReturnType;
      insertQuickTable: (id: string) => ReturnType;
    };
  }
}

/** The table around the selection: node, start position (inside), map. */
function tableAt(state: EditorState) {
  const $p = state.selection.$from;
  for (let d = $p.depth; d > 0; d--) {
    const node = $p.node(d);
    if (node.type.name === 'table') return { node, pos: $p.before(d), start: $p.start(d), map: TableMap.get(node) };
  }
  return null;
}

/** Rows that are header rows (all cells tableHeader) at the top of a table. */
export function headerRowCount(table: PMNode): number {
  let n = 0;
  for (let i = 0; i < table.childCount; i++) {
    const r = table.child(i);
    let all = r.childCount > 0;
    r.forEach((c) => { if (c.type.name !== 'tableHeader') all = false; });
    if (!all) break;
    n++;
  }
  return n;
}

const hasMerged = (table: PMNode) => {
  let m = false;
  table.descendants((n) => {
    if ((n.type.name === 'tableCell' || n.type.name === 'tableHeader') && (n.attrs.colspan > 1 || n.attrs.rowspan > 1)) m = true;
    return !m;
  });
  return m;
};

function cellsInSelection(state: EditorState): { pos: number; node: PMNode }[] {
  const out: { pos: number; node: PMNode }[] = [];
  const sel = state.selection;
  if (sel instanceof CellSelection) {
    sel.forEachCell((node, pos) => out.push({ node, pos }));
    return out;
  }
  const $p = sel.$from;
  for (let d = $p.depth; d > 0; d--) {
    const n = $p.node(d);
    if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') {
      out.push({ node: n, pos: $p.before(d) });
      break;
    }
  }
  return out;
}

function rowsInSelection(state: EditorState): number[] {
  const t = tableAt(state);
  if (!t) return [];
  const cells = cellsInSelection(state);
  const rows = new Set<number>();
  for (const c of cells) {
    const $c = state.doc.resolve(c.pos);
    rows.add($c.before($c.depth));
  }
  return [...rows];
}

const textOf = (n: PMNode) => {
  const parts: string[] = [];
  n.forEach((p) => parts.push(p.textContent));
  return parts.join(' ').trim();
};

function makeCell(schema: Schema, type: 'tableCell' | 'tableHeader', text: string) {
  return schema.nodes[type].create(null, schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined));
}

/**
 * Tiptap's TableView only refreshes the column widths on update, so a changed style, border or alignment
 * on the <table> would not show. Rebuild the view when the table's own attributes change.
 */
export class SyncTableView extends TableView {
  update(node: PMNode): boolean {
    const old = this.node.attrs as Record<string, unknown>;
    const now = node.attrs as Record<string, unknown>;
    if (Object.keys(now).some((k) => old[k] !== now[k])) return false;
    return super.update(node);
  }
}

export const TableTools = Extension.create({
  name: 'tableTools',

  addGlobalAttributes() {
    return [
      {
        types: ['table'],
        attributes: {
          tstyle: { default: null, parseHTML: (el) => el.getAttribute('data-tstyle'), renderHTML: (a) => (a.tstyle ? { 'data-tstyle': a.tstyle } : {}) },
          tborders: { default: null, parseHTML: (el) => el.getAttribute('data-borders'), renderHTML: (a) => (a.tborders ? { 'data-borders': a.tborders } : {}) },
          tbanded: { ...bool('data-banded'), renderHTML: (a) => (a.tbanded ? { 'data-banded': 'true' } : {}) },
          tfirstcol: { ...bool('data-firstcol'), renderHTML: (a) => (a.tfirstcol ? { 'data-firstcol': 'true' } : {}) },
          ttotal: { ...bool('data-total'), renderHTML: (a) => (a.ttotal ? { 'data-total': 'true' } : {}) },
          talign: { default: null, parseHTML: (el) => el.getAttribute('data-talign'), renderHTML: (a) => (a.talign ? { 'data-talign': a.talign } : {}) },
          tfit: { default: null, parseHTML: (el) => el.getAttribute('data-fit'), renderHTML: (a) => (a.tfit ? { 'data-fit': a.tfit } : {}) },
          tline: { default: null, parseHTML: (el) => el.getAttribute('data-line'), renderHTML: (a) => (a.tline ? { 'data-line': a.tline } : {}) },
          tlinew: {
            default: null,
            parseHTML: (el) => (el.getAttribute('data-linew') ? Number(el.getAttribute('data-linew')) : null),
            renderHTML: (a) => (a.tlinew ? { 'data-linew': String(a.tlinew), style: `--tb-w:${Math.max(1, Math.round((Number(a.tlinew) * 4) / 3))}px` } : {}),
          },
          tlinec: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-linec'),
            renderHTML: (a) => (a.tlinec ? { 'data-linec': String(a.tlinec), style: `--tb-c:${a.tlinec}` } : {}),
          },
          tpad: {
            default: null,
            parseHTML: (el) => (el.getAttribute('data-pad') ? Number(el.getAttribute('data-pad')) : null),
            renderHTML: (a) => (a.tpad != null ? { 'data-pad': String(a.tpad), style: `--tb-pad:${twipsPx(Number(a.tpad))}px` } : {}),
          },
        },
      },
      {
        types: ['tableRow'],
        attributes: {
          rheight: {
            default: null,
            parseHTML: (el) => (el.getAttribute('data-height') ? Number(el.getAttribute('data-height')) : null),
            renderHTML: (a) => (a.rheight ? { 'data-height': String(a.rheight), style: `height:${twipsPx(Number(a.rheight))}px` } : {}),
          },
          // true / false / null (= header rows repeat, others don't)
          rrepeat: {
            default: null,
            parseHTML: (el) => (el.getAttribute('data-repeat') === 'true' ? true : el.getAttribute('data-repeat') === 'false' ? false : null),
            renderHTML: (a) => (a.rrepeat === true || a.rrepeat === false ? { 'data-repeat': String(a.rrepeat) } : {}),
          },
          rkeep: { ...bool('data-keep'), renderHTML: (a) => (a.rkeep ? { 'data-keep': 'true' } : {}) },
        },
      },
      {
        types: ['tableCell', 'tableHeader'],
        attributes: {
          bg: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-bg'),
            renderHTML: (a) => (a.bg ? { 'data-bg': String(a.bg), style: `background-color:${a.bg}` } : {}),
          },
          valign: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-valign'),
            renderHTML: (a) => (a.valign ? { 'data-valign': String(a.valign), style: `vertical-align:${a.valign}` } : {}),
          },
          ...Object.fromEntries(
            (['bt', 'bb', 'bl', 'br'] as const).map((k) => [
              k,
              {
                default: null,
                parseHTML: (el: HTMLElement) => el.getAttribute('data-' + k),
                renderHTML: (a: Record<string, unknown>) => {
                  const v = a[k] as CellSide | null;
                  if (!v) return {};
                  const side = { bt: 'top', bb: 'bottom', bl: 'left', br: 'right' }[k];
                  return {
                    ['data-' + k]: v,
                    style: v === 'none' ? `border-${side}-style:none` : `border-${side}:${v === 'double' ? 'calc(var(--tb-w,1px) + 2px)' : 'var(--tb-w,1px)'} ${SIDE_CSS[v]} var(--tb-c,currentColor)`,
                  };
                },
              },
            ]),
          ),
        },
      },
    ];
  },

  addCommands() {
    const setTable = (attrs: Record<string, unknown>) => ({ state, tr, dispatch }: CommandProps) => {
      const t = tableAt(state);
      if (!t) return false;
      if (dispatch) tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, ...attrs });
      return true;
    };
    return {
      setTableAttrs: (attrs) => setTable(attrs),
      newUndoStep: () => ({ tr, dispatch }) => {
        if (dispatch) closeHistory(tr);
        return true;
      },
      applyTableStyle: (id) => (props) => {
        const s = TABLE_STYLES.find((x) => x.id === id);
        if (!s) return false;
        return setTable({ tstyle: id, tborders: s.borders, tbanded: s.banded || null })(props);
      },
      setCellsAttrs: (attrs) => ({ state, tr, dispatch }) => {
        const cells = cellsInSelection(state);
        if (!cells.length) return false;
        if (dispatch) for (const c of cells) tr.setNodeMarkup(c.pos, undefined, { ...c.node.attrs, ...attrs });
        return true;
      },
      setRowsAttrs: (attrs) => ({ state, tr, dispatch }) => {
        const rows = rowsInSelection(state);
        if (!rows.length) return false;
        if (dispatch) for (const pos of rows) tr.setNodeMarkup(pos, undefined, { ...state.doc.nodeAt(pos)!.attrs, ...attrs });
        return true;
      },
      setCellSides: (sides, value) => ({ state, tr, dispatch }) => {
        const cells = cellsInSelection(state);
        if (!cells.length) return false;
        if (dispatch)
          for (const c of cells) {
            const a = { ...c.node.attrs };
            if (sides.t) a.bt = value;
            if (sides.b) a.bb = value;
            if (sides.l) a.bl = value;
            if (sides.r) a.br = value;
            tr.setNodeMarkup(c.pos, undefined, a);
          }
        return true;
      },
      setCellAlign: (v, h) => ({ state, tr, dispatch }) => {
        const cells = cellsInSelection(state);
        if (!cells.length) return false;
        if (dispatch)
          for (const c of cells) {
            tr.setNodeMarkup(c.pos, undefined, { ...c.node.attrs, valign: v });
            c.node.forEach((p, off) => {
              if (p.type.spec.attrs && 'textAlign' in p.type.spec.attrs) tr.setNodeMarkup(c.pos + 1 + off, undefined, { ...p.attrs, textAlign: h });
            });
          }
        return true;
      },
      selectTablePart: (part) => ({ state, tr, dispatch }) => {
        const t = tableAt(state);
        if (!t) return false;
        const cells = cellsInSelection(state);
        if (!cells.length) return false;
        const $cell = state.doc.resolve(cells[0].pos);
        let sel;
        if (part === 'cell') sel = new CellSelection($cell);
        else if (part === 'row') sel = CellSelection.rowSelection($cell);
        else if (part === 'column') sel = CellSelection.colSelection($cell);
        else {
          const first = t.start + t.map.map[0];
          const last = t.start + t.map.map[t.map.map.length - 1];
          sel = CellSelection.create(state.doc, first, last);
        }
        if (dispatch) tr.setSelection(sel);
        return true;
      },
      clearCells: () => ({ state, tr, dispatch }) => {
        const cells = cellsInSelection(state);
        if (!cells.length) return false;
        if (dispatch)
          for (const c of [...cells].reverse()) {
            const from = tr.mapping.map(c.pos + 1);
            const to = tr.mapping.map(c.pos + c.node.nodeSize - 1);
            tr.replaceWith(from, to, state.schema.nodes.paragraph.create());
          }
        return true;
      },
      setColumnWidth: (twips) => ({ state, tr, dispatch }) => {
        const t = tableAt(state);
        if (!t) return false;
        const rect = selectedRect(state);
        const px = Math.round(twips / 15);
        if (dispatch) {
          const seen = new Set<number>();
          for (let row = 0; row < t.map.height; row++)
            for (let col = rect.left; col < rect.right; col++) {
              const cellPos = t.map.map[row * t.map.width + col];
              if (seen.has(cellPos)) continue;
              seen.add(cellPos);
              const cell = t.node.nodeAt(cellPos)!;
              const idx = col - t.map.colCount(cellPos);
              const cw = cell.attrs.colwidth ? [...cell.attrs.colwidth] : Array(cell.attrs.colspan).fill(0);
              cw[idx] = px;
              tr.setNodeMarkup(t.start + cellPos, undefined, { ...cell.attrs, colwidth: cw });
            }
          tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, tfit: 'fixed' });
        }
        return true;
      },
      distributeColumns: () => ({ state, tr, dispatch, view }) => {
        const t = tableAt(state);
        if (!t) return false;
        const dom = view.nodeDOM(t.pos) as HTMLElement | null;
        const tableEl = dom?.querySelector?.('table') ?? (dom as HTMLTableElement | null);
        const total = tableEl?.getBoundingClientRect().width ? tableEl.offsetWidth : 573;
        const each = Math.floor(total / t.map.width);
        if (dispatch) {
          t.node.descendants((n, p) => {
            if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') {
              tr.setNodeMarkup(t.start + p, undefined, { ...n.attrs, colwidth: Array(n.attrs.colspan).fill(each) });
              return false;
            }
            return true;
          });
          tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, tfit: 'fixed' });
        }
        return true;
      },
      distributeRows: (twips) => ({ state, tr, dispatch }) => {
        const t = tableAt(state);
        if (!t) return false;
        if (dispatch) t.node.forEach((r, off) => tr.setNodeMarkup(t.start + off, undefined, { ...r.attrs, rheight: twips }));
        return true;
      },
      autoFit: (mode, widthsTwips) => ({ state, tr, dispatch }) => {
        const t = tableAt(state);
        if (!t) return false;
        if (dispatch) {
          if (mode !== 'fixed' || widthsTwips)
            t.node.descendants((n, p) => {
              if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') {
                let colwidth: number[] | null = null;
                if (mode === 'fixed' && widthsTwips) {
                  const col = t.map.colCount(p);
                  colwidth = Array.from({ length: n.attrs.colspan }, (_, k) => Math.round((widthsTwips[col + k] ?? 1440) / 15));
                }
                tr.setNodeMarkup(t.start + p, undefined, { ...n.attrs, colwidth });
                return false;
              }
              return true;
            });
          tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, tfit: mode === 'contents' ? 'auto' : mode === 'window' ? 'window' : 'fixed' });
        }
        return true;
      },
      splitTable: () => ({ state, tr, dispatch }) => {
        const t = tableAt(state);
        if (!t) return false;
        const $p = state.selection.$from;
        let rowIndex = -1;
        for (let d = $p.depth; d > 0; d--) if ($p.node(d).type.name === 'tableRow') { rowIndex = $p.index(d - 1); break; }
        if (rowIndex <= 0 || hasMerged(t.node)) return false;
        if (dispatch) {
          closeHistory(tr); // its own undo step
          const rows: PMNode[] = [];
          t.node.forEach((r) => rows.push(r));
          const a = t.node.type.create(t.node.attrs, rows.slice(0, rowIndex));
          const b = t.node.type.create({ ...t.node.attrs, ttotal: null }, rows.slice(rowIndex));
          const gap = state.schema.nodes.paragraph.create();
          tr.replaceWith(t.pos, t.pos + t.node.nodeSize, [a.type.create({ ...a.attrs, ttotal: null }, a.content), gap, b.type.create({ ...b.attrs, ttotal: t.node.attrs.ttotal }, b.content)]);
          tr.setSelection(TextSelection.create(tr.doc, t.pos + a.nodeSize + 1));
        }
        return true;
      },
      textToTable: (d, header) => ({ state, tr, dispatch }) => {
        const { from, to } = state.selection;
        const blocks: { pos: number; node: PMNode }[] = [];
        state.doc.forEach((n, pos) => {
          if (pos + n.nodeSize > from && pos < Math.max(to, from + 1) && n.isTextblock) blocks.push({ pos, node: n });
        });
        if (!blocks.length) return false;
        const rows = splitRows(blocks.map((b) => b.node.textContent), d);
        if (!rows.length) return false;
        if (dispatch) {
          closeHistory(tr); // its own undo step
          const s = state.schema;
          const tableRows = rows.map((r, i) =>
            s.nodes.tableRow.create(header && i === 0 ? { rrepeat: true } : null, r.map((c) => makeCell(s, header && i === 0 ? 'tableHeader' : 'tableCell', c))),
          );
          const table = s.nodes.table.create({ tstyle: 'court', tborders: 'all' }, tableRows);
          const start = blocks[0].pos;
          const end = blocks[blocks.length - 1].pos + blocks[blocks.length - 1].node.nodeSize;
          tr.replaceWith(start, end, table);
        }
        return true;
      },
      tableToText: () => ({ state, tr, dispatch }) => {
        const t = tableAt(state);
        if (!t) return false;
        if (dispatch) {
          closeHistory(tr); // its own undo step
          const s = state.schema;
          const paras: PMNode[] = [];
          t.node.forEach((r) => {
            const cells: string[] = [];
            r.forEach((c) => cells.push(textOf(c)));
            const line = cells.join('\t');
            paras.push(s.nodes.paragraph.create(null, line ? s.text(line) : undefined));
          });
          tr.replaceWith(t.pos, t.pos + t.node.nodeSize, paras);
        }
        return true;
      },
      sortTable: (col, dir, as) => ({ state, tr, dispatch }) => {
        const t = tableAt(state);
        if (!t || hasMerged(t.node)) return false;
        const rows: PMNode[] = [];
        t.node.forEach((r) => rows.push(r));
        const head = headerRowCount(t.node);
        const tail = t.node.attrs.ttotal ? 1 : 0;
        const body = rows.slice(head, rows.length - tail);
        if (body.length < 2) return false;
        const values = body.map((r) => (col < r.childCount ? textOf(r.child(col)) : ''));
        const order = sortOrder(values, dir, as);
        if (dispatch) {
          closeHistory(tr); // its own undo step
          const sorted = [...rows.slice(0, head), ...order.map((i) => body[i]), ...rows.slice(rows.length - tail)];
          tr.replaceWith(t.pos, t.pos + t.node.nodeSize, t.node.type.create(t.node.attrs, sorted));
          // same size, so the caret stays in the table (and the table tabs stay open)
          tr.setSelection(TextSelection.near(tr.doc.resolve(state.selection.from)));
        }
        return true;
      },
      sumColumn: () => ({ state, tr, dispatch }) => {
        const t = tableAt(state);
        if (!t || hasMerged(t.node)) return false;
        const rect = selectedRect(state);
        const col = rect.left;
        const rows: PMNode[] = [];
        t.node.forEach((r) => rows.push(r));
        const head = headerRowCount(t.node);
        const hasTotal = !!t.node.attrs.ttotal;
        const body = rows.slice(head, rows.length - (hasTotal ? 1 : 0));
        const texts = body.map((r) => (col < r.childCount ? textOf(r.child(col)) : '')).filter((x) => x);
        const nums = texts.map(cellNumber).filter((x): x is number => x !== null);
        if (!nums.length) return false;
        const sum = nums.reduce((a, b) => a + b, 0);
        const label = formatSum(+sum.toFixed(6), texts);
        if (dispatch) {
          closeHistory(tr); // its own undo step
          const s = state.schema;
          if (hasTotal) {
            const cellRel = t.map.map[(t.map.height - 1) * t.map.width + col];
            const cell = t.node.nodeAt(cellRel)!;
            const at = t.start + cellRel;
            tr.replaceWith(at + 1, at + cell.nodeSize - 1, s.nodes.paragraph.create(cell.firstChild?.attrs ?? null, s.text(label)));
          } else {
            const width = rows[rows.length - 1].childCount;
            const cells = Array.from({ length: width }, (_, i) => makeCell(s, 'tableCell', i === col ? label : i === 0 && col !== 0 ? 'মোট' : ''));
            const newRow = s.nodes.tableRow.create(null, cells);
            tr.insert(t.pos + t.node.nodeSize - 1, newRow);
            tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, ttotal: true });
          }
        }
        return true;
      },
      insertQuickTable: (id) => ({ commands, tr, dispatch }) => {
        const q = QUICK_TABLES.find((x) => x.id === id);
        if (!q) return false;
        if (dispatch) closeHistory(tr);
        return commands.insertContent(quickTableJSON(q));
      },
    };
  },
});
