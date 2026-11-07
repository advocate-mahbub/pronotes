/**
 * Pictures of the pages (.png), drawn from the page on screen. Each page is drawn on its own
 * (iPad Safari limits the size of one picture), always in light colours, without gridlines.
 */
import { toBlob } from 'html-to-image';

export interface PngOptions {
  /** unzoomed px */
  pageW: number;
  pageH: number;
  /** gap between pages in Print Layout (0 = one long sheet, cut every page height) */
  gap: number;
  pages: number;
  pixelRatio?: number;
}

const SKIP = ['grid-overlay', 'fm-para'];

export async function pagesToPng(pageEl: HTMLElement, o: PngOptions): Promise<Blob[]> {
  const root = document.documentElement;
  const theme = root.dataset.theme;
  root.dataset.theme = 'light';
  try {
    await document.fonts?.ready;
    const z = pageEl.getBoundingClientRect().width / pageEl.offsetWidth || 1;
    const totalH = pageEl.getBoundingClientRect().height / z;
    const step = o.pageH + o.gap;
    const count = o.gap ? Math.max(1, o.pages) : Math.max(1, Math.ceil(totalH / o.pageH));
    const out: Blob[] = [];
    for (let i = 0; i < count; i++) {
      const top = i * (o.gap ? step : o.pageH);
      const blob = await toBlob(pageEl, {
        width: o.pageW,
        height: o.pageH,
        pixelRatio: o.pixelRatio ?? 2,
        backgroundColor: '#ffffff',
        cacheBust: false,
        style: { zoom: '1', transform: `translateY(${-top}px)`, transformOrigin: '0 0', margin: '0', border: '0', boxShadow: 'none', background: '#ffffff' },
        filter: (n) => !(n instanceof HTMLElement && SKIP.some((c) => n.classList.contains(c))),
      });
      if (blob) out.push(blob);
    }
    return out;
  } finally {
    if (theme === undefined) delete root.dataset.theme;
    else root.dataset.theme = theme;
  }
}
