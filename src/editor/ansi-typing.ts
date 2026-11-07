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

/** Type `out` (Unicode, from the layout) in Bijoy. */
export function typeAnsi(view: EditorView, out: string, cfg: AnsiConfig & { vowelForming: boolean; oldReph: boolean; fixChandra?: boolean }): void {
  const { state } = view;
  const sel = state.selection;
  const marks = marksWithFont(view, cfg.bijoyFont);
  if (!sel.empty) {
    const tr = state.tr.replaceWith(sel.from, sel.to, state.schema.text(toBijoy(out), marks));
    view.dispatch(tr.scrollIntoView());
    return;
  }
  const w = bijoyWordBefore(view, cfg);
  const uni = fixNukta(toUnicode(w.text));
  const edit = planType(uni, true, out, { bangla: true, vowelForming: cfg.vowelForming, oldReph: cfg.oldReph, fixChandra: cfg.fixChandra });
  const next = applyEdit(uni, uni.length, edit).value;
  const bj = toBijoy(next);
  const tr = state.tr;
  if (bj) tr.replaceWith(w.from, sel.from, state.schema.text(bj, marks));
  else tr.delete(w.from, sel.from);
  view.dispatch(tr.scrollIntoView());
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
  const uni = [...fixNukta(toUnicode(w.text))];
  uni.pop();
  const bj = toBijoy(uni.join(''));
  const tr = state.tr;
  if (bj) tr.replaceWith(w.from, state.selection.from, state.schema.text(bj, marksWithFont(view, cfg.bijoyFont)));
  else tr.delete(w.from, state.selection.from);
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** Convert the whole document (or nothing if it is already so): Unicode → Bijoy. Returns the number of runs changed. */
export function docToBijoy(view: EditorView, cfg: Pick<AnsiConfig, 'bijoyFont' | 'englishFont'>): number {
  const { state } = view;
  const tr = state.tr;
  const ts = state.schema.marks.textStyle;
  let n = 0;
  const items: { pos: number; node: PMNode }[] = [];
  state.doc.descendants((node, pos) => {
    if (node.isText && !isBijoyFont(fontOf(node.marks), cfg.bijoyFont) && /[ঀ-৿]/.test(node.text!)) items.push({ pos, node });
  });
  for (const { pos, node } of items.reverse()) {
    const old = node.marks.find((m) => m.type === ts);
    const withFont = (f: string) => ts.create({ ...(old?.attrs ?? {}), fontFamily: `"${f}"` }).addToSet(node.marks.filter((m) => m.type !== ts));
    const parts = bijoyRuns(node.text!).map((r) => state.schema.text(r.text, withFont(r.en ? cfg.englishFont : cfg.bijoyFont)));
    tr.replaceWith(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize), parts);
    n++;
  }
  if (n) view.dispatch(closeHistory(tr));
  return n;
}

/** Convert every run set in a Bijoy font back to Unicode and remove the Bijoy/English fonts it set. */
export function docToUnicode(view: EditorView, cfg: Pick<AnsiConfig, 'bijoyFont' | 'englishFont'>): number {
  const { state } = view;
  const tr = state.tr;
  const ts = state.schema.marks.textStyle;
  let n = 0;
  const items: { pos: number; node: PMNode; bj: boolean }[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const f = fontOf(node.marks);
    if (isBijoyFont(f, cfg.bijoyFont)) items.push({ pos, node, bj: true });
    else if (clean(f) === cfg.englishFont) items.push({ pos, node, bj: false });
  });
  for (const { pos, node, bj } of items.reverse()) {
    const old = node.marks.find((m) => m.type === ts);
    const attrs = { ...(old?.attrs ?? {}), fontFamily: null };
    const keep = Object.entries(attrs).some(([k, v]) => k !== 'fontFamily' && v !== null && v !== false && v !== undefined);
    const marks = keep ? ts.create(attrs).addToSet(node.marks.filter((m) => m.type !== ts)) : node.marks.filter((m) => m.type !== ts);
    const text = bj ? fixNukta(toUnicode(node.text!)) : node.text!;
    if (!text) continue;
    tr.replaceWith(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize), state.schema.text(text, marks));
    n++;
  }
  if (n) view.dispatch(closeHistory(tr));
  return n;
}
