/**
 * Words being spoken, shown in the document at the caret before they are final (decisions.md 77): grey
 * and a little blurred, not part of the text (no undo step, not saved, not exported). When the words are
 * final they are inserted as real text and this goes away. Also used for "লিখছে…" while a recording is
 * being written.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

interface Interim { text: string; kind: 'words' | 'busy' }
export const interimKey = new PluginKey<Interim>('interimText');

/** Shows (or, with '', clears) the not-yet-final words at the caret. */
export function setInterim(view: EditorView, text: string, kind: Interim['kind'] = 'words') {
  const cur = interimKey.getState(view.state);
  if (cur && cur.text === text && cur.kind === kind) return;
  view.dispatch(view.state.tr.setMeta(interimKey, { text, kind }).setMeta('addToHistory', false));
}

export const InterimText = Extension.create({
  name: 'interimText',
  addProseMirrorPlugins() {
    return [
      new Plugin<Interim>({
        key: interimKey,
        state: {
          init: () => ({ text: '', kind: 'words' }),
          apply: (tr, v) => (tr.getMeta(interimKey) as Interim | undefined) ?? v,
        },
        props: {
          decorations(state) {
            const v = interimKey.getState(state);
            if (!v?.text) return null;
            const w = Decoration.widget(state.selection.head, () => {
              const s = document.createElement('span');
              s.className = 'pn-interim ' + v.kind;
              s.setAttribute('data-testid', 'pn-interim');
              s.setAttribute('aria-live', 'polite');
              s.textContent = v.text;
              return s;
            }, { side: 1, key: v.kind + ':' + v.text, ignoreSelection: true });
            return DecorationSet.create(state.doc, [w]);
          },
        },
      }),
    ];
  },
});
