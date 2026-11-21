import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * The selection drawn by ProNotes itself (decisions.md 97). An iPhone or iPad paints its own faint tint over
 * selected text and ignores the page's ::selection colours, so in the dark themes a selection stayed dark and could
 * hardly be seen. The selected text now gets a class (`pn-sel`) whose colours contrast with the page: a light
 * band with dark letters on a dark page, a clear blue on a light one.
 */
export const SelectionMark = Extension.create({
  name: 'selectionMark',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('pnSelectionMark'),
      props: {
        decorations(state) {
          const { from, to, empty } = state.selection;
          if (empty || to - from < 1) return null;
          return DecorationSet.create(state.doc, [Decoration.inline(from, to, { class: 'pn-sel' })]);
        },
      },
    })];
  },
});
