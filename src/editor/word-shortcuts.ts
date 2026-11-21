/**
 * Microsoft Word's keyboard shortcuts in the ProNotes editor (Windows keys; on Mac/iPad ⌘ takes the
 * place of Ctrl, as in Word for Mac). Keys are matched by their position (event.code), so they work the
 * same while typing Bangla. They run before the editor's own key bindings, but a key the Bornona engine
 * uses (the Bangla/English switch, the ANSI switch, an AltGr letter) stays with it (bornonaWants). Shortcuts the editor already had (Ctrl+B/I/U, Ctrl+Z/Y,
 * Ctrl+Alt+1–3, Ctrl+Enter, Shift+Enter, Tab in tables and lists) keep working and are listed in
 * WORD_SHORTCUTS for the help list.
 */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { Mark } from '@tiptap/pm/model';
import { isBijoyFont } from '../bijoy';
import { stepFontSize } from './formatting';

export const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');

interface Keys { mod?: boolean; shift?: boolean; alt?: boolean }
type KeyLike = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/** Exactly these modifiers (Ctrl — ⌘ on Apple — Shift, Alt) with the key at this position. */
export function keyIs(e: KeyLike, code: string | string[], k: Keys = {}, apple = IS_APPLE): boolean {
  const mod = apple ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  const none = !e.ctrlKey && !e.metaKey;
  return (Array.isArray(code) ? code.includes(e.code) : e.code === code)
    && (k.mod ? mod : none) && !!e.shiftKey === !!k.shift && !!e.altKey === !!k.alt;
}

