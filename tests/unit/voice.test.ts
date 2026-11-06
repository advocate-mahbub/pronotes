import { describe, it, expect, vi } from 'vitest';
import golden from '../golden/voice.json';
import {
  cleanVoice, voiceInsertText, VoiceDeduper, parseCorrections, decideVoice, VoiceController,
  type VoiceEnv, type SpeechRecognitionLike,
} from '../../src/voice';

describe('voice clean-up matches v8 (golden)', () => {
  it.each(golden.clean.map((c, i) => [i, c] as const))('case %i', (_i, c) => {
    expect(cleanVoice(c.raw, c.lang, { commands: c.vcmd, banglaDigits: c.vdig, corrections: c.corr })).toBe(c.out);
  });
  it.each(golden.put.map((c, i) => [i, c] as const))('insert %i', (_i, c) => {
    const o = { commands: true, banglaDigits: true, corrections: '' };
    expect(c.before + voiceInsertText(c.before, c.raw, c.lang, o)).toBe(c.value);
  });
  it('same result twice within 2.5 s is inserted once', () => {
    const d = new VoiceDeduper();
    let v = '';
    for (const t of ['আমি', 'আমি']) if (d.accept(t, 1000)) v += voiceInsertText(v, t, 'bn-BD', { commands: true, banglaDigits: true, corrections: '' });
    expect(v).toBe(golden.dedupe);
    expect(d.accept('আমি', 4000)).toBe(true);
  });
  it('ignores malformed correction lines', () => {
    expect(parseCorrections('ক = খ\nbad\n = x\nগ=ঘ')).toEqual([['ক', 'খ'], ['গ', 'ঘ']]);
  });
});

const env = (o: Partial<VoiceEnv> = {}): VoiceEnv => ({
  SR: null, isIOS: false, isAndroid: false, appleEngine: false, coarse: false, secure: true, preview: false, ...o,
});

describe('decideVoice', () => {
  class FakeSR {}
  const SR = FakeSR as never;
  it('Chrome desktop on https: live', () => expect(decideVoice('bn-BD', env({ SR })).kind).toBe('live'));
  it('iPad Bangla: device keyboard', () => {
    const d = decideVoice('bn-BD', env({ SR, isIOS: true, appleEngine: true, coarse: true }));
    expect(d.kind).toBe('device-keyboard');
  });
  it('iPad English with speech API: live', () => expect(decideVoice('en-US', env({ SR, isIOS: true, appleEngine: true, coarse: true })).kind).toBe('live'));
  it('desktop Safari Bangla: unavailable', () => expect(decideVoice('bn-BD', env({ SR, appleEngine: true })).kind).toBe('unavailable'));
  it('no API on desktop: unavailable', () => expect(decideVoice('bn-BD', env()).kind).toBe('unavailable'));
  it('http page: unavailable', () => expect(decideVoice('bn-BD', env({ SR, secure: false })).kind).toBe('unavailable'));
  it('claude.ai preview on a tablet: device keyboard', () => expect(decideVoice('bn-BD', env({ SR, preview: true, coarse: true })).kind).toBe('device-keyboard'));
});

/** Scriptable SpeechRecognition stand-in. */
function mockSR() {
  const made: Mock[] = [];
  class Mock implements SpeechRecognitionLike {
    lang = '';
    interimResults = false;
    maxAlternatives = 0;
    continuous = false;
    onresult: SpeechRecognitionLike['onresult'] = null;
    onerror: SpeechRecognitionLike['onerror'] = null;
    onend: SpeechRecognitionLike['onend'] = null;
    started = false;
    constructor() { made.push(this); }
    start() { this.started = true; }
    stop() { this.started = false; }
    say(text: string, isFinal: boolean) {
      this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text }, length: 1 }] });
    }
    end() { this.onend?.(); }
  }
  return { SR: Mock, made };
}

describe('VoiceController', () => {
  const setup = (o: Partial<VoiceEnv> = {}) => {
    const m = mockSR();
    const finals: string[] = [];
    const interims: string[] = [];
    const errors: [string, boolean][] = [];
    const states: boolean[] = [];
    const c = new VoiceController(env({ SR: m.SR, ...o }), {
      lang: () => 'bn-BD', onFinal: (t) => finals.push(t), onInterim: (t) => interims.push(t),
      onListening: (on) => states.push(on), onError: (msg, fb) => errors.push([msg, fb]),
    });
    return { c, m, finals, interims, errors, states };
  };

  it('passes interim and final text, continuous on desktop', () => {
    const { c, m, finals, interims } = setup();
    c.start();
    expect(m.made[0].continuous).toBe(true);
    expect(m.made[0].lang).toBe('bn-BD');
    m.made[0].say('আমি', false);
    m.made[0].say('আমি বাদী', true);
    expect(interims).toContain('আমি');
    expect(finals).toEqual(['আমি বাদী']);
  });

  it('Android: not continuous, restarts after each phrase, stops after 9 silent cycles', () => {
    vi.useFakeTimers();
    const { c, m, errors } = setup({ isAndroid: true });
    c.start();
    expect(m.made[0].continuous).toBe(false);
    for (let i = 0; i < 9; i++) {
      m.made[m.made.length - 1].end();
      vi.advanceTimersByTime(300);
    }
    expect(m.made.length).toBe(9);
    expect(c.listening).toBe(false);
    expect(errors[0][0]).toMatch(/শোনা যায়নি/);
    vi.useRealTimers();
  });

  it('stop() inserts pending interim text and does not restart', () => {
    vi.useFakeTimers();
    const { c, m, finals, states } = setup();
    c.start();
    m.made[0].say('অসমাপ্ত', false);
    c.stop();
    vi.advanceTimersByTime(500);
    expect(finals).toEqual(['অসমাপ্ত']);
    expect(m.made.length).toBe(1);
    expect(states).toEqual([true, false]);
    vi.useRealTimers();
  });

  it('permission error stops with a message; no-speech is ignored', () => {
    const { c, m, errors } = setup();
    c.start();
    m.made[0].onerror?.({ error: 'no-speech' });
    expect(c.listening).toBe(true);
    m.made[0].onerror?.({ error: 'not-allowed' });
    expect(c.listening).toBe(false);
    expect(errors[0][0]).toMatch(/Microphone/);
  });

  it('language-not-supported on a tablet asks for the keyboard fallback', () => {
    const { c, m, errors } = setup({ coarse: true });
    c.start();
    m.made[0].onerror?.({ error: 'language-not-supported' });
    expect(errors[0][1]).toBe(true);
  });
});
