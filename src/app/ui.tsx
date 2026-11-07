/** Small shared UI pieces: a popover that is never clipped by a scrolling toolbar, and a panel sheet. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface PopoverProps {
  label: ReactNode;
  title: string;
  testid?: string;
  className?: string;
  active?: boolean;
  /** Content; call close() to shut the popover. */
  children: (close: () => void) => ReactNode;
  disabled?: boolean;
}

/** A toolbar button with a drop-down panel. Positioned with `fixed`, so a scrolling ribbon does not cut it off. */
export function Popover({ label, title, testid, className, active, children, disabled }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = panel.current?.offsetWidth ?? 240;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top: r.bottom + 4 });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <>
      <button ref={btn} type="button" className={'tb' + (active || open ? ' on' : '') + (className ? ' ' + className : '')} title={title} aria-label={title}
        aria-haspopup="true" aria-expanded={open} data-testid={testid} disabled={disabled}
        onPointerDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div ref={panel} className="pop" role="menu" style={{ left: pos.left, top: pos.top }} data-testid={testid ? testid + '-menu' : undefined}
          onPointerDown={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'SELECT') e.preventDefault(); }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </>
  );
}

/** A dialog: centred on wide screens, a sheet from the bottom on phones and iPad portrait. */
export function Sheet({ title, onClose, children, testid, footer }: { title: string; onClose: () => void; children: ReactNode; testid?: string; footer?: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="modal sheet-wrap" role="dialog" aria-modal="true" aria-label={title} data-testid={testid}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="box sheet">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="tb" aria-label="✕" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="row sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
