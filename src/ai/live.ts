/**
 * Live voice typing: the words appear while the user speaks (decisions.md 73).
 *
 * Two engines, the same outside:
 * - "gemini": the Gemini Live API (free tier model gemini-3.1-flash-live-preview) with input-audio
 *   transcription, over a WebSocket straight from the browser with the user's own key. Microphone audio
 *   goes as 16 kHz 16-bit PCM in small pieces; the transcription comes back as it is recognised.
 * - "browser": the browser's own speech recognition (Chrome on computers and Android, bn-BD), when there
 *   is no Gemini key. iPhone/iPad Safari has it too, but Apple does not recognise Bangla there.
 *
 * A piece of text is "final" (put into the document) when the speaker pauses; until then it is shown
 * as it grows. Pause closes the connection after the last words are in; ▶ opens a new one. A dropped
 * connection (or a call taking the microphone) pauses by itself: what was written stays.
 */
import { resampleTo16k } from './transcribe';

export const LIVE_MODEL = 'gemini-3.1-flash-live-preview';
const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

export type LiveState = 'starting' | 'live' | 'paused' | 'cut' | 'stopped';
export interface LiveEvents {
  /** The words being heard now (not final yet). */
  onInterim(text: string): void;
  /** Words to put into the document. */
  onFinal(text: string): void;
  onState(s: LiveState, why?: string): void;
}
export interface LiveEngine {
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
}

type SR = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const SRClass = (): (new () => SR) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const APPLE = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && !/Chrome|CriOS|Edg/.test(navigator.userAgent);
/** The browser's own recognition can do Bangla here (Chrome/Edge; not Apple's Safari). */
export const browserLiveOk = () => Boolean(SRClass()) && !APPLE;

/** Which engine live typing uses here, or null when it cannot work. */
export function liveEngineKind(hasKey: boolean): 'gemini' | 'browser' | null {
  if (hasKey && typeof WebSocket !== 'undefined') return 'gemini';
  if (browserLiveOk()) return 'browser';
  return null;
}

// ---------------------------------------------------------------------------------------------------
/** Microphone → 16 kHz PCM pieces (about 0.25 s each), for streaming. */
class MicStream {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  onPiece?: (pcm16: Int16Array) => void;
  onLost?: () => void;

