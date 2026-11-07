import { describe, it, expect } from 'vitest';
import { numberInWords, amountInWords, groupDigits, parseAmount, toBnDigits, toEnDigits, fixBrokenBangla, countText, BN_0_99 } from '../../src/convert';

describe('amount in words', () => {
  it('Bangla words 0–99 are complete and unique', () => {
    expect(BN_0_99).toHaveLength(100);
    expect(new Set(BN_0_99).size).toBe(100);
  });
  it('Bangla: lakh, crore, hundreds', () => {
    expect(numberInWords(500000, 'bn')).toBe('পাঁচ লক্ষ');
    expect(numberInWords(2550, 'bn')).toBe('দুই হাজার পাঁচ শত পঞ্চাশ');
    expect(numberInWords(12345678, 'bn')).toBe('এক কোটি তেইশ লক্ষ পঁয়তাল্লিশ হাজার ছয় শত আটাত্তর');
    expect(numberInWords(1000000000, 'bn')).toBe('এক শত কোটি');
    expect(numberInWords(0, 'bn')).toBe('শূন্য');
    expect(numberInWords(88, 'bn')).toBe('অষ্টাশি');
  });
  it('English: lakh and crore', () => {
    expect(numberInWords(500000, 'en')).toBe('Five Lakh');
    expect(numberInWords(12345678, 'en')).toBe('One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight');
  });
  it('deed styles with figures', () => {
    expect(amountInWords('৫,০০,০০০', 'bn')).toEqual({ words: 'পাঁচ লক্ষ', withTaka: 'পাঁচ লক্ষ টাকা মাত্র', deedStyle: '৫,০০,০০০/- (পাঁচ লক্ষ) টাকা' });
    expect(amountInWords('1250.5', 'bn')!.withTaka).toBe('এক হাজার দুই শত পঞ্চাশ টাকা পঞ্চাশ পয়সা মাত্র');
    expect(amountInWords('500000', 'en')).toEqual({ words: 'Five Lakh', withTaka: 'Taka Five Lakh only', deedStyle: 'Tk. 5,00,000/- (Taka Five Lakh only)' });
    expect(amountInWords('abc', 'bn')).toBeNull();
  });
  it('grouping and parsing', () => {
    expect(groupDigits('12345678')).toBe('1,23,45,678');
    expect(groupDigits('999')).toBe('999');
    expect(parseAmount('Tk. 5,00,000/-')).toEqual({ taka: 500000, paisa: 0 });
    expect(parseAmount('৫০০.৭৫ টাকা')).toEqual({ taka: 500, paisa: 75 });
  });
});

describe('digits', () => {
  it('both ways, nothing else changed', () => {
    expect(toBnDigits('দাগ 123, খতিয়ান 45')).toBe('দাগ ১২৩, খতিয়ান ৪৫');
    expect(toEnDigits('দাগ ১২৩')).toBe('দাগ 123');
  });
});

describe('broken Bangla repair', () => {
  it('vowel signs typed before the consonant (PDF order) and ো/ৌ', () => {
    expect(fixBrokenBangla('েক িক ৈক').text).toBe('কে কি কৈ');
    expect(fixBrokenBangla('েকাট েমৗ').text).toBe('কোট মৌ');
    expect(fixBrokenBangla('িক্র').text).toBe('ক্রি');
  });
  it('correct text is left alone', () => {
    const ok = 'আদালতে মোকদ্দমা দায়ের করা হইল। কৌশলে';
    expect(fixBrokenBangla(ok)).toEqual({ text: ok, changes: [] });
  });
  it('nukta letters, zero-width spaces, অা, dari and spaces', () => {
    const r = fixBrokenBangla('জা' + 'য' + String.fromCharCode(0x09bc) + 'গা​ অাম  বাদী |', { pipeAsDari: true });
    expect(r.text).toBe('জায়গা আম বাদী।');
    expect(r.changes.length).toBeGreaterThanOrEqual(4);
  });
});

describe('count', () => {
  it('words, characters, paragraphs', () => {
    expect(countText('বাদী পক্ষ।\nদ্বিতীয় লাইন')).toEqual({ words: 4, chars: 22, charsNoSpace: 20, paragraphs: 2 });
  });
});