/** The help list: what each key does (Bangla, translated by the UI) and how to write it. */
export interface ShortcutInfo { keys: string; what: string; group: 'char' | 'para' | 'edit' | 'file' }
const C = 'Ctrl';
export const WORD_SHORTCUTS: ShortcutInfo[] = [
  { group: 'char', keys: `${C}+B / ${C}+I / ${C}+U`, what: 'মোটা / বাঁকা / নিচে দাগ' },
  { group: 'char', keys: `${C}+Shift+D`, what: 'নিচে দুই দাগ' },
  { group: 'char', keys: `${C}+Shift+K`, what: 'Small Caps' },
  { group: 'char', keys: `${C}+Shift+A`, what: 'সব বড় হাতের অক্ষর (ইংরেজি)' },
  { group: 'char', keys: 'Shift+F3', what: 'ইংরেজির case বদল: ছোট → বড় → প্রথম অক্ষর বড়' },
  { group: 'char', keys: `${C}+= / ${C}+Shift+=`, what: 'নিচে ছোট (Subscript) / ওপরে ছোট (Superscript)' },
  { group: 'char', keys: `${C}+Shift+> / ${C}+Shift+<`, what: 'ফন্ট সাইজ পরের / আগের ধাপে' },
  { group: 'char', keys: `${C}+] / ${C}+[`, what: 'ফন্ট সাইজ ১ পয়েন্ট বাড়ান / কমান' },
  { group: 'char', keys: `${C}+Space`, what: 'অক্ষরের ফরম্যাট মুছুন (বাংলা/ইংরেজি বদলের কী এটা না হলে)' },
  { group: 'char', keys: `${C}+Shift+C / ${C}+Shift+V`, what: 'ফরম্যাট কপি / বসান' },
  { group: 'char', keys: `${C}+Shift+H`, what: 'হাইলাইট' },
  { group: 'char', keys: `${C}+D / ${C}+Shift+F`, what: 'ফন্টের তালিকা খুলুন' },
  { group: 'char', keys: `${C}+Shift+P`, what: 'ফন্ট সাইজের ঘরে যান' },
  { group: 'para', keys: `${C}+L / ${C}+E / ${C}+R / ${C}+J`, what: 'বামে / মাঝে / ডানে / দুই পাশ সমান' },
  { group: 'para', keys: `${C}+M / ${C}+Shift+M`, what: 'ইনডেন্ট বাড়ান / কমান' },
  { group: 'para', keys: `${C}+T / ${C}+Shift+T`, what: 'ঝুলন্ত (hanging) ইনডেন্ট বাড়ান / কমান' },
  { group: 'para', keys: `${C}+1 / ${C}+5 / ${C}+2`, what: 'লাইনের ফাঁক ১ / ১.৫ / ২' },
  { group: 'para', keys: `${C}+0`, what: 'প্যারার আগে ১২ পয়েন্ট ফাঁক দিন / তুলে দিন' },
  { group: 'para', keys: `${C}+Q`, what: 'প্যারার ফরম্যাট মুছুন' },
  { group: 'para', keys: `${C}+Shift+N`, what: 'সাধারণ প্যারা (Normal)' },
  { group: 'para', keys: `${C}+Alt+1 / 2 / 3`, what: 'শিরোনাম ১ / ২ / ৩' },
  { group: 'para', keys: `${C}+Shift+L`, what: 'বুলেট তালিকা' },
  { group: 'para', keys: `${C}+Shift+8`, what: 'ফরম্যাট চিহ্ন (¶) দেখান / লুকান' },
  { group: 'para', keys: 'Alt+Shift+↑ / ↓', what: 'প্যারা ওপরে / নিচে সরান' },
  { group: 'edit', keys: `${C}+Z / ${C}+Y`, what: 'Undo / Redo' },
  { group: 'edit', keys: `${C}+Enter`, what: 'পাতা ভাগ (Page break)' },
  { group: 'edit', keys: 'Shift+Enter', what: 'একই প্যারায় নতুন লাইন' },
  { group: 'edit', keys: `${C}+Shift+Space`, what: 'না-ভাঙা ফাঁক (nonbreaking space)' },
  { group: 'edit', keys: `${C}+Shift+-`, what: 'না-ভাঙা হাইফেন' },
  { group: 'edit', keys: `${C}+-`, what: 'ঐচ্ছিক হাইফেন' },
  { group: 'edit', keys: `${C}+Alt+-`, what: 'em ড্যাশ —' },
  { group: 'edit', keys: `${C}+Num -`, what: 'en ড্যাশ –' },
  { group: 'edit', keys: `${C}+Alt+C / R / T`, what: '© / ® / ™' },
  { group: 'edit', keys: `${C}+Alt+.`, what: 'তিন ডট …' },
  { group: 'edit', keys: `${C}+Backspace / ${C}+Delete`, what: 'আগের / পরের শব্দ মুছুন' },
  { group: 'file', keys: `${C}+S`, what: 'এখনই সেভ' },
  { group: 'file', keys: `${C}+F / ${C}+H`, what: 'খুঁজুন / খুঁজুন ও বদলান' },
  { group: 'file', keys: `${C}+P`, what: 'প্রিন্ট' },
];

