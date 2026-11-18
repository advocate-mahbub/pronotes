/**
 * Live voice typing on screen: a strip shows the words as they are heard (grey), and each phrase goes
 * into the document when the speaker pauses. ⏸ / ▶ pause and go on, ■ ends it. Started from the 🎙 key
 * on the on-screen keyboard, or the small round button by the page when no keyboard is shown.
 */
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { BrowserLive, GeminiLive, liveEngineKind, polishTranscript, type LiveEngine, type LiveState } from '../ai';
import { insertPlainText, textBeforeCaret } from '../editor';
import { parseCorrections } from '../voice';
import { useT } from '../i18n';
import { load, save } from './prefs';

interface Opts {
  editor: Editor;
  geminiKey: string;
  bangla: boolean;
  say: (m: string) => void;
  voice: { corrections: string; banglaDigits: boolean };
  disabled?: boolean;
}

export function useLiveVoice(o: Opts) {
  const kind = liveEngineKind(Boolean(o.geminiKey));
  const [state, setState] = useState<LiveState>('stopped');
  const [interim, setInterim] = useState('');
  const [consent, setConsent] = useState(false);
  const eng = useRef<LiveEngine | null>(null);
  const opts = useRef(o);
  opts.current = o;

  useEffect(() => () => { void eng.current?.stop(); }, []);

  const put = (raw: string) => {
    const { editor, voice } = opts.current;
    const text = polishTranscript(raw, voice, parseCorrections);
    if (!text) return;
    const before = textBeforeCaret(editor.view);
    const lead = before && !/\s$/.test(before) && !/^[\s।,;:?!]/.test(text) ? ' ' : '';
    insertPlainText(editor.view, lead + text);
  };

  const begin = async () => {
    const { geminiKey, bangla, say } = opts.current;
    const lang = bangla ? 'bn-BD' : 'en-US';
    const ev = {
      onInterim: setInterim,
      onFinal: put,
      onState: (s: LiveState, why?: string) => {
        setState(s);
        if (s === 'cut') say(why === 'mic' ? 'কল বা অন্য অ্যাপ মাইক নিয়েছে: Live থেমেছে, ▶ চাপলে আবার চলবে' : 'সংযোগ কেটে গেছে: Live থেমেছে, ▶ চাপলে আবার চলবে');
      },
    };
    const e: LiveEngine = kind === 'gemini' ? new GeminiLive(geminiKey, lang, ev) : new BrowserLive(lang, ev);
    eng.current = e;
    try {
      await e.start();
    } catch (err) {
      eng.current = null;
      setState('stopped');
      say('Live ভয়েস চালু হলো না' + ((err as Error).message ? ' (' + (err as Error).message + ')' : ''));
    }
  };

  const toggle = () => {
    if (state === 'live' || state === 'starting') return void stop();
    if (state === 'paused' || state === 'cut') return void eng.current?.resume();
    if (o.disabled) return o.say('বিজয় (ANSI) টাইপ চালু থাকলে ভয়েস চলে না। আগে ইউনিকোডে ফিরুন।');
    if (!kind) return o.say('এখানে Live ভয়েস চলে না: Settings-এ Gemini key দিন (বা কম্পিউটার/Android-এ Chrome ব্যবহার করুন)');
    if (!load('liveConsent', false)) return setConsent(true);
    void begin();
  };
  const stop = async () => { const e = eng.current; eng.current = null; await e?.stop(); setInterim(''); setState('stopped'); };

  const ui = (
    <LiveStrip state={state} interim={interim} kind={kind} consent={consent}
      onPause={() => void eng.current?.pause()} onResume={() => void eng.current?.resume()} onStop={() => void stop()}
      onConsent={(ok) => { setConsent(false); if (ok) { save('liveConsent', true); void begin(); } }} />
  );
  return { available: Boolean(kind), on: state !== 'stopped', state, toggle, ui };
}

function LiveStrip(p: { state: LiveState; interim: string; kind: 'gemini' | 'browser' | null; consent: boolean;
  onPause: () => void; onResume: () => void; onStop: () => void; onConsent: (ok: boolean) => void }) {
  const { t } = useT();
  const b = (id: string, text: string, on: () => void, cls = '') => (
    <button type="button" className={'btn ' + cls} data-testid={'live-' + id} onPointerDown={(e) => e.preventDefault()} onClick={on}>{text}</button>
  );
  return (
    <>
      {p.state !== 'stopped' && (
        <div className={'live-strip ' + p.state} role="status" aria-live="polite" data-testid="live-strip">
          <span className={'live-dot ' + p.state} aria-hidden="true" />
          <span className="live-text" data-testid="live-interim">
            {p.interim || (p.state === 'starting' ? t('চালু হচ্ছে…') : p.state === 'live' ? t('বলুন, লেখা এখানেই ভেসে উঠবে…') : p.state === 'paused' ? t('বিরতি') : t('থেমে আছে: ▶ চাপলে আবার চলবে'))}
          </span>
          {p.state === 'live' && b('pause', '⏸', p.onPause)}
          {(p.state === 'paused' || p.state === 'cut') && b('resume', '▶', p.onResume, 'primary')}
          {b('stop', '■', p.onStop)}
        </div>
      )}
      {p.consent && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="live-title" data-testid="live-consent">
          <div className="box">
            <h2 id="live-title">{t('Live ভয়েস চালুর আগে')}</h2>
            <p>{p.kind === 'gemini'
              ? t('বলার সাথে সাথে আপনার কথা আপনার Gemini key দিয়ে Google-এর কাছে যায় আর লেখা হয়ে ফেরে। ফ্রি স্তরে Google পাঠানো জিনিস তাদের পণ্য উন্নত করতে ব্যবহার করতে পারে।')
              : t('বলার সাথে সাথে আপনার কথা ব্রাউজারের নিজের ভয়েস সেবায় (Chrome-এ Google) যায় আর লেখা হয়ে ফেরে।')}</p>
            <p>{t('মক্কেলের নাম, ঠিকানা, দলিল নম্বর বা গোপন তথ্য মুখে না বলে কিবোর্ডে লিখুন।')}</p>
            <div className="row">
              <button type="button" className="btn primary" data-testid="live-ok" onClick={() => p.onConsent(true)}>{t('বুঝেছি, চালু করুন')}</button>
              <button type="button" className="btn" onClick={() => p.onConsent(false)}>{t('বাতিল')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
