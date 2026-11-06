/**
 * Fonts: the user's own font files (stored in IndexedDB, registered with FontFace),
 * and detection of fonts installed on the computer. Ported from v8 (`installed`, `registerFont`).
 */
import type { StoredFont } from '../storage';

export * from './font-file';

/** Unicode Bangla fonts commonly installed on Bangladeshi computers (v8 LOCAL_UNI, legal-drafting ones first). */
export const LOCAL_UNI = [
  'SutonnyOMJ', 'Nikosh', 'Kalpurush', 'SolaimanLipi', 'Siyam Rupali', 'Mukti', 'AdorshoLipi', 'Kohinoor Bangla',
  'Bangla Sangam MN', 'Vrinda', 'Nirmala UI',
];
/** Bijoy (ANSI) fonts (v8 LOCAL_ANSI). */
export const LOCAL_ANSI = ['SutonnyMJ', 'SutonnyEMJ', 'SulekhaT'];
/** Loaded by the app itself, always available. */
export const WEB_FONTS = ['Noto Serif Bengali', 'Noto Sans Bengali', 'Hind Siliguri'];
/** English fonts offered for the English parts of Bijoy text pasted into Word. */
export const ENGLISH_FONTS = ['Times New Roman', 'Arial', 'Calibri', 'Cambria', 'Georgia'];

/** True when the browser can draw `name` (installed or registered). v8 canvas width check. */
export function isFontAvailable(name: string, ansi = false): boolean {
  try {
    const c = document.createElement('canvas').getContext('2d');
    if (!c) return false;
    const s = ansi ? 'Avgvi †mvbvi evsjv mmmmwwwlli' : 'আমার সোনার বাংলা কর্ম ক্ষ mmmwwwlli';
    return ['monospace', 'serif', 'sans-serif'].some((f) => {
      c.font = '40px ' + f;
      const a = c.measureText(s).width;
      c.font = '40px "' + name + '",' + f;
      return c.measureText(s).width !== a;
    });
  } catch {
    return false;
  }
}

const registered = new Map<string, FontFace>();

/** Make an uploaded font usable under its family name. Throws when the file is not a font. */
export async function registerFont(f: Pick<StoredFont, 'id' | 'family' | 'data'>): Promise<void> {
  const face = new FontFace(f.family, f.data);
  await face.load();
  const old = registered.get(f.id);
  if (old) document.fonts.delete(old);
  document.fonts.add(face);
  registered.set(f.id, face);
}

export function unregisterFont(id: string): void {
  const face = registered.get(id);
  if (face) document.fonts.delete(face);
  registered.delete(id);
}

export const MAX_FONT_BYTES = 15 * 1024 * 1024;

/** CSS font-family value for a name. */
export const cssFamily = (name: string) => '"' + name.replace(/"/g, '') + '"';
