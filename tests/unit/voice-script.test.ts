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
