/**
 * Keyman keyboards (.kmx, compiled; .kmp is a zip of them, opened in the app layer).
 * parseKMX reads the binary file (format: keymanapp/keyman common/include/kmx_file.h) into plain JSON
 * that can be stored; kmxProcess runs its rules on the text before the caret, following Keyman core's
 * kmx_processevent.cpp (context match, any/notany/index, deadkeys, nul, use/match/nomatch, options).
 * Pure functions: no DOM, no editor.
 */
import { US } from './keys';

/** One element of a rule's context or output, or of a store. A plain string is a literal character. */
export type KItem =
  | string
  | { k: 'any' | 'notany'; s: number }
  | { k: 'index'; s: number; n: number }
  | { k: 'ctx' }
  | { k: 'ctxex'; n: number }
  | { k: 'nul' }
  | { k: 'use'; g: number }
  | { k: 'ret' }
  | { k: 'beep' }
  | { k: 'dk'; d: number }
  | { k: 'ifopt'; a: number; ne: boolean; b: number }
  | { k: 'setopt'; a: number; b: number }
  | { k: 'resetopt'; a: number }
  | { k: 'saveopt'; a: number }
  | { k: 'ifsys'; id: number; ne: boolean; b: number }
  | { k: 'setsys'; id: number; b: number }
  | { k: 'call'; s: number }
  | { k: 'x' };

export interface KStore {
  sys: number;
  name: string;
  /** The raw value (options are compared and set by it). */
  v: string;
  items: KItem[];
}
export interface KRule {
  /** Virtual key code (vk: true) or a character code. */
  key: number;
  vk: boolean;
  flags: number;
  ctx: KItem[];
  out: KItem[];
}
export interface KGroup {
  name: string;
  keys: boolean;
  rules: KRule[];
  match: KItem[] | null;
  nomatch: KItem[] | null;
}
export interface KmxKeyboard {
  v: 1;
  name: string;
  copyright: string;
  version: string;
  /** Bijoy/ANSI text (SutonnyMJ) or Unicode Bangla. */
  enc: 'unicode' | 'ansi';
  start: number;
  stores: KStore[];
  groups: KGroup[];
  /** Parts of the keyboard that ProNotes does not run (shown to the user once). */
  unsupported: string[];
}

/** Notes shown to the user about parts of a Keyman keyboard that ProNotes does not run. */
export const KMX_NOTES = {
  ctrl: 'Ctrl দিয়ে লেখার রুল',
  caps: 'Caps Lock চালু থাকলে আলাদা রুল',
  call: 'call() (বাইরের কোড)',
  mnemonic: 'mnemonic লেআউট: কী-গুলো US (ইংরেজি) কিবোর্ড ধরে নেওয়া হলো',
};

const SENT = 0xffff;
const ARGS: Record<number, number> = { 1: 1, 2: 2, 3: 0, 4: 0, 5: 1, 6: 0, 7: 0, 8: 1, 0x0c: 1, 0x0e: 0, 0x0f: 1, 0x11: 1, 0x12: 1, 0x13: 2, 0x14: 3, 0x15: 1, 0x16: 1, 0x17: 3, 0x18: 2 };
const K_SHIFT = 0x10;
const ALT = 0x04 | 0x08 | 0x40;
const CTRL = 0x01 | 0x02 | 0x20;
const CAPS = 0x100;
const TSS = { COPYRIGHT: 2, NAME: 7, VERSION: 8, MNEMONIC: 17, PLATFORM: 31, BASELAYOUT: 32, LAYER: 33, KEYBOARDVERSION: 36 };

/** Windows-1252 for bytes 0x80–0x9F: the form the Bijoy converter reads (e.g. ‡ for এ-কার). */
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
const fixAnsi = (ch: string) => {
  const c = ch.charCodeAt(0);
  return ch.length === 1 && c >= 0x80 && c <= 0x9f ? CP1252[c - 0x80] : ch;
};

