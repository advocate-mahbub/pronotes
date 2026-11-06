import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { BUILTIN_LAYOUTS, findLayout, hasAltLayer, resolveKey, charFor, planType, fixNukta, parseAvroLayout, resolveTypedChar } from '../../src/bornona-engine';
import { typeSequence } from './sim';

const golden = (f: string) => JSON.parse(fs.readFileSync(new URL('../golden/' + f, import.meta.url), 'utf8'));
const OFF = { bangla: true, vowelForming: false, oldReph: false };
const LAYERS: [string, string][] = [['normal', ''], ['shift', 'Shift+'], ['alt', 'Alt+'], ['shiftAlt', 'Shift+Alt+']];

describe('layouts', () => {
  it('built-in layout data is identical to v8', () => {
    expect(BUILTIN_LAYOUTS).toEqual(golden('layouts.json'));
    expect(BUILTIN_LAYOUTS.map((l) => l.id)).toEqual(['bornona', 'national', 'probhat', 'munir', 'avroeasy']);
  });
  it('AltGr layer detection', () => {
    expect(hasAltLayer(findLayout('bornona').map)).toBe(false);
    expect(hasAltLayer(findLayout('avroeasy').map)).toBe(true);
  });
});

describe('every key, every layer, every layout matches v8', () => {
  const keys = golden('keys.json');
  for (const L of BUILTIN_LAYOUTS) {
    it(L.name, () => {
      let checked = 0;
      for (const code of Object.keys(keys[L.id])) {
        for (const [layer, mod] of LAYERS) {
          if (!(layer in keys[L.id][code])) continue;
          expect(typeSequence([mod + code], L.map, OFF), `${L.id} ${mod}${code}`).toBe(keys[L.id][code][layer]);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(190);
    });
  }
});

describe('key sequences (vowel forming, reph) match v8', () => {
  for (const s of golden('sequences.json')) {
    it(`${s.layout} vf=${s.vf} oldReph=${s.oldReph}: ${s.output}`, () => {
      expect(typeSequence(s.keys, findLayout(s.layout).map, { bangla: true, vowelForming: s.vf, oldReph: s.oldReph })).toBe(s.output);
    });
  }
});

describe('engine details', () => {
  const bornona = findLayout('bornona').map;
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
