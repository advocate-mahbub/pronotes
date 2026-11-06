import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { LayoutMap } from '../bornona-engine';
import { editorExtensions, type BornonaConfig } from '../editor';
import { learnTail, learnText, type WordBank } from '../suggest';
import type { Doc } from '../storage';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { SuggestionBar } from './SuggestionBar';

export type SaveState = 'saved' | 'saving' | 'error';

interface Props {
  doc: Doc;
  map: LayoutMap;
  bangla: boolean;
  vowelForming: boolean;
  oldReph: boolean;
  kbVisible: boolean;
  coarse: boolean;
  bank: WordBank;
  bankVersion: number;
  onBankChanged: () => void;
  onToggleLanguage: () => void;
  onSave: (id: string, json: object, text: string) => Promise<void>;
  onRename: (id: string, title: string) => void;
  onSaveState: (s: SaveState) => void;
  toolbarExtra: React.ReactNode;
  toolbarRight: React.ReactNode;
}

/** One open document: toolbar, title, page and the keyboard dock. Remounted per document (fresh undo history). */
export function Workspace(p: Props) {
  const [flash, setFlash] = useState<string | null>(null);
  const [title, setTitle] = useState(p.doc.title);
  const cfg = useRef<BornonaConfig>({ bangla: p.bangla, map: p.map, vowelForming: p.vowelForming, oldReph: p.oldReph, suspended: false });
  cfg.current = { bangla: p.bangla, map: p.map, vowelForming: p.vowelForming, oldReph: p.oldReph, suspended: false };
  const getConfig = useCallback(() => cfg.current, []);
  const cb = useRef(p);
  cb.current = p;

  const timer = useRef<number>(undefined);
  const pending = useRef(false);
  const flush = useCallback(async (ed: { getJSON: () => object; getText: () => string } | null) => {
    clearTimeout(timer.current);
    if (!pending.current || !ed) return;
    pending.current = false;
    try {
      await cb.current.onSave(cb.current.doc.id, ed.getJSON(), ed.getText());
      cb.current.onSaveState('saved');
    } catch {
      cb.current.onSaveState('error');
    }
  }, []);

  const editor = useEditor({
    extensions: editorExtensions({
      getConfig,
      onToggleLanguage: () => cb.current.onToggleLanguage(),
      onKey: (code) => {
        setFlash(code);
        setTimeout(() => setFlash((f) => (f === code ? null : f)), 120);
      },
      onWordDone: (before) => {
        if (learnTail(cb.current.bank, before)) cb.current.onBankChanged();
      },
      onTextInserted: (text) => {
        if (learnText(cb.current.bank, text)) cb.current.onBankChanged();
      },
    }),
    content: p.doc.content,
    editorProps: { attributes: { class: 'page-body', lang: 'bn', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', 'data-testid': 'editor' } },
    onUpdate: ({ editor }) => {
      pending.current = true;
      cb.current.onSaveState('saving');
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => flush(editor), 600);
    },
  });

  // Save immediately when leaving the document, hiding the app, or pressing Ctrl/⌘+S.
  useEffect(() => {
    if (!editor) return;
    const hide = () => document.visibilityState === 'hidden' && flush(editor);
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        pending.current = true;
        flush(editor);
      }
    };
    document.addEventListener('visibilitychange', hide);
    const leave = () => flush(editor);
    window.addEventListener('pagehide', leave);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('keydown', key);
      window.removeEventListener('pagehide', leave);
      flush(editor);
    };
  }, [editor, flush]);

  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        attributes: {
          class: 'page-body', lang: 'bn', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', 'data-testid': 'editor',
          inputmode: p.coarse && p.kbVisible ? 'none' : 'text',
        },
      },
    });
  }, [editor, p.coarse, p.kbVisible]);

  if (!editor) return null;
  const btn = (label: string, t: string, active: boolean, run: () => void, testid?: string) => (
    <button type="button" className={'tb' + (active ? ' on' : '')} title={t} aria-label={t} aria-pressed={active} data-testid={testid}
      onPointerDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
  const commitTitle = () => {
    if (title.trim() !== p.doc.title) p.onRename(p.doc.id, title);
  };

  return (
    <>
      <nav className="toolbar" aria-label="লেখার সরঞ্জাম">
        {p.toolbarExtra}
        {btn('B', 'Bold (Ctrl/⌘+B)', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'bold')}
        {btn('U', 'Underline (Ctrl/⌘+U)', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run())}
        {btn('H', 'Highlight', editor.isActive('highlight'), () => editor.chain().focus().toggleHighlight().run())}
        <span className="sep" />
        {btn('↶', 'Undo (Ctrl/⌘+Z)', false, () => editor.chain().focus().undo().run())}
        {btn('↷', 'Redo', false, () => editor.chain().focus().redo().run())}
        <span className="grow" />
        {p.toolbarRight}
      </nav>
      <main className="desk">
        <input className="title" data-testid="title" aria-label="ড্রাফটের নাম" value={title}
          onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTitle(); editor.commands.focus(); } }} />
        <div className="page">
          <EditorContent editor={editor} />
        </div>
      </main>
      <footer className="dock">
        <SuggestionBar editor={editor} bank={p.bank} version={p.bankVersion} />
        {p.kbVisible && (
          <OnScreenKeyboard editor={editor} map={p.map} bangla={p.bangla} getConfig={getConfig} onToggleLanguage={p.onToggleLanguage}
            onWordDone={(before) => { if (learnTail(p.bank, before)) p.onBankChanged(); }} flash={flash} />
        )}
      </footer>
    </>
  );
}