  async open(): Promise<void> {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = this.ctx ?? new AC();
    this.ctx = ctx;
    const resumed = ctx.resume().catch(() => {}); // inside the tap
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    await resumed;
    for (const t of this.stream.getAudioTracks()) t.onended = () => this.onLost?.();
    ctx.onstatechange = () => { if (ctx.state === 'interrupted' as AudioContextState || ctx.state === 'suspended') this.onLost?.(); };
    this.src = ctx.createMediaStreamSource(this.stream);
    this.node = ctx.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = (e) => {
      const f = resampleTo16k(new Float32Array(e.inputBuffer.getChannelData(0)), ctx.sampleRate);
      const out = new Int16Array(f.length);
      for (let i = 0; i < f.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
      this.onPiece?.(out);
    };
    this.src.connect(this.node);
    this.node.connect(ctx.destination);
  }

  close(): void {
    try { this.src?.disconnect(); this.node?.disconnect(); } catch { /* gone */ }
    if (this.node) this.node.onaudioprocess = null;
    if (this.ctx) this.ctx.onstatechange = null;
    this.stream?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    void this.ctx?.close().catch(() => {});
    this.ctx = null; this.stream = null; this.node = null; this.src = null;
  }
}

const b64 = (pcm: Int16Array) => {
  const u8 = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Gemini Live: words as they are spoken. */
export class GeminiLive implements LiveEngine {
  private ws: WebSocket | null = null;
  private mic = new MicStream();
  private ready = false;
  private heard = '';      // final-to-be text of the current utterance
  private idle?: number;   // puts `heard` into the document after a pause in the words
  private state: LiveState = 'stopped';
  constructor(private key: string, private lang: string, private ev: LiveEvents, private model = LIVE_MODEL, private url = WS) {}

  private set(s: LiveState, why?: string) { this.state = s; this.ev.onState(s, why); }
  private flush() {
    clearTimeout(this.idle);
    const t = this.heard.replace(/\s+/g, ' ').trim();
    this.heard = '';
    this.ev.onInterim('');
    if (t) this.ev.onFinal(t);
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.url}?key=${encodeURIComponent(this.key)}`);
      this.ws = ws;
      this.ready = false;
      let opened = false;
      ws.onopen = () => {
        ws.send(JSON.stringify({ setup: {
          model: 'models/' + this.model,
          generationConfig: { responseModalities: ['AUDIO'] },
          inputAudioTranscription: { languageCodes: [this.lang] },
        } }));
      };
      ws.onmessage = async (m) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(typeof m.data === 'string' ? m.data : await (m.data as Blob).text()); } catch { return; }
        if (msg.setupComplete) { opened = true; this.ready = true; resolve(); return; }
        const sc = msg.serverContent as { inputTranscription?: { text?: string }; interimInputTranscription?: { text?: string }; turnComplete?: boolean } | undefined;
        if (sc?.inputTranscription?.text) {
          this.heard += sc.inputTranscription.text;
          this.ev.onInterim(this.heard);
          clearTimeout(this.idle);
          this.idle = window.setTimeout(() => this.flush(), 1400);
        } else if (sc?.interimInputTranscription?.text) {
          this.ev.onInterim((this.heard + ' ' + sc.interimInputTranscription.text).trim());
        }
        if (sc?.turnComplete) this.flush();
        if (msg.goAway) void this.renew(); // the session is ending: carry on in a new one
      };
      ws.onerror = () => { if (!opened) reject(new Error('connect')); };
      ws.onclose = (e) => {
        if (!opened) return reject(new Error(e.reason || 'closed ' + e.code));
        if (this.ws === ws && this.state === 'live') { this.flush(); this.mic.close(); this.set('cut', e.reason || 'network'); }
      };
    });
  }

  /** A new session in place of one that is ending (sessions are limited in length). */
  private async renew() {
    const old = this.ws;
    this.flush();
    try { await this.connect(); } catch { /* the old one goes on until it closes */ }
    try { old?.close(); } catch { /* gone */ }
  }

  async start() {
    this.set('starting');
    this.mic.onPiece = (pcm) => {
      if (this.ready && this.state === 'live' && this.ws?.readyState === WebSocket.OPEN)
        this.ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: b64(pcm) } } }));
    };
    this.mic.onLost = () => { if (this.state === 'live') { this.flush(); this.mic.close(); this.ws?.close(); this.set('cut', 'mic'); } };
    try {
      await Promise.all([this.mic.open(), this.connect()]);
    } catch (e) {
      this.mic.close();
      this.ws?.close();
      this.set('stopped', (e as Error).message);
      throw e;
    }
    this.set('live');
  }

  /** Let the last words arrive, then close. */
  private async wind() {
    try { this.ws?.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })); } catch { /* closed */ }
    await new Promise((r) => setTimeout(r, 1200));
    this.flush();
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(); } catch { /* gone */ }
  }

  async pause() {
    if (this.state !== 'live') return;
    this.state = 'paused';
    this.mic.close();
    await this.wind();
    this.set('paused');
  }

  async resume() {
    this.set('starting');
    try {
      await Promise.all([this.mic.open(), this.connect()]);
      this.set('live');
    } catch (e) {
      this.mic.close();
      this.set('cut', (e as Error).message);
    }
  }

  async stop() {
    const was = this.state;
    this.state = 'stopped';
    this.mic.close();
    if (was === 'live') await this.wind(); else { this.flush(); this.ws?.close(); this.ws = null; }
    this.set('stopped');
  }
}

/** The browser's own recognition (Chrome/Edge): free, no key; audio goes to the browser maker's service. */
export class BrowserLive implements LiveEngine {
  private r: SR | null = null;
  private want = false;
  constructor(private lang: string, private ev: LiveEvents) {}

  private open() {
    const C = SRClass();
    if (!C) throw new Error('unsupported');
    const r = new C();
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) this.ev.onFinal(res[0].transcript.trim());
        else interim += res[0].transcript;
      }
      this.ev.onInterim(interim.trim());
    };
    // Chrome ends a session after silence: while wanted, start again
    r.onend = () => { if (this.want) { try { r.start(); } catch { this.ev.onState('cut', 'ended'); } } };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.want = false;
      this.ev.onState(e.error === 'network' ? 'cut' : 'stopped', e.error);
    };
    this.r = r;
    r.start();
  }

  async start() { this.want = true; this.open(); this.ev.onState('live'); }
  async pause() { this.want = false; this.r?.stop(); this.ev.onInterim(''); this.ev.onState('paused'); }
  async resume() { this.want = true; this.open(); this.ev.onState('live'); }
  async stop() { this.want = false; this.r?.stop(); this.ev.onInterim(''); this.ev.onState('stopped'); }
}
