/**
 * The three voice buttons (decisions.md 77): ● with the time (blinking red while it listens), ⏸ / ▶,
 * and ■. The same in the keyboard's strip, in the strip left when the keyboard is put down, and beside
 * the page's mic when there is no strip. What is said appears in the document itself, at the caret.
 * Record-to-text adds: "লিখছে…" while Gemini writes; a recording that could not be sent stays with
 * ▶ (send again) and 🗑 (pressed twice, throw away); 🗑 also when paused.
 */
import { useRef, type ReactNode } from 'react';
import { num, useT } from '../i18n';
import type { LiveVoice } from './LiveVoice';
import type { AiVoice } from './AiVoiceKey';

// plain drawn signs, all in one style — not the emoji ⏸ ▶ ■ (decisions.md 86)
const svg = (d: ReactNode) => <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">{d}</svg>;
export const PAUSE_ICON = svg(<><rect x="6.5" y="5.5" width="3.6" height="13" rx="1" /><rect x="13.9" y="5.5" width="3.6" height="13" rx="1" /></>);
export const PLAY_ICON = svg(<path d="M8.5 5.8v12.4a.8.8 0 0 0 1.2.7l9.6-6.2a.8.8 0 0 0 0-1.4L9.7 5.1a.8.8 0 0 0-1.2.7z" />);
export const STOP_ICON = svg(<rect x="6.5" y="6.5" width="11" height="11" rx="2" />);

export function VoiceControls({ live, ai }: { live?: LiveVoice; ai?: AiVoice }) {
  const { t, lang } = useT();
  // the buttons appear where 🎙 was: the click that follows that same tap (it began on 🎙) must not press ■,
  // so a button acts only on a click whose press began on it (or a keyboard click, which has no press)
  const pressed = useRef('');
  const clock = (s: number) => num(`${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`, lang);
  const b = (id: string, text: ReactNode, on: () => void, label: string, cls = '') => (
    <button type="button" className={'vc-b ' + cls} data-testid={id} aria-label={label} title={label}
      onPointerDown={(e) => { e.preventDefault(); pressed.current = id; }}
      onClick={(e) => { if (pressed.current === id || e.detail === 0) on(); pressed.current = ''; }}>{text}</button>
  );
  if (ai && ai.state !== 'idle') {
    const s = ai.state;
    const trash = b('aiv-discard', ai.armed ? t('মুছবেন?') : '🗑', ai.discard, t('রেকর্ড মুছে ফেলুন'), ai.armed ? 'warn wide' : '');
    return (
      <div className={'voice-ctl ai-voice-bar ' + s} role="status" data-testid="ai-voice-bar">
        {s === 'busy' ? (
          <span className="vc-rec busy" data-testid="aiv-busy" onClick={ai.cancel}><span className="spin" aria-hidden="true" />{t('লিখছে…')}</span>
        ) : (
          <span className={'vc-rec ' + (s === 'rec' ? 'on' : '')}><span className="vc-dot" aria-hidden="true" />{clock(ai.secs)}</span>
        )}
        {s === 'rec' && b('aiv-pause', PAUSE_ICON, ai.pause, t('বিরতি'))}
        {(s === 'paused' || s === 'cut') && b('aiv-resume', PLAY_ICON, ai.resume, t('চালিয়ে যান'))}
        {(s === 'rec' || s === 'paused' || s === 'cut') && b('aiv-write', STOP_ICON, ai.write, t('থামিয়ে লেখায় বসান'), 'stop')}
        {s === 'held' && b('aiv-send', PLAY_ICON, ai.sendHeld, t('রাখা রেকর্ডটা লেখায় বসান'), 'stop')}
        {(s === 'paused' || s === 'cut' || s === 'held') && trash}
      </div>
    );
  }
  if (live && live.on) {
    const s = live.state;
    return (
      <div className={'voice-ctl live-strip ' + s} role="status" data-testid="live-strip">
        <span className={'vc-rec ' + (s === 'live' ? 'on' : '')} title={s === 'cut' ? t('থেমে আছে: ▶ চাপলে আবার চলবে') : undefined}>
          <span className="vc-dot" aria-hidden="true" />{s === 'starting' ? '…' : clock(live.secs)}
        </span>
        {s === 'live' && b('live-pause', PAUSE_ICON, live.pause, t('বিরতি'))}
        {(s === 'paused' || s === 'cut') && b('live-resume', PLAY_ICON, live.resume, t('চালিয়ে যান'))}
        {b('live-stop', STOP_ICON, live.stop, t('বন্ধ করুন'), 'stop')}
      </div>
    );
  }
  return null;
}
