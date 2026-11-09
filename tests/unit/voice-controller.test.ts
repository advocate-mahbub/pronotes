import { describe, expect, it } from 'vitest';
import { decideVoice, type VoiceEnv } from '../../src/voice/controller';

const base: VoiceEnv = {
  SR: class { lang = ''; interimResults = false; maxAlternatives = 1; continuous = false; onresult = null; onerror = null; onend = null; start() {} stop() {} },
  isIOS: false, isAndroid: false, appleEngine: false, coarse: false, secure: true, preview: false,
};

describe('mobile voice capability decisions', () => {
  it('uses the device keyboard when iOS cannot provide Bangla speech recognition', () => {
    expect(decideVoice('bn-BD', { ...base, isIOS: true, appleEngine: true, coarse: true })).toEqual({
      kind: 'device-keyboard',
      message: 'iPhone/iPad-এ বাংলা ভয়েস Apple সাপোর্ট করে না। ফোনের কিবোর্ডের মাইক (Gboard) ব্যবহার করুন।',
    });
  });

  it('does not claim live voice on an insecure mobile page', () => {
    expect(decideVoice('bn-BD', { ...base, isAndroid: true, coarse: true, secure: false })).toEqual({
      kind: 'unavailable', message: 'ভয়েস টাইপিং শুধু https সাইটে চলে',
    });
  });

  it('falls back clearly when the browser has no speech API', () => {
    expect(decideVoice('bn-BD', { ...base, SR: null, coarse: true }).kind).toBe('device-keyboard');
    expect(decideVoice('bn-BD', { ...base, SR: null, coarse: false }).kind).toBe('unavailable');
  });
});
