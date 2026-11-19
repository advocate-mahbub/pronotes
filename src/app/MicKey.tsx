/** The strip's 🎙: a tap starts Live, held (half a second) starts record-to-text (decisions.md 77). */
import { useRef } from 'react';
import { useT } from '../i18n';
import { LINE_MIC } from './OnScreenKeyboard';

const HOLD = 500;

export function MicKey({ onTap, onHold }: { onTap: () => void; onHold?: () => void }) {
  const { t } = useT();
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  // one press = one action, even when a touch also sends the mouse-style events after it
  const down = useRef(false);
  const label = onHold ? t('ভয়েস: চাপলে Live, চেপে ধরলে রেকর্ড করে লেখা') : t('ভয়েস টাইপিং');
  return (
    <button type="button" className="k mic-key" data-testid="strip-mic" aria-label={label} title={label}
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
      onPointerCancel={() => { clearTimeout(timer.current); down.current = false; }}>
      {LINE_MIC}
    </button>
  );
}
