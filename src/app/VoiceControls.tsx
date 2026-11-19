/**
 * The three voice buttons (decisions.md 77): ● with the time (blinking red while it listens), ⏸ / ▶,
 * and ■. The same in the keyboard's strip, in the strip left when the keyboard is put down, and beside
 * the page's mic when there is no strip. What is said appears in the document itself, at the caret.
 * Record-to-text adds: "লিখছে…" while Gemini writes; a recording that could not be sent stays with
 * ▶ (send again) and 🗑 (pressed twice, throw away); 🗑 also when paused.
 */
import { useRef } from 'react';
import { num, useT } from '../i18n';
import type { LiveVoice } from './LiveVoice';
import type { AiVoice } from './AiVoiceKey';

export function VoiceControls({ live, ai }: { live?: LiveVoice; ai?: AiVoice }) {
  const { t, lang } = useT();
  // the buttons appear where 🎙 was: the click that follows that same tap (it began on 🎙) must not press ■,
  // so a button acts only on a click whose press began on it (or a keyboard click, which has no press)
  const pressed = useRef('');
  const clock = (s: number) => num(`${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`, lang);
  const b = (id: string, text: string, on: () => void, label: string, cls = '') => (
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
        {s === 'rec' && b('aiv-pause', '⏸', ai.pause, t('বিরতি'))}
        {(s === 'paused' || s === 'cut') && b('aiv-resume', '▶', ai.resume, t('চালিয়ে যান'))}
        {(s === 'rec' || s === 'paused' || s === 'cut') && b('aiv-write', '■', ai.write, t('থামিয়ে লেখায় বসান'), 'stop')}
        {s === 'held' && b('aiv-send', '▶', ai.sendHeld, t('রাখা রেকর্ডটা লেখায় বসান'), 'stop')}
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
        {s === 'live' && b('live-pause', '⏸', live.pause, t('বিরতি'))}
        {(s === 'paused' || s === 'cut') && b('live-resume', '▶', live.resume, t('চালিয়ে যান'))}
        {b('live-stop', '■', live.stop, t('বন্ধ করুন'), 'stop')}
      </div>
    );
  }
  return null;
}