/** Decode one KMX string (UTF-16 code units) into items. */
function items(u: number[]): KItem[] {
  const out: KItem[] = [];
  for (let i = 0; i < u.length; i++) {
    const c = u[i];
    if (c !== SENT) {
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < u.length) {
        out.push(String.fromCharCode(c, u[++i]));
      } else out.push(fixAnsi(String.fromCharCode(c)));
      continue;
    }
    const code = u[++i];
    if (code === 0x0a) {
      // virtual key in output (not typed by ProNotes): skip to its end marker
      while (i + 1 < u.length && u[i + 1] !== 0x10) i++;
      i++;
      out.push({ k: 'x' });
      continue;
    }
    const n = ARGS[code];
    if (n === undefined) {
      out.push({ k: 'x' });
      continue;
    }
    const a = u.slice(i + 1, i + 1 + n);
    i += n;
    switch (code) {
      case 1: out.push({ k: 'any', s: a[0] - 1 }); break;
      case 2: out.push({ k: 'index', s: a[0] - 1, n: a[1] }); break;
      case 3: out.push({ k: 'ctx' }); break;
      case 4: out.push({ k: 'nul' }); break;
      case 5: out.push({ k: 'use', g: a[0] - 1 }); break;
      case 6: out.push({ k: 'ret' }); break;
      case 7: out.push({ k: 'beep' }); break;
      case 8: out.push({ k: 'dk', d: a[0] - 1 }); break;
      case 0x0f: out.push({ k: 'call', s: a[0] - 1 }); break;
      case 0x11: out.push({ k: 'ctxex', n: a[0] }); break;
      case 0x12: out.push({ k: 'notany', s: a[0] - 1 }); break;
      case 0x13: out.push({ k: 'setopt', a: a[0] - 1, b: a[1] - 1 }); break;
      case 0x14: out.push({ k: 'ifopt', a: a[0] - 1, ne: a[1] === 1, b: a[2] - 1 }); break;
      case 0x15: out.push({ k: 'saveopt', a: a[0] - 1 }); break;
      case 0x16: out.push({ k: 'resetopt', a: a[0] - 1 }); break;
      case 0x17: out.push({ k: 'ifsys', id: a[0] - 1, ne: a[1] === 1, b: a[2] - 1 }); break;
      case 0x18: out.push({ k: 'setsys', id: a[0] - 1, b: a[1] - 1 }); break;
      default: out.push({ k: 'x' });
    }
  }
  return out;
}

const isBn = (s: string) => /[ঀ-৿]/.test(s);
const isAnsiChar = (s: string) => /[¡-ÿŒ-™]/.test(s);

/** Read a compiled Keyman keyboard. Throws Error('kmx') when the file is not one ProNotes can use. */
export function parseKMX(buf: ArrayBuffer): KmxKeyboard {
  const dv = new DataView(buf);
  if (buf.byteLength < 64 || dv.getUint32(0, true) !== 0x5354584b) throw new Error('kmx: not a compiled Keyman keyboard');
  const ver = dv.getUint32(4, true);
  if (ver < 0x500) throw new Error('kmx: version too old');
  const u32 = (o: number) => dv.getUint32(o, true);
  const str = (o: number): number[] | null => {
    if (!o || o >= buf.byteLength) return null;
    const r: number[] = [];
    for (let p = o; p + 1 < buf.byteLength; p += 2) {
      const c = dv.getUint16(p, true);
      if (c === 0) break;
      r.push(c);
    }
    return r;
  };
  const text = (o: number) => String.fromCharCode(...(str(o) ?? []));
  const nStores = u32(0x18);
  const nGroups = u32(0x1c);
  const pStores = u32(0x20);
  const pGroups = u32(0x24);
  const startAnsi = u32(0x28);
  const startUni = u32(0x2c);
  const flags = u32(0x30);
  if (nGroups > 128 || nStores > 10000 || pStores + nStores * 12 > buf.byteLength || pGroups + nGroups * 24 > buf.byteLength) throw new Error('kmx: damaged file');

  const unsupported = new Set<string>();
  const stores: KStore[] = [];
  for (let i = 0; i < nStores; i++) {
    const o = pStores + i * 12;
    const raw = str(u32(o + 8)) ?? [];
    stores.push({ sys: u32(o), name: text(u32(o + 4)), v: String.fromCharCode(...raw), items: items(raw) });
  }
  const groups: KGroup[] = [];
  for (let g = 0; g < nGroups; g++) {
    const o = pGroups + g * 24;
    const pKeys = u32(o + 4);
    const n = u32(o + 16);
    if (pKeys + n * 20 > buf.byteLength) throw new Error('kmx: damaged file');
    const rules: KRule[] = [];
    for (let k = 0; k < n; k++) {
      const r = pKeys + k * 20;
      const fl = u32(r + 8);
      const rule: KRule = { key: dv.getUint16(r, true), vk: fl !== 0, flags: fl, out: items(str(u32(r + 12)) ?? []), ctx: items(str(u32(r + 16)) ?? []) };
      if (fl & CTRL) unsupported.add(KMX_NOTES.ctrl);
      if (fl & CAPS) unsupported.add(KMX_NOTES.caps);
      if (rule.out.some((x) => typeof x !== 'string' && x.k === 'call')) unsupported.add(KMX_NOTES.call);
      rules.push(rule);
    }
    const m = str(u32(o + 8));
    const nm = str(u32(o + 12));
    groups.push({ name: text(u32(o)), keys: u32(o + 20) !== 0, rules, match: m && m.length ? items(m) : null, nomatch: nm && nm.length ? items(nm) : null });
  }
  if (flags & 0x20 && !groups.length) throw new Error('kmx: LDML keyboard (Keyman 17 .xml) not supported');
  const none = 0xffffffff;
  const uni = startUni !== none && startUni < nGroups;
  const start = uni ? startUni : startAnsi !== none && startAnsi < nGroups ? startAnsi : -1;
  if (start < 0) throw new Error('kmx: no starting group');
  const sys = (id: number) => stores.find((s) => s.sys === id)?.v ?? '';
  if (sys(TSS.MNEMONIC) === '1') unsupported.add(KMX_NOTES.mnemonic);

  // Unicode Bangla or Bijoy (ANSI) text? Look at what the keyboard writes.
  let bn = 0;
  let ansi = 0;
  const count = (list: KItem[]) => {
    for (const x of list) if (typeof x === 'string') {
      if (isBn(x)) bn++;
      else if (isAnsiChar(x)) ansi++;
    }
  };
  for (const g of groups) for (const r of g.rules) count(r.out);
  for (const s of stores) if (!s.sys) count(s.items);
  const enc = bn === 0 && (ansi > 10 || !uni) ? 'ansi' : 'unicode';

  return {
    v: 1, name: sys(TSS.NAME) || 'Keyman', copyright: sys(TSS.COPYRIGHT), version: sys(TSS.KEYBOARDVERSION) || sys(TSS.VERSION),
    enc, start, stores, groups, unsupported: [...unsupported],
  };
}

