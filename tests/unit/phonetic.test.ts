import { describe, expect, it } from 'vitest';
import { transliterateLowercase } from '../../src/bornona-engine';

describe('ProNotes Phonetic', () => {
  it('transliterates the approved lowercase examples', () => {
    expect(transliterateLowercase('amar')).toBe('আমার');
    expect(transliterateLowercase('bangla')).toBe('বাংলা');
    expect(transliterateLowercase('dalil')).toBe('দলিল');
  });
});
