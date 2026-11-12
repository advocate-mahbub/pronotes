import { describe, it, expect } from 'vitest';
import { BUILTIN_LAYOUTS, PRO_NOTES_LAYOUT, PRO_NOTES_PHONETIC_LAYOUT, findLayout, hasAltLayer, resolveKey, charFor, planType, fixNukta, parseAvroLayout, resolveTypedChar } from '../../src/bornona-engine';
import { typeSequence } from './sim';

describe('layouts', () => {
  it('exposes exactly the approved four layouts', () => {
    expect([PRO_NOTES_LAYOUT, PRO_NOTES_PHONETIC_LAYOUT, ...BUILTIN_LAYOUTS].map((l) => l.id)).toEqual(['pronotes', 'pronotes-phonetic', 'bijoy-classic', 'unibijoy']);
  });
  it('AltGr layer detection', () => {
    expect(hasAltLayer(PRO_NOTES_LAYOUT.map)).toBe(false);
    expect(hasAltLayer(findLayout('unibijoy').map)).toBe(true);
  });
});

describe('engine details', () => {
  const bornona = PRO_NOTES_LAYOUT.map;
  it('ক → Shift+F → ম = কর্ম (exact code points)', () => {
    const out = typeSequence(['KeyK', 'Shift+KeyF', 'KeyM'], bornona, { bangla: true, vowelForming: true, oldReph: false });
    expect([...out].map((c) => c.codePointAt(0)!.toString(16))).toEqual(['995', '9b0', '9cd', '9ae']);
  });
  it('numpad digits type Bangla digits when NumLock is on', () => {
    const a = resolveKey({ code: 'Numpad5', key: '5', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }, { bangla: true, map: bornona });
    expect(a).toEqual({ kind: 'type', code: 'Numpad5', text: '৫' });
  });
  it('Ctrl+Space toggles the language; English mode passes keys through', () => {
    expect(resolveKey({ code: 'Space', key: ' ', shiftKey: false, altKey: false, ctrlKey: true, metaKey: false }, { bangla: true, map: bornona })).toEqual({ kind: 'toggle-language' });
    expect(resolveKey({ code: 'KeyK', key: 'k', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }, { bangla: false, map: bornona })).toBeNull();
    expect(charFor(bornona, 'KeyK', true, false, false)).toBe('K');
  });
  it('iPad keyboards without event.code fall back to event.key', () => {
    expect(resolveKey({ code: '', key: 'K', shiftKey: true, altKey: false, ctrlKey: false, metaKey: false }, { bangla: true, map: bornona })).toEqual({ kind: 'type', code: 'KeyK', text: 'খ' });
    expect(resolveTypedChar('k', { bangla: true, map: bornona })).toBe('ক');
  });
  it('Cmd shortcuts are never captured', () => {
    expect(resolveKey({ code: 'KeyB', key: 'b', shiftKey: false, altKey: false, ctrlKey: false, metaKey: true }, { bangla: true, map: bornona })).toBeNull();
  });
  it('no vowel forming inside a selection', () => {
    expect(planType('ক', false, 'ি', { bangla: true, vowelForming: true, oldReph: false })).toEqual({ deleteBefore: 0, text: 'ি' });
  });
});

describe('normalisation', () => {
  it('decomposed nukta letters become single code points; NFC is not used', () => {
    expect(fixNukta('য়ড়ঢ়')).toBe('য়ড়ঢ়');
    // documents why NFC is forbidden
    expect('য়'.normalize('NFC')).toBe('য়');
  });
});

describe('.avrolayout import', () => {
  const xml = (extra = '') => {
    const keys = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U'];
    return '<?xml version="1.0"?><Layout><LayoutName><![CDATA[Test Layout]]></LayoutName><DeveloperName><![CDATA[Me]]></DeveloperName><KeyData>' +
      keys.map((k) => `<Key_${k}_Normal><![CDATA[ক]]></Key_${k}_Normal><Key_${k}_Shift><![CDATA[য়]]></Key_${k}_Shift>`).join('') +
      '<Key_OEM7_Normal><![CDATA[&apos;]]></Key_OEM7_Normal><Key_A_AltGr><![CDATA[ই]]></Key_A_AltGr><Num1><![CDATA[১]]></Num1>' + extra + '</KeyData></Layout>';
  };
  it('parses keys, layers, entities, numpad and normalises nukta', () => {
    const L = parseAvroLayout(xml());
    expect(L.name).toBe('Test Layout');
    expect(L.map.KeyA).toEqual(['ক', 'য়', 'ই', '']);
    expect(L.map.Quote[0]).toBe("'");
    expect(L.map.Numpad1).toEqual(['১']);
  });
  it('rejects files without key data', () => {
    expect(() => parseAvroLayout('<Layout></Layout>')).toThrow();
  });
});

describe('v2: switch key and chandrabindu fix', () => {
  const k = (code: string, key: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) => ({
    code, key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods,
  });
  it('the chosen key switches the language; the others type normally', () => {
    const st = { bangla: true, map: BUILTIN_LAYOUTS[0].map };
    expect(resolveKey(k('Space', ' ', { ctrlKey: true }), st)).toEqual({ kind: 'toggle-language' });
    expect(resolveKey(k('F12', 'F12'), { ...st, toggleKey: 'f12' })).toEqual({ kind: 'toggle-language' });
    expect(resolveKey(k('Space', ' ', { ctrlKey: true }), { ...st, toggleKey: 'f12' })).toBeNull();
    expect(resolveKey(k('KeyM', 'm', { ctrlKey: true }), { ...st, toggleKey: 'ctrl+m' })).toEqual({ kind: 'toggle-language' });
    expect(resolveKey(k('Backquote', '`', { ctrlKey: true }), { ...st, toggleKey: 'ctrl+backquote' })).toEqual({ kind: 'toggle-language' });
    expect(resolveKey(k('Space', ' ', { altKey: true }), { ...st, toggleKey: 'alt+space' })).toEqual({ kind: 'toggle-language' });
    // works in English mode too, so you can switch back
    expect(resolveKey(k('F12', 'F12'), { ...st, bangla: false, toggleKey: 'f12' })).toEqual({ kind: 'toggle-language' });
  });
  it('ঁ typed before a kar moves after it when the fix is on', () => {
    const o = { bangla: true, vowelForming: true, oldReph: false, fixChandra: true };
    const ca = String.fromCharCode(0x0981);
    expect(planType('ক' + ca, true, 'া', o)).toEqual({ deleteBefore: 1, text: 'া' + ca });
    expect(planType('চ' + ca, true, 'ি', o)).toEqual({ deleteBefore: 1, text: 'ি' + ca });
    // off: unchanged (v8 behaviour, and vowel forming applies after ঁ)
    expect(planType('ক' + ca, true, 'া', { ...o, fixChandra: false })).toEqual({ deleteBefore: 0, text: 'আ' });
    // ঁ after a full vowel is left alone
    expect(planType('আ' + ca, true, 'া', o).deleteBefore).toBe(0);
  });
});
