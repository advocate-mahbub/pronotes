/**
 * Legal paragraph styles, stored as the `pstyle` attribute of a paragraph.
 * Measurements follow the owner's court drafts (twips: 1440 = 1 inch).
 */
import { Extension } from '@tiptap/core';

export type ParagraphStyle = 'normal' | 'numbered' | 'heading' | 'title' | 'party' | 'party2' | 'right';

export const PARAGRAPH_STYLES: { id: ParagraphStyle; label: string }[] = [
  { id: 'normal', label: 'সাধারণ অনুচ্ছেদ' },
  { id: 'numbered', label: 'ক্রমিক অনুচ্ছেদ (১।)' },
  { id: 'heading', label: 'শিরোনাম (মাঝখানে)' },
  { id: 'title', label: 'বড় শিরোনাম (দরখাস্তের নাম)' },
  { id: 'party', label: 'পক্ষের অংশ' },
  { id: 'party2', label: 'পক্ষের অংশ (আরও ভেতরে)' },
  { id: 'right', label: 'ডানে বসানো লাইন' },
];

/** Word measurements per style (twips). Shared by the screen CSS and the .docx export. */
export const STYLE_TWIPS = {
  firstLine: 720,
  hanging: 720,
  party: 3280,
  party2: 3680,
} as const;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    legalParagraph: {
      setParagraphStyle: (style: ParagraphStyle) => ReturnType;
    };
  }
}

export const LegalParagraph = Extension.create({
  name: 'legalParagraph',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          pstyle: {
            default: 'normal',
            keepOnSplit: true,
            parseHTML: (el) => (el.getAttribute('data-pstyle') as ParagraphStyle) || 'normal',
            renderHTML: (attrs) => ({ 'data-pstyle': attrs.pstyle || 'normal' }),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setParagraphStyle:
        (style) =>
        ({ commands }) =>
          commands.updateAttributes('paragraph', { pstyle: style }),
    };
  },
});
