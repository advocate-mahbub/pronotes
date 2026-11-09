import builtin from './builtin-layouts.json';

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

/** Bornona, National (Jatiya), Probhat, Munir Optima (uni), Avro Easy — identical to v8's BUILTIN_LAYOUTS. */
export const BUILTIN_LAYOUTS: Layout[] = builtin as Layout[];
export const PRONOTES_LAYOUT_ID = 'pronotes';
export const PRO_NOTES_LAYOUT: Layout = (() => {
  const base = BUILTIN_LAYOUTS.find((l) => l.id === 'bornona') ?? BUILTIN_LAYOUTS[0];
  const map = Object.fromEntries(Object.entries(base.map).map(([code, chars]) => [code, [...chars]]));
  map.Backquote = ['ৱ', 'ৰ'];
  map.Backslash = ['\u200c', '~'];
  return { ...base, id: PRONOTES_LAYOUT_ID, name: 'ProNotes', map };
})();
export function availableLayouts(custom: Layout[] = []): Layout[] {
  return [PRO_NOTES_LAYOUT, ...BUILTIN_LAYOUTS.filter((l) => l.id !== 'bornona'), ...custom]
    .filter((l, i, all) => all.findIndex((x) => x.id === l.id) === i);
}

export function findLayout(id: string, custom: Layout[] = []): Layout {
  return [PRO_NOTES_LAYOUT, ...BUILTIN_LAYOUTS, ...custom].find((l) => l.id === id) ?? PRO_NOTES_LAYOUT;
}

/** True when the layout uses the AltGr layers (shows the AltGr key on the on-screen keyboard). */
export function hasAltLayer(map: LayoutMap): boolean {
  return Object.values(map).some((v) => v.length > 2 && Boolean(v[2] || v[3]));
}
