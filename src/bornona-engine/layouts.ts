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

export function findLayout(id: string, custom: Layout[] = []): Layout {
  return [...BUILTIN_LAYOUTS, ...custom].find((l) => l.id === id) ?? BUILTIN_LAYOUTS[0];
}

/** True when the layout uses the AltGr layers (shows the AltGr key on the on-screen keyboard). */
export function hasAltLayer(map: LayoutMap): boolean {
  return Object.values(map).some((v) => v.length > 2 && Boolean(v[2] || v[3]));
}
