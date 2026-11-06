import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import { BornonaExtension, type BornonaOptions } from './bornona-extension';
import { LegalParagraph } from './legal-format';

/**
 * Extensions used by the ProNotes editor. Lists, headings and code are switched off:
 * legal structure comes from paragraph styles, and Markdown-like shortcuts
 * ("- ", "1. ") must not reshape a draft while typing.
 */
export function editorExtensions(bornona: Partial<BornonaOptions> & Pick<BornonaOptions, 'getConfig'>) {
  return [
    StarterKit.configure({
      link: false, codeBlock: false, code: false, blockquote: false, horizontalRule: false, heading: false,
      bulletList: false, orderedList: false, listItem: false, listKeymap: false, strike: false,
    }),
    Highlight.configure({ multicolor: false }),
    TableKit.configure({ table: { resizable: false } }),
    LegalParagraph,
    BornonaExtension.configure(bornona),
  ];
}
