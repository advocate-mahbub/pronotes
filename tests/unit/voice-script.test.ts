import { describe, it, expect } from 'vitest';
import { banglaScript, devanagariToBengali, toBanglaVoice } from '../../src/voice/script';

// decisions.md 82: Bangla speech is never written in Hindi, Chinese, Japanese or Latin letters
describe('Bangla voice in Bengali letters', () => {
  it('Hindi letters become the same Bengali letters', () => {
    expect(devanagariToBengali('आमार सोनार बांला')).toBe('আমার সোনার বাংলা');
    expect(devanagariToBengali('दलिल ।')).toBe('দলিল ।');
    expect(devanagariToBengali('वादी')).toBe('বাদী'); // व has no Bengali twin: ব
  });

  it('other scripts are dropped; Bengali and English stay', () => {
    const r = banglaScript('আমার 我的 জমি ジミ Gmail');
    expect(r.text).toBe('আমার জমি Gmail');
    expect(r.dropped).toBe(4);
    expect(r.latin).toBe(false);
  });

  it('all-Latin is marked and rewritten; English voice is left alone', async () => {
    expect(banglaScript('amar sonar bangla').latin).toBe(true);
    const rewrite = async () => 'আমার সোনার বাংলা';
    expect(await toBanglaVoice('amar sonar bangla', 'bn-BD', rewrite)).toBe('আমার সোনার বাংলা');
    expect(await toBanglaVoice('amar sonar bangla', 'en-US', rewrite)).toBe('amar sonar bangla');
    // a failed or empty rewrite keeps what came
    expect(await toBanglaVoice('amar', 'bn-BD', async () => { throw new Error('x'); })).toBe('amar');
    expect(await toBanglaVoice('amar', 'bn-BD', async () => 'amar')).toBe('amar');
  });
});

// decisions.md 87: each sentence judged on its own
import { looksRomanBangla, voiceSentences } from '../../src/voice/script';
describe('Hindi and romanised Bangla inside Bangla voice', () => {
  it('romanised Bangla / Hindi sentences are found; English ones are not', () => {
    expect(looksRomanBangla('Ok, bar theek hai.')).toBe(true);
    expect(looksRomanBangla('Abar theek achhe.')).toBe(true);
    expect(looksRomanBangla('Okay, but the cut.')).toBe(false);
    expect(looksRomanBangla('I have a head ache.')).toBe(false);
    expect(looksRomanBangla('আমি ঠিক আছি')).toBe(false);
  });
  it('sentences keep their marks and spaces', () => {
    expect(voiceSentences('এক। Two? তিন')).toEqual(['এক। ', 'Two? ', 'তিন']);
  });
  it('only the wrong sentences are rewritten; Hindi letters never stay', async () => {
    const seen: string[] = [];
    const rewrite = async (s: string) => { seen.push(s); return s.includes('ठीक') ? 'এবার ঠিক আছে।' : 'আবার ঠিক আছে।'; };
    const out = await toBanglaVoice('তুমি কি আমার কথা বুঝতে পারছো? Okay, but the cut. ए बार ठीक अच्छे। Abar theek achhe.', 'bn-BD', rewrite);
    expect(out).toBe('তুমি কি আমার কথা বুঝতে পারছো? Okay, but the cut. এবার ঠিক আছে। আবার ঠিক আছে।');
    expect(seen).toEqual(['ए बार ठीक अच्छे।', 'Abar theek achhe.']);
  });
  it('without a key: Hindi letters become Bengali, Latin stays', async () => {
    expect(await toBanglaVoice('ठीक है। Abar theek achhe.', 'bn-BD')).toBe('ঠীক হৈ। Abar theek achhe.');
  });
  it('English voice: Hindi letters do not stay either', async () => {
    expect(await toBanglaVoice('hello ठीक', 'en-US')).toBe('hello ঠীক');
  });
});
