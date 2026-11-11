/**
 * Typing with a Keyman keyboard that has rules (context, deadkeys, groups). The rules read the text
 * before the caret and say what it becomes; the change is applied as one ProseMirror transaction, so
 * fonts, Undo, suggestions and pagination keep working (no execCommand, no DOM edits).
 *
 * A keyboard may write Unicode or Bijoy (ANSI). When the document side differs (Bijoy keyboard in a
 * Unicode document, or the other way round), the word before the caret is converted for the rules
 * and the result converted back. Deadkeys and the exact text the rules produced are kept per editor
 * while the caret stays where the last key left it.
 */
import type { EditorView } from '@tiptap/pm/view';
import { kmxProcess, ctxText, textCtx, newRunState, REV, US, fixNukta, type CtxItem, type KmxKeyboard, type KmxKey, type KmxRunState, type KeyInput } from '../bornona-engine';
import { toBijoy, toUnicode } from '../bijoy';
import { bijoyWordBefore, bijoyFontAt, marksWithFont, type AnsiConfig } from './ansi-typing';

export interface RulesSession {
  /** Caret position after the last key. */
  pos: number;
  /** Document text the rules last produced (ends at `pos`). */
  shown: string;
  /** The same text as the rules see it, with deadkeys. */
  ctx: CtxItem[];
}

const runStates = new WeakMap<KmxKeyboard, KmxRunState>();
const runState = (kb: KmxKeyboard) => {
  let s = runStates.get(kb);
  if (!s) runStates.set(kb, (s = newRunState()));
  return s;
};

function conv(kb: KmxKeyboard, ansiDoc: boolean): { toL: (s: string) => string; toD: (s: string) => string } {
  const layoutAnsi = kb.enc === 'ansi';
  if (layoutAnsi === ansiDoc) return { toL: (s) => s, toD: (s) => s };
  if (layoutAnsi) return { toL: (s) => toBijoy(s), toD: (s) => fixNukta(toUnicode(s)) };
  return { toL: (s) => fixNukta(toUnicode(s)), toD: (s) => toBijoy(s) };
}

const MAX_ITEMS = 64;

/**
 * One key, without any editor: `region` is the document text before the caret that may be rewritten,
 * `pos` the caret position. Returns the edit at the caret and the new session, or null when the key
 * should go to the editor unchanged.
 */
export function rulesStep(
  kb: KmxKeyboard, key: KmxKey, region: string, pos: number, session: RulesSession | undefined, ansiDoc = false, st: KmxRunState = runState(kb),
): { del: number; text: string; session: RulesSession } | null {
  const c = conv(kb, ansiDoc);
  const ctx: CtxItem[] = session && session.pos === pos && region.endsWith(session.shown)
    ? [...textCtx(c.toL(region.slice(0, region.length - session.shown.length))), ...session.ctx]
    : textCtx(c.toL(region));
  const r = kmxProcess(kb, ctx, key, st);
  if (!r.handled) return null;
  const kept = r.ctx.slice(-MAX_ITEMS);
  const shownAll = c.toD(ctxText(r.ctx));
  let p = 0;
  while (p < region.length && p < shownAll.length && region[p] === shownAll[p]) p++;
  const del = region.length - p;
  const text = shownAll.slice(p);
  return { del, text, session: { pos: pos - del + text.length, shown: c.toD(ctxText(kept)), ctx: kept } };
}

/** The key a keyboard event stands for, or null when it is not a typing key (shortcuts, arrows …). */
export function rulesKeyFromEvent(ev: KeyInput): KmxKey | null {
  if (ev.metaKey || ev.isComposing) return null;
  const alt = ev.altKey || Boolean(ev.altGraph);
  if (ev.ctrlKey && !alt) return null;
  if (ev.code === 'Backspace') return alt ? null : { code: 'Backspace', shift: false, alt: false };
  if (ev.code === 'Space' || ev.key === ' ') return { code: 'Space', shift: ev.shiftKey, alt };
  let code = ev.code;
  let shift = ev.shiftKey;
  if (code && code.startsWith('Numpad')) {
    if (ev.key.length !== 1) return null; // NumLock off
    return { code, shift: false, alt: false };
  }
  if (!US[code]) {
    const r = REV[ev.key];
    if (!r) return null;
    [code, shift] = r;
  }
  return { code, shift, alt };
}

/** The key for a typed character (touch keyboards that send no key codes). */
export function rulesKeyForChar(ch: string): KmxKey | null {
  if (ch === ' ') return { code: 'Space', shift: false, alt: false };
  const r = REV[ch];
  return r ? { code: r[0], shift: r[1], alt: false } : null;
}

const sessions = new WeakMap<object, RulesSession>();

/** Run one key in the editor. Returns false when the editor should handle the key itself. */
export function typeRulesKey(view: EditorView, kb: KmxKeyboard, key: KmxKey, ansi?: AnsiConfig): boolean {
  if (!view.state.selection.empty) {
    if (key.code === 'Backspace') return false;
    view.dispatch(view.state.tr.deleteSelection());
  }
  const { state } = view;
  const pos = state.selection.from;
  const ansiDoc = Boolean(ansi?.on);
  let region: string;
  if (ansiDoc) region = bijoyWordBefore(view, ansi!).text;
  else {
    const { $from } = state.selection;
    region = $from.parent.textBetween(Math.max(0, $from.parentOffset - 128), $from.parentOffset, undefined, '￼');
    if (/^[\udc00-\udfff]/.test(region)) region = region.slice(1);
  }
  const r = rulesStep(kb, key, region, pos, sessions.get(view), ansiDoc);
  if (!r) {
    sessions.delete(view);
    return false;
  }
  sessions.set(view, r.session);
  if (!r.del && !r.text) return true;
  const from = pos - r.del;
  const tr = state.tr;
  if (ansiDoc && r.text) tr.replaceWith(from, pos, state.schema.text(r.text, marksWithFont(view, bijoyFontAt(view, ansi!))));
  else tr.insertText(r.text, from, pos);
  view.dispatch(tr.scrollIntoView());
  return true;
}

type Box = HTMLInputElement | HTMLTextAreaElement;

/** Same for a plain text box (title, find). Returns false to let the box handle the key. */
export function typeRulesKeyBox(el: Box, kb: KmxKeyboard, key: KmxKey, setValue: (el: Box, value: string, caret: number) => void): boolean {
  let s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? s;
  let value = el.value;
  if (s !== e) {
    if (key.code === 'Backspace') return false;
    value = value.slice(0, s) + value.slice(e);
  }
  const region = value.slice(Math.max(0, s - 128), s);
  const r = rulesStep(kb, key, region, s, sessions.get(el));
  if (!r) {
    sessions.delete(el);
    return false;
  }
  sessions.set(el, r.session);
  const start = s - r.del;
  s = start + r.text.length;
  setValue(el, value.slice(0, start) + r.text + value.slice(start + r.del), s);
  return true;
}
