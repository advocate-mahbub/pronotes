/**
 * How the app and its keyboard look (decisions.md 88): the app's colour set (palette) for light and dark,
 * the keyboard's own colours, and the keyboard's height. The palette and the keyboard colours go into
 * backups; the height belongs to this device (screens differ).
 */
import { load, save } from './prefs';

// ---------- the app's colour set ----------
export type Palette = 'classic' | 'white' | 'blue' | 'colorful' | 'black';
/** The ◐ button still chooses light or dark; the palette says which light and which dark. */
export const PALETTES: { id: Palette; label: string }[] = [
  { id: 'classic', label: 'ক্লাসিক (ক্রিম / রাত-নীল)' },
  { id: 'white', label: 'সাদা / গাঢ় ধূসর' },
  { id: 'blue', label: 'নীল' },
  { id: 'colorful', label: 'রঙিন' },
  { id: 'black', label: 'সাদা / কালো' },
];

/** light or dark as it is now: the ◐ choice, or the device's when it follows the device. */
export function resolvedMode(theme: string): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyPalette(p: Palette, theme: string): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (p === 'classic') delete root.dataset.palette;
  else root.dataset.palette = p;
  root.dataset.mode = resolvedMode(theme);
}
export const loadPalette = (): Palette => {
  const v = load<string>('palette', 'classic');
  return (PALETTES.some((x) => x.id === v) ? v : 'classic') as Palette;
};

// ---------- the keyboard's colours ----------
export type KbTheme = 'app' | 'iphone-light' | 'iphone-dark' | 'navy-gold' | 'black' | 'custom';
/** Four colours make a keyboard: its background, the keys, the letters, and a pressed or lit key. */
export interface KbColors { bg: string; key: string; fg: string; active: string }
export const KB_THEMES: { id: KbTheme; label: string; c?: KbColors }[] = [
  { id: 'app', label: 'অ্যাপের রং অনুযায়ী' },
  { id: 'iphone-light', label: 'iPhone হালকা', c: { bg: '#d1d4d9', key: '#ffffff', fg: '#000000', active: '#0a84ff' } },
  { id: 'iphone-dark', label: 'iPhone গাঢ়', c: { bg: '#202124', key: '#464749', fg: '#ffffff', active: '#0a84ff' } },
  { id: 'navy-gold', label: 'ProNotes নেভি-সোনালি', c: { bg: '#0d1829', key: '#14213a', fg: '#efe7d6', active: '#c8a45d' } },
  { id: 'black', label: 'কালো', c: { bg: '#000000', key: '#1c1c1e', fg: '#ffffff', active: '#c8a45d' } },
  { id: 'custom', label: 'নিজের রং' },
];
export const DEFAULT_CUSTOM: KbColors = { bg: '#0d1829', key: '#14213a', fg: '#efe7d6', active: '#c8a45d' };
export interface KbLook { theme: KbTheme; custom: KbColors }
export const loadKbLook = (): KbLook => {
  const v = load<Partial<KbLook>>('kbLook', {});
  const theme = KB_THEMES.some((x) => x.id === v.theme) ? (v.theme as KbTheme) : 'app';
  return { theme, custom: { ...DEFAULT_CUSTOM, ...(v.custom ?? {}) } };
};
export const colorsOf = (l: KbLook): KbColors | undefined => (l.theme === 'custom' ? l.custom : KB_THEMES.find((x) => x.id === l.theme)?.c);

const hex = (s: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (c: string) => {
  const [r, g, b] = hex(c).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast between two colours (1–21). Letters on keys below 4.5 are hard to read. */
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** Black or white, whichever reads better on this colour. */
export const textOn = (c: string) => (contrast(c, '#000000') >= contrast(c, '#ffffff') ? '#000000' : '#ffffff');

/** The CSS that gives every keyboard surface these colours (nothing for "follow the app"). */
export function kbThemeCss(c: KbColors | undefined): string {
  if (!c) return '';
  const mix = (a: string, b: string, p: number) => `color-mix(in srgb, ${a} ${p}%, ${b})`;
  const v = [
    `--key: ${c.key}`, `--key-2: ${c.bg}`, `--key-shadow: ${mix(c.key, '#000', 65)}`,
    `--fg: ${c.fg}`, `--muted: ${mix(c.fg, c.bg, 62)}`, `--line: ${mix(c.fg, c.bg, 14)}`,
    `--accent: ${c.active}`, `--accent-fg: ${textOn(c.active)}`, `--accent-soft: ${mix(c.active, c.key, 35)}`,
    `--ios-kb: ${c.bg}`, `--ios-key: ${c.key}`, `--ios-fn: ${mix(c.key, c.bg, 55)}`, `--ios-fg: ${c.fg}`, `--ios-hit: ${mix(c.active, c.key, 30)}`,
  ].join('; ');
  return `.kb, .kb-liftwrap, .kb-strip, .kb-float, .kb-pop, .kb-hand, .kb-menu, .kb-preview { ${v}; color: ${c.fg}; }`;
}
export function applyKbLook(l: KbLook): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('pn-kb-theme') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'pn-kb-theme';
    document.head.appendChild(el);
  }
  el.textContent = kbThemeCss(colorsOf(l));
  document.documentElement.dataset.kbTheme = l.theme;
}
export const saveKbLook = (l: KbLook) => { save('kbLook', l); applyKbLook(l); };

// ---------- the keyboard's height (this device) ----------
export const KB_H_MIN = 70;
export const KB_H_MAX = 140;
export const loadKbHeight = () => Math.max(KB_H_MIN, Math.min(KB_H_MAX, load<number>('device.kbHeight', 100)));
export function applyKbHeight(pct: number): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--kb-hs', String(Math.max(KB_H_MIN, Math.min(KB_H_MAX, pct)) / 100));
}
export const saveKbHeight = (pct: number) => { save('device.kbHeight', pct); applyKbHeight(pct); };
