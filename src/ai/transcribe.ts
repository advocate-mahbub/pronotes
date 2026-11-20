/**
 * AI voice typing: record, then let Gemini (the user's own key) write down what was said.
 * Better for Bangla than the browser's built-in speech service, because a large model hears whole
 * sentences, legal words and Bangla–English mixing. The audio goes to Google only when the user
 * presses the AI voice key and has agreed to it once (consent in the app).
 */
import { fixNukta } from '../bornona-engine';
import { AiError, geminiGenerate, type GeminiOptions } from './gemini';

/** 16 kHz mono is what speech models use; a minute is about 1.9 MB. */
export const VOICE_RATE = 16000;
/** Longest recording; Gemini takes up to 20 MB inline, this stays far below. */
export const VOICE_MAX_SECONDS = 300;

export const TRANSCRIBE_PROMPT = [
  'এই অডিওতে যা বলা হয়েছে, হুবহু লিখে দিন। শুধু লেখাটা দিন, কোনো ব্যাখ্যা, শিরোনাম বা উদ্ধৃতিচিহ্ন নয়।',
  'ভাষা: বাংলাদেশের প্রমিত বাংলা বানান (পানি, গোসল, দাওয়াত — যেমন বলা হয়েছে)। ইংরেজি শব্দ বা বাক্য ইংরেজি অক্ষরেই লিখুন।',
  'বাংলা কথা সবসময় বাংলা অক্ষরে: কখনো ইংরেজি (amar), হিন্দি (देवनागरी) বা অন্য কোনো অক্ষরে নয়, অনুবাদও নয়।',
  'বক্তা "দাঁড়ি", "কমা", "প্রশ্নবোধক", "নতুন লাইন" বা "নতুন অনুচ্ছেদ" বললে শব্দটা না লিখে চিহ্ন বা লাইন-ভাঙা বসান। বাক্যের শেষে দাঁড়ি (।) দিন।',
  'সংখ্যা যেভাবে বলা হয়েছে সেভাবে বাংলা অঙ্কে লিখুন (যেমন ১২৩ নং দাগ, ৫ শতাংশ)। নাম, দাগ, খতিয়ান, দলিল নম্বর বদলাবেন না; না বুঝলে [অস্পষ্ট] লিখুন।',
  'কোনো কথা যোগ করবেন না, সংক্ষেপ করবেন না, ভাষা সুন্দর করবেন না। অডিওতে কথা না থাকলে কিছুই লিখবেন না।',
].join('\n');

