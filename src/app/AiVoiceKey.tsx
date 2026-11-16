/**
 * ✦ AI voice key: a separate key from the built-in mic. Tap to record, tap again to stop; the audio
 * goes to Gemini with the user's own key and the Bangla text is typed at the caret.
 * Recording is raw microphone samples (PcmRecorder), so it works the same on iPad Safari and Chrome.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { AiError, aiErrorMessage, errText, PcmRecorder, polishTranscript, VOICE_ERROR_TEXT, VOICE_MAX_SECONDS, VoiceError, transcribe } from '../ai';
import { insertPlainText, textBeforeCaret } from '../editor';
import { parseCorrections } from '../voice';
import { num, useT } from '../i18n';
import { load, save } from './prefs';

interface Props {
  editor: Editor;
  gemini: { key: string; model: string; setModel?: (m: string) => void };
  say: (msg: string) => void;
  onOpenSettings: () => void;
  /** Bijoy (ANSI) typing is on: voice cannot type there (the key says why when pressed). */
  disabled?: boolean;
  /** The voice settings that also apply to AI voice: corrections and Bangla digits. */
  voice?: { corrections: string; banglaDigits: boolean };
  /** Icon shown on the key (the microphone). */
  icon?: ReactNode;
}

export function AiVoiceKey({ editor, gemini, say, onOpenSettings, disabled, voice, icon }: Props) {
  const { t, lang } = useT();
  // digits follow the menu language: no Bangla digit in an English menu
  const clock = (s: number) => num(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, lang);
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const [secs, setSecs] = useState(0);
  const [consent, setConsent] = useState(false);
  const rec = useRef<PcmRecorder | null>(null);
  const timer = useRef<number>(undefined);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => { clearInterval(timer.current); rec.current?.cancel(); abort.current?.abort(); }, []);

  /** A message with the browser's or Google's own reason, so a problem can be reported exactly. */
  const fail = (text: string, detail: string) => say(detail ? t(text) + ' (' + detail + ')' : text);

  // called straight from the tap: the recorder switches the audio on before anything is awaited
  const start = async () => {
    const r = new PcmRecorder();
    rec.current = r;
    try {
      await r.start();
    } catch (e) {
      rec.current = null;
      if (e instanceof VoiceError) return fail(VOICE_ERROR_TEXT[e.stage], e.message);
      return fail(VOICE_ERROR_TEXT.mic, errText(e));
    }
    setSecs(0);
    setState('rec');
    const t0 = Date.now();
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setSecs(s);
      if (s >= VOICE_MAX_SECONDS) void stop();
    }, 250);
  };

  const stop = async () => {
    clearInterval(timer.current);
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    setState('busy');
    try {
      const samples = r.stop();
      abort.current = new AbortController();
      const raw = await transcribe(samples, { key: gemini.key, model: gemini.model, signal: abort.current.signal, onModelChange: gemini.setModel });
      const text = voice ? polishTranscript(raw, voice, parseCorrections) : raw;
      if (!text) return say(VOICE_ERROR_TEXT.silent);
      const before = textBeforeCaret(editor.view);
      const lead = before && !/\s$/.test(before) && !/^[\s।,;:?!]/.test(text) ? ' ' : '';
      editor.commands.focus();
      insertPlainText(editor.view, lead + text);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      if (e instanceof VoiceError) return fail(VOICE_ERROR_TEXT[e.stage], e.message);
      if (!(e instanceof AiError)) return fail('রেকর্ড করা কথা পড়া গেল না', errText(e));
      const m = aiErrorMessage(e);
      say(m.detail ? t(m.text) + ' (Google: ' + m.detail + ')' : m.text);
    } finally {
      abort.current = null;
      setState('idle');
    }
  };

  const press = () => {
    if (state === 'rec') return void stop();
    if (state === 'busy') {
      abort.current?.abort();
      return setState('idle');
    }
    if (disabled) return say('বিজয় (ANSI) টাইপ চালু থাকলে ভয়েস চলে না। আগে ইউনিকোডে ফিরুন।');
    if (!gemini.key) {
      say('AI ভয়েসের জন্য Settings → AI সহকারী-তে নিজের Gemini key দিন');
      return onOpenSettings();
    }
    if (!load('aiVoiceConsent', false)) return setConsent(true);
    if (!PcmRecorder.supported()) return say(VOICE_ERROR_TEXT.unsupported);
    void start();
  };

  const label = state === 'rec' ? t('AI ভয়েস: থামিয়ে লেখায় বসান') : state === 'busy' ? t('লেখা হচ্ছে… (চাপলে বাতিল)') : t('AI ভয়েস টাইপিং (Gemini)');
  return (
    <>
      <button type="button" className={'mic ai-voice ' + state} data-testid="ai-voice" aria-pressed={state !== 'idle'} aria-label={label} title={label}
        aria-disabled={disabled || undefined} onPointerDown={(e) => e.preventDefault()} onClick={press}>
        {state === 'busy' ? <span className="spin" aria-hidden="true" /> : <>{icon ?? <span aria-hidden="true">✦</span>}<span className="ai-badge" aria-hidden="true">✦</span></>}
      </button>
      {state !== 'idle' && (
        <div className="ai-voice-bar" role="status" data-testid="ai-voice-bar">
          {state === 'rec' ? (
            <><span className="dotrec" aria-hidden="true" />{t('বলুন… {time}', { time: clock(secs) })} <small>{t('থামাতে ✦ চাপুন')}</small></>
          ) : (
            t('লেখা হচ্ছে…')
          )}
        </div>
      )}
      {consent && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="aiv-title" data-testid="ai-voice-consent">
          <div className="box">
            <h2 id="aiv-title">{t('AI ভয়েস চালুর আগে')}</h2>
            <p>{t('✦ চাপলে আপনার কথা রেকর্ড হয়, থামালে সেই অডিও আপনার Gemini key দিয়ে Google-এর কাছে যায় আর লেখা হয়ে ফেরে। Google-এর ফ্রি স্তরে পাঠানো জিনিস তাদের সেবা উন্নত করতে ব্যবহার হতে পারে।')}</p>
            <p>{t('অডিওর ভেতরের নাম বা নম্বর লুকানো যায় না। মক্কেলের নাম, ঠিকানা, দলিল নম্বর বা গোপন তথ্য মুখে না বলে কিবোর্ডে লিখুন।')}</p>
            <div className="row">
              <button type="button" className="btn primary" data-testid="ai-voice-ok" onClick={() => { save('aiVoiceConsent', true); setConsent(false); void start(); }}>{t('বুঝেছি, চালু করুন')}</button>
              <button type="button" className="btn" onClick={() => setConsent(false)}>{t('বাতিল')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
