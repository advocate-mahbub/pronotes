/**
 * ✦ AI voice key: a separate key from the built-in mic. Tap to record, tap again to write it; the audio
 * goes to Gemini with the user's own key and the Bangla text is typed at the caret.
 * Recording is raw microphone samples (PcmRecorder), so it works the same on iPad Safari and Chrome.
 *
 * Nothing said is lost (decisions.md 73): ⏸/▶ pause and go on in the same recording; a call or another
 * app taking the mic pauses it by itself; the recording is kept on the device as it goes, so a failed
 * send (no internet) can be sent again — automatically when the connection is back — and a recording
 * cut off by a closed app is offered again when ProNotes opens. 🗑 (pressed twice) throws it away and
 * starts afresh.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { AiError, aiErrorMessage, addHeld, beginHeld, clearHeld, errText, loadHeld, PcmRecorder, polishTranscript, VOICE_ERROR_TEXT, VOICE_MAX_SECONDS, VoiceError, transcribe } from '../ai';
import { insertPlainText, setInterim, textBeforeCaret } from '../editor';
import { parseCorrections } from '../voice';
import { useT } from '../i18n';
import { load, save } from './prefs';
import { VoiceControls } from './VoiceControls';

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

/**
 * idle; rec = recording; paused = the user paused; cut = a call or another app took the mic;
 * busy = being written; held = written failed (no internet…) or left from before: kept, ready to send.
 */
export type AiVoiceState = 'idle' | 'rec' | 'paused' | 'cut' | 'busy' | 'held';
type State = AiVoiceState;

