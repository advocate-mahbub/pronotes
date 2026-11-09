/**
 * Find and replace: highlights every match, steps through them, replaces one or all.
 * Plain substring match (case-insensitive for English); Bangla is matched as typed (nukta letters normalised).
 * Text set in a Bijoy (ANSI) font is searched with the Bijoy spelling of the (Unicode) query, so one search
 * box finds both; a replacement there is written in Bijoy too.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { fixNukta } from '../bornona-engine';
import { isBijoyFont, toBijoy, toUnicode } from '../bijoy';

export interface FindState {
  query: string;
  caseSensitive: boolean;
  matches: FindMatch[];
  index: number;
}

export const findKey = new PluginKey<FindState>('find');

export interface FindMatch {
  from: number;
  to: number;
  /** The match is Bijoy-encoded text (a replacement is written in Bijoy). */
  bj?: boolean;
}

const fontOfNode = (n: PMNode) => n.marks.find((m) => m.type.name === 'textStyle')?.attrs.fontFamily;

/** All matches of `query` in the document (within text blocks; a match never crosses a block). */
export function findMatches(doc: PMNode, query: string, caseSensitive = false): FindMatch[] {
  const q = fixNukta(query);
  if (!q) return [];
  const norm = (s: string) => (caseSensitive ? s : s.toLowerCase());
  const needle = norm(q);
  // Bijoy spellings of a Bangla query: at a word start (†) and inside a word (‡); Bijoy is case-sensitive
  const bnQuery = /[\u0980-\u09FF]/.test(q);
  const bjNeedles = bnQuery ? [...new Set([toBijoy(q), toBijoy(q, 'ক')])].filter(Boolean) : [];
  const out: FindMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // map text offsets to document positions (leaf nodes count as one character)
    let text = '';
    const at: number[] = [];
    const bj: boolean[] = [];
    node.forEach((child, off) => {
      if (child.isText) {
        const b = isBijoyFont(fontOfNode(child));
        for (let i = 0; i < child.text!.length; i++) {
          at.push(pos + 1 + off + i);
          bj.push(b);
        }
        text += child.text;
      } else {
        at.push(pos + 1 + off);
        bj.push(false);
        text += '￼';
      }
    });
    const found: FindMatch[] = [];
    const hay = norm(text);
    let i = hay.indexOf(needle);
    while (i >= 0) {
      // Unicode matches outside Bijoy text (Bijoy text is Latin letters underneath)
      if (!bj[i]) found.push({ from: at[i], to: at[i + needle.length - 1] + 1 });
      i = hay.indexOf(needle, i + needle.length);
    }
    for (const b of bjNeedles) {
      let k = text.indexOf(b);
      while (k >= 0) {
        if (bj.slice(k, k + b.length).every(Boolean)) found.push({ from: at[k], to: at[k + b.length - 1] + 1, bj: true });
        k = text.indexOf(b, k + b.length);
      }
    }
    // in order, overlapping matches (the two Bijoy spellings) counted once
    found.sort((x, y) => x.from - y.from || y.to - x.to);
    for (const m of found) if (!out.length || m.from >= out[out.length - 1].to) out.push(m);
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

/** The replacement as it is written at a match: Bijoy (keeping ‡/† right for the letter before) in Bijoy text. */
function replacementFor(doc: PMNode, m: FindMatch, text: string): string {
  const t = fixNukta(text);
  if (!m.bj) return t;
  // the letter before is Bijoy too: read it back as Unicode to know whether the match is inside a word
  return toBijoy(t, toUnicode(doc.textBetween(Math.max(0, m.from - 3), m.from)));
}
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
            if (text) tr.insertText(replacementFor(state.doc, m, text), m.from, m.to);
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
              if (text) tr.insertText(replacementFor(state.doc, m, text), m.from, m.to);
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
