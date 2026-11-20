/**
 * The zoom bar (decisions.md 79): − 125% + at the bottom of the page area, so how far the page is zoomed
 * is always in sight. It lights up while two fingers zoom, showing the number as it changes; % opens the
 * steps (page width, whole page, 50–200%) and 100% puts it back. It fades out a moment after the last
 * zoom, scroll or touch, and comes back with the next one (decisions.md 82). Without the paper view (phone, reflow)
 * it zooms the text instead.
 */
import { useEffect, useRef, useState } from 'react';
import { num, useT } from '../i18n';

export const ZOOM_STEPS = [50, 75, 90, 100, 125, 150, 200];

interface Props {
  /** The zoom now, in %. */
  pct: number;
  /** While fingers pinch: the % shown live. */
  live: number | null;
  /** Paper view: page width / whole page exist. */
  paper: boolean;
  setPct: (p: number | 'width' | 'page') => void;
  min: number;
  max: number;
  /** A new number: show the bar again for a moment (the page was scrolled or touched). */
  wake?: number;
}

/** How long the bar stays after the last zoom, scroll or touch (decisions.md 82). */
export const ZOOM_BAR_IDLE_MS = 2500;

export function ZoomBar({ pct, live, paper, setPct, min, max, wake = 0 }: Props) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  // shown on a zoom, a scroll or a touch of the page; fades out by itself, stays while a finger or the menu is on it
  const [awake, setAwake] = useState(true);
  const hover = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const nap = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => { if (!hover.current) setAwake(false); }, ZOOM_BAR_IDLE_MS); };
  useEffect(() => { setAwake(true); if (live === null && !open) nap(); else clearTimeout(timer.current); }, [pct, live, wake, open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);
  const shown = live ?? pct;
  const down = () => setPct(Math.max(min, [...ZOOM_STEPS].reverse().find((z) => z < pct - 1) ?? min));
  const up = () => setPct(Math.min(max, ZOOM_STEPS.find((z) => z > pct + 1) ?? max));
  const choose = (z: number | 'width' | 'page') => { setPct(z); setOpen(false); };
  const step = (f: () => void) => () => { f(); setAwake(true); nap(); };
  return (
    <div className="zoom-bar-wrap" aria-hidden={false}>
      <div className={'zoom-bar' + (live !== null ? ' live' : '') + (awake || open ? '' : ' idle')} data-testid="zoom-bar" data-idle={awake || open ? undefined : 'yes'}
        onPointerDown={(e) => e.preventDefault()}
        onPointerEnter={() => { hover.current = true; setAwake(true); clearTimeout(timer.current); }}
        onPointerLeave={() => { hover.current = false; nap(); }}>
        <button type="button" aria-label={t('ছোট করে দেখুন')} title={t('ছোট করে দেখুন')} data-testid="zb-out" onClick={step(down)}>−</button>
        <button type="button" className="zb-pct" aria-label="Zoom" aria-expanded={open} data-testid="zb-pct" onClick={() => setOpen(!open)}>{num(String(Math.round(shown)), lang)}%</button>
        <button type="button" aria-label={t('বড় করে দেখুন')} title={t('বড় করে দেখুন')} data-testid="zb-in" onClick={step(up)}>+</button>
        {open && (
          <div className="zb-menu" role="menu" data-testid="zb-menu">
            {paper && <button type="button" role="menuitem" data-testid="zb-width" onClick={() => choose('width')}>{t('পাতার চওড়া')}</button>}
            {paper && <button type="button" role="menuitem" data-testid="zb-page" onClick={() => choose('page')}>{t('পুরো পাতা')}</button>}
            {ZOOM_STEPS.filter((z) => z >= min && z <= max).map((z) => (
              <button key={z} type="button" role="menuitem" className={z === Math.round(pct) ? 'on' : ''} data-testid={'zb-' + z} onClick={() => choose(z)}>
                {num(String(z), lang)}%{z === 100 ? ' · ' + t('আসল মাপ') : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
