/**
 * Tiptap extension that types through the Bornona engine.
 * Physical keys: handleKeyDown. Touch keyboards that skip keydown: handleTextInput.
 * The on-screen keyboard calls typeText() directly.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';
import { resolveKey, resolveTypedChar, planType, fixNukta, isAnsiKey, type LayoutMap, type ToggleKey, type AnsiKey } from '../bornona-engine';
import { typeAnsi, backspaceAnsi, insertEnglishAnsi, type AnsiConfig } from './ansi-typing';

export interface BornonaConfig {
  bangla: boolean;
  map: LayoutMap;
  vowelForming: boolean;
  oldReph: boolean;
  /** true while the device's own keyboard is used (e.g. voice typing on iPad). */
  suspended: boolean;
  fixChandra?: boolean;
  toggleKey?: ToggleKey;
  /** Experimental Bijoy (ANSI) typing. */
  ansi?: AnsiConfig;
  ansiKey?: AnsiKey;
}

export interface BornonaOptions {
  getConfig: () => BornonaConfig;
  onToggleLanguage: () => void;
  /** A key was typed by the engine (used to flash the on-screen key). */
  onKey: (code: string) => void;
  /** A word was finished (space, punctuation, Enter): text before the boundary. */
  onWordDone: (before: string) => void;
  /** Several words were inserted at once (paste, suggestion phrase, voice). */
  onTextInserted: (text: string) => void;
  /**
   * Paste hook (Bijoy → Unicode). Return the text to insert instead of the clipboard
   * contents plus a message for the user, or null to paste normally.
   */
  convertPaste: (text: string, html: string) => { text: string; message: string } | null;
  onNotice: (message: string) => void;
  /** The ANSI typing key was pressed. */
  onToggleAnsi: () => void;
}

const LEAF = String.fromCharCode(0xfffc);
const BOUNDARY = /^[\s।,.;:?!)]$/;

/** Text of the current paragraph before the caret. */
export function textBeforeCaret(view: EditorView): string {
  const { $from } = view.state.selection;
  return $from.parent.textBetween(0, $from.parentOffset, undefined, LEAF);
}

/** Type `out` at the caret, applying vowel forming / reph exactly like v8. */
export function typeText(view: EditorView, out: string, cfg: BornonaConfig): void {
  if (cfg.ansi?.on) {
    if (cfg.bangla) typeAnsi(view, out, { ...cfg.ansi, vowelForming: cfg.vowelForming, oldReph: cfg.oldReph, fixChandra: cfg.fixChandra });
    else insertEnglishAnsi(view, out, cfg.ansi);
    return;
  }
  const { state } = view;
  const sel = state.selection;
  const edit = planType(textBeforeCaret(view), sel.empty, out, cfg);
  const tr = sel.empty ? state.tr.insertText(edit.text, sel.from - edit.deleteBefore, sel.from) : state.tr.insertText(edit.text, sel.from, sel.to);
  view.dispatch(tr.scrollIntoView());
}

/**
 * Insert plain text at the caret. Each newline starts a new paragraph that keeps the
 * current paragraph's style (voice "নতুন লাইন", converted Bijoy text).
 */
