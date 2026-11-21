/**
 * Live voice typing: the words appear in the document at the caret as they are heard (grey, soft) and
 * become real text when the speaker pauses (decisions.md 77). The controls (● time, ⏸ / ▶, ■) are drawn
 * by VoiceControls, in the keyboard's strip or beside the page's mic.
 */
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { BrowserLive, GeminiLive, liveEngineKind, geminiRescript, type LiveEngine, type LiveState } from '../ai';
import { insertPlainText, setInterim, textBeforeCaret } from '../editor';
import { liveVoiceText, toBanglaVoice, banglaScript } from '../voice';
import { useT } from '../i18n';
import { load, save } from './prefs';

interface Opts {
  editor: Editor;
  geminiKey: string;
  bangla: boolean;
  say: (m: string) => void;
  /** Settings → voice: the language ('auto' = the keyboard's), spoken punctuation, digits, corrections (decisions.md 86). */
  voice: { lang: string; commands: boolean; corrections: string; banglaDigits: boolean };
  disabled?: boolean;
  /** The Live model (Settings → voice); empty = the default. */
  model?: string;
}

export function useLiveVoice(o: Opts) {
  const kind = liveEngineKind(Boolean(o.geminiKey));
  // one language box for recorded and Live voice: a fixed choice wins over the keyboard's language
  const langOf = (v: Opts) => (v.voice.lang && v.voice.lang !== 'auto' ? v.voice.lang : v.bangla ? 'bn-BD' : 'en-US');
  const [state, setState] = useState<LiveState>('stopped');
  const [consent, setConsent] = useState(false);
  const [secs, setSecs] = useState(0);
  // the words being heard now, also shown in the keyboard strip's gap (decisions.md 83)
  const [heard, setHeard] = useState('');
  const clock = useRef<number | undefined>(undefined);
  const eng = useRef<LiveEngine | null>(null);
  const opts = useRef(o);
  opts.current = o;

  useEffect(() => () => { void eng.current?.stop(); clearInterval(clock.current); }, []);
  // the time shown beside ●: runs only while it is listening
  useEffect(() => {
    clearInterval(clock.current);
    if (state === 'live') clock.current = window.setInterval(() => setSecs((n) => n + 1), 1000);
    if (state === 'stopped') setSecs(0);
  }, [state]);

  /** The words being heard, grey at the caret (with a space before them when needed). */
  const showInterim = (raw0: string) => {
    const view = opts.current.editor.view;
    // the grey words too: no Hindi or Chinese letters on the page, even for a moment
    const raw = banglaScript(raw0).text;
    setHeard(raw.trim());
    if (!raw.trim()) return setInterim(view, '');
    const before = textBeforeCaret(view);
    setInterim(view, (before && !/\s$/.test(before) ? ' ' : '') + raw.trim());
  };

  // Bangla in Bengali letters only (decisions.md 82): one result after another, in the order heard
  const queue = useRef(Promise.resolve());
  const put = (raw: string) => {
    const { geminiKey } = opts.current;
    const lang = langOf(opts.current);
    queue.current = queue.current.then(async () => putNow(await toBanglaVoice(raw, lang, geminiRescript(geminiKey)), lang));
  };
  const putNow = (raw: string, lang: string) => {
    const { editor, voice } = opts.current;
    const text = liveVoiceText(raw, lang, voice);
    setInterim(editor.view, '');
    if (!text) return;
    const before = textBeforeCaret(editor.view);
    const lead = before && !/\s$/.test(before) && !/^[\s।,;:?!]/.test(text) ? ' ' : '';
    insertPlainText(editor.view, lead + text);
  };

  const begin = async () => {
    const { geminiKey, say } = opts.current;
    const lang = langOf(opts.current);
    const ev = {
      onInterim: showInterim,
      onFinal: put,
      onState: (s: LiveState, why?: string) => {
        setState(s);
        if (s === 'cut') say(why === 'mic' ? 'কল বা অন্য অ্যাপ মাইক নিয়েছে: Live থেমেছে, ▶ চাপলে আবার চলবে' : 'সংযোগ কেটে গেছে: Live থেমেছে, ▶ চাপলে আবার চলবে');
      },
    };
    const e: LiveEngine = kind === 'gemini' ? new GeminiLive(geminiKey, lang, ev, opts.current.model || undefined) : new BrowserLive(lang, ev);
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
  const stop = async () => { const e = eng.current; eng.current = null; await e?.stop(); setInterim(opts.current.editor.view, ''); setState('stopped'); };
  const pause = () => { setInterim(opts.current.editor.view, ''); void eng.current?.pause(); };
  const resume = () => void eng.current?.resume();

  const ui = <LiveConsent kind={kind} consent={consent} onConsent={(ok) => { setConsent(false); if (ok) { save('liveConsent', true); void begin(); } }} />;
  return { available: Boolean(kind), on: state !== 'stopped', state, secs, heard: state === 'stopped' ? '' : heard, toggle, pause, resume, stop: () => void stop(), ui };
}
export type LiveVoice = ReturnType<typeof useLiveVoice>;

function LiveConsent(p: { kind: 'gemini' | 'browser' | null; consent: boolean; onConsent: (ok: boolean) => void }) {
  const { t } = useT();
  return (
    <>
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
