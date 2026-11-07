/**
 * Word-like direct formatting (Home tab, Font and Paragraph panels).
 * Values are stored in Word's own units so the .docx export can write them unchanged:
 * twips for indents (1440 = 1 inch), points for spacing, percent for character scale.
 */
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type LineRule = 'auto' | 'atLeast' | 'exact';

/** Paragraph attributes (types: paragraph, heading). null = not set (style or document default applies). */
export interface ParagraphFormat {
  /** Left indent in twips, Word's "Left": where the lines after the first one start. */
  indL: number | null;
  indR: number | null;
  /** First-line indent in twips; negative = hanging indent. */
  first: number | null;
  /** Space before / after the paragraph, points. */
  spBefore: number | null;
  spAfter: number | null;
  lineRule: LineRule | null;
  /** auto: multiple of single spacing (1.5); atLeast/exact: points. */
  lineVal: number | null;
  keepNext: boolean;
  keepLines: boolean;
  breakBefore: boolean;
  /** Widow/orphan control (Word's default is on). */
  widow: boolean;
}

/** Character attributes kept on the textStyle mark (with color, font family and size). */
export interface CharFormat {
  /** Character scale in percent (Word "Scale": 33–200). */
  scale: number | null;
  /** Letter spacing in points (positive = expanded, negative = condensed). */
  spacing: number | null;
  /** Raised (+) or lowered (−) position in points. */
  position: number | null;
  /** Kerning for fonts at or above this size (points). */
  kern: number | null;
  smallCaps: boolean;
}

export type UnderlineStyle = 'single' | 'double' | 'dotted' | 'wavy';

/** Multiplier for "single" line spacing on screen (Bangla fonts need more room than Latin ones). */
export const SINGLE_LINE = 1.3;
export const twipsToPx = (t: number) => t / 15;
export const INDENT_STEP = 720; // ½ inch, like Word's Increase Indent

const num = (v: string | null) => (v === null || v === '' || isNaN(Number(v)) ? null : Number(v));
const bool = (v: string | null) => v === 'true';

export function paragraphStyleCss(a: Partial<ParagraphFormat>): string {
  const css: string[] = [];
  // a direct indent replaces the paragraph style's own (padding-left of the numbered style)
  if (a.indL != null) css.push(`padding-left:0;margin-left:${twipsToPx(a.indL)}px`);
  if (a.indR != null) css.push(`margin-right:${twipsToPx(a.indR)}px`);
  if (a.first != null) css.push(`text-indent:${twipsToPx(a.first)}px`);
  if (a.spBefore != null) css.push(`margin-top:${a.spBefore}pt`);
  if (a.spAfter != null) css.push(`margin-bottom:${a.spAfter}pt`);
  if (a.lineRule && a.lineVal != null) {
    css.push(a.lineRule === 'auto' ? `line-height:${(a.lineVal * SINGLE_LINE).toFixed(3)}` : `line-height:${a.lineVal}pt`);
  }
  return css.join(';');
}

export function charStyleCss(a: Partial<CharFormat>): string {
  const css: string[] = [];
  if (a.spacing != null && a.spacing !== 0) css.push(`letter-spacing:${a.spacing}pt`);
  if (a.position != null && a.position !== 0) css.push(`position:relative;top:${-a.position}pt`);
  if (a.kern != null) css.push('font-kerning:normal');
  if (a.smallCaps) css.push('font-variant-caps:small-caps');
  if (a.scale != null && a.scale !== 100) css.push(`display:inline-block;transform:scaleX(${a.scale / 100});transform-origin:0 50%;text-indent:0`);
  return css.join(';');
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      setParagraphFormat: (attrs: Partial<ParagraphFormat>) => ReturnType;
      indentMore: () => ReturnType;
      indentLess: () => ReturnType;
    };
    charFormat: {
      setCharFormat: (attrs: Partial<CharFormat>) => ReturnType;
      setUnderlineStyle: (style: UnderlineStyle) => ReturnType;
    };
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
  }
}

