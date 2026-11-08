/**
 * AI voice typing: record, then let Gemini (the user's own key) write down what was said.
 * Better for Bangla than the browser's built-in speech service, because a large model hears whole
 * sentences, legal words and Bangla–English mixing. The audio goes to Google only when the user
 * presses the AI voice key and has agreed to it once (consent in the app).
 */
import { fixNukta } from '../bornona-engine';
import { geminiGenerate, type GeminiOptions } from './gemini';

/** 16 kHz mono is what speech models use; a minute is about 1.9 MB. */
export const VOICE_RATE = 16000;
/** Longest recording; Gemini takes up to 20 MB inline, this stays far below. */
export const VOICE_MAX_SECONDS = 300;

export const TRANSCRIBE_PROMPT = [
  'এই অডিওতে যা বলা হয়েছে, হুবহু লিখে দিন। শুধু লেখাটা দিন, কোনো ব্যাখ্যা, শিরোনাম বা উদ্ধৃতিচিহ্ন নয়।',
  'ভাষা: বাংলাদেশের প্রমিত বাংলা বানান (পানি, গোসল, দাওয়াত — যেমন বলা হয়েছে)। ইংরেজি শব্দ বা বাক্য ইংরেজি অক্ষরেই লিখুন।',
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

/** Any recording the browser made (webm/opus, mp4/aac …) → 16 kHz mono samples. */
export async function toMono16k(blob: Blob): Promise<Float32Array> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * VOICE_RATE)), VOICE_RATE);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  } finally {
    void ctx.close();
  }
}

/** Microphone recording with MediaRecorder; stop() gives the audio. */
export class VoiceRecorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  static supported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const r = this.rec;
      const done = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        this.rec = null;
        resolve(new Blob(this.chunks, { type: r?.mimeType || 'audio/webm' }));
      };
      if (!r || r.state === 'inactive') return done();
      r.onstop = done;
      r.stop();
    });
  }

  cancel(): void {
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
    this.chunks = [];
  }
}

/** Sends 16 kHz samples to Gemini and returns the Bangla text ('' for silence). */
export async function transcribe(samples: Float32Array, o: GeminiOptions): Promise<string> {
  if (samples.length < VOICE_RATE / 2 || peak(samples) < 0.01) return '';
  const data = toBase64(encodeWav(samples));
  return cleanTranscript(await geminiGenerate(TRANSCRIBE_PROMPT, { ...o, audio: { mime: 'audio/wav', data }, temperature: 0 }));
}