/** The keys as this device writes them (⌘ and ⌥ on Mac/iPad). */
export const showKeys = (k: string, apple = IS_APPLE) => (apple ? k.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧') : k);

/* ---------- the commands ---------- */

interface CopiedFormat { marks: readonly Mark[]; para: Record<string, unknown> }
const PARA_RESET = { indL: null, indR: null, first: null, spBefore: null, spAfter: null, lineRule: null, lineVal: null, keepNext: false, keepLines: false, breakBefore: false };
const HANG = 720; // half an inch, Word's default tab stop

function isTextblock(name: string) { return name === 'paragraph' || name === 'heading'; }

/** Change the case of the English letters in the selection (Shift+F3 / Ctrl+Shift+A). */
export function changeCase(ed: Editor, mode: 'upper' | 'lower' | 'title' | 'cycle'): boolean {
  const { state } = ed;
  const { from, to, empty } = state.selection;
  if (empty) return false;
  const text = state.doc.textBetween(from, to, ' ');
  if (mode === 'cycle') {
    // Word's order: lower → UPPER → Title (by what the selection is now)
    mode = text === text.toLowerCase() ? 'upper' : text === text.toUpperCase() ? 'title' : 'lower';
  }
  const tr = state.tr;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true;
    const s = Math.max(from, pos);
    const e = Math.min(to, pos + node.nodeSize);
    const txt = node.text!.slice(s - pos, e - pos);
    const lead = s === from || /\s$/.test(state.doc.textBetween(Math.max(0, s - 1), s, ' ', ' '));
    const out = mode === 'upper' ? txt.toUpperCase() : mode === 'lower' ? txt.toLowerCase()
      : txt.toLowerCase().replace(/(^|\s)([a-z])/g, (m, a: string, b: string, i: number) => (i === 0 && !a && !lead ? m : a + b.toUpperCase()));
    if (out !== txt) tr.replaceWith(s, e, state.schema.text(out, node.marks));
    return false;
  });
  if (!tr.docChanged) return true;
  tr.setSelection(TextSelection.create(tr.doc, from, to));
  ed.view.dispatch(tr);
  return true;
}

/** Move the paragraph (or list item) with the caret one place up or down (Alt+Shift+↑/↓). */
export function moveBlock(ed: Editor, dir: -1 | 1): boolean {
  const { state } = ed;
  const { $from, $to } = state.selection;
  let d = $from.depth;
  while (d > 1 && $from.node(d - 1).childCount === 1) d--;
  const node = $from.node(d);
  if (!node || ['tableCell', 'tableHeader', 'tableRow', 'table'].includes(node.type.name) || $to.depth < d || $to.node(d) !== node) return false;
  const parent = $from.node(d - 1);
  const index = $from.index(d - 1);
  const other = index + dir;
  if (other < 0 || other >= parent.childCount) return true; // already at the edge: nothing to do, key is still ours
  const start = $from.before(d);
  const sib = parent.child(other);
  const tr = state.tr;
  const offFrom = state.selection.from - start;
  const offTo = state.selection.to - start;
  if (dir < 0) {
    const sibStart = start - sib.nodeSize;
    tr.delete(start, start + node.nodeSize).insert(sibStart, node);
    tr.setSelection(TextSelection.create(tr.doc, sibStart + offFrom, sibStart + offTo));
  } else {
    const end = start + node.nodeSize;
    tr.delete(end, end + sib.nodeSize).insert(start, sib);
    const ns = start + sib.nodeSize;
    tr.setSelection(TextSelection.create(tr.doc, ns + offFrom, ns + offTo));
  }
  ed.view.dispatch(tr.scrollIntoView());
  return true;
}

function insertText(ed: Editor, s: string): boolean {
  // straight into the text (insertContent would collapse a nonbreaking space)
  ed.view.dispatch(ed.state.tr.insertText(s).scrollIntoView());
  return true;
}

function curSize(ed: Editor, fallback: number): number {
  return parseFloat(String(ed.getAttributes('textStyle').fontSize || '')) || fallback;
}

/** Word's character-format reset; Bijoy (ANSI) text keeps its font so it does not turn into Latin letters. */
function clearChar(ed: Editor, bijoyFont?: string): boolean {
  const { state } = ed;
  const { from, to } = state.selection;
  const ts = state.schema.marks.textStyle;
  const keep: { from: number; to: number; font: string }[] = [];
  state.doc.nodesBetween(from, to, (n, pos) => {
    const f = n.isText ? n.marks.find((m) => m.type === ts)?.attrs.fontFamily : null;
    if (f && isBijoyFont(f, bijoyFont)) keep.push({ from: Math.max(from, pos), to: Math.min(to, pos + n.nodeSize), font: String(f) });
  });
  return ed.chain().focus().unsetAllMarks().command(({ tr }) => {
    for (const k of keep) tr.addMark(k.from, k.to, ts.create({ fontFamily: k.font }));
    return true;
  }).run();
}

