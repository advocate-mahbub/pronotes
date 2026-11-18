import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import { TextStyleKit } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import Heading from '@tiptap/extension-heading';
import { BornonaExtension, type BornonaOptions } from './bornona-extension';
import { LegalParagraph } from './legal-format';
import { CharFormatting, FormattingMarks, PageBreak, ParagraphFormatting } from './formatting';
import { FindReplace } from './find-replace';
import { Pagination, type PageLayout } from './pagination';
import { TableTools, SyncTableView } from './table-tools';
import { WordShortcuts } from './word-shortcuts';
import { hasAltLayer, isAnsiKey, isToggleKey } from '../bornona-engine';

/** Markdown-like shortcuts ("- ", "1. ", "# ", "[ ] ") must never reshape a legal draft while typing. */
const noInput = { addInputRules: () => [] };

/**
 * Extensions used by the ProNotes editor (all document kinds share one schema;
 * the toolbar decides which tools each kind shows). Code and links stay off.
 */
/** Word puts these keys to other uses (Ctrl+Shift+L bullets, Ctrl+Shift+8 ¶); word-shortcuts.ts has Word's set. */
const noKeys = { addKeyboardShortcuts: () => ({}) };

export function editorExtensions(bornona: Partial<BornonaOptions> & Pick<BornonaOptions, 'getConfig'>, opts: { getLayout?: () => PageLayout; getDefaultSize?: () => number } = {}) {
  return [
    StarterKit.configure({
      link: false, codeBlock: false, code: false, blockquote: false, horizontalRule: false,
      heading: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false,
    }),
    Heading.extend(noInput).configure({ levels: [1, 2, 3] }),
    BulletList.extend({ ...noInput, ...noKeys }),
    OrderedList.extend(noInput),
    ListItem,
    ListKeymap,
    TaskList,
    TaskItem.extend(noInput).configure({ nested: true }),
    Highlight.configure({ multicolor: true }),
    TextStyleKit.configure({ backgroundColor: false, lineHeight: false }),
    TextAlign.extend(noKeys).configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    Subscript,
    Superscript,
    TableKit.configure({ table: { resizable: false, View: SyncTableView } }),
    TableTools,
    LegalParagraph,
    ParagraphFormatting,
    CharFormatting,
    PageBreak,
    FindReplace,
    FormattingMarks,
    Pagination.configure({ getLayout: opts.getLayout ?? (() => ({ on: false }) as PageLayout) }),
    BornonaExtension.configure(bornona),
    WordShortcuts.configure({
      getBijoyFont: () => bornona.getConfig().ansi?.bijoyFont,
      getDefaultSize: opts.getDefaultSize ?? (() => 12),
      ctrlSpaceIsToggle: () => (bornona.getConfig().toggleKey ?? 'ctrl+space') === 'ctrl+space',
      bornonaWants: (e) => {
        const c = bornona.getConfig();
        const ki = { code: e.code, key: e.key, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey };
        if (isToggleKey(ki, c.toggleKey) || isAnsiKey(ki, c.ansiKey)) return true;
        // Windows reports AltGr as Ctrl+Alt: when the Bangla layout has AltGr characters, real AltGr (the
        // AltGraph state) types them; left Ctrl+Alt stays Word's shortcut (© —, Heading 1…)
        const typing = c.bangla && !c.suspended;
        const altGr = Boolean(e.getModifierState?.('AltGraph'));
        return e.ctrlKey && e.altKey && typing && (!!c.rules || (altGr && hasAltLayer(c.map ?? {})));
      },
    }),
  ];
}
