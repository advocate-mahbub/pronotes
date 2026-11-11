import type { Layout, LayoutMap } from './layouts';
import { US } from './keys';
import { fixNukta } from './normalize';

/** OpenBangla Keyboard key names for the printed US characters (data/*.json, "fixed" layouts, version 2). */
const NAME: Record<string, string> = {
  '`': 'Grave', '~': 'Tilde', '!': 'Exclaim', '@': 'At', '#': 'Hash', $: 'Dollar', '%': 'Percent', '^': 'Circum', '&': 'Ampersand',
  '*': 'Asterisk', '(': 'ParenLeft', ')': 'ParenRight', '-': 'Minus', _: 'UnderScore', '=': 'Equals', '+': 'Plus',
  '[': 'BracketLeft', ']': 'BracketRight', '{': 'BraceLeft', '}': 'BraceRight', '\\': 'BackSlash', '|': 'Bar',
  ';': 'Semicolon', ':': 'Colon', "'": 'Apostrophe', '"': 'Quote', ',': 'Comma', '<': 'Less', '.': 'Period', '>': 'Greater',
  '/': 'Slash', '?': 'Question',
};
const keyName = (ch: string) => NAME[ch] ?? ch;
const NUM: Record<string, string> = { Add: 'NumpadAdd', Subtract: 'NumpadSubtract', Multiply: 'NumpadMultiply', Divide: 'NumpadDivide', Decimal: 'NumpadDecimal' };

/**
 * Parse an OpenBangla Keyboard layout (.json). Keys there are named by the character printed on a
 * US keyboard ("Key_a_Normal", "Key_A_AltGr"), so Shift is the capital/shifted character's entry.
 * Throws when the file is not a fixed OpenBangla layout.
 */
export function parseOpenBanglaLayout(txt: string): Omit<Layout, 'id'> {
  let d: { info?: { type?: string; layout?: { name?: string; developer?: { name?: string } } }; layout?: Record<string, unknown> };
  try {
    d = JSON.parse(txt.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('openbangla: not JSON');
  }
  const L = d && typeof d.layout === 'object' && d.layout ? (d.layout as Record<string, unknown>) : null;
  if (!L) throw new Error('openbangla: no layout');
  if (d.info?.type && d.info.type !== 'fixed') throw new Error('openbangla: only fixed layouts');
  const get = (k: string) => (typeof L[k] === 'string' ? fixNukta(L[k] as string) : '');
  const map: LayoutMap = {};
  let n = 0;
  for (const code in US) {
    const [lo, hi] = US[code];
    const row = [get(`Key_${keyName(lo)}_Normal`), get(`Key_${keyName(hi)}_Normal`), get(`Key_${keyName(lo)}_AltGr`), get(`Key_${keyName(hi)}_AltGr`)];
    if (!row.some(Boolean)) continue;
    n += row.filter(Boolean).length;
    map[code] = row[2] || row[3] ? row : row.slice(0, 2);
  }
  for (const k in L) {
    const m = k.match(/^Num(\d|Add|Subtract|Multiply|Divide|Decimal)$/);
    if (m && get(k)) map[/^\d$/.test(m[1]) ? 'Numpad' + m[1] : NUM[m[1]]] = [get(k)];
  }
  if (n < 40) throw new Error('openbangla: too few keys');
  const info = d.info?.layout;
  return { name: (info?.name || 'OpenBangla').trim(), dev: (info?.developer?.name || '').trim(), map };
}
