/* Runtime packages are present, but the npm package export maps do not expose
 * their declarations correctly under TypeScript's Bundler resolution. */
declare module '@tiptap/react' {
  import type { Editor as CoreEditor } from '@tiptap/core';
  export type Editor = CoreEditor;
  export const EditorContent: any;
  export const useEditor: any;
}

declare module '@tiptap/pm/view' {
  export type EditorView = any;
  export type Decoration = any;
  export const Decoration: any;
  export const DecorationSet: any;
}