function pasteFormat(ed: Editor, f: CopiedFormat): boolean {
  const { state } = ed;
  const { from, to, empty } = state.selection;
  const tr = state.tr;
  if (empty) tr.setStoredMarks(f.marks);
  else { tr.removeMark(from, to); f.marks.forEach((m) => tr.addMark(from, to, m)); }
  const { level: _l, pstyle, ...rest } = f.para;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!isTextblock(node.type.name)) return true;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...rest, ...(node.type.name === 'paragraph' && pstyle !== undefined ? { pstyle } : {}), ...(node.type.name === 'heading' ? { level: node.attrs.level } : {}) });
    return false;
  });
  ed.view.dispatch(tr);
  return true;
}

export interface WordShortcutsOptions {
  /** The Bijoy (ANSI) font in use, so Ctrl+Space keeps Bijoy text readable. */
  getBijoyFont: () => string | undefined;
  /** Size used when the text has none set (the document's default size). */
  getDefaultSize: () => number;
  /** Ctrl+Space is also a Bangla/English switch key; it clears formatting only when the switch is another key. */
  ctrlSpaceIsToggle: () => boolean;
  /** The Bornona engine has a use for this key (switch keys, AltGr letters of the layout). */
  bornonaWants: (e: KeyboardEvent) => boolean;
  apple: boolean;
}

