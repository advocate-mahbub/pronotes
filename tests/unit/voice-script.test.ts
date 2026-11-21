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
    // first both together; this answer is not line for line, so then each on its own
    expect(seen.slice(1)).toEqual(['ए बार ठीक अच्छे।', 'Abar theek achhe.']);
    expect(seen[0]).toContain('[1] ए बार ठीक अच्छे।\n[2] Abar theek achhe.');
  });
  it('several wrong sentences: one request, answered line for line (decisions.md 95)', async () => {
    const seen: string[] = [];
    const rewrite = async (s: string) => { seen.push(s); return '[1] এবার ঠিক আছে।\n[2] আবার ঠিক আছে।'; };
    const out = await toBanglaVoice('তুমি কি বুঝলে? ए बार ठीक अच्छे। Abar theek achhe.', 'bn-BD', rewrite);
    expect(out).toBe('তুমি কি বুঝলে? এবার ঠিক আছে। আবার ঠিক আছে।');
    expect(seen).toHaveLength(1);
  });
  it('a failed batch falls back to one sentence at a time', async () => {
    let n = 0;
    const rewrite = async (s: string) => { n++; if (s.includes('[1]')) throw new Error('429'); return 'আবার ঠিক আছে।'; };
    expect(await toBanglaVoice('Abar theek achhe. Abar theek achhe.', 'bn-BD', rewrite)).toBe('আবার ঠিক আছে। আবার ঠিক আছে।');
    expect(n).toBe(3);
  });
  it('without a key: Hindi letters become Bengali, Latin stays', async () => {
    expect(await toBanglaVoice('ठीक है। Abar theek achhe.', 'bn-BD')).toBe('ঠীক হৈ। Abar theek achhe.');
  });
  it('English voice: Hindi letters do not stay either', async () => {
    expect(await toBanglaVoice('hello ठीक', 'en-US')).toBe('hello ঠীক');
  });
});
