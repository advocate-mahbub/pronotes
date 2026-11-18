import builtin from './builtin-layouts.json';
import approvedUniBijoy from './approved-unibijoy.json';
import type { KmxKeyboard } from './kmx';

/**
 * A layout maps a physical key code to its characters:
 * [Normal, Shift, AltGr, Shift+AltGr]. Trailing empty layers may be omitted.
 * Numpad keys have a single entry.
 */
export type LayoutMap = Record<string, string[]>;

export interface Layout {
  id: string;
  name: string;
  dev: string;
  /** For a Keyman keyboard with rules: what each key types on its own (on-screen keyboard labels). */
  map: LayoutMap;
  /** Where the layout came from (added by the user). */
  format?: 'avro' | 'openbangla' | 'kmx';
  /** Keyman keyboard with context rules: typing runs these rules instead of the map. */
  kmx?: KmxKeyboard;
}

/**
 * The zip contains the historical v8 catalogue for compatibility with old
 * golden files, but it must never be exposed as the application's catalogue.
 * The public catalogue below is deliberately restricted to the four approved
 * layouts.  The positional Bijoy map is the repository's verified National
 * fixed-map source; it is exposed under the user-facing Bijoy Classic name.
 */
const legacy = builtin as Layout[];
const fixed = legacy.find((l) => l.id === 'national') ?? legacy[0];
const bornona = legacy.find((l) => l.id === 'bornona') ?? fixed;
export const BUILTIN_LAYOUTS: Layout[] = [
  { ...fixed, id: 'bijoy-classic', name: 'Bijoy Classic', dev: 'Ananda Computers' },
  approvedUniBijoy as Layout,
];
/**
 * Anna-ganda signs on the AltGr layer of the number row (the owner's choice, decisions.md 72): the key's
 * digit gives that value — 1–4 are Unicode's own signs (৴ ৵ ৶ ৷), 5–9 are written by adding (৷৴ = 4+1),
 * 0 = ৹, - = ৸, = = ১৲ (16 annas, the whole), ` = ৻ (ganda).
 */
export const ANNA_ALT: Record<string, string> = {
  Backquote: '\u09FB', Digit1: '\u09F4', Digit2: '\u09F5', Digit3: '\u09F6', Digit4: '\u09F7',
  Digit5: '\u09F7\u09F4', Digit6: '\u09F7\u09F5', Digit7: '\u09F7\u09F6', Digit8: '\u09F7\u09F7', Digit9: '\u09F7\u09F7\u09F4',
  Digit0: '\u09F9', Minus: '\u09F8', Equal: '\u09E7\u09F2',
};
export const PRONOTES_LAYOUT_ID = 'pronotes';
export const PRO_NOTES_LAYOUT: Layout = (() => {
  const base = bornona;
  const map = Object.fromEntries(Object.entries(base.map).map(([code, chars]) => [code, [...chars]]));
  map.Backquote = ['ৱ', 'ৰ'];
  map.Backslash = ['\u200c', '~'];
  for (const [code, sign] of Object.entries(ANNA_ALT)) map[code] = [map[code][0] ?? '', map[code][1] ?? '', sign];
  return { ...base, id: PRONOTES_LAYOUT_ID, name: 'ProNotes', map };
})();
export const PRO_NOTES_PHONETIC_LAYOUT: Layout = {
  ...PRO_NOTES_LAYOUT,
  id: 'pronotes-phonetic',
  name: 'ProNotes Phonetic',
  dev: 'ProNotes',
};
export function availableLayouts(custom: Layout[] = []): Layout[] {
  return [PRO_NOTES_LAYOUT, PRO_NOTES_PHONETIC_LAYOUT, ...BUILTIN_LAYOUTS, ...custom]
    .filter((l, i, all) => all.findIndex((x) => x.id === l.id) === i);
}

export function findLayout(id: string, custom: Layout[] = []): Layout {
  // the historical v8 layouts (e.g. a stored "bornona") stay readable, but are never offered in the layout box
  return [PRO_NOTES_LAYOUT, PRO_NOTES_PHONETIC_LAYOUT, ...BUILTIN_LAYOUTS, ...custom, ...legacy].find((l) => l.id === id) ?? PRO_NOTES_LAYOUT;
}

/** True when the layout has AltGr characters beyond the anna-ganda number row (phones then keep an Alt key). */
export function hasAltBeyondAnna(map: LayoutMap): boolean {
  return Object.entries(map).some(([c, v]) => !(c in ANNA_ALT) && v.length > 2 && Boolean(v[2] || v[3]));
}

/** True when the layout uses the AltGr layers (shows the AltGr key on the on-screen keyboard). */
export function hasAltLayer(map: LayoutMap): boolean {
  return Object.values(map).some((v) => v.length > 2 && Boolean(v[2] || v[3]));
}
