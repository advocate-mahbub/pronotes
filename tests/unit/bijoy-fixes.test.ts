import { describe, it, expect } from 'vitest';
import { toBijoy, toUnicode, bijoyRuns } from '../../src/bijoy';

/** The owner's six points (SutonnyMJ, checked by him in Word). */
describe('Bijoy glyphs the owner corrected', () => {
  it('১. স্ত → ¯Í  ২. ন্ত → šÍ (not the ড়-like —)', () => {
    expect(toBijoy('স্ত')).toBe('¯Í');
    expect(toBijoy('মাস্তান')).toBe('gv¯Ívb');
    expect(toBijoy('ন্ত')).toBe('šÍ');
    expect(toBijoy('অন্তর')).toBe('AšÍi');
    expect(toBijoy('ন্ত্ব')).toBe('šÍ¡');
    expect(toBijoy('স্তু')).toBe('¯‘');
    expect(toBijoy('ন্তু')).toBe('š‘');
  });
  it('৩. quotes → Ò Ó Ô Õ, straight ones by position', () => {
    expect(toBijoy('“দেশে”')).toBe('Ò†`‡kÓ');
    expect(toBijoy('"দেশে"')).toBe('Ò†`‡kÓ');
    expect(toBijoy('‘হ্যাঁ’')).toBe('Ôn¨vuÕ');
    // the library's own ‘ ’ “ ” letter parts are not touched
    expect(toBijoy('স্থ')).toBe('¯’');
  });
  it('৪. রু → iæ  ৭. দ্রু → `ªæ', () => {
    expect(toBijoy('দ্রু')).toBe('`ªæ');
    expect(toBijoy('দ্রুত')).toBe('`ªæZ');
    expect(toUnicode('`ªæZ')).toBe('দ্রুত');
    expect(toUnicode('`ª“Z')).toBe('দ্রুত'); // older files
    expect(toBijoy('রু')).toBe('iæ');
    expect(toBijoy('রুজু')).toBe('iæRy');
  });
  it('৫. ে-কার: † only at the start of a word, ‡ inside', () => {
    expect(toBijoy('দেশে')).toBe('†`‡k');
    expect(toBijoy('কেরানীগঞ্জে')).toBe('†KivbxM‡Ä');
    // a word split by formatting (bold, colour): the second part continues the word
    expect(toBijoy('শে', 'দে')).toBe('‡k');
    expect(toBijoy(' শে', 'দে')).toBe(' †k');
    expect(bijoyRuns('শে কথা', 'দে')[0].text).toBe('‡k K_v');
  });
  it('৬. converting back and again changes nothing', () => {
    for (const b of ['`ªæZ', '¯Í', 'šÍ', 'iæ', 'Ò†`‡kÓ', 'Ôn¨vuÕ', '†`‡k', 'gv¯Ívb', '¯‘', 'š‘']) expect(toBijoy(toUnicode(b)), b).toBe(b);
    expect(toUnicode('Ò†`‡kÓ')).toBe('“দেশে”');
    // older files with the — form still read correctly
    expect(toUnicode('¯—')).toBe('স্ত');
    expect(toUnicode('i“')).toBe('রু');
  });
});