/** Cleans the model's answer: no code fences or quotes around it, canonical য়/ড়/ঢ়. */
export function cleanTranscript(s: string): string {
  let t = s.trim().replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
  if (/^["“'‘].*["”'’]$/s.test(t)) t = t.slice(1, -1).trim();
  return fixNukta(t.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n'));
}

/** PCM samples (−1…1) as a 16-bit mono WAV file. */
export function encodeWav(samples: Float32Array, rate = VOICE_RATE): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Loudest sample: a recording of only silence is not sent. */
export const peak = (s: Float32Array) => s.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

/** Where a voice recording stopped working (shown to the user with the browser's own reason). */
export type VoiceStage = 'unsupported' | 'mic' | 'audio' | 'silent';
export class VoiceError extends Error {
  constructor(public stage: VoiceStage, message: string) {
    super(message);
  }
}
export const VOICE_ERROR_TEXT: Record<VoiceStage, string> = {
  unsupported: 'এই ব্রাউজারে মাইক থেকে রেকর্ড করা যায় না',
  mic: 'মাইক ব্যবহারের অনুমতি পাওয়া যায়নি। ব্রাউজারের সেটিংসে এই সাইটকে মাইকের অনুমতি দিন।',
  audio: 'মাইক চালু হলো, কিন্তু কোনো শব্দ আসেনি। অ্যাপটা বন্ধ করে আবার খুলে চেষ্টা করুন।',
  silent: 'কোনো কথা শোনা যায়নি',
};

const withTimeout = <T,>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(what + ': timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

/** Averages blocks of samples down to 16 kHz (a plain low-pass, enough for speech). */
export function resampleTo16k(input: Float32Array, rate: number): Float32Array {
  if (rate === VOICE_RATE) return input;
  const ratio = rate / VOICE_RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(input.length, Math.max(a + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let k = a; k < b; k++) sum += input[k];
    out[i] = sum / (b - a);
  }
  return out;
}

/**
 * Microphone → raw samples through Web Audio, straight from the device: no MediaRecorder file and
 * no decodeAudioData, which Safari (iPad/iPhone) cannot do for its own fragmented MP4 recordings.
 * start() must be called from the tap itself: the audio is switched on before anything is awaited.
 */
export class PcmRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private node: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  /** How many chunks have been handed out by take() already (for saving on the device as it goes). */
  private taken = 0;
  private rate = 48000;
  /** The user paused (sound is not kept), or something took the microphone away (a call, another app). */
  paused = false;
  /** Called when the recording stops by itself: a phone call, another app taking the mic, the mic unplugged. */
  onInterrupt?: () => void;
  static supported = () =>
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined'
    && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);

  async start(): Promise<void> {
    if (!PcmRecorder.supported()) throw new VoiceError('unsupported', 'no getUserMedia/AudioContext');
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    const resumed = ctx.resume().catch(() => {}); // still inside the tap
    await this.openMic(() => this.cancel());
    await resumed;
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    this.rate = ctx.sampleRate;
    this.chunks = [];
    this.taken = 0;
    this.paused = false;
    // iOS: a call (or Siri, or another app's audio) "interrupts" the audio; desktop browsers suspend it
    ctx.onstatechange = () => { if (!this.paused && ctx.state !== 'running' && ctx.state !== 'closed') this.interrupt(); };
    this.connect();
  }

  private async openMic(onFail: () => void): Promise<void> {
    try {
      this.stream = await withTimeout(navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }), 20_000, 'microphone');
    } catch (e) {
      onFail();
      throw new VoiceError('mic', errText(e));
    }
    for (const tr of this.stream.getAudioTracks()) tr.onended = () => { if (!this.paused) this.interrupt(); };
  }

  private connect(): void {
    const ctx = this.ctx!;
    this.src = ctx.createMediaStreamSource(this.stream!);
    this.node = ctx.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = (e) => { if (!this.paused) this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
    this.src.connect(this.node);
    this.node.connect(ctx.destination); // Safari runs the node only when it is connected; its output is silence
  }

  private interrupt(): void {
    this.paused = true;
    this.onInterrupt?.();
  }

  /** Stop keeping sound; what was said so far stays. */
  pause(): void {
    this.paused = true;
  }

  /**
   * Go on recording after the same audio. After a call the microphone may have been taken away: it is
   * asked for again (call this from a tap, so iOS allows it).
   */
  async resume(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) throw new VoiceError('audio', 'closed');
    const lost = !this.stream || this.stream.getAudioTracks().every((t) => t.readyState === 'ended');
    const resumed = ctx.resume().catch(() => {});
    if (lost) {
      try { this.src?.disconnect(); this.node?.disconnect(); } catch { /* already gone */ }
      await this.openMic(() => {});
      this.connect();
    }
    await resumed;
    this.paused = false;
  }

  /** Seconds recorded so far (pauses not counted). */
  get seconds(): number {
    return this.chunks.reduce((n, c) => n + c.length, 0) / this.rate;
  }

  /** The audio recorded since the last take(), at 16 kHz: kept on the device as the recording goes. */
  take(): Float32Array | null {
    const fresh = this.chunks.slice(this.taken);
    if (!fresh.length) return null;
    this.taken = this.chunks.length;
    return resampleTo16k(join(fresh), this.rate);
  }

  /** Stops and gives 16 kHz mono samples. */
  stop(): Float32Array {
    const parts = this.chunks;
    const rate = this.rate;
    this.cancel();
    if (!parts.length) throw new VoiceError('audio', 'no audio frames');
    return resampleTo16k(join(parts), rate);
  }

  cancel(): void {
    try { this.src?.disconnect(); this.node?.disconnect(); } catch { /* already gone */ }
    if (this.node) this.node.onaudioprocess = null;
    if (this.ctx) this.ctx.onstatechange = null;
    this.stream?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.stream = null;
    this.src = null;
    this.node = null;
    this.chunks = [];
    this.taken = 0;
  }
}

/** Float32 pieces → one array. */
export function join(parts: Float32Array[]): Float32Array {
  const all = new Float32Array(parts.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of parts) { all.set(c, o); o += c.length; }
  return all;
}

/** The browser's own reason, short (e.g. "NotAllowedError"). */
export function errText(e: unknown): string {
  if (e instanceof Error) return (e.name && e.name !== 'Error' ? e.name + ': ' : '') + e.message.slice(0, 120);
  return String(e).slice(0, 120);
}

/** Corrections ("ভুল = ঠিক") and the digits setting, applied to the model's text (line breaks kept). */
export function polishTranscript(text: string, o: { corrections: string; banglaDigits: boolean }, parse: (s: string) => [string, string][]): string {
  let s = fixNukta(text);
  for (const [a, b] of parse(o.corrections)) {
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp('(^|[\\s(“‘"])' + esc + '(?=$|[\\s।,.?!;:)”’"])', 'gm'), '$1' + b);
  }
  if (!o.banglaDigits) s = s.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
  return s;
}

/** Longest wait for Gemini's answer. */
export const TRANSCRIBE_TIMEOUT_MS = 90_000;

/** Sends 16 kHz samples to Gemini and returns the Bangla text ('' for silence). */
export async function transcribe(samples: Float32Array, o: GeminiOptions & { timeoutMs?: number }): Promise<string> {
  if (samples.length < VOICE_RATE / 2 || peak(samples) < 0.01) return '';
  const data = toBase64(encodeWav(samples));
  // never wait for ever: our own time limit, and the caller's cancel still works
  const ac = new AbortController();
  const outer = o.signal;
  const onAbort = () => ac.abort();
  outer?.addEventListener('abort', onAbort);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ac.abort(); }, o.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS);
  try {
    return cleanTranscript(await geminiGenerate(TRANSCRIBE_PROMPT, { ...o, signal: ac.signal, audio: { mime: 'audio/wav', data }, temperature: 0 }));
  } catch (e) {
    if (timedOut) throw new AiError('timeout', 'no answer in ' + Math.round((o.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS) / 1000) + ' s');
    throw e;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
}
