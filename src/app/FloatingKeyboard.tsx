import { useEffect, useRef, useState, type ReactNode } from 'react';
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
