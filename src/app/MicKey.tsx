/**
 * The one 🎙 (decisions.md 77, 82): a tap starts the first voice mode, held (half a second) the second.
 * Used in the keyboard strip and, as one round button, on the page when the ProNotes keyboard is not up.
 */
import { useRef, type ReactNode } from 'react';
import { useT } from '../i18n';
import { LINE_MIC } from './OnScreenKeyboard';

const HOLD = 500;

interface Props {
  onTap: () => void;
  onHold?: () => void;
  className?: string;
  testid?: string;
  label?: string;
  pressed?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}

export function MicKey({ onTap, onHold, className = 'k mic-key', testid = 'strip-mic', label: l, pressed, disabled, children }: Props) {
  const { t } = useT();
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  // one press = one action, even when a touch also sends the mouse-style events after it
  const down = useRef(false);
  const label = l ?? (onHold ? t('ভয়েস: চাপলে Live, চেপে ধরলে রেকর্ড করে লেখা') : t('ভয়েস টাইপিং'));
  return (
    <button type="button" className={className} data-testid={testid} aria-label={label} title={label} aria-pressed={pressed} disabled={disabled}
      data-hold={onHold ? 'yes' : undefined}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.preventDefault();
        if (down.current) return;
        down.current = true;
        held.current = false;
        clearTimeout(timer.current);
        if (onHold) timer.current = window.setTimeout(() => { held.current = true; onHold(); }, HOLD);
      }}
      onPointerUp={() => { clearTimeout(timer.current); if (!down.current) return; down.current = false; if (!held.current) onTap(); }}
      onPointerCancel={() => { clearTimeout(timer.current); down.current = false; }}
      onPointerLeave={() => { if (!down.current) return; clearTimeout(timer.current); down.current = false; }}
      // keyboard users (Enter/Space) and screen readers: a click without a pointer press = a tap
      onClick={(e) => { if (e.detail === 0) onTap(); }}>
      {children ?? LINE_MIC}
    </button>
  );
}
