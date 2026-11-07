/**
 * Print Layout: shows where pages break, the way the page will print from ProNotes.
 *
 * The document itself is never changed. After each edit the plugin measures the blocks and lines on
 * screen and inserts spacer widgets: between blocks when a block moves to the next page, or inside a
 * paragraph at a line boundary when the paragraph runs over (with simple widow/orphan control).
 * A spacer draws the rest of the page, its footer, the gap between sheets and the next top margin.
 * Measurements ignore existing spacers, so the result is stable.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

export interface PageLayout {
  on: boolean;
  /** CSS zoom applied to the page. */
  zoom: number;
  /** All in unzoomed CSS px. */
  pageW: number;
  pageH: number;
  mt: number;
  mb: number;
  ml: number;
  mr: number;
  /** Distance of the footer text from the bottom edge. */
  footerDist: number;
  gap: number;
  /** Footer text for page n of total ('' = no page numbers). */
  footer: (n: number, total: number) => string;
  footerAlign: 'left' | 'center' | 'right';
}

export interface PageBreakInfo {
  pos: number;
  /** Inside a paragraph (at a line start) or before a block. */
  inline: boolean;
  /** Empty space left at the bottom of the page, px. */
  blank: number;
  /** Left offset of the spacer relative to the page edge, px (negative margin). */
  left: number;
}

interface PState {
  breaks: PageBreakInfo[];
  endBlank: number;
  pages: number;
  /** bumped when the layout options change, to rebuild decorations */
  v: number;
}

export const paginationKey = new PluginKey<PState>('pagination');
export const pageCount = (state: import('@tiptap/pm/state').EditorState) => paginationKey.getState(state)?.pages ?? 1;

interface Opts {
  getLayout: () => PageLayout;
}

const same = (a: PState, b: Omit<PState, 'v'>) =>
  a.pages === b.pages &&
  Math.abs(a.endBlank - b.endBlank) < 1 &&
  a.breaks.length === b.breaks.length &&
  a.breaks.every((x, i) => x.pos === b.breaks[i].pos && x.inline === b.breaks[i].inline && Math.abs(x.blank - b.breaks[i].blank) < 1 && Math.abs(x.left - b.breaks[i].left) < 1);

function spacer(L: PageLayout, blank: number, left: number, n: number, total: number, inline: boolean, last = false): HTMLElement {
  const el = document.createElement(inline ? 'span' : 'div');
  el.className = 'pg-gap' + (last ? ' pg-end' : '');
  el.contentEditable = 'false';
  el.setAttribute('aria-hidden', 'true');
  const restH = Math.max(0, blank) + L.mb;
  el.style.cssText = `display:block;height:${last ? restH : restH + L.gap + L.mt}px;margin-left:${-left}px;width:${L.pageW}px;text-indent:0;`;
  const rest = document.createElement('span');
  rest.className = 'pg-rest';
  rest.style.cssText = `height:${restH}px`;
  const label = L.footer(n, total);
  if (label) {
    const f = document.createElement('span');
    f.className = 'pg-foot';
    // shown through CSS, so the label is never part of the document's text (copy, search, tests)
    f.setAttribute('data-label', label);
    const side = L.footerAlign === 'left' ? `left:${L.ml}px` : L.footerAlign === 'right' ? `right:${L.mr}px` : 'left:0;right:0;text-align:center';
    f.style.cssText = `bottom:${Math.max(4, L.footerDist - 18)}px;${side}`;
    rest.appendChild(f);
  }
  el.appendChild(rest);
  if (!last) {
    const band = document.createElement('span');
    band.className = 'pg-band';
    band.style.cssText = `height:${L.gap}px`;
    el.appendChild(band);
  }
  return el;
}

