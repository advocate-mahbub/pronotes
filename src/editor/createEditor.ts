import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { BornonaExtension, type BornonaOptions } from './bornona-extension';

/** Extensions used by the ProNotes editor. */
export function editorExtensions(bornona: BornonaOptions) {
  return [
    StarterKit.configure({ link: false, codeBlock: false, code: false, blockquote: false, horizontalRule: false }),
    Highlight.configure({ multicolor: false }),
    BornonaExtension.configure(bornona),
  ];
}