const P_ATTRS: (keyof ParagraphFormat)[] = ['indL', 'indR', 'first', 'spBefore', 'spAfter', 'lineRule', 'lineVal', 'keepNext', 'keepLines', 'breakBefore', 'widow'];

export const ParagraphFormatting = Extension.create({
  name: 'paragraphFormat',
  addGlobalAttributes() {
    const attr = (key: keyof ParagraphFormat) => {
      const isBool = ['keepNext', 'keepLines', 'breakBefore', 'widow'].includes(key);
      const dflt = key === 'widow' ? true : isBool ? false : null;
      return {
        default: dflt,
        keepOnSplit: key !== 'breakBefore',
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute('data-' + key.toLowerCase());
          if (v === null) return dflt;
          return isBool ? bool(v) : key === 'lineRule' ? v : num(v);
        },
        // the style is written once, by the first attribute (see renderHTML below)
        renderHTML: (a: Record<string, unknown>) => {
          const v = a[key];
          if (v === dflt || v === null || v === undefined) return {};
          return { ['data-' + key.toLowerCase()]: String(v) };
        },
      };
    };
    const attributes: Record<string, ReturnType<typeof attr>> = {};
    for (const k of P_ATTRS) attributes[k] = attr(k);
    // one more attribute only to emit the combined inline style
    (attributes as Record<string, unknown>).pfStyle = {
      default: null,
      parseHTML: () => null,
      renderHTML: (a: Record<string, unknown>) => {
        const css = paragraphStyleCss(a as Partial<ParagraphFormat>);
        return css ? { style: css } : {};
      },
    };
    return [{ types: ['paragraph', 'heading'], attributes }];
  },
  addCommands() {
    const setBoth =
      (attrs: Record<string, unknown>) =>
      ({ commands }: { commands: { updateAttributes: (t: string, a: Record<string, unknown>) => boolean } }) => {
        const a = commands.updateAttributes('paragraph', attrs);
        const b = commands.updateAttributes('heading', attrs);
        return a || b;
      };
    return {
      setParagraphFormat: (attrs) => setBoth(attrs as Record<string, unknown>),
      indentMore:
        () =>
        ({ editor, state, chain }) => {
          if (editor.isActive('listItem') || editor.isActive('taskItem')) return chain().sinkListItem(editor.isActive('taskItem') ? 'taskItem' : 'listItem').run();
          const cur = (state.selection.$from.parent.attrs.indL as number | null) ?? 0;
          return setBoth({ indL: cur + INDENT_STEP })({ commands: editor.commands as never });
        },
      indentLess:
        () =>
        ({ editor, state, chain }) => {
          if (editor.isActive('listItem') || editor.isActive('taskItem')) return chain().liftListItem(editor.isActive('taskItem') ? 'taskItem' : 'listItem').run();
          const cur = (state.selection.$from.parent.attrs.indL as number | null) ?? 0;
          const next = Math.max(0, cur - INDENT_STEP);
          return setBoth({ indL: next === 0 ? null : next })({ commands: editor.commands as never });
        },
    };
  },
});

const C_ATTRS: (keyof CharFormat)[] = ['scale', 'spacing', 'position', 'kern', 'smallCaps'];

export const CharFormatting = Extension.create({
  name: 'charFormat',
  addGlobalAttributes() {
    const attributes: Record<string, unknown> = {};
    for (const k of C_ATTRS) {
      attributes[k] = {
        default: k === 'smallCaps' ? false : null,
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute('data-' + k.toLowerCase());
          return k === 'smallCaps' ? bool(v) : num(v);
        },
        renderHTML: (a: Record<string, unknown>) => {
          const v = a[k];
          if (v === null || v === undefined || v === false) return {};
          return { ['data-' + k.toLowerCase()]: String(v) };
        },
      };
    }
    attributes.cfStyle = {
      default: null,
      parseHTML: () => null,
      renderHTML: (a: Record<string, unknown>) => {
        const css = charStyleCss(a as Partial<CharFormat>);
        return css ? { style: css } : {};
      },
    };
    return [
      { types: ['textStyle'], attributes: attributes as never },
      {
        types: ['underline'],
        attributes: {
          ustyle: {
            default: 'single',
            parseHTML: (el: HTMLElement) => el.getAttribute('data-ustyle') || 'single',
            renderHTML: (a: Record<string, unknown>) =>
              a.ustyle && a.ustyle !== 'single' ? { 'data-ustyle': a.ustyle, style: `text-decoration-style:${a.ustyle}` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setCharFormat:
        (attrs) =>
        ({ chain }) =>
          chain().setMark('textStyle', attrs as Record<string, unknown>).removeEmptyTextStyle().run(),
      setUnderlineStyle:
        (style) =>
        ({ chain }) =>
          chain().setMark('underline', { ustyle: style }).run(),
    };
  },
});

/** Manual page break (a block of its own, like Word's Ctrl+Enter). */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-page-break]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': '', class: 'pb' })],
  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: 'pageBreak' }, { type: 'paragraph' }]).run(),
    };
  },
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.setPageBreak() };
  },
});