/** Line boxes of a block element, in client coordinates (zoomed), grouped by line. */
function lineBoxes(dom: HTMLElement, skip: DOMRect[]): { top: number; bottom: number; left: number }[] {
  const range = document.createRange();
  range.selectNodeContents(dom);
  const rects = [...range.getClientRects()].filter(
    (r) => r.width > 0 && r.height > 0 && !skip.some((s) => r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5),
  );
  rects.sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: { top: number; bottom: number; left: number }[] = [];
  for (const r of rects) {
    const mid = (r.top + r.bottom) / 2;
    const l = lines.find((x) => mid > x.top && mid < x.bottom);
    if (l) {
      l.top = Math.min(l.top, r.top);
      l.bottom = Math.max(l.bottom, r.bottom);
      l.left = Math.min(l.left, r.left);
    } else lines.push({ top: r.top, bottom: r.bottom, left: r.left });
  }
  return lines.sort((a, b) => a.top - b.top);
}

export function measure(view: EditorView, L: PageLayout): Omit<PState, 'v'> {
  const z = L.zoom || 1;
  const root = view.dom as HTMLElement;
  const rootRect = root.getBoundingClientRect();
  const pageLeft = rootRect.left;
  const origin = rootRect.top / z + L.mt;
  const contentH = L.pageH - L.mt - L.mb;
  const spacers = [...root.querySelectorAll('.pg-gap')].map((e) => e.getBoundingClientRect());
  const spacerZ = spacers.map((r) => ({ top: r.top / z, h: r.height / z }));
  const unspace = (clientY: number) => {
    const y = clientY / z;
    let s = 0;
    for (const sp of spacerZ) if (sp.top < y - 0.5) s += Math.min(sp.h, y - sp.top);
    return y - s - origin;
  };

  const breaks: PageBreakInfo[] = [];
  let pageStart = 0;
  let pageEnd = contentH;
  let page = 1;
  let pending = false;
  let lastBottom = 0;
  const blockBreak = (pos: number, top: number) => {
    breaks.push({ pos, inline: false, blank: pageEnd - top, left: L.ml });
    pageStart = top;
    pageEnd = top + contentH;
    page++;
  };

  const nodes: { node: import('@tiptap/pm/model').Node; offset: number }[] = [];
  view.state.doc.forEach((node, offset) => nodes.push({ node, offset }));
  for (const { node, offset } of nodes) {
    const dom = view.nodeDOM(offset) as HTMLElement | null;
    if (!dom || !(dom instanceof HTMLElement)) continue;
    if (node.type.name === 'pageBreak') {
      pending = true;
      continue;
    }
    const r = dom.getBoundingClientRect();
    const top = unspace(r.top);
    const bottom = unspace(r.bottom);
    if ((pending || node.attrs.breakBefore) && top > pageStart + 1) blockBreak(offset, top);
    pending = false;
    let guard = 0;
    while (bottom > pageEnd + 0.5 && guard++ < 200) {
      const splittable = node.isTextblock && !node.attrs.keepLines && node.type.name !== 'heading';
      if (!splittable || top >= pageEnd - 0.5) {
        if (top > pageStart + 0.5) {
          blockBreak(offset, top);
          continue;
        }
        // taller than a page and already at the top: let it run over without a visible break
        pageStart = pageEnd;
        pageEnd += contentH;
        page++;
        continue;
      }
      const lines = lineBoxes(dom, spacers).map((l) => ({ ...l, uTop: unspace(l.top), uBottom: unspace(l.bottom) }));
      let i = lines.findIndex((l) => l.uBottom > pageEnd + 0.5 && l.uTop >= pageStart - 0.5);
      if (i < 0) break;
      const before = lines.filter((l) => l.uTop >= pageStart - 0.5).length - (lines.length - i);
      // orphan: a single line at the bottom of the page moves with the rest
      if (i === 0 || (before === 1 && lines.length > 2)) {
        if (top > pageStart + 0.5) {
          blockBreak(offset, top);
          continue;
        }
      }
      // widow: never leave a single line alone at the top of the next page
      if (lines.length - i === 1 && i >= 2) i--;
      const line = lines[i];
      const hit = view.posAtCoords({ left: line.left + 1, top: (line.top + line.bottom) / 2 });
      if (!hit) break;
      const cs = getComputedStyle(dom);
      const contentLeft = (r.left - pageLeft) / z + parseFloat(cs.paddingLeft || '0') + L.ml;
      breaks.push({ pos: hit.pos, inline: true, blank: pageEnd - line.uTop, left: contentLeft });
      pageStart = line.uTop;
      pageEnd = line.uTop + contentH;
      page++;
    }
    lastBottom = Math.max(lastBottom, bottom);
  }
  return { breaks, endBlank: Math.max(0, pageEnd - lastBottom), pages: page };
}

