/**
 * Experimental Bijoy (ANSI) typing. Text typed in Bangla is stored in Bijoy encoding with the
 * Bijoy font (SutonnyMJ) set on it, so it can be copied into old SutonnyMJ documents as is.
 *
 * How it works: the Bijoy word before the caret is read back to Unicode, the Bornona engine
 * types into that Unicode word (vowel forming, reph …), and the result is written back in Bijoy.
 * English typed in this mode gets the English font, so the two can be told apart later.
 * Word suggestions, learning and voice do not work on Bijoy text.
 */
import type { EditorView } from '@tiptap/pm/view';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import type { Mark, Node as PMNode } from '@tiptap/pm/model';
import { planType, applyEdit, fixNukta } from '../bornona-engine';
import { toBijoy, toUnicode, bijoyRuns, isBijoyFont } from '../bijoy';

export { isBijoyFont };

export interface AnsiConfig {
  on: boolean;
  bijoyFont: string;
  englishFont: string;
}

const clean = (f: unknown) => String(f ?? '').replace(/["']/g, '').split(',')[0].trim();
const fontOf = (marks: readonly Mark[]) => marks.find((m) => m.type.name === 'textStyle')?.attrs.fontFamily;

/** The Bijoy font to type in: the one at the caret when it is a Bijoy font (chosen in the font box), else the setting. */
function bijoyFontAt(view: EditorView, cfg: AnsiConfig): string {
  const { state } = view;
  const marks = state.storedMarks ?? state.selection.$from.marks();
  const f = fontOf(marks);
  return f && isBijoyFont(f, cfg.bijoyFont) ? clean(f) : cfg.bijoyFont;
}

/** Marks for new text: the marks at the caret with the font set to `font`. */
function marksWithFont(view: EditorView, font: string): readonly Mark[] {
  const { state } = view;
  const base = state.storedMarks ?? state.selection.$from.marks();
  const ts = state.schema.marks.textStyle;
  const old = base.find((m) => m.type === ts);
  const mark = ts.create({ ...(old?.attrs ?? {}), fontFamily: `"${font}"` });
  return mark.addToSet(base.filter((m) => m.type !== ts));
}

/** The Bijoy word just before the caret (only text in the Bijoy font, up to a space). */
export function bijoyWordBefore(view: EditorView, cfg: AnsiConfig): { text: string; from: number } {
  const { $from } = view.state.selection;
  const parent = $from.parent;
  const chars: { ch: string; bj: boolean }[] = [];
  parent.forEach((child: PMNode, offset: number) => {
    if (offset >= $from.parentOffset) return;
    const bj = child.isText && isBijoyFont(fontOf(child.marks), cfg.bijoyFont);
    const text = child.isText ? child.text!.slice(0, $from.parentOffset - offset) : '￼';
    for (const ch of text) chars.push({ ch, bj });
  });
  let i = chars.length;
  while (i > 0 && chars[i - 1].bj && !/\s/.test(chars[i - 1].ch)) i--;
  const text = chars.slice(i).map((c) => c.ch).join('');
  return { text, from: $from.pos - text.length };
}

/**
 * The Unicode of the word last written in Bijoy, per editor. Bijoy is ambiguous while a word is
 * being typed ("কর্" and "র্ক" are both "K©"; "স্" reads back as a visible hasanta), so the word
 * is not read back from Bijoy when it is still the one we wrote.
 */
const shadow = new WeakMap<EditorView, { from: number; bj: string; uni: string }>();

/** Unicode of the Bijoy word before the caret. */
function wordUnicode(view: EditorView, w: { text: string; from: number }): string {
  const s = shadow.get(view);
  if (s && s.from === w.from && s.bj === w.text) return s.uni;
  // a hasanta at the end is still being typed (a conjunct follows), not a visible hasanta
  return fixNukta(toUnicode(w.text)).replace(/্\u200C$/, '্');
}

function writeWord(view: EditorView, w: { from: number }, to: number, uni: string, marks: readonly Mark[]) {
  const { state } = view;
  const bj = toBijoy(uni);
  const tr = state.tr;
  if (bj) tr.replaceWith(w.from, to, state.schema.text(bj, marks));
  else tr.delete(w.from, to);
  view.dispatch(tr.scrollIntoView());
  if (bj) shadow.set(view, { from: w.from, bj, uni });
  else shadow.delete(view);
}

/** Type `out` (Unicode, from the layout) in Bijoy. */
export function typeAnsi(view: EditorView, out: string, cfg: AnsiConfig & { vowelForming: boolean; oldReph: boolean; fixChandra?: boolean }): void {
  const { state } = view;
  const sel = state.selection;
  const marks = marksWithFont(view, bijoyFontAt(view, cfg));
  if (!sel.empty) {
    const tr = state.tr.replaceWith(sel.from, sel.to, state.schema.text(toBijoy(out), marks));
    view.dispatch(tr.scrollIntoView());
    return;
  }
  const w = bijoyWordBefore(view, cfg);
  const uni = wordUnicode(view, w);
  const edit = planType(uni, true, out, { bangla: true, vowelForming: cfg.vowelForming, oldReph: cfg.oldReph, fixChandra: cfg.fixChandra });
  writeWord(view, w, sel.from, applyEdit(uni, uni.length, edit).value, marks);
}

/** English text in ANSI mode: set in the English font so it is never mistaken for Bijoy. */
export function insertEnglishAnsi(view: EditorView, text: string, cfg: AnsiConfig): void {
  const { state } = view;
  const { from, to } = state.selection;
  view.dispatch(state.tr.replaceWith(from, to, state.schema.text(text, marksWithFont(view, cfg.englishFont))).scrollIntoView());
}

/** Backspace inside a Bijoy word: remove one Unicode letter, not one ANSI byte. Returns false to let the editor handle it. */
export function backspaceAnsi(view: EditorView, cfg: AnsiConfig): boolean {
  const { state } = view;
  if (!state.selection.empty) return false;
  const w = bijoyWordBefore(view, cfg);
  if (!w.text) return false;
  const uni = [...wordUnicode(view, w)];
  uni.pop();
  writeWord(view, w, state.selection.from, uni.join(''), marksWithFont(view, bijoyFontAt(view, cfg)));
  return true;
}

/** Convert the whole document (or nothing if it is already so): Unicode → Bijoy. Returns the number of runs changed. */
export function docToBijoy(view: EditorView, cfg: Pick<AnsiConfig, 'bijoyFont' | 'englishFont'>, range?: { from: number; to: number }): number {
  const { state } = view;
  const tr = state.tr;
  const n = toBijoyIn(tr, state, cfg, range);
  if (n) view.dispatch(closeHistory(tr));
  return n;
}

/** Text nodes (or the parts of them inside `range`) that a conversion touches. */
function pieces(state: EditorState, range: { from: number; to: number } | undefined, want: (node: PMNode) => boolean) {
  const out: { node: PMNode; from: number; to: number }[] = [];
  const visit = (node: PMNode, pos: number) => {
    if (!node.isText || !want(node)) return;
    const from = range ? Math.max(range.from, pos) : pos;
    const to = range ? Math.min(range.to, pos + node.nodeSize) : pos + node.nodeSize;
    if (to > from) out.push({ node, from, to });
  };
  if (range) state.doc.nodesBetween(range.from, range.to, visit);
  else state.doc.descendants(visit);
  return out;
}

/** Unicode Bangla → Bijoy in the given font (English parts in the English font); adds the steps to `tr`. */
export function toBijoyIn(tr: Transaction, state: EditorState, cfg: Pick<AnsiConfig, 'bijoyFont' | 'englishFont'>, range?: { from: number; to: number }): number {
  const ts = state.schema.marks.textStyle;
  const items = pieces(state, range, (node) => !isBijoyFont(fontOf(node.marks), cfg.bijoyFont) && /[ঀ-৿]/.test(node.text!));
  for (const { node, from, to } of items.reverse()) {
    const old = node.marks.find((m) => m.type === ts);
    const withFont = (f: string) => ts.create({ ...(old?.attrs ?? {}), fontFamily: `"${f}"` }).addToSet(node.marks.filter((m) => m.type !== ts));
    const text = state.doc.textBetween(from, to);
    const prev = state.doc.textBetween(Math.max(0, from - 1), from);
    const parts = bijoyRuns(text, prev).map((r) => state.schema.text(r.text, withFont(r.en ? cfg.englishFont : cfg.bijoyFont)));
    tr.replaceWith(tr.mapping.map(from), tr.mapping.map(to), parts);
  }
  return items.length;
}

/** Convert every run set in a Bijoy font back to Unicode and remove the Bijoy/English fonts it set. */
export function docToUnicode(view: EditorView, cfg: Pick<AnsiConfig, 'bijoyFont' | 'englishFont'>, range?: { from: number; to: number }): number {
  const { state } = view;
  const tr = state.tr;
  const n = toUnicodeIn(tr, state, cfg, range);
  if (n) view.dispatch(closeHistory(tr));
  return n;
}

/** Bijoy → Unicode; the font becomes `unicodeFont`, or the document's own when none is given. Adds the steps to `tr`. */
export function toUnicodeIn(tr: Transaction, state: EditorState, cfg: Pick<AnsiConfig, 'bijoyFont' | 'englishFont'>, range?: { from: number; to: number }, unicodeFont?: string): number {
  const ts = state.schema.marks.textStyle;
  const items = pieces(state, range, (node) => {
    const f = fontOf(node.marks);
    return isBijoyFont(f, cfg.bijoyFont) || (!range && clean(f) === cfg.englishFont);
  });
  let n = 0;
  for (const { node, from, to } of items.reverse()) {
    const bj = isBijoyFont(fontOf(node.marks), cfg.bijoyFont);
    const old = node.marks.find((m) => m.type === ts);
    const attrs = { ...(old?.attrs ?? {}), fontFamily: unicodeFont ? `"${unicodeFont}"` : null };
    const keep = Object.entries(attrs as Record<string, unknown>).some(([k, v]) => (k !== 'fontFamily' || !!unicodeFont) && v !== null && v !== false && v !== undefined);
    const marks = keep ? ts.create(attrs).addToSet(node.marks.filter((m) => m.type !== ts)) : node.marks.filter((m) => m.type !== ts);
    const raw = state.doc.textBetween(from, to);
    const text = bj ? fixNukta(toUnicode(raw)) : raw;
    if (!text) continue;
    tr.replaceWith(tr.mapping.map(from), tr.mapping.map(to), state.schema.text(text, marks));
    n++;
  }
  return n;
}