export function insertPlainText(view: EditorView, text: string): void {
  const tr = view.state.tr;
  if (!tr.selection.empty) tr.deleteSelection();
  fixNukta(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((line, i) => {
      if (i > 0) tr.split(tr.selection.from);
      if (line) tr.insertText(line);
    });
  // its own Undo step (paste, voice, converter and AI inserts)
  view.dispatch(closeHistory(tr).scrollIntoView());
}

/** Delete one character before the caret (on-screen ⌫). */
export function deleteBackward(view: EditorView, joinBackward: () => boolean, cfg?: BornonaConfig): void {
  const { state } = view;
  const sel = state.selection;
  if (cfg?.ansi?.on && backspaceAnsi(view, cfg.ansi)) return;
  if (!sel.empty) return view.dispatch(state.tr.deleteSelection().scrollIntoView());
  if (sel.$from.parentOffset > 0) {
    const before = textBeforeCaret(view);
    // the last code unit of an emoji (or any character above U+FFFF) is a low surrogate: delete both halves
    const last = before.charCodeAt(before.length - 1);
    const prev = before.charCodeAt(before.length - 2);
    const len = last >= 0xdc00 && last <= 0xdfff && prev >= 0xd800 && prev <= 0xdbff ? 2 : 1;
    return view.dispatch(state.tr.delete(sel.from - len, sel.from).scrollIntoView());
  }
  joinBackward();
}

export const BornonaExtension = Extension.create<BornonaOptions>({
  name: 'bornona',

  addOptions() {
    return {
      getConfig: () => ({ bangla: false, map: {}, vowelForming: true, oldReph: false, suspended: false }),
      onToggleLanguage: () => {},
      onKey: () => {},
      onWordDone: () => {},
      onTextInserted: () => {},
      convertPaste: () => null,
      onNotice: () => {},
      onToggleAnsi: () => {},
    };
  },

  addProseMirrorPlugins() {
    const opts = this.options;
    /** Where an IME composition started (−1: none). */
    let composeFrom = -1;
    return [
      new Plugin({
        key: new PluginKey('bornona'),
        props: {
          handleKeyDown(view, event) {
            if (view.composing) return false;
            const cfg = opts.getConfig();
            const ki = {
              code: event.code, key: event.key, shiftKey: event.shiftKey, altKey: event.altKey, ctrlKey: event.ctrlKey,
              metaKey: event.metaKey, altGraph: event.getModifierState?.('AltGraph'), isComposing: event.isComposing,
            };
            if (isAnsiKey(ki, cfg.ansiKey)) {
              opts.onToggleAnsi();
              return true;
            }
            const ansi = cfg.ansi?.on && !cfg.suspended ? cfg.ansi : null;
            if (ansi && event.key === 'Backspace' && !event.ctrlKey && !event.altKey && !event.metaKey) return backspaceAnsi(view, ansi);
            if (event.key === 'Enter' && !event.isComposing && !ansi) opts.onWordDone(textBeforeCaret(view));
            const a = resolveKey(
              ki,
              { bangla: cfg.bangla, map: cfg.map, suspended: cfg.suspended, toggleKey: cfg.toggleKey },
            );
            if (!a) {
              // English (or a space) next to Bijoy text must not take the Bijoy font
              if (ansi && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey && !cfg.bangla) {
                insertEnglishAnsi(view, event.key, ansi);
                return true;
              }
              return false;
            }
            if (a.kind === 'toggle-language') {
              opts.onToggleLanguage();
              return true;
            }
            if (a.kind === 'swallow') return true;
            typeText(view, a.text, cfg);
            opts.onKey(a.code);
            return true;
          },
          handleTextInput(view, _from, _to, text) {
            const cfg = opts.getConfig();
            // several letters at once (a phone keyboard's suggestion or autocorrect): type each through the layout
            if (composeFrom < 0 && !view.composing && text.length > 1 && text.length <= 64 && cfg.bangla && !cfg.suspended && !cfg.ansi?.on && /^[\x20-\x7e]+$/.test(text)) {
              const out = [...text].map((ch) => (ch === ' ' ? ' ' : resolveTypedChar(ch, { bangla: true, map: cfg.map, suspended: false })));
              if (out.every((x) => x !== null)) {
                for (const x of out) typeText(view, x as string, cfg);
                return true;
              }
            }
            const r = resolveTypedChar(text, { bangla: cfg.bangla, map: cfg.map, suspended: cfg.suspended });
            if (!r) {
              if (cfg.ansi?.on && !cfg.suspended && !cfg.bangla) {
                insertEnglishAnsi(view, text, cfg.ansi);
                return true;
              }
              return false;
            }
            typeText(view, r, cfg);
            return true;
          },
          handlePaste(view, event) {
            const cd = event.clipboardData;
            if (!cd) return false;
            const r = opts.convertPaste(cd.getData('text/plain'), cd.getData('text/html'));
            if (!r) return false;
            const before = textBeforeCaret(view);
            const lead = before && !/\s$/.test(before) && !/^\s/.test(r.text) ? ' ' : '';
            insertPlainText(view, lead + r.text);
            opts.onNotice(r.message);
            return true;
          },
          // Android keyboards with word prediction (Gboard, Samsung) "compose" a whole Latin word and
          // skip the per-letter path. When the composition ends, its Latin letters are typed again
          // through the layout. Turning off the keyboard's suggestion strip avoids the wait.
          handleDOMEvents: {
            compositionstart(view) {
              composeFrom = view.state.selection.from;
              return false;
            },
            compositionend(view) {
              const from = composeFrom;
              const cfg = opts.getConfig();
              if (from < 0 || !cfg.bangla || cfg.suspended || cfg.ansi?.on) {
                composeFrom = -1;
                return false;
              }
              // after ProseMirror has applied the committed text
              setTimeout(() => {
                composeFrom = -1;
                const to = view.state.selection.from;
                if (to <= from || to - from > 64) return;
                const latin = view.state.doc.textBetween(from, to, '');
                if (!/^[\x21-\x7e]+$/.test(latin)) return;
                const out = [...latin].map((ch) => resolveTypedChar(ch, { bangla: true, map: cfg.map, suspended: false }));
                if (out.some((x) => x === null)) return;
                view.dispatch(view.state.tr.delete(from, to));
                for (const x of out) typeText(view, x as string, cfg);
              }, 30);
              return false;
            },
          },
          transformPastedText: (text) => fixNukta(text),
          transformPastedHTML: (html) => fixNukta(html),
        },
      }),
    ];
  },

  onTransaction({ transaction }) {
    // ignore undo/redo and programmatic document loads
    if (!transaction.docChanged || transaction.getMeta('history$') || transaction.getMeta('pronotes-load')) return;
    // Bijoy text is not words to learn or suggest from
    if (this.options.getConfig().ansi?.on) return;
    let inserted = '';
    for (const step of transaction.steps) {
      const slice = (step as unknown as { slice?: { content: { size: number; textBetween: (a: number, b: number, s?: string) => string } } }).slice;
      if (slice && slice.content.size) inserted += slice.content.textBetween(0, slice.content.size, ' ');
    }
    if (!inserted) return;
    if (/\S\s+\S/.test(inserted)) {
      this.options.onTextInserted(inserted);
      return;
    }
    if (BOUNDARY.test(inserted.slice(-1))) {
      const before = textBeforeCaret(this.editor.view);
      this.options.onWordDone(before.slice(0, -1));
    }
  },
});
