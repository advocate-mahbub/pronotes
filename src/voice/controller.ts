/**
 * Live voice typing with the Web Speech API, ported from v8 (`startRec`, `startVoice`, `stopVoice`).
 * Where live Bangla speech is not available (iPhone/iPad, Safari), the app falls back to the
 * device keyboard's own mic (see `decideVoice`).
 */

/* Minimal typings: SpeechRecognition is not in TypeScript's DOM library for every target. */
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative; length: number }
interface SREvent { resultIndex: number; results: ArrayLike<SRResult> }
interface SRErrorEvent { error: string }
export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
export type SRConstructor = new () => SpeechRecognitionLike;

export interface VoiceEnv {
  SR: SRConstructor | null;
  isIOS: boolean;
  isAndroid: boolean;
  /** WebKit engine (all iOS browsers, desktop Safari): no Bangla speech. */
  appleEngine: boolean;
  /** Touch device (phone/tablet). */
  coarse: boolean;
  /** https or localhost (the API needs a secure page). */
  secure: boolean;
  /** Running inside the claude.ai preview, where the page cannot open the mic. */
  preview: boolean;
}

export function detectVoiceEnv(w: Window & typeof globalThis = window): VoiceEnv {
  const any = w as unknown as Record<string, unknown>;
  const SR = (any.SpeechRecognition || any.webkitSpeechRecognition || null) as SRConstructor | null;
  const ua = w.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (w.navigator.platform === 'MacIntel' && w.navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const appleEngine = isIOS || (/Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android|SamsungBrowser/.test(ua));
  const coarse = typeof w.matchMedia === 'function' && w.matchMedia('(pointer: coarse)').matches;
  const secure = w.location.protocol === 'https:' || /^(localhost|127\.)/.test(w.location.hostname);
  const preview = Boolean(any.claude);
  return { SR, isIOS, isAndroid, appleEngine, coarse, secure, preview };
}

export type VoiceDecision =
  | { kind: 'live' }
  /** Open the device keyboard and let its mic do the work (engine suspended). */
  | { kind: 'device-keyboard'; message: string }
  | { kind: 'unavailable'; message: string };

/** v8 `startVoice` checks, in the same order. */
export function decideVoice(lang: string, env: VoiceEnv): VoiceDecision {
  const bn = lang.startsWith('bn');
  if (env.preview) {
    return env.coarse
      ? { kind: 'device-keyboard', message: 'এই প্রিভিউতে সরাসরি মাইক চলে না। ফোনের কিবোর্ডের মাইক ব্যবহার করুন।' }
      : { kind: 'unavailable', message: 'এই প্রিভিউতে সরাসরি মাইক চলে না। নিজের সাইটে বসানো ভার্সন Chrome বা Edge-এ খুলুন।' };
  }
  if (!env.SR || (env.appleEngine && bn)) {
    if (env.coarse)
      return {
        kind: 'device-keyboard',
        message: env.isIOS
          ? 'iPhone/iPad-এ বাংলা ভয়েস Apple সাপোর্ট করে না। ফোনের কিবোর্ডের মাইক (Gboard) ব্যবহার করুন।'
          : 'ফোনের কিবোর্ডের মাইক ব্যবহার করুন।',
      };
    return {
      kind: 'unavailable',
      message: env.appleEngine ? 'Safari বাংলা ভয়েস সাপোর্ট করে না। Chrome বা Edge-এ খুলুন।' : 'এই ব্রাউজারে ভয়েস টাইপিং নেই। Chrome বা Edge-এ খুলুন।',
    };
  }
  if (!env.secure) return { kind: 'unavailable', message: 'ভয়েস টাইপিং শুধু https সাইটে চলে' };
  return { kind: 'live' };
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'মাইক্রোফোনের অনুমতি দেওয়া হয়নি। ব্রাউজারের ঠিকানার পাশের লক আইকন থেকে Microphone চালু করুন।',
  'service-not-allowed': 'এই ব্রাউজারে ভয়েস টাইপিং চালু নেই। Chrome বা Edge ব্যবহার করুন।',
  network: 'ভয়েস টাইপিং-এর জন্য ইন্টারনেট লাগে। সংযোগ দেখে আবার চেষ্টা করুন।',
  'audio-capture': 'মাইক্রোফোন পাওয়া যায়নি।',
  'language-not-supported': 'এই ব্রাউজার এই ভাষার ভয়েস সাপোর্ট করে না।',
};

/** Every message this module can show (for the English interface check). */
export const ERRORS_FOR_I18N = [
  ...Object.values(ERRORS),
  'অনেকক্ষণ কিছু শোনা যায়নি, ভয়েস বন্ধ হলো',
  'ভয়েস চালু করা গেল না, আবার চাপুন',
];

export interface VoiceCallbacks {
  lang: () => string;
  /** A final result (raw transcript). */
  onFinal: (raw: string) => void;
  /** Interim text while speaking ('' when cleared). */
  onInterim: (text: string) => void;
  onListening: (on: boolean) => void;
  /** Stopped because of an error. `fallback` = try the device keyboard instead. */
  onError: (message: string, fallback: boolean) => void;
}

/** One live session. Android ends after every phrase, so the controller restarts it until stopped. */
export class VoiceController {
  private rec: SpeechRecognitionLike | null = null;
  private interim = '';
  private restartT: ReturnType<typeof setTimeout> | undefined;
  private emptyCycles = 0;
  listening = false;

  constructor(private env: VoiceEnv, private cb: VoiceCallbacks) {}

  start(): void {
    if (this.listening || !this.env.SR) return;
    this.emptyCycles = 0;
    this.listening = true;
    this.cb.onListening(true);
    this.startRec();
  }

  stop(): void {
    clearTimeout(this.restartT);
    const r = this.rec;
    this.rec = null;
    const was = this.listening;
    this.listening = false;
    if (r) {
      r.onend = null;
      try {
        r.stop();
      } catch {
        /* already stopped */
      }
    }
    this.flushInterim();
    if (was) this.cb.onListening(false);
  }

  private flushInterim(): void {
    if (this.interim.trim()) this.cb.onFinal(this.interim);
    this.interim = '';
    this.cb.onInterim('');
  }

  private fail(message: string, fallback = false): void {
    this.stop();
    this.cb.onError(message, fallback);
  }

  private startRec(): void {
    const rec = new this.env.SR!();
    this.rec = rec;
    rec.lang = this.cb.lang();
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = !this.env.isAndroid;
    rec.onresult = (e) => {
      let fin = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else interim += r[0].transcript;
      }
      this.interim = interim;
      if (fin.trim()) {
        this.interim = '';
        this.cb.onFinal(fin);
      }
      this.emptyCycles = 0;
      this.cb.onInterim(this.interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      const msg = ERRORS[e.error] || 'ভয়েসে সমস্যা: ' + e.error;
      this.fail(msg, e.error === 'language-not-supported' && this.env.coarse);
    };
    rec.onend = () => {
      this.rec = null;
      if (this.interim.trim()) {
        this.cb.onFinal(this.interim);
        this.interim = '';
        this.cb.onInterim('');
      }
      if (!this.listening) return;
      if (++this.emptyCycles > 8) {
        this.fail('অনেকক্ষণ কিছু শোনা যায়নি, ভয়েস বন্ধ হলো');
        return;
      }
      this.restartT = setTimeout(() => {
        if (!this.listening) return;
        try {
          this.startRec();
        } catch {
          this.stop();
        }
      }, this.env.isAndroid ? 250 : 100);
    };
    try {
      rec.start();
    } catch {
      this.rec = null;
      this.fail('ভয়েস চালু করা গেল না, আবার চাপুন');
    }
  }
}