export const WordShortcuts = Extension.create<WordShortcutsOptions, { copied: CopiedFormat | null }>({
  name: 'wordShortcuts',
  // before the editor's key bindings (100), so Word's meaning of a key wins over Tiptap's
  priority: 101,
  addOptions() {
    return { getBijoyFont: () => undefined, getDefaultSize: () => 12, ctrlSpaceIsToggle: () => true, bornonaWants: () => false, apple: IS_APPLE };
  },
  addStorage() {
    return { copied: null };
  },
  addProseMirrorPlugins() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the extension, used from inside ProseMirror's plugin
    const ext = this;
    const ed = () => ext.editor;
    const para = (attrs: Record<string, unknown>) => ed().chain().focus().setParagraphFormat(attrs).run();
    const curPara = () => ed().state.selection.$from.parent.attrs as Record<string, number | null | string>;
    const setSize = (n: number) => ed().chain().focus().setFontSize(Math.min(400, Math.max(1, n)) + 'pt').run();
    const size = () => curSize(ed(), ext.options.getDefaultSize());
    const toggleSup = () => ed().chain().focus().unsetSubscript().toggleSuperscript().run();
    const toggleSub = () => ed().chain().focus().unsetSuperscript().toggleSubscript().run();

    type Rule = [string | string[], Keys, () => boolean];
    const M = { mod: true }, MS = { mod: true, shift: true }, MA = { mod: true, alt: true };
    const rules: Rule[] = [
      // characters
      ['KeyD', MS, () => (ed().isActive('underline', { ustyle: 'double' }) ? ed().chain().focus().unsetUnderline().run() : ed().chain().focus().setUnderline().setUnderlineStyle('double').run())],
      ['KeyK', MS, () => ed().chain().focus().setCharFormat({ smallCaps: !ed().getAttributes('textStyle').smallCaps }).run()],
      ['KeyA', MS, () => { const { from, to } = ed().state.selection; const x = ed().state.doc.textBetween(from, to, ' '); return changeCase(ed(), x === x.toUpperCase() ? 'lower' : 'upper'); }],
      ['F3', { shift: true }, () => changeCase(ed(), 'cycle')],
      ['Equal', M, toggleSub],
      ['NumpadAdd', M, toggleSup],
      ['Equal', MS, toggleSup],
      ['Period', MS, () => setSize(stepFontSize(size(), 1))],
      ['Comma', MS, () => setSize(stepFontSize(size(), -1))],
      ['BracketRight', M, () => setSize(size() + 1)],
      ['BracketLeft', M, () => setSize(size() - 1)],
      ['Space', M, () => (ext.options.ctrlSpaceIsToggle() ? false : clearChar(ed(), ext.options.getBijoyFont()))],
      ['KeyC', MS, () => {
        const { state } = ed();
        ext.storage.copied = { marks: state.storedMarks ?? state.selection.$from.marks(), para: { ...state.selection.$from.parent.attrs } };
        return true;
      }],
      ['KeyV', MS, () => (ext.storage.copied ? pasteFormat(ed(), ext.storage.copied) : true)],
      // paragraphs
      ['KeyL', M, () => ed().chain().focus().setTextAlign('left').run()],
      ['KeyE', M, () => ed().chain().focus().setTextAlign('center').run()],
      ['KeyR', M, () => ed().chain().focus().setTextAlign('right').run()],
      ['KeyJ', M, () => ed().chain().focus().setTextAlign('justify').run()],
      ['KeyM', M, () => ed().chain().focus().indentMore().run()],
      ['KeyM', MS, () => ed().chain().focus().indentLess().run()],
      ['KeyT', M, () => { const a = curPara(); return para({ indL: (Number(a.indL) || 0) + HANG, first: (Number(a.first) || 0) - HANG }); }],
      ['KeyT', MS, () => {
        const a = curPara();
        const l = Number(a.indL) || 0, f = Number(a.first) || 0;
        if (l < HANG || f > -HANG) return true;
        return para({ indL: l - HANG || null, first: f + HANG || null });
      }],
      [['Digit1', 'Numpad1'], M, () => para({ lineRule: 'auto', lineVal: 1 })],
      [['Digit2', 'Numpad2'], M, () => para({ lineRule: 'auto', lineVal: 2 })],
      [['Digit5', 'Numpad5'], M, () => para({ lineRule: 'auto', lineVal: 1.5 })],
      [['Digit0', 'Numpad0'], M, () => para({ spBefore: Number(curPara().spBefore) > 0 ? null : 12 })],
      ['KeyQ', M, () => ed().chain().focus().unsetTextAlign().setParagraphFormat(PARA_RESET).run()],
      ['KeyN', MS, () => ed().chain().focus().setParagraph().run()],
      ['KeyL', MS, () => ed().chain().focus().toggleBulletList().run()],
      ['Digit8', MS, () => ed().chain().focus().toggleFormattingMarks().run()],
      ['ArrowUp', { shift: true, alt: true }, () => moveBlock(ed(), -1)],
      ['ArrowDown', { shift: true, alt: true }, () => moveBlock(ed(), 1)],
      // special characters
      ['Space', MS, () => insertText(ed(), ' ')],
      ['Minus', MS, () => insertText(ed(), '‑')],
      ['Minus', M, () => insertText(ed(), '­')],
      ['NumpadSubtract', M, () => insertText(ed(), '–')],
      [['Minus', 'NumpadSubtract'], MA, () => insertText(ed(), '—')],
      ['KeyC', MA, () => insertText(ed(), '©')],
      ['KeyR', MA, () => insertText(ed(), '®')],
      ['KeyT', MA, () => insertText(ed(), '™')],
      ['Period', MA, () => insertText(ed(), '…')],
    ];

    return [
      new Plugin({
        key: new PluginKey('wordShortcuts'),
        props: {
          handleKeyDown(_view, event) {
            if (event.isComposing || ext.options.bornonaWants(event)) return false;
            // a letter the person's own keyboard types with AltGr (ć, ł, €…) is never taken for a Ctrl+Alt shortcut
            const altGr = event.key.length === 1 && /[^\x00-\x7f]/.test(event.key);
            for (const [code, k, run] of rules) {
              if (!keyIs(event, code, k, ext.options.apple) || (k.alt && altGr)) continue;
              if (!run()) return false;
              event.preventDefault(); // the browser's own use of the key (zoom, bookmark, new tab…) is skipped
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
