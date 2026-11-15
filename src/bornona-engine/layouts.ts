import builtin from './builtin-layouts.json';
import approvedUniBijoy from './approved-unibijoy.json';

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
  map: LayoutMap;
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
const probhat = legacy.find((l) => l.id === 'probhat');
if (!probhat) {
  throw new Error('Built-in layout catalogue is missing the required Probhat layout');
}

export const BUILTIN_LAYOUTS: Layout[] = [
  { ...fixed, id: 'bijoy-classic', name: 'Bijoy Classic', dev: 'Ananda Computers' },
  approvedUniBijoy as Layout,
  probhat,
];
export const PRONOTES_LAYOUT_ID = 'pronotes';
export const PRO_NOTES_LAYOUT: Layout = (() => {
  const base = bornona;
  const map = Object.fromEntries(Object.entries(base.map).map(([code, chars]) => [code, [...chars]]));
  map.Backquote = ['ৱ', 'ৰ'];
  map.Backslash = ['\u200c', '~'];
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
  return [PRO_NOTES_LAYOUT, PRO_NOTES_PHONETIC_LAYOUT, ...BUILTIN_LAYOUTS, ...custom].find((l) => l.id === id) ?? PRO_NOTES_LAYOUT;
}

/** True when the layout uses the AltGr layers (shows the AltGr key on the on-screen keyboard). */
export function hasAltLayer(map: LayoutMap): boolean {
  return Object.values(map).some((v) => v.length > 2 && Boolean(v[2] || v[3]));
}
