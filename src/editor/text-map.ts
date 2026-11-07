/**
 * Change the text of the document (or the selection) run by run, keeping every run's formatting.
 * Text typed in Bijoy (ANSI) is left alone. One transaction, so a single Undo brings it back.
 */
import type { EditorView } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as PMNode } from '@tiptap/pm/model';
import { isBijoyFont } from '../bijoy';

export function mapDocText(view: EditorView, fn: (s: string) => string, selectionOnly: boolean): number {
  const { state } = view;
  const { from, to, empty } = state.selection;
  const a = selectionOnly && !empty ? from : 0;
  const b = selectionOnly && !empty ? to : state.doc.content.size;
  const items: { from: number; to: number; node: PMNode; text: string }[] = [];
  state.doc.nodesBetween(a, b, (node, pos) => {
    if (!node.isText) return;
    const f = node.marks.find((m) => m.type.name === 'textStyle')?.attrs.fontFamily;
    if (isBijoyFont(f)) return;
    const s = Math.max(a, pos);
    const e = Math.min(b, pos + node.nodeSize);
    const text = node.text!.slice(s - pos, e - pos);
    const next = fn(text);
    if (next !== text) items.push({ from: s, to: e, node, text: next });
  });
  if (!items.length) return 0;
  const tr = state.tr;
  for (const it of items.reverse()) {
    if (it.text) tr.replaceWith(it.from, it.to, state.schema.text(it.text, it.node.marks));
    else tr.delete(it.from, it.to);
  }
  // its own Undo step, not merged with the typing before it
  view.dispatch(closeHistory(tr));
  return items.length;
}

/** Text of the selection, or of the whole document when nothing is selected. */
export function selectedOrAll(view: EditorView): { text: string; whole: boolean } {
  const { state } = view;
  const { from, to, empty } = state.selection;
  return empty
    ? { text: state.doc.textBetween(0, state.doc.content.size, '\n', ' '), whole: true }
    : { text: state.doc.textBetween(from, to, '\n', ' '), whole: false };
}
