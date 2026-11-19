import { describe, it, expect } from 'vitest';
import { findFraction, plainFraction, unFraction } from '../../src/editor/fraction';
import { ANNA_SIGNS, NUMPAD_ROWS, ANNA_PAD_ROWS, PHONE_ROWS } from '../../src/bornona-engine';
import { readFrac } from '../../src/chart/model';

describe('the ½ key', () => {
  it('finds the a/b just typed, with a whole number before it', () => {
    expect(findFraction('দাগের ১/২')).toEqual({ whole: '', num: '১', den: '২', length: 3 });
    expect(findFraction('২ ১/২')).toEqual({ whole: '২', num: '১', den: '২', length: 5 });
    expect(findFraction('১/০')).toBeNull();
    expect(findFraction('১/২ ')).toBeNull(); // only right before the caret
  });
  it('ready-made signs where Unicode has them, small digits where not', () => {
    expect(plainFraction(findFraction('১/২')!)).toBe('½');
    expect(plainFraction(findFraction('3/4')!)).toBe('¾');
    expect(plainFraction(findFraction('২ ১/২')!)).toBe('২½');
    expect(plainFraction(findFraction('৫/১৬')!)).toBe('⁵⁄₁₆');
  });
  it('the title chart reads every form back', () => {
    expect(unFraction('½')).toBe('1/2');
    expect(unFraction('⁵⁄₁₆')).toBe('5/16');
    expect(readFrac('¾')).toEqual(readFrac('৩/৪'));
    expect(readFrac('২½')).toEqual(readFrac('৫/২'));
    expect(readFrac('২ ১/২')).toEqual(readFrac('৫/২'));
  });
});

describe('anna signs: the owner’s table', () => {
  it('1–16 annas', () => {
    expect(ANNA_SIGNS.slice(1)).toEqual(['৴', '৵', '৶', '৷৹', '৷৴', '৷৵', '৷৶', '৷৷৹', '৷৷৴', '৷৷৵', '৷৷৶', '৸', '৸৴', '৸৵', '৸৶', '১৲']);
  });
  it('keypads: 6-column numpad with every sign; ৴৵৶ pad 4×4 of 1–16; no keypad key on the phone letters', () => {
    expect(NUMPAD_ROWS.slice(0, 5).every((r) => r.length === 6)).toBe(true);
    const signs = NUMPAD_ROWS.flat().filter((c) => c.startsWith('Txt:')).map((c) => c.slice(4));
    for (const x of ['<', '>', '≤', '≥', '≠', '±', '৳', '%', '=', '/', '(', ')', ':', '+', '-', '×', '÷']) expect(signs).toContain(x);
    expect(NUMPAD_ROWS.flat()).toContain('#Frac');
    expect(ANNA_PAD_ROWS.slice(0, 4).flat()).toEqual(Array.from({ length: 16 }, (_, i) => 'Anna:' + (i + 1)));
    expect(PHONE_ROWS.flat()).not.toContain('#Num');
  });
});
