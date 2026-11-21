import { describe, it, expect } from 'vitest';
import { liveVoiceText } from '../../src/voice';
import { fixNukta as n } from '../../src/bornona-engine';

// decisions.md 86: Live voice gets the same clean-up as recorded voice
const o = { commands: true, banglaDigits: true, corrections: 'এক্তিয়ার = এখতিয়ার' };
describe('liveVoiceText', () => {
  it('spoken marks, also glued to the engine\'s own; one mark stays', () => {
    expect(liveVoiceText('আমি বলছি দাঁড়ি।', 'bn-BD', o)).toBe(n('আমি বলছি।'));
    expect(liveVoiceText('আমি বলছি। দাঁড়ি', 'bn-BD', o)).toBe(n('আমি বলছি।'));
    expect(liveVoiceText('আবার কমা লিখি', 'bn-BD', o)).toBe(n('আবার, লিখি'));
  });
  it('Bangla digits, corrections, "." after Bangla = দাঁড়ি', () => {
    expect(liveVoiceText('দাগ 500 এর এক্তিয়ার.', 'bn-BD', o)).toBe(n('দাগ ৫০০ এর এখতিয়ার।'));
    expect(liveVoiceText('দাগ ৫০০', 'bn-BD', { ...o, banglaDigits: false })).toBe(n('দাগ 500'));
  });
  it('spoken punctuation off: the words stay words', () => {
    expect(liveVoiceText('আমি বলছি দাঁড়ি', 'bn-BD', { ...o, commands: false })).toBe(n('আমি বলছি দাঁড়ি'));
  });
  it('English: its own words, digits untouched', () => {
    expect(liveVoiceText('section 144 full stop', 'en-US', o)).toBe(n('section 144.'));
  });
});
