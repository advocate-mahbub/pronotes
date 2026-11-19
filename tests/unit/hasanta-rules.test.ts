import { describe, it, expect } from 'vitest';
import { planInsert, applyEdit, type TypeOptions } from '../../src/bornona-engine';
import { loupeText } from '../../src/app/CaretOverlay';

// decisions.md 76: ্ then a kar = the full vowel; ্্ = fixed hasanta (্ + ZWNJ); a third ্ does nothing
const on: TypeOptions = { bangla: true, vowelForming: true, oldReph: false, hasantaRules: true };
const typeAll = (keys: string[], opts = on) => keys.reduce((v, k) => applyEdit(v, v.length, planInsert(v, true, k, opts)).value, '');

describe('ProNotes hasanta rules', () => {
  it('্ + kar after a consonant gives the vowel, not the kar (কই, not কি)', () => {
    expect(typeAll(['ক', '্', 'ি'])).toBe('কই');
    expect(typeAll(['ব', '্', 'ু'])).toBe('বউ');
    expect(typeAll(['খ', 'া', '্', 'ি'])).toBe('খাই');
    expect(typeAll(['ন', 'া', '্', 'ে', 'া'])).toBe('নাও'); // ো typed in two steps
    for (const [kar, vowel] of [['া', 'আ'], ['ী', 'ঈ'], ['ূ', 'ঊ'], ['ৃ', 'ঋ'], ['ৈ', 'ঐ'], ['ো', 'ও'], ['ৌ', 'ঔ']])
      expect(typeAll(['ক', '্', kar])).toBe('ক' + vowel);
  });
  it('্্ makes a fixed hasanta that joins nothing: বল্‌বো', () => {
    expect(typeAll(['ব', 'ল', '্', '্', 'ব', 'ো'])).toBe('বল্‌বো');
    expect(typeAll(['ব', 'ল', '্', '্', '্'])).toBe('বল্‌'); // the third does nothing
  });
  it('one ্ still makes a conjunct', () => {
    expect(typeAll(['ক', '্', 'ষ'])).toBe('ক্ষ');
  });
  it('other layouts are untouched', () => {
    const off = { ...on, hasantaRules: false };
    expect(typeAll(['ক', '্', 'ি'], off)).toBe('ক্ি');
    expect(typeAll(['ক', '্', '্'], off)).toBe('ক্্');
  });
});

describe('loupe text', () => {
  it('takes a few letters each side and never starts with a loose kar', () => {
    expect(loupeText('আমি বল্‌বো যে', ' কাজটা')).toEqual(['বল্‌বো যে', ' কাজটা']);
    const [b] = loupeText('অনেক লম্বা একটা বাক্য যেখানে কিছু আছে', '', 12);
    expect(b.length).toBeLessThanOrEqual(12);
    expect(/^[া-্]/.test(b)).toBe(false);
  });
});
