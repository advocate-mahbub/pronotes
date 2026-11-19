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
export interface AppFonts { bn: string; en: string }

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

/** The @font-face rules for "PN UI". A side left empty falls through to the next fonts in the CSS stack. */
export function appFontCss(f: AppFonts, ownUrl: (name: string) => string | undefined): string {
  const rule = (name: string, range: string) =>
    `@font-face { font-family: ${q(APP_FONT_FAMILY)}; src: ${fontSrc(name, ownUrl(name))}; unicode-range: ${range}; font-display: swap; }`;
  return [f.bn ? rule(f.bn, BN_RANGE) : '', f.en ? rule(f.en, EN_RANGE) : ''].filter(Boolean).join('\n');
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