// ---------------------------------------------------------------- running the rules

/** Context before the caret: characters and invisible deadkeys. */
export type CtxItem = string | { dk: number };

export interface KmxKey {
  /** KeyboardEvent.code ('KeyA', 'Digit1', 'Space', 'Backspace', 'Numpad1' …). */
  code: string;
  shift: boolean;
  /** AltGr (Right Alt). */
  alt: boolean;
}

/** Option values (set/reset) and the current layer, kept per keyboard while the app is open. */
export interface KmxRunState {
  opts: Record<number, string>;
  layer: string;
}
export const newRunState = (): KmxRunState => ({ opts: {}, layer: 'default' });

const VK: Record<string, number> = {
  Space: 0x20, Backspace: 0x08, Enter: 0x0d, Tab: 0x09, Semicolon: 0xba, Equal: 0xbb, Comma: 0xbc, Minus: 0xbd, Period: 0xbe,
  Slash: 0xbf, Backquote: 0xc0, BracketLeft: 0xdb, Backslash: 0xdc, BracketRight: 0xdd, Quote: 0xde, IntlBackslash: 0xe2,
  NumpadMultiply: 0x6a, NumpadAdd: 0x6b, NumpadSubtract: 0x6d, NumpadDecimal: 0x6e, NumpadDivide: 0x6f,
};
const NUMPAD_CH: Record<string, string> = { NumpadMultiply: '*', NumpadAdd: '+', NumpadSubtract: '-', NumpadDecimal: '.', NumpadDivide: '/' };

export function vkOf(code: string): number {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit\d$/.test(code)) return code.charCodeAt(5);
  if (/^Numpad\d$/.test(code)) return 0x60 + Number(code[6]);
  return VK[code] ?? 0;
}
function charOf(k: KmxKey): string {
  if (k.code === 'Space') return ' ';
  if (/^Numpad\d$/.test(k.code)) return k.code[6];
  if (NUMPAD_CH[k.code]) return NUMPAD_CH[k.code];
  const u = US[k.code];
  return u ? u[k.shift ? 1 : 0] : '';
}

const PLATFORM = ['web', 'desktop', 'hardware'];
const same = (a: CtxItem | KItem, b: CtxItem): boolean =>
  typeof a === 'string' ? a === b : typeof b !== 'string' && 'k' in a && a.k === 'dk' && a.d === b.dk;
const isCond = (x: KItem) => typeof x !== 'string' && (x.k === 'ifopt' || x.k === 'ifsys');