/** The recording itself (record → Gemini → text), for the page's ✦ key and the keyboard strip's 🎙. */
export function useAiVoice({ editor, gemini, say, onOpenSettings, disabled, voice }: Omit<Props, 'icon'>) {
  const { t } = useT();
  const [state, setState] = useState<State>('idle');
  const [secs, setSecs] = useState(0);
  const [consent, setConsent] = useState(false);
  const [armed, setArmed] = useState(false);
  const rec = useRef<PcmRecorder | null>(null);
  const held = useRef<Float32Array | null>(null);
  const timer = useRef<number>(undefined);
  const abort = useRef<AbortController | null>(null);
  const stateRef = useRef<State>('idle');
  stateRef.current = state;

  useEffect(() => () => { clearInterval(timer.current); rec.current?.cancel(); abort.current?.abort(); }, []);

  // a recording left from before (the app was closed during a call…): offer it again
  useEffect(() => {
    void loadHeld().then((h) => {
      if (!h || stateRef.current !== 'idle' || h.seconds < 0.5) return;
      held.current = h.samples;
      setSecs(h.seconds);
      setState('held');
    });
  }, []);

  // the connection is back: send what is waiting
  useEffect(() => {
    const on = () => { if (stateRef.current === 'held' && held.current) void send(held.current); };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A message with the browser's or Google's own reason, so a problem can be reported exactly. */
  const fail = (text: string, detail: string) => say(detail ? t(text) + ' (' + detail + ')' : text);

  const tick = () => {
    clearInterval(timer.current);
    let last = Date.now();
    timer.current = window.setInterval(() => {
      const r = rec.current;
      if (!r) return;
      setSecs(r.seconds);
      if (r.seconds >= VOICE_MAX_SECONDS) void stop();
      // keep the new audio on the device every few seconds
      if (Date.now() - last > 4000) { last = Date.now(); const piece = r.take(); if (piece) void addHeld(piece); }
    }, 250);
  };

  // called straight from the tap: the recorder switches the audio on before anything is awaited
  const start = async () => {
    const r = new PcmRecorder();
    rec.current = r;
    r.onInterrupt = () => {
      const piece = r.take();
      if (piece) void addHeld(piece);
      setState('cut');
    };
    try {
      await r.start();
    } catch (e) {
      rec.current = null;
      if (e instanceof VoiceError) return fail(VOICE_ERROR_TEXT[e.stage], e.message);
      return fail(VOICE_ERROR_TEXT.mic, errText(e));
    }
    held.current = null;
    void beginHeld();
    setSecs(0);
    setArmed(false);
    setState('rec');
    tick();
  };

  const pause = () => {
    rec.current?.pause();
    const piece = rec.current?.take();
    if (piece) void addHeld(piece);
    setState('paused');
  };
  const resume = async () => {
    const r = rec.current;
    if (!r) return;
    try {
      await r.resume();
      setState('rec');
    } catch (e) {
      fail(VOICE_ERROR_TEXT.mic, e instanceof VoiceError ? e.message : errText(e));
    }
  };

  /** Writes the audio into the document; on failure it is kept (held) to send again. */
  const send = async (samples: Float32Array) => {
    held.current = samples;
    setState('busy');
    // "লিখছে…" at the caret while Gemini writes it
    setInterim(editor.view, ' ' + t('লিখছে…'), 'busy');
    try {
      abort.current = new AbortController();
      const raw = await transcribe(samples, { key: gemini.key, model: gemini.model, signal: abort.current.signal, onModelChange: gemini.setModel });
      const text = voice ? polishTranscript(raw, voice, parseCorrections) : raw;
      held.current = null;
      void clearHeld();
      setState('idle');
      if (!text) return say(VOICE_ERROR_TEXT.silent);
      const before = textBeforeCaret(editor.view);
      const lead = before && !/\s$/.test(before) && !/^[\s।,;:?!]/.test(text) ? ' ' : '';
      editor.commands.focus();
      insertPlainText(editor.view, lead + text);
    } catch (e) {
      setState('held');
      if ((e as Error).name === 'AbortError') return;
      if (e instanceof VoiceError) return fail(VOICE_ERROR_TEXT[e.stage], e.message);
      if (!(e instanceof AiError)) return fail('রেকর্ড করা কথা পড়া গেল না', errText(e));
      const m = aiErrorMessage(e);
      say(m.detail ? t(m.text) + ' (Google: ' + m.detail + ')' : m.text);
    } finally {
      abort.current = null;
      setInterim(editor.view, '');
    }
  };

  const stop = async () => {
    clearInterval(timer.current);
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    let samples: Float32Array;
    const tail = r.take(); // the last seconds too, so a failed send keeps everything
    if (tail) await addHeld(tail);
    try {
      samples = r.stop();
    } catch (e) {
      setState('idle');
      void clearHeld();
      return e instanceof VoiceError ? fail(VOICE_ERROR_TEXT[e.stage], e.message) : fail(VOICE_ERROR_TEXT.audio, errText(e));
    }
    await send(samples);
  };

  /** 🗑 twice: throw the recording away; while recording, a fresh one starts at once. */
  const discard = () => {
    if (!armed) { setArmed(true); window.setTimeout(() => setArmed(false), 3000); return; }
    setArmed(false);
    const wasRecording = Boolean(rec.current);
    clearInterval(timer.current);
    rec.current?.cancel();
    rec.current = null;
    held.current = null;
    void clearHeld();
    setSecs(0);
    setState('idle');
    if (wasRecording) { say('মুছে ফেলা হলো, নতুন করে বলুন'); void start(); } else say('রেকর্ডটা মুছে ফেলা হলো');
  };

  const press = () => {
    if (state === 'rec' || state === 'paused' || state === 'cut') return void stop();
    if (state === 'busy') { abort.current?.abort(); return; }
    if (state === 'held') return held.current ? void send(held.current) : setState('idle');
    if (disabled) return say('বিজয় (ANSI) টাইপ চালু থাকলে ভয়েস চলে না। আগে ইউনিকোডে ফিরুন।');
    if (!gemini.key) {
      say('AI ভয়েসের জন্য Settings → AI সহকারী-তে নিজের Gemini key দিন');
      return onOpenSettings();
    }
    if (!load('aiVoiceConsent', false)) return setConsent(true);
    if (!PcmRecorder.supported()) return say(VOICE_ERROR_TEXT.unsupported);
    void start();
  };

  const consentUi = consent && (
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
  );
  return {
    state, secs, armed, consentUi, press, pause, resume: () => void resume(), write: () => void stop(), discard,
    sendHeld: () => { if (held.current) void send(held.current); },
    cancel: () => abort.current?.abort(),
  };
}
export type AiVoice = ReturnType<typeof useAiVoice>;

/** The page's ✦ mic, driven by a useAiVoice() that the workspace owns (the keyboard strip uses the same one). */
export function AiVoiceKey(props: { v: AiVoice; icon?: ReactNode; disabled?: boolean }) {
  const { t } = useT();
  const { v } = props;
  const { state } = v;
  const label = state === 'rec' || state === 'paused' || state === 'cut' ? t('AI ভয়েস: থামিয়ে লেখায় বসান') : state === 'busy' ? t('লেখা হচ্ছে… (চাপলে থামে, রেকর্ড থাকে)') : state === 'held' ? t('রাখা রেকর্ডটা লেখায় বসান') : t('AI ভয়েস টাইপিং (Gemini)');
  return (
    <>
      <button type="button" className={'mic ai-voice ' + state} data-testid="ai-voice" aria-pressed={state !== 'idle'} aria-label={label} title={label}
        aria-disabled={props.disabled || undefined} onPointerDown={(e) => e.preventDefault()} onClick={v.press}>
        {state === 'busy' ? <span className="spin" aria-hidden="true" /> : <>{props.icon ?? <span aria-hidden="true">✦</span>}<span className="ai-badge" aria-hidden="true">✦</span></>}
      </button>
      {state !== 'idle' && <div className="voice-pill-wrap"><VoiceControls ai={v} /></div>}
      {v.consentUi}
    </>
  );
}
