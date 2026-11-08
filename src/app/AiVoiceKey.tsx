/**
 * ✦ AI voice key: a separate key from the built-in mic. Tap to record, tap again to stop; the audio
 * goes to Gemini with the user's own key and the Bangla text is typed at the caret.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { AiError, AI_ERROR_TEXT, VOICE_MAX_SECONDS, VoiceRecorder, toMono16k, transcribe } from '../ai';
import { insertPlainText, textBeforeCaret } from '../editor';
import { useT } from '../i18n';
import { load, save } from './prefs';

interface Props {
  editor: Editor;
  gemini: { key: string; model: string };
  say: (msg: string) => void;
  onOpenSettings: () => void;
  disabled?: boolean;
  /** Icon shown on the key (the microphone). */
  icon?: ReactNode;
}

const bnDigits = (s: string) => s.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
const clock = (s: number) => bnDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

export function AiVoiceKey({ editor, gemini, say, onOpenSettings, disabled, icon }: Props) {
  const { t } = useT();
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const [secs, setSecs] = useState(0);
  const [consent, setConsent] = useState(false);
  const rec = useRef<VoiceRecorder | null>(null);
  const timer = useRef<number>(undefined);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => { clearInterval(timer.current); rec.current?.cancel(); abort.current?.abort(); }, []);

  const start = async () => {
    if (!VoiceRecorder.supported()) return say('এই ব্রাউজারে মাইক থেকে রেকর্ড করা যায় না');
    const r = new VoiceRecorder();
    try {
      await r.start();
    } catch {
      return say('মাইক ব্যবহারের অনুমতি পাওয়া যায়নি। ব্রাউজারের সেটিংসে এই সাইটকে মাইকের অনুমতি দিন।');
    }
    rec.current = r;
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
      const samples = await toMono16k(await r.stop());
      abort.current = new AbortController();
      const text = await transcribe(samples, { key: gemini.key, model: gemini.model, signal: abort.current.signal });
      if (!text) return say('কোনো কথা শোনা যায়নি');
      const before = textBeforeCaret(editor.view);
      const lead = before && !/\s$/.test(before) && !/^[\s।,;:?!]/.test(text) ? ' ' : '';
      editor.commands.focus();
      insertPlainText(editor.view, lead + text);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      say(e instanceof AiError ? AI_ERROR_TEXT[e.code] : 'রেকর্ড করা কথা পড়া গেল না');
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
    if (!gemini.key) {
      say('AI ভয়েসের জন্য Settings → AI সহকারী-তে নিজের Gemini key দিন');
      return onOpenSettings();
    }
    if (!load('aiVoiceConsent', false)) return setConsent(true);
    void start();
  };

  const label = state === 'rec' ? t('AI ভয়েস: থামিয়ে লেখায় বসান') : state === 'busy' ? t('লেখা হচ্ছে… (চাপলে বাতিল)') : t('AI ভয়েস টাইপিং (Gemini)');
  return (
    <>
      <button type="button" className={'mic ai-voice ' + state} data-testid="ai-voice" aria-pressed={state !== 'idle'} aria-label={label} title={label}
        disabled={disabled} onPointerDown={(e) => e.preventDefault()} onClick={press}>
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
