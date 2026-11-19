/**
 * The zoom bar (decisions.md 79): − 125% + at the bottom of the page area, so how far the page is zoomed
 * is always in sight. It lights up while two fingers zoom, showing the number as it changes; % opens the
 * steps (page width, whole page, 50–200%) and 100% puts it back. Without the paper view (phone, reflow)
 * it zooms the text instead.
 */
import { useState } from 'react';
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
}

export function ZoomBar({ pct, live, paper, setPct, min, max }: Props) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const shown = live ?? pct;
  const down = () => setPct(Math.max(min, [...ZOOM_STEPS].reverse().find((z) => z < pct - 1) ?? min));
  const up = () => setPct(Math.min(max, ZOOM_STEPS.find((z) => z > pct + 1) ?? max));
  const choose = (z: number | 'width' | 'page') => { setPct(z); setOpen(false); };
  return (
    <div className="zoom-bar-wrap" aria-hidden={false}>
      <div className={'zoom-bar' + (live !== null ? ' live' : '')} data-testid="zoom-bar" onPointerDown={(e) => e.preventDefault()}>
        <button type="button" aria-label={t('ছোট করে দেখুন')} title={t('ছোট করে দেখুন')} data-testid="zb-out" onClick={down}>−</button>
        <button type="button" className="zb-pct" aria-label="Zoom" aria-expanded={open} data-testid="zb-pct" onClick={() => setOpen(!open)}>{num(String(Math.round(shown)), lang)}%</button>
        <button type="button" aria-label={t('বড় করে দেখুন')} title={t('বড় করে দেখুন')} data-testid="zb-in" onClick={up}>+</button>
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