/**
 * Run one key through the keyboard. `ctx` is the text before the caret (with deadkeys), oldest first.
 * Returns the new context, or handled=false when the key should go to the editor unchanged.
 */
export function kmxProcess(kb: KmxKeyboard, ctx: readonly CtxItem[], key: KmxKey, st: KmxRunState = newRunState()): { ctx: CtxItem[]; handled: boolean } {
  const buf: CtxItem[] = ctx.slice(-64);
  const vk = vkOf(key.code);
  // AltGr with no rule types nothing (as on Windows with a US base layout)
  const ch = key.code === 'Backspace' || key.alt ? '' : charOf(key);
  const charCode = ch ? ch.charCodeAt(0) : 0;
  let loops = 0;
  let stop = false;
  let pass = false;
  const val = (s: number) => st.opts[s] ?? kb.stores[s]?.v ?? '';
  const sysVal = (id: number): string | null => {
    if (id === TSS.LAYER) return st.layer;
    if (id === TSS.BASELAYOUT) return 'kbdus.dll';
    return null;
  };

  const condOk = (x: KItem): boolean => {
    if (typeof x === 'string') return true;
    if (x.k === 'ifopt') {
      const eq = val(x.a) === val(x.b);
      return x.ne ? !eq : eq;
    }
    if (x.k === 'ifsys') {
      let eq: boolean;
      if (x.id === TSS.PLATFORM) eq = val(x.b).split(/\s+/).filter(Boolean).every((p) => PLATFORM.includes(p.toLowerCase()));
      else {
        const v = sysVal(x.id);
        if (v === null) return false;
        eq = v === val(x.b);
      }
      return x.ne ? !eq : eq;
    }
    return true;
  };

  /** Context match (ContextMatch). Returns the index stack, or null. */
  const match = (rc: KItem[]): number[] | null => {
    const idx: number[] = new Array(rc.length).fill(0);
    if (!rc.length) return idx;
    let p = 0;
    const nul = typeof rc[0] !== 'string' && rc[0].k === 'nul';
    for (const x of rc) if (isCond(x) && !condOk(x)) return null;
    const len = rc.filter((x) => !isCond(x)).length - (nul ? 1 : 0);
    if (nul) {
      if (buf.length > len) return null;
      p = 1;
    }
    if (buf.length < len) return null;
    let q = buf.length - len;
    const q0 = q;
    for (; p < rc.length; p++) {
      const x = rc[p];
      if (isCond(x)) continue;
      const b = buf[q];
      if (typeof x === 'string') {
        if (x !== b) return null;
      } else {
        switch (x.k) {
          case 'dk':
            if (typeof b === 'string' || b.dk !== x.d) return null;
            break;
          case 'any': {
            const i = (kb.stores[x.s]?.items ?? []).findIndex((s) => same(s, b));
            if (i < 0) return null;
            idx[p] = i;
            break;
          }
          case 'notany':
            if ((kb.stores[x.s]?.items ?? []).some((s) => same(s, b))) return null;
            break;
          case 'index': {
            const n = idx[x.n - 1] ?? 0;
            idx[p] = n;
            const s = kb.stores[x.s]?.items[n];
            if (s === undefined || !same(s, b)) return null;
            break;
          }
          case 'ctxex': {
            // the nth item of the matched context (Keyman counts from the start of the matched text)
            const pos = q0 + x.n - 1;
            const t = pos < q ? buf[pos] : undefined;
            if (t === undefined || !same(typeof t === 'string' ? t : { k: 'dk', d: t.dk }, b)) return null;
            break;
          }
          default:
            return null;
        }
      }
      q++;
    }
    return idx;
  };

  const emit = (x: KItem) => {
    if (typeof x === 'string') buf.push(x);
    else if (x.k === 'dk') buf.push({ dk: x.d });
  };

  /** PostString. Returns true when a use()/call() was found (then match is not run). */
  const post = (out: KItem[], mini: CtxItem[], miniIf: number, miniNul: boolean, idx: number[]): boolean => {
    let found = false;
    for (const x of out) {
      if (stop) return true;
      if (typeof x === 'string') {
        buf.push(x);
        continue;
      }
      switch (x.k) {
        case 'dk': buf.push({ dk: x.d }); break;
        case 'ctx': for (const m of mini) buf.push(m); break;
        case 'ctxex': {
          const i = x.n - 1 - miniIf - (miniNul ? 1 : 0);
          if (mini[i] !== undefined) buf.push(mini[i]);
          break;
        }
        case 'index': {
          const s = kb.stores[x.s]?.items[idx[x.n - 1] ?? 0];
          if (s !== undefined) emit(s);
          break;
        }
        case 'ret': stop = true; return true;
        case 'use': group(x.g); found = true; if (stop) return true; break;
        case 'call': found = true; break;
        case 'setopt': st.opts[x.a] = val(x.b); break;
        case 'resetopt': delete st.opts[x.a]; break;
        case 'setsys': if (x.id === TSS.LAYER) st.layer = val(x.b); break;
        default: break; // beep, saveopt, virtual keys
      }
    }
    return found;
  };

  const keyOk = (r: KRule): boolean => {
    if (r.vk) {
      const f = r.flags;
      if (f & CTRL || f & CAPS) return false;
      return r.key === vk && !!(f & K_SHIFT) === key.shift && !!(f & ALT) === key.alt;
    }
    return r.key === charCode && charCode !== 0 && !key.alt;
  };

  function group(gi: number) {
    if (++loops > 50) {
      stop = true;
      return;
    }
    const g = kb.groups[gi];
    if (!g) return;
    let rule: KRule | null = null;
    let idx: number[] = [];
    for (const r of g.rules) {
      const m = match(r.ctx);
      if (!m) continue;
      if (!g.keys) {
        if (r.ctx.length) {
          rule = r;
          idx = m;
          break;
        }
        continue;
      }
      if (keyOk(r)) {
        rule = r;
        idx = m;
        break;
      }
    }
    if (!rule) {
      if (g.keys && charCode === 0) {
        if (key.code === 'Backspace') {
          // remove deadkeys before the caret, then one character (and the deadkeys before it)
          const dropDk = () => { while (buf.length && typeof buf[buf.length - 1] !== 'string') buf.pop(); };
          dropDk();
          if (!buf.length) { pass = true; return; }
          buf.pop();
          dropDk();
          return;
        }
        pass = true;
        return;
      }
      if (g.nomatch) post(g.nomatch, [], 0, false, []);
      else if (g.keys && ch) buf.push(ch);
      return;
    }
    const nul = typeof rule.ctx[0] !== 'string' && rule.ctx[0]?.k === 'nul';
    const ifLen = rule.ctx.filter(isCond).length;
    const n = rule.ctx.length - ifLen - (nul ? 1 : 0);
    const mini = n > 0 ? buf.slice(buf.length - n) : [];
    let out = rule.out;
    const first = out[0];
    if (typeof first !== 'string' && first?.k === 'ctx') out = out.slice(1);
    else buf.splice(buf.length - n, n);
    const found = post(out, mini, ifLen, nul, idx);
    if (!found && !stop && g.match) post(g.match, mini, ifLen, nul, idx);
  }

  group(kb.start);
  if (pass) return { ctx: ctx.slice(), handled: false };
  return { ctx: buf, handled: true };
}