/** Font sizes offered by the size box and stepped through by A+ / A−. */
export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 22, 23, 24, 26, 28, 32, 36, 48, 72];
export function stepFontSize(cur: number, dir: 1 | -1): number {
  if (dir > 0) return FONT_SIZES.find((s) => s > cur) ?? Math.min(cur + 10, 400);
  return [...FONT_SIZES].reverse().find((s) => s < cur) ?? Math.max(1, cur - 1);
}

/* ---------- ¶ formatting marks (screen only) ---------- */

const marksKey = new PluginKey<boolean>('formattingMarks');
export const marksShown = (state: EditorState) => marksKey.getState(state) ?? false;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    formattingMarks: { toggleFormattingMarks: (on?: boolean) => ReturnType };
  }
}

/** Shows spaces as · and paragraph ends as ¶ (like Word's Show/Hide ¶). Never printed or exported. */
export const FormattingMarks = Extension.create({
  name: 'formattingMarks',
  addProseMirrorPlugins() {
    return [
      new Plugin<boolean>({
        key: marksKey,
        state: {
          init: () => false,
          apply: (tr, v) => {
            const m = tr.getMeta(marksKey);
            return typeof m === 'boolean' ? m : v;
          },
        },
        props: {
          decorations(state) {
            if (!marksKey.getState(state)) return null;
            const deco: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.isText) {
                const t = node.text!;
                for (let i = t.indexOf(' '); i >= 0; i = t.indexOf(' ', i + 1)) deco.push(Decoration.inline(pos + i, pos + i + 1, { class: 'fm-sp' }));
                return false;
              }
              if (node.isTextblock) {
                const end = pos + node.nodeSize - 1;
                deco.push(Decoration.widget(end, () => {
                  const s = document.createElement('span');
                  s.className = 'fm-para';
                  s.textContent = '¶';
                  return s;
                }, { side: 1, ignoreSelection: true, key: 'p' + end }));
              }
              return true;
            });
            return DecorationSet.create(state.doc, deco);
          },
        },
      }),
    ];
  },
  addCommands() {
    return {
      toggleFormattingMarks:
        (on) =>
        ({ state, tr, dispatch }) => {
          if (dispatch) tr.setMeta(marksKey, on ?? !marksKey.getState(state));
          return true;
        },
    };
  },
});

/**
 * Indents a paragraph style gives by itself (Word terms, twips): used by the ruler and the
 * Paragraph panel to show the current values when the paragraph has no direct indent.
 */
export const STYLE_INDENTS: Record<string, { indL: number; first: number }> = {
  normal: { indL: 0, first: 720 },
  numbered: { indL: 720, first: -720 },
  party: { indL: 3280, first: 0 },
  party2: { indL: 3680, first: 0 },
};
export function effectiveIndent(attrs: Record<string, unknown>, legal: boolean): { indL: number; indR: number; first: number } {
  const st = legal ? STYLE_INDENTS[String(attrs.pstyle || 'normal')] : undefined;
  return {
    indL: (attrs.indL as number | null) ?? st?.indL ?? 0,
    indR: (attrs.indR as number | null) ?? 0,
    first: (attrs.first as number | null) ?? st?.first ?? 0,
  };
}
