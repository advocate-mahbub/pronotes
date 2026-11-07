/**
 * Find and replace: highlights every match, steps through them, replaces one or all.
 * Plain substring match (case-insensitive for English); Bangla is matched as typed (nukta letters normalised).
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { fixNukta } from '../bornona-engine';

export interface FindState {
  query: string;
  caseSensitive: boolean;
  matches: { from: number; to: number }[];
  index: number;
}

export const findKey = new PluginKey<FindState>('find');

/** All matches of `query` in the document (within text blocks; a match never crosses a block). */
export function findMatches(doc: PMNode, query: string, caseSensitive = false): { from: number; to: number }[] {
  const q = fixNukta(query);
  if (!q) return [];
  const norm = (s: string) => (caseSensitive ? s : s.toLowerCase());
  const needle = norm(q);
  const out: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // map text offsets to document positions (leaf nodes count as one character)
    let text = '';
    const at: number[] = [];
    node.forEach((child, off) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) at.push(pos + 1 + off + i);
        text += child.text;
      } else {
        at.push(pos + 1 + off);
        text += '￼';
      }
    });
    const hay = norm(text);
    let i = hay.indexOf(needle);
    while (i >= 0) {
      out.push({ from: at[i], to: at[i + needle.length - 1] + 1 });
      i = hay.indexOf(needle, i + needle.length);
    }
    return false;
  });
  return out;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    findReplace: {
      setFindQuery: (query: string, caseSensitive?: boolean) => ReturnType;
      findNext: () => ReturnType;
      findPrev: () => ReturnType;
      replaceCurrent: (text: string) => ReturnType;
      replaceAll: (text: string) => ReturnType;
      clearFind: () => ReturnType;
    };
  }
}

const meta = (tr: Transaction, s: Partial<FindState>) => tr.setMeta(findKey, s);
export const getFind = (state: EditorState) => findKey.getState(state)!;

export const FindReplace = Extension.create({
  name: 'findReplace',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({ query: '', caseSensitive: false, matches: [], index: 0 }),
          apply(tr, old) {
            const m = tr.getMeta(findKey) as Partial<FindState> | undefined;
            const next = { ...old, ...m };
            if (m || tr.docChanged) {
              next.matches = findMatches(tr.doc, next.query, next.caseSensitive);
              if (next.index >= next.matches.length) next.index = Math.max(0, next.matches.length - 1);
            }
            return next;
          },
        },
        props: {
          decorations(state) {
            const s = findKey.getState(state);
            if (!s || !s.matches.length) return null;
            return DecorationSet.create(
              state.doc,
              s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.index ? 'find-hit find-cur' : 'find-hit' })),
            );
          },
        },
      }),
    ];
  },
  addCommands() {
    const go =
      (dir: 1 | -1) =>
      () =>
      ({ state, dispatch, tr }: { state: EditorState; dispatch?: (tr: Transaction) => void; tr: Transaction }) => {
        const s = getFind(state);
        if (!s.matches.length) return false;
        const index = (s.index + dir + s.matches.length) % s.matches.length;
        if (dispatch) {
          meta(tr, { index });
          const m = s.matches[index];
          tr.setSelection(TextSelection.create(tr.doc, m.from, m.to));
          tr.scrollIntoView();
        }
        return true;
      };
    return {
      setFindQuery:
        (query, caseSensitive = false) =>
        ({ tr, dispatch }) => {
          if (dispatch) meta(tr, { query, caseSensitive, index: 0 });
          return true;
        },
      findNext: go(1),
      findPrev: go(-1),
      replaceCurrent:
        (text) =>
        ({ state, tr, dispatch }) => {
          const s = getFind(state);
          const m = s.matches[s.index];
          if (!m) return false;
          if (dispatch) {
            if (text) tr.insertText(fixNukta(text), m.from, m.to);
            else tr.delete(m.from, m.to);
          }
          return true;
        },
      replaceAll:
        (text) =>
        ({ state, tr, dispatch }) => {
          const s = getFind(state);
          if (!s.matches.length) return false;
          if (dispatch) {
            for (const m of [...s.matches].reverse()) {
              if (text) tr.insertText(fixNukta(text), m.from, m.to);
              else tr.delete(m.from, m.to);
            }
          }
          return true;
        },
      clearFind:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) meta(tr, { query: '', index: 0 });
          return true;
        },
    };
  },
});
