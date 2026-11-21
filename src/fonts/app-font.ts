/**
 * The app's own fonts (decisions.md 80): one Bangla and one English font for menus, buttons and the keyboard
 * keys, chosen in Settings → অ্যাপ. Both become one family, "PN UI", split by Unicode range, so Bangla
 * letters always come from the Bangla font and English from the English one, whichever has more glyphs.
 * The document's own fonts are separate (Home → font box).
 */
import kalpurushUrl from '../assets/fonts/kalpurush.woff2?url';

export const APP_FONT_FAMILY = 'PN UI';
/** The default Bangla font of the app: ships with it (SIL OFL), so every device has it. */
export const DEFAULT_APP_BN = 'Kalpurush';
/** Empty = the device's own interface font. */
export const DEFAULT_APP_EN = '';
/**
 * bn/en: the fonts (decisions.md 80). bnScale/enScale: their letter size in % (size-adjust, so only the
 * letters grow, not the layout). kb/kbScale: the keyboard keys' Bangla font ('' = the app's Bangla font)
 * and its size (decisions.md 82).
 */
export interface AppFonts {
  bn: string; en: string; bnScale?: number; enScale?: number; kb?: string; kbScale?: number;
  /** The keys' English font ('' = the app's English font) and its size (decisions.md 88). */
  kbEn?: string; kbEnScale?: number;
}
export const KB_FONT_FAMILY = 'PN KB';
export const SCALE_MIN = 70;
export const SCALE_MAX = 150;
const scaleOf = (n: number | undefined) => Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(n || 100)));
/** The device's interface font cannot be named in local(); these stand in when only its size is changed. */
const DEVICE_EN = ['Helvetica Neue', 'Segoe UI', 'Roboto', 'Arial'];

/** Bangla letters, ।॥, ZWNJ/ZWJ and the dotted circle the keyboard shows under a kar. */
export const BN_RANGE = 'U+0964-0965, U+0980-09FF, U+200C-200D, U+25CC';
/** Latin, punctuation, digits and the common signs. */
export const EN_RANGE = 'U+0000-024F, U+2000-206F, U+20A0-20CF, U+2100-214F';

const q = (s: string) => '"' + s.replace(/["\\]/g, '') + '"';

/** Where the browser finds a font: the bundled file, a file the user added, or the device's installed font. */
export function fontSrc(name: string, ownUrl?: string): string {
  if (name === DEFAULT_APP_BN) return `url(${q(kalpurushUrl)}) format("woff2"), local(${q(name)})`;
  if (ownUrl) return `url(${q(ownUrl)})`;
  return `local(${q(name)})`;
}

/** The @font-face rules for "PN UI" (menus) and "PN KB" (keyboard keys). An empty side falls through to the next fonts. */
export function appFontCss(f: AppFonts, ownUrl: (name: string) => string | undefined): string {
  const face = (family: string, src: string, range: string, scale: number) =>
    `@font-face { font-family: ${q(family)}; src: ${src}; unicode-range: ${range}; font-display: swap;${scale !== 100 ? ` size-adjust: ${scale}%;` : ''} }`;
  const enScale = scaleOf(f.enScale);
  const enSrc = f.en ? fontSrc(f.en, ownUrl(f.en)) : enScale !== 100 ? DEVICE_EN.map((n) => `local(${q(n)})`).join(', ') : '';
  const kb = f.kb || f.bn;
  // the keys' English letters: their own face only when a font or a size of their own is chosen; otherwise
  // they fall through to "PN UI", the app's English
  const kbEnScale = scaleOf(f.kbEnScale);
  const kbEnName = f.kbEn || f.en;
  const kbEnSrc = !f.kbEn && kbEnScale === 100 ? '' : kbEnName ? fontSrc(kbEnName, ownUrl(kbEnName)) : DEVICE_EN.map((n) => `local(${q(n)})`).join(', ');
  return [
    f.bn ? face(APP_FONT_FAMILY, fontSrc(f.bn, ownUrl(f.bn)), BN_RANGE, scaleOf(f.bnScale)) : '',
    enSrc ? face(APP_FONT_FAMILY, enSrc, EN_RANGE, enScale) : '',
    kb ? face(KB_FONT_FAMILY, fontSrc(kb, ownUrl(kb)), BN_RANGE, scaleOf(f.kbScale)) : '',
    kbEnSrc ? face(KB_FONT_FAMILY, kbEnSrc, EN_RANGE, kbEnScale) : '',
  ].filter(Boolean).join('\n');
}

/** Put the rules into the page (one <style>, replaced on each change). */
export function applyAppFonts(f: AppFonts, ownUrl: (name: string) => string | undefined): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('pn-app-font') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'pn-app-font';
    document.head.appendChild(el);
  }
  el.textContent = appFontCss(f, ownUrl);
  document.documentElement.dataset.appFontBn = f.bn || '';
  document.documentElement.dataset.appFontEn = f.en || '';
}
