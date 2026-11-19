import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { load, save } from './prefs';
import { useT } from '../i18n';

/**
 * iPad (and computers): the keyboard as a small phone-sized panel that floats over the page, like the
 * iPad's own floating keyboard and Gboard's. Drag the bar to move it (the place is remembered on this
 * device); ⤓ puts it back at the bottom. It always stays on screen.
 */
export function FloatingKeyboard({ children, onDock }: { children: ReactNode; onDock: () => void }) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => load('kb.floatPos', { x: -1, y: -1 }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  /** Keep the panel inside the window (after a turn of the iPad, too). */
  const clamp = (x: number, y: number) => {
    const el = box.current;
    const w = el?.offsetWidth ?? 340, h = el?.offsetHeight ?? 260;
    return { x: Math.max(4, Math.min(window.innerWidth - w - 4, x)), y: Math.max(4, Math.min(window.innerHeight - h - 4, y)) };
  };
  useEffect(() => {
    const place = () => setPos((p) => (p.x < 0 ? clamp(window.innerWidth - (box.current?.offsetWidth ?? 340) - 24, window.innerHeight - (box.current?.offsetHeight ?? 260) - 24) : clamp(p.x, p.y)));
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={box} className="kb-float" data-testid="kb-floating" style={{ left: pos.x, top: pos.y }}>
      <div className="kb-float-bar" data-testid="kb-float-bar"
        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; }}
        onPointerMove={(e) => { if (drag.current) setPos(clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy)); }}
        onPointerUp={() => { if (drag.current) { drag.current = null; save('kb.floatPos', pos); } }}>
        <span className="grip" aria-hidden="true" />
        <button type="button" tabIndex={-1} data-testid="kb-dock" aria-label={t('কিবোর্ড নিচে বসান')} title={t('কিবোর্ড নিচে বসান')}
          onPointerDown={(e) => e.stopPropagation()} onClick={onDock}>⤓</button>
      </div>
      {children}
    </div>
  );
}

export type KbMode = 'dock' | 'float' | 'split' | 'splitPhone';

/** True while the screen is wider than tall (iPad or phone turned sideways). */
export function useLandscape(): boolean {
  const q = () => typeof window !== 'undefined' && window.matchMedia?.('(orientation: landscape)').matches;
  const [l, setL] = useState(q);
  useEffect(() => {
    const m = window.matchMedia?.('(orientation: landscape)');
    const on = () => setL(Boolean(m?.matches));
    m?.addEventListener?.('change', on);
    window.addEventListener('resize', on);
    return () => { m?.removeEventListener?.('change', on); window.removeEventListener('resize', on); };
  }, []);
  return Boolean(l);
}

/**
 * iPad: the docked keyboard (whole or split) can be raised from the bottom edge, so two thumbs reach it
 * while the hands hold the iPad. Drag the bar above it; the height is remembered for upright and
 * sideways separately.
 */
export function LiftableKeyboard({ children, landscape, phone = false, edgeToEdge = false }: { children: ReactNode; landscape: boolean; phone?: boolean; edgeToEdge?: boolean }) {
  const { t } = useT();
  const key = (phone ? 'kb.liftPhone.' : 'kb.lift.') + (landscape ? 'land' : 'port');
  const [lift, setLift] = useState<number>(() => load(key, 0));
  useEffect(() => setLift(load(key, 0)), [key]);
  const drag = useRef<{ y: number; l: number } | null>(null);
  // split on the iPad: the halves belong at the screen's edges, where the thumbs are, even with the
  // drafts list open beside the page — the keyboard reaches out over it, edge to edge
  const wrap = useRef<HTMLDivElement>(null);
  const [reach, setReach] = useState<{ l: number; w: number } | null>(null);
  useLayoutEffect(() => {
    if (!edgeToEdge) return setReach(null);
    const place = () => {
      const p = wrap.current?.parentElement?.getBoundingClientRect();
      if (p) setReach({ l: p.left, w: window.innerWidth });
    };
    place();
    window.addEventListener('resize', place);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (wrap.current?.parentElement) ro?.observe(wrap.current.parentElement);
    return () => { window.removeEventListener('resize', place); ro?.disconnect(); };
  }, [edgeToEdge]);
  // a phone's screen is small: up to a third of it
  const max = () => Math.round(window.innerHeight * (phone ? 0.33 : 0.4));
  return (
    <div ref={wrap} className={'kb-liftwrap' + (phone ? ' phone' : '') + (reach ? ' reach' : '')} data-testid="kb-liftwrap"
      style={{ paddingBottom: Math.min(lift, max()), ...(reach ? { marginLeft: -reach.l, width: reach.w } : {}) }}>
      <div className="kb-grip" data-testid="kb-grip" role="separator" aria-label={t('কিবোর্ড ওপরে-নিচে সরান')} title={t('কিবোর্ড ওপরে-নিচে সরান')}
        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, l: lift }; }}
        onPointerMove={(e) => { if (drag.current) setLift(Math.max(0, Math.min(max(), drag.current.l + drag.current.y - e.clientY))); }}
        onPointerUp={() => { if (drag.current) { drag.current = null; save(key, lift); } }}
        onDoubleClick={() => { setLift(0); save(key, 0); }}>
        <span className="grip" aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}

/** A phone held sideways: wide but short, with a finger for a pointer. It still gets the phone keyboard. */
export function useShortTouch(): boolean {
  const Q = '(max-height: 500px) and (orientation: landscape) and (pointer: coarse)';
  const [v, setV] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(Q).matches));
  useEffect(() => {
    const m = window.matchMedia?.(Q);
    const on = () => setV(Boolean(m?.matches));
    m?.addEventListener?.('change', on);
    return () => m?.removeEventListener?.('change', on);
  }, []);
  return v;
}
