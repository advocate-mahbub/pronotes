/**
 * Fonts: the user's own font files (stored in IndexedDB, registered with FontFace),
 * and detection of fonts installed on the computer. Ported from v8 (`installed`, `registerFont`).
 */
import type { StoredFont } from '../storage';

export * from './font-file';
import { readFontStyle } from './font-file';

/** Unicode Bangla fonts commonly installed on Bangladeshi computers (v8 LOCAL_UNI, legal-drafting ones first). */
export const LOCAL_UNI = [
  'SutonnyOMJ', 'Nikosh', 'Kalpurush', 'SolaimanLipi', 'Siyam Rupali', 'Mukti', 'AdorshoLipi', 'Kohinoor Bangla',
  'Bangla Sangam MN', 'Vrinda', 'Nirmala UI',
];
/**
 * Bijoy (ANSI) fonts looked for on the device (v8 LOCAL_ANSI, extended). Names only: these fonts belong to
 * their makers (Bijoy/Ananda Computers and others) and are never shipped with ProNotes; a font shows up
 * when it is installed on the computer or added by the user in Settings → ফন্ট.
 */
export const LOCAL_ANSI = [
  'SutonnyMJ', 'SutonnyEMJ', 'SutonnyCMJ', 'SutonnySushreeMJ', 'SulekhaT', 'SulekhaMJ',
  'AtraiMJ', 'BhagirathiMJ', 'BrahmaputraMJ', 'BuriagangaMJ', 'ChandrabatiMJ', 'DhanshirhiMJ', 'GoomtiMJ',
  'JamunaMJ', 'KarnaphuliMJ', 'MeghnaMJ', 'PadmaMJ', 'RupshaMJ', 'SurmaMJ', 'TistaMJ', 'TitasMJ',
];

/** Bangla names people type when looking for a font (search in the font list). */
export const FONT_ALIASES: Record<string, string> = {
  সুতন্নী: 'sutonny', সুতনী: 'sutonny', নিকোশ: 'nikosh', কালপুরুষ: 'kalpurush', সোলায়মান: 'solaiman', সিয়াম: 'siyam',
  রূপালী: 'rupali', মুক্তি: 'mukti', আদর্শ: 'adorsho', কোহিনূর: 'kohinoor', নোটো: 'noto', হিন্দ: 'hind', সুলেখা: 'sulekha',
  আত্রাই: 'atrai', ভাগীরথী: 'bhagirathi', ব্রহ্মপুত্র: 'brahmaputra', বুড়িগঙ্গা: 'buriganga', চন্দ্রাবতী: 'chandrabati',
  ধানসিঁড়ি: 'dhanshirhi', গোমতী: 'goomti', যমুনা: 'jamuna', কর্ণফুলী: 'karnaphuli', মেঘনা: 'meghna', পদ্মা: 'padma',
  রূপসা: 'rupsha', সুরমা: 'surma', তিস্তা: 'tista', তিতাস: 'titas', বিজয়: 'mj', ইউনিকোড: 'unicode',
};

/** Does a font name match what was typed in the font search (English or Bangla, spaces ignored)? */
export function fontMatches(name: string, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return true;
  const n = name.toLowerCase().replace(/\s+/g, '');
  if (n.includes(q)) return true;
  return Object.entries(FONT_ALIASES).some(([bn, en]) => bn.startsWith(query.trim()) || query.trim().startsWith(bn) ? n.includes(en) : false);
}
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
export async function registerFont(f: Pick<StoredFont, 'id' | 'family' | 'data'> & { fileName?: string }): Promise<void> {
  // each file keeps its own style, so a "SutonnyMJ Italic" file never draws normal SutonnyMJ text
  const st = readFontStyle(f.data, f.fileName);
  const face = new FontFace(f.family, f.data, { style: st.style, weight: String(st.weight) });
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
