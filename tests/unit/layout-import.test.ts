import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  parseKMX, kmxProcess, ctxText, kmxIsSimple, kmxKeyLabels, newRunState, parseOpenBanglaLayout, BUILTIN_LAYOUTS,
  type CtxItem, type KmxKeyboard,
} from '../../src/bornona-engine';
import { rulesStep, rulesKeyFromEvent, rulesKeyForChar, type RulesSession } from '../../src/editor/rules-typing';
import { readLayoutFile } from '../../src/app/layout-files';
import { toBijoy } from '../../src/bijoy';
import legacyLayouts from '../../src/bornona-engine/builtin-layouts.json';
import type { Layout } from '../../src/bornona-engine';

const FIX = path.join(__dirname, '../fixtures/kmx');
const bytes = (f: string) => {
  const b = readFileSync(path.join(FIX, f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const code4 = (v: string[]) => (v.length === 1 ? 1 : 4);
const NUKTA = /[যডঢ]়/;

/** Type keys from an empty context; returns the visible text (or the raw context). */
function typeKeys(kb: KmxKeyboard, keys: string, start: CtxItem[] = [], st = newRunState()) {
  let ctx = start;
  for (const t of keys.split(' ')) {
    const [code, mod = ''] = t.split('+');
    const r = kmxProcess(kb, ctx, { code, shift: mod.includes('S'), alt: mod.includes('A') }, st);
    ctx = r.handled ? r.ctx : [...ctx, '<pass>'];
  }
  return ctx;
}

describe('Keyman .kmx', () => {
  const test = parseKMX(bytes('pn_test.kmx'));

  it('reads the header, stores and groups of a compiled keyboard', () => {
    expect(test.name).toBe('PN Test');
    expect(test.copyright).toBe('© Test');
    expect(test.enc).toBe('unicode');
    expect(test.groups.map((g) => g.keys)).toEqual([true, false]);
    expect(kmxIsSimple(test)).toBe(false);
  });

  it('rejects other files', () => {
    expect(() => parseKMX(new TextEncoder().encode('not a keyboard at all, just some text here!!!!!!!!!!!!!!!!!!!!!!!').buffer as ArrayBuffer)).toThrow();
    expect(() => parseKMX(new ArrayBuffer(10))).toThrow();
  });

  it('runs rules like Keyman: index(), deadkeys, nul, options, context, RALT, use() group', () => {
    const st = newRunState();
    expect(ctxText(typeKeys(test, 'KeyK KeyA', [], st))).toBe('কা');
    // deadkey: f then k → কি (ই-কার typed first, Bijoy style); the deadkey alone is invisible
    expect(ctxText(typeKeys(test, 'KeyF KeyK', [], st))).toBe('কি');
    expect(typeKeys(test, 'KeyF', [], st)).toEqual([{ dk: 0 }]);
    // nul: only at the start of the text
    expect(ctxText(typeKeys(test, 'KeyQ', [], st))).toBe('শুরু');
    expect(ctxText(typeKeys(test, 'KeyQ', ['x'], st))).toBe('xক্যু');
    // option: z works until Shift+Z turns it off
    expect(ctxText(typeKeys(test, 'KeyZ', [], st))).toBe('ON');
    expect(ctxText(typeKeys(test, 'KeyZ+S KeyZ', [], st))).toBe('z');
    // any(cons) + x > context ্ index(cons, 1)
    expect(ctxText(typeKeys(test, 'KeyG KeyX', [], newRunState()))).toBe('গ্গ');
    expect(ctxText(typeKeys(test, 'KeyK+A', [], newRunState()))).toBe('ৎ');
    expect(ctxText(typeKeys(test, 'KeyM', [], newRunState()))).toBe('মা');
  });

  it('Backspace: own rule, else deadkeys and one letter, else the editor', () => {
    const st = newRunState();
    expect(ctxText(typeKeys(test, 'KeyF KeyK Backspace', [], st))).toBe('ক');
    expect(typeKeys(test, 'KeyF Backspace', ['ক'], st)).toEqual([]);
    expect(typeKeys(test, 'Backspace', [], st)).toEqual(['<pass>']);
  });

  it('AltGr on a key without a rule types nothing; other keys type their English letter', () => {
    expect(kmxProcess(test, [], { code: 'KeyB', shift: false, alt: true }).handled).toBe(false);
    expect(ctxText(typeKeys(test, 'KeyB'))).toBe('b');
  });

  it('a "one key, one text" keyboard becomes a plain layout map (Bangla Probhat from Keyman = built-in Probhat)', () => {
    const kb = parseKMX(bytes('bangla_probhat.kmx'));
    expect(kmxIsSimple(kb)).toBe(true);
    const map = kmxKeyLabels(kb);
    const builtinProbhat = BUILTIN_LAYOUTS.find((l) => l.id === 'probhat');
    expect(builtinProbhat, 'the built-in catalogue must retain the Probhat layout').toBeDefined();
    const ours = builtinProbhat!.map;
    for (const code of ['KeyK', 'KeyA', 'KeyZ', 'KeyR', 'Digit1', 'Slash']) expect(map[code][0], code).toBe(ours[code][0]);
    expect(map.KeyZ[0]).toBe('য়'); // য় precomposed
    expect(map.KeyR[1]).toBe('ড়');
    for (const v of Object.values(map)) expect(v.join('')).not.toMatch(NUKTA);
  });

  it('reports what it does not run (Ctrl rules)', () => {
    const kb = parseKMX(bytes('basic_kbdinben.kmx'));
    expect(kb.unsupported).toContain('Ctrl দিয়ে লেখার রুল');
    expect(kmxIsSimple(kb)).toBe(false);
    // Shift+1 writes several letters at once
    expect(ctxText(typeKeys(kb, 'Digit1+S'))).toBe('অ্যা');
  });
});

describe('typing in the editor text (rulesStep)', () => {
  const kb = parseKMX(bytes('pn_test.kmx'));
  const run = (keys: string, start = '') => {
    let text = start;
    let s: RulesSession | undefined;
    const st = newRunState();
    for (const c of keys.split(' ')) {
      const r = rulesStep(kb, { code: c, shift: false, alt: false }, text, text.length, s, false, st);
      if (!r) return { text: text + '<pass>' };
      text = text.slice(0, text.length - r.del) + r.text;
      s = r.session;
    }
    return { text, s };
  };

  it('keeps the deadkey between keys while the caret stays', () => {
    expect(run('KeyF KeyK', 'আমি ').text).toBe('আমি কি');
  });
  it('rewrites only the changed end (one small edit)', () => {
    const r = rulesStep(kb, { code: 'KeyX', shift: false, alt: false }, 'আমি গ', 5, undefined, false);
    expect(r).toMatchObject({ del: 0, text: '্গ' });
  });
  it('the caret moved: the old deadkey is forgotten', () => {
    const st = newRunState();
    const a = rulesStep(kb, { code: 'KeyF', shift: false, alt: false }, 'ক', 1, undefined, false, st)!;
    const b = rulesStep(kb, { code: 'KeyK', shift: false, alt: false }, 'ক খ', 3, a.session, false, st)!;
    expect(b.text).toBe('ক');
  });
  it('a Bijoy keyboard in a Unicode document: rules see Bijoy, the document gets Unicode', () => {
    // a tiny Bijoy keyboard: k → K (ক in SutonnyMJ), f → ‡ (এ-কার, typed before the consonant)
    const bj: KmxKeyboard = {
      v: 1, name: 'BJ', copyright: '', version: '', enc: 'ansi', start: 0, stores: [], unsupported: [],
      groups: [{ name: 'main', keys: true, match: null, nomatch: null, rules: [
        { key: 'k'.charCodeAt(0), vk: false, flags: 0, ctx: [], out: ['K'] },
        { key: 'f'.charCodeAt(0), vk: false, flags: 0, ctx: [], out: ['‡'] },
      ] }],
    };
    let text = '';
    let s: RulesSession | undefined;
    for (const ch of 'fk') {
      const r = rulesStep(bj, rulesKeyForChar(ch)!, text, text.length, s, false)!;
      text = text.slice(0, text.length - r.del) + r.text;
      s = r.session;
    }
    expect(text).toBe('কে');
    expect(text).not.toMatch(/[‡K]/);
    expect(toBijoy(text)).toMatch(/K$/);
  });
});

describe('keys from events and touch keyboards', () => {
  const ev = (code: string, key: string, mods: Partial<Record<'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey', boolean>> = {}) =>
    ({ code, key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods });
  it('maps codes, shifted letters, and devices that send no code', () => {
    expect(rulesKeyFromEvent(ev('KeyA', 'A', { shiftKey: true }))).toEqual({ code: 'KeyA', shift: true, alt: false });
    expect(rulesKeyFromEvent(ev('', 'k'))).toEqual({ code: 'KeyK', shift: false, alt: false });
    expect(rulesKeyFromEvent(ev('Space', ' '))).toMatchObject({ code: 'Space' });
    expect(rulesKeyFromEvent(ev('KeyC', 'c', { ctrlKey: true }))).toBeNull();
    expect(rulesKeyFromEvent(ev('KeyC', 'c', { metaKey: true }))).toBeNull();
    expect(rulesKeyFromEvent(ev('ArrowLeft', 'ArrowLeft'))).toBeNull();
    expect(rulesKeyForChar('?')).toEqual({ code: 'Slash', shift: true, alt: false });
  });
});

describe('OpenBangla .json', () => {
  // the same shape as OpenBangla Keyboard's data/*.json ("fixed", version 2), with the keys of Probhat
  const probhat = (legacyLayouts as Layout[]).find((l) => l.id === 'probhat')!;
  const name: Record<string, string> = { '`': 'Grave', '~': 'Tilde', '!': 'Exclaim', '@': 'At', '#': 'Hash', $: 'Dollar', '%': 'Percent', '^': 'Circum', '&': 'Ampersand', '*': 'Asterisk', '(': 'ParenLeft', ')': 'ParenRight', '-': 'Minus', _: 'UnderScore', '=': 'Equals', '+': 'Plus', '[': 'BracketLeft', ']': 'BracketRight', '{': 'BraceLeft', '}': 'BraceRight', '\\': 'BackSlash', '|': 'Bar', ';': 'Semicolon', ':': 'Colon', "'": 'Apostrophe', '"': 'Quote', ',': 'Comma', '<': 'Less', '.': 'Period', '>': 'Greater', '/': 'Slash', '?': 'Question' };
  const US: Record<string, string> = { Backquote: '`~', Digit1: '1!', Digit2: '2@', Digit3: '3#', Digit4: '4$', Digit5: '5%', Digit6: '6^', Digit7: '7&', Digit8: '8*', Digit9: '9(', Digit0: '0)', Minus: '-_', Equal: '=+', BracketLeft: '[{', BracketRight: ']}', Backslash: '\\|', Semicolon: ';:', Quote: '\'"', Comma: ',<', Period: '.>', Slash: '/?' };
  const layout: Record<string, string> = {};
  for (const [code, v] of Object.entries(probhat.map)) {
    if (code.startsWith('Numpad')) {
      layout['Num' + code.slice(6)] = v[0];
      continue;
    }
    const pair = US[code] ?? code.slice(3).toLowerCase() + code.slice(3);
    [pair[0], pair[1]].forEach((ch, i) => {
      layout[`Key_${name[ch] ?? ch}_Normal`] = v[i] ?? '';
      layout[`Key_${name[ch] ?? ch}_AltGr`] = v[i + 2] ?? '';
    });
  }
  const file = JSON.stringify({ info: { layout: { name: 'Probhat', version: '1.0', developer: { name: 'Shabab Mustafa' } }, type: 'fixed', version: '2' }, layout });

  it('reads every key and layer (same map as the built-in Probhat)', () => {
    const L = parseOpenBanglaLayout(file);
    expect(L.name).toBe('Probhat');
    expect(L.dev).toBe('Shabab Mustafa');
    const pad = (v: string[] = []) => [...v, '', '', ''].slice(0, code4(v)).join('|');
    for (const [code, v] of Object.entries(probhat.map)) expect(pad(L.map[code]), code).toBe(pad(v));
  });
  it('refuses phonetic layouts and other JSON', () => {
    expect(() => parseOpenBanglaLayout(JSON.stringify({ info: { type: 'phonetic' }, layout: {} }))).toThrow();
    expect(() => parseOpenBanglaLayout('{"a":1}')).toThrow();
    expect(() => parseOpenBanglaLayout('nope')).toThrow();
  });

  it('readLayoutFile tells the kind by content, not by name', async () => {
    const asFile = (data: BlobPart, nameOf: string) => new File([data], nameOf);
    expect((await readLayoutFile(asFile(file, 'x.txt')))[0]).toMatchObject({ name: 'Probhat', format: 'openbangla' });
    const k = await readLayoutFile(asFile(bytes('pn_test.kmx'), 'any-name'));
    expect(k[0]).toMatchObject({ name: 'PN Test', format: 'kmx' });
    expect(k[0].kmx).toBeTruthy();
    const simple = await readLayoutFile(asFile(bytes('bangla_probhat.kmx'), 'p.kmx'));
    expect(simple[0].kmx).toBeUndefined();
    await expect(readLayoutFile(asFile('<Layout/>', 'x.avrolayout'))).rejects.toThrow('পড়া গেল না');
  });

  it('a .kmp package (zip) gives every .kmx inside it', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('kmp.json', '{}');
    zip.file('pn_test.kmx', bytes('pn_test.kmx'));
    zip.file('bangla_probhat.kmx', bytes('bangla_probhat.kmx'));
    const data = await zip.generateAsync({ type: 'arraybuffer' });
    const got = await readLayoutFile(new File([data], 'pack.kmp'));
    expect(got.map((l) => l.name).sort()).toEqual(['Bangla Probhat', 'PN Test']);
    const empty = new JSZip();
    empty.file('a.js', '');
    await expect(readLayoutFile(new File([await empty.generateAsync({ type: 'arraybuffer' })], 'e.kmp'))).rejects.toThrow('.kmx');
  });
});
