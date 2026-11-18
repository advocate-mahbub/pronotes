import { describe, it, expect } from 'vitest';
import { wordDeleteCount, doubleSpaceDari, keyAlternatives } from '../../src/app/kb-gestures';
import { ANNA_ALT, PRO_NOTES_LAYOUT, PHONE_SYMBOL_ROWS, charFor, resolveKey, hasAltBeyondAnna, findLayout } from '../../src/bornona-engine';

describe('keyboard gestures', () => {
  it('⌫ for a word: the spaces before it, then the word (Bangla marks are part of it)', () => {
    expect(wordDeleteCount('আমি কর্মস্থলে ')).toBe('কর্মস্থলে '.length);
    expect(wordDeleteCount('আমি যাব')).toBe('যাব'.length);
    expect(wordDeleteCount('শেষ।')).toBe(1); // a mark alone
    expect(wordDeleteCount('')).toBe(0);
  });
  it('two spaces make "। " only right after a word', () => {
    expect(doubleSpaceDari('আমি ')).toBe(true);
    expect(doubleSpaceDari('আমি। ')).toBe(false);
    expect(doubleSpaceDari('  ')).toBe(false);
    expect(doubleSpaceDari(' ')).toBe(false);
  });
  it('long-press offers the key’s other characters, the current one first', () => {
    const m = PRO_NOTES_LAYOUT.map;
    const o = keyAlternatives(m, 'Digit5', true, false);
    expect(o[0]).toBe(m.Digit5[0]);
    expect(o).toContain('৷৴'); // ৷৴
    expect(new Set(o).size).toBe(o.length);
  });
});

describe('anna-ganda signs on the ProNotes layout', () => {
  const m = PRO_NOTES_LAYOUT.map;
  it('Alt + number row = the owner’s table', () => {
    const got = Object.fromEntries(Object.keys(ANNA_ALT).map((c) => [c, charFor(m, c, false, true)]));
    expect(got).toEqual({ Backquote: '৻', Digit1: '৴', Digit2: '৵', Digit3: '৶', Digit4: '৷', Digit5: '৷৴', Digit6: '৷৵', Digit7: '৷৶', Digit8: '৷৷', Digit9: '৷৷৴', Digit0: '৹', Minus: '৸', Equal: '১৲' });
    // the plain and Shift characters did not move
    expect(charFor(m, 'Digit1', false)).toBe('১');
    expect(charFor(m, 'Backquote', false)).toBe('ৱ');
    expect(findLayout('pronotes-phonetic').map.Digit9[2]).toBe('৷৷৴');
  });
  it('phones: the symbol layer’s number row is the Alt characters; the letters layer keeps no Alt key', () => {
    expect(PHONE_SYMBOL_ROWS[0].every((c) => c.startsWith('Alt+'))).toBe(true);
    expect(PHONE_SYMBOL_ROWS[1]).toContain('Alt+Equal');
    expect(hasAltBeyondAnna(m)).toBe(false);
    expect(hasAltBeyondAnna(findLayout('bijoy-classic').map)).toBe(true);
  });
  it('AltGr (Windows) and Option (Mac/iPad) type the sign; left Ctrl+Alt is left for Heading 1', () => {
    const state = { map: m, bangla: true, suspended: false, toggleKey: 'ctrl+space' } as Parameters<typeof resolveKey>[1];
    const k = (o: Partial<Parameters<typeof resolveKey>[0]>) => resolveKey({ code: 'Digit1', key: '1', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, ...o }, state);
    expect(k({ altKey: true, ctrlKey: true, altGraph: true })).toEqual({ kind: 'type', code: 'Digit1', text: '৴' });
    expect(k({ altKey: true })).toEqual({ kind: 'type', code: 'Digit1', text: '৴' });
    expect(k({ altKey: true, ctrlKey: true })).toBeNull();
  });
});
