/**
 * One font's sample line (decisions.md 90): a verse or hadith in that font, on one line with "…" when it is
 * longer; held down (or hovered), the whole text and where it is from. The source follows the menu's language.
 */
import { useRef, useState, type CSSProperties } from 'react';
import { toBijoy } from '../bijoy';
import { useT } from '../i18n';
import { sampleFor, useQuotePrefs, type SampleKind } from './font-quotes';

interface Props { font: string; kind: SampleKind; style?: CSSProperties; className?: string; testid?: string }

export function FontSample({ font, kind, style, className = '', testid }: Props) {
  const { lang: uiLang } = useT();
  const prefs = useQuotePrefs();
  const s = sampleFor(font, kind, prefs, toBijoy);
  const src = uiLang === 'en' ? s.srcEn : s.src;
  const [open, setOpen] = useState(false);
  const held = useRef<{ timer: number; fired: boolean } | null>(null);
  const full = kind === 'ansi' ? s.q.bn : s.text;
  return (
    <span className={'font-sample ' + className} data-testid={testid} title={full + (src ? ' — ' + src : '')}
      onPointerDown={() => { held.current = { fired: false, timer: window.setTimeout(() => { if (held.current) held.current.fired = true; setOpen(true); }, 500) }; }}
      onPointerUp={() => { if (held.current) clearTimeout(held.current.timer); }}
      onPointerLeave={() => { if (held.current) clearTimeout(held.current.timer); }}
      // a hold opens the whole text; it does not also choose the font underneath
      onClickCapture={(e) => { if (held.current?.fired) { e.stopPropagation(); e.preventDefault(); held.current = null; } }}>
      <span className="fs-line" style={style}>{s.text}</span>
      {open && (
        <span className="fs-full" data-testid={testid ? testid + '-full' : 'font-sample-full'} role="note"
          onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(false); }}>
          <span className="fs-text" style={kind === 'ansi' ? undefined : style}>{full}</span>
          {src && <small className="fs-src">{src}</small>}
        </span>
      )}
    </span>
  );
}