/** Visible text of a context (deadkeys removed). */
export const ctxText = (c: readonly CtxItem[]) => c.filter((x): x is string => typeof x === 'string').join('');
/** A string as context items (one per code point). */
export const textCtx = (s: string): CtxItem[] => [...s];

/** What each key types on its own (for the on-screen keyboard labels): [Normal, Shift, AltGr, Shift+AltGr]. */
export function kmxKeyLabels(kb: KmxKeyboard): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  const codes = [...Object.keys(US), ...Array.from({ length: 10 }, (_, i) => 'Numpad' + i), ...Object.keys(NUMPAD_CH)];
  for (const code of codes) {
    const row = [false, true].flatMap((alt) => [false, true].map((shift) => {
      const r = kmxProcess(kb, [], { code, shift, alt });
      return r.handled ? ctxText(r.ctx) : '';
    }));
    if (code.startsWith('Numpad')) map[code] = [row[0]];
    else if (row.some(Boolean)) map[code] = row[2] || row[3] ? row : row.slice(0, 2);
  }
  return map;
}

/**
 * True when the keyboard is only "one key → fixed text" (no context, deadkeys, groups or options).
 * Such a keyboard is used as a plain layout map, so the Bornona settings (vowel forming, reph) apply.
 */
export function kmxIsSimple(kb: KmxKeyboard): boolean {
  if (kb.enc !== 'unicode') return false;
  const g = kb.groups[kb.start];
  if (!g || !g.keys || g.match || g.nomatch || kb.groups.length !== 1) return false;
  return g.rules.every((r) => r.ctx.length === 0 && r.vk && !(r.flags & (CTRL | CAPS)) && r.out.every((x) => typeof x === 'string'));
}
