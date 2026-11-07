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

/** Markdown-like shortcuts ("- ", "1. ", "# ", "[ ] ") must never reshape a legal draft while typing. */
const noInput = { addInputRules: () => [] };

/**
 * Extensions used by the ProNotes editor (all document kinds share one schema;
 * the toolbar decides which tools each kind shows). Code and links stay off.
 */
export function editorExtensions(bornona: Partial<BornonaOptions> & Pick<BornonaOptions, 'getConfig'>) {
  return [
    StarterKit.configure({
      link: false, codeBlock: false, code: false, blockquote: false, horizontalRule: false,
      heading: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false,
    }),
    Heading.extend(noInput).configure({ levels: [1, 2, 3] }),
    BulletList.extend(noInput),
    OrderedList.extend(noInput),
    ListItem,
    ListKeymap,
    TaskList,
    TaskItem.extend(noInput).configure({ nested: true }),
    Highlight.configure({ multicolor: true }),
    TextStyleKit.configure({ backgroundColor: false, lineHeight: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    Subscript,
    Superscript,
    TableKit.configure({ table: { resizable: false } }),
    LegalParagraph,
    ParagraphFormatting,
    CharFormatting,
    PageBreak,
    FindReplace,
    FormattingMarks,
    BornonaExtension.configure(bornona),
  ];
}