export const Pagination = Extension.create<Opts>({
  name: 'pagination',
  addOptions() {
    return { getLayout: () => ({ on: false }) as PageLayout };
  },
  addProseMirrorPlugins() {
    const getLayout = this.options.getLayout;
    return [
      new Plugin<PState>({
        key: paginationKey,
        state: {
          init: () => ({ breaks: [], endBlank: 0, pages: 1, v: 0 }),
          apply(tr, old) {
            const m = tr.getMeta(paginationKey) as Partial<PState> | undefined;
            if (m) return { ...old, ...m, v: old.v + 1 };
            if (!tr.docChanged || !old.breaks.length) return old;
            // keep positions roughly right until the next measurement
            return { ...old, breaks: old.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos) })) };
          },
        },
        props: {
          decorations(state) {
            const L = getLayout();
            const s = paginationKey.getState(state);
            if (!L.on || !s) return null;
            const total = s.pages;
            const deco = s.breaks.map((b, i) =>
              Decoration.widget(b.pos, () => spacer(L, b.blank, b.inline ? b.left : L.ml, i + 1, total, b.inline), {
                side: -1,
                ignoreSelection: true,
                key: `pg-${i}-${Math.round(b.blank)}-${Math.round(b.left)}-${b.inline}-${total}-${s.v}`,
              }),
            );
            deco.push(
              Decoration.widget(state.doc.content.size, () => spacer(L, s.endBlank, L.ml, total, total, false, true), {
                side: 1,
                ignoreSelection: true,
                key: `pg-end-${Math.round(s.endBlank)}-${total}-${s.v}`,
              }),
            );
            return DecorationSet.create(state.doc, deco);
          },
        },
        view(view) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          let frame = 0;
          const run = () => {
            const L = getLayout();
            const cur = paginationKey.getState(view.state)!;
            if (!L.on) {
              if (cur.breaks.length || cur.pages !== 1) view.dispatch(view.state.tr.setMeta(paginationKey, { breaks: [], endBlank: 0, pages: 1 }).setMeta('addToHistory', false));
              return;
            }
            const next = measure(view, L);
            if (!same(cur, next)) view.dispatch(view.state.tr.setMeta(paginationKey, next).setMeta('addToHistory', false));
          };
          const schedule = (delay = 120) => {
            clearTimeout(timer);
            cancelAnimationFrame(frame);
            timer = setTimeout(() => (frame = requestAnimationFrame(run)), delay);
          };
          const onResize = () => schedule(200);
          window.addEventListener('resize', onResize);
          document.fonts?.ready.then(() => schedule(0));
          (view.dom as HTMLElement).addEventListener('pn-relayout', () => schedule(0));
          schedule(0);
          return {
            update(v, prev) {
              if (v.state.doc !== prev.doc || paginationKey.getState(v.state)?.v === 0) schedule();
            },
            destroy() {
              clearTimeout(timer);
              cancelAnimationFrame(frame);
              window.removeEventListener('resize', onResize);
            },
          };
        },
      }),
    ];
  },
});

/** Ask the paginator to measure again (page setup, zoom or font changed). */
export const relayout = (view: EditorView) => (view.dom as HTMLElement).dispatchEvent(new Event('pn-relayout'));
