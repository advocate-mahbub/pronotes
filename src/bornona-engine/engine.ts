/**
 * Bornona keyboard engine. Pure functions, no DOM and no UI framework, so the same
 * engine drives a <textarea> or the Tiptap editor. Behaviour is ported from
 * reference/bornona-pad-v8.html and checked against tests/golden.
 */
import { US, REV } from './keys';
import type { LayoutMap } from './layouts';
import { hasAltLayer } from './layouts';
import { fixNukta } from './normalize';

/** The parts of a KeyboardEvent the engine needs. */
export interface KeyInput {
  code: string;
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** event.getModifierState('AltGraph') */
  altGraph?: boolean;
  isComposing?: boolean;
}

export interface EngineState {
  /** Bangla mode on (false = plain English typing). */
  bangla: boolean;
  map: LayoutMap;
  /** e.g. while the phone's own keyboard is open for voice typing. */
  suspended?: boolean;
}

export type KeyAction =
  | { kind: 'toggle-language' }
  /** Prevent the browser default and type `text` (pass it through planType). */
  | { kind: 'type'; code: string; text: string }
  /** Prevent the browser default and type nothing (AltGr key with an empty slot). */
  | { kind: 'swallow' }
  /** Let the browser handle the key. */
  | null;

/** Character a key produces. `alt` = AltGr layer. */
export function charFor(map: LayoutMap, code: string, shift: boolean, alt = false, bangla = true): string {
  if (bangla) {
    const m = map[code];
    if (!m) return '';
    if (code.startsWith('Numpad')) return m[0] || '';
    return m[(alt ? 2 : 0) + (shift ? 1 : 0)] || '';
  }
  const u = US[code];
  return u ? u[shift ? 1 : 0] : '';
}

/** Decide what a physical key press does (v8 `keydown` handler). */
export function resolveKey(ev: KeyInput, state: EngineState): KeyAction {
  if (ev.ctrlKey && !ev.altKey && !ev.metaKey && (ev.code === 'Space' || ev.key === ' ')) return { kind: 'toggle-language' };
  const alt = !ev.metaKey && (ev.altKey || Boolean(ev.altGraph));
  const map = state.map;
  if (state.suspended || !state.bangla || ev.isComposing || ev.metaKey || (ev.ctrlKey && !alt) || (alt && !hasAltLayer(map))) return null;
  let code = ev.code;
  let sh = ev.shiftKey;
  if (code && code.startsWith('Numpad') && map[code]) {
    if (ev.key.length !== 1) return null; // NumLock off: arrows, Home, End …
  } else if (!map[code]) {
    const r = REV[ev.key];
    if (!r) return null;
    [code, sh] = r;
  } else {
    const r = REV[ev.key];
    if (r && r[0] === code && !code.startsWith('Key')) sh = r[1];
  }
  if (alt && !code) return null;
  const out = charFor(map, code, sh, alt);
  if (!out) return alt ? { kind: 'swallow' } : null;
  return { kind: 'type', code, text: out };
}

/** Fallback for touch keyboards that skip keydown (v8 `beforeinput` handler). */
export function resolveTypedChar(data: string, state: EngineState): string | null {
  if (state.suspended || !state.bangla || data.length !== 1) return null;
  const r = REV[data];
  if (!r) return null;
  return charFor(state.map, r[0], r[1]) || null;
}

/** Edit to apply at the caret: delete `deleteBefore` characters before it, then insert `text`. */
export interface Edit {
  deleteBefore: number;
  text: string;
}

export interface TypeOptions {
  bangla: boolean;
  /** স্বর-গঠন: a kar at word start / after a vowel becomes the full vowel. */
  vowelForming: boolean;
  /** বিজয়-ধাঁচের রেফ: রেফ typed after the consonant moves before it. */
  oldReph: boolean;
}

const KAR: Record<string, string> = {
  'া': 'আ', 'ি': 'ই', 'ী': 'ঈ', 'ু': 'উ', 'ূ': 'ঊ', 'ৃ': 'ঋ', 'ে': 'এ', 'ৈ': 'ঐ', 'ো': 'ও', 'ৌ': 'ঔ',
};
const isCons = (ch: string | undefined): boolean =>
  !!ch && ((ch >= 'ক' && ch <= 'হ') || ch === 'ড়' || ch === 'ঢ়' || ch === 'য়' || ch === '়');

/** Consonant cluster (with an optional kar) right before the caret. */
const RE_CLUS = /[ক-হড়ঢ়য়](?:্[ক-হড়ঢ়য়])*[া-ৌৗ]?$/;

/**
 * v8 `insert()`: vowel forming + nukta normalisation.
 * `before` = text before the caret; `collapsed` = no selection.
 */
export function planInsert(before: string, collapsed: boolean, text: string, opts: TypeOptions): Edit {
  let deleteBefore = 0;
  let t = text;
  if (opts.bangla && opts.vowelForming && KAR[t] && collapsed) {
    const prev = before[before.length - 1];
    if (prev === 'অ' && t === 'া') {
      deleteBefore = 1;
      t = 'আ';
    } else if (!isCons(prev) && prev !== '্') {
      t = KAR[t];
    }
  }
  return { deleteBefore, text: fixNukta(t) };
}

/** v8 `typeChar()`: old-style reph, then planInsert. */
export function planType(before: string, collapsed: boolean, out: string, opts: TypeOptions): Edit {
  if (opts.bangla && opts.oldReph && out === 'র্' && collapsed) {
    const m = before.match(RE_CLUS);
    if (m && !before.slice(0, before.length - m[0].length).endsWith('র্')) {
      // v8 selects the cluster and inserts over it, so vowel forming does not run here.
      return { deleteBefore: m[0].length, text: fixNukta('র্' + m[0]) };
    }
  }
  return planInsert(before, collapsed, out, opts);
}

/** Apply an Edit to a plain string at `caret`. Returns the new value and caret. */
export function applyEdit(value: string, caret: number, edit: Edit): { value: string; caret: number } {
  const start = caret - edit.deleteBefore;
  const v = value.slice(0, start) + edit.text + value.slice(caret);
  return { value: v, caret: start + edit.text.length };
}
