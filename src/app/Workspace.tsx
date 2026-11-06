import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { LayoutMap } from '../bornona-engine';
import { editorExtensions, PARAGRAPH_STYLES, type BornonaConfig, type ParagraphStyle } from '../editor';
import { docxBlob, docxFileName, type DocFormat } from '../docx-export';
import { saveFile } from '../storage/download';
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
  format: DocFormat;
  say: (msg: string) => void;
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
    // Tiptap re-applies these options on re-render, so inputmode must be part of them.
    editorProps: { attributes: { class: 'page-body', lang: 'bn', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', 'data-testid': 'editor', inputmode: p.coarse && p.kbVisible ? 'none' : 'text' } },
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

  // Fit the Legal-size page (8.5 in = 816 px) to the available width.
  const deskRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setZoom(Math.min(1.25, Math.max(0.3, (el.clientWidth - 24) / 816))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor]);

  const exportDocx = async () => {
    if (!editor) return;
    pending.current = true;
    await flush(editor);
    try {
      const ok = await saveFile(docxFileName(title), await docxBlob(editor.getJSON(), title, p.format));
      if (ok) p.say('Word ফাইল (.docx) তৈরি হয়েছে');
    } catch {
      p.say('Word ফাইল তৈরি করা যায়নি');
    }
  };
  const print = async () => {
    if (!editor) return;
    pending.current = true;
    await flush(editor);
    try {
      window.print();
    } catch {
      p.say('এখানে প্রিন্ট করা যায় না');
    }
  };

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
        <select className="pstyle" aria-label="অনুচ্ছেদের ধরন" data-testid="pstyle"
          value={(editor.getAttributes('paragraph').pstyle as ParagraphStyle) || 'normal'}
          onChange={(e) => editor.chain().focus().setParagraphStyle(e.target.value as ParagraphStyle).run()}>
          {PARAGRAPH_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {editor.isActive('table') ? (
          <>
            {btn('+সারি', 'নিচে সারি যোগ', false, () => editor.chain().focus().addRowAfter().run(), 'row-add')}
            {btn('−সারি', 'এই সারি মুছুন', false, () => editor.chain().focus().deleteRow().run(), 'row-del')}
            {btn('−টেবিল', 'টেবিল মুছুন', false, () => editor.chain().focus().deleteTable().run(), 'table-del')}
          </>
        ) : (
          btn('তফসিল', 'তফসিলের টেবিল (৪ কলাম)', false, () => editor.chain().focus().insertTable({ rows: 3, cols: 4, withHeaderRow: true }).run(), 'table-add')
        )}
        <span className="sep" />
        {btn('↶', 'Undo (Ctrl/⌘+Z)', false, () => editor.chain().focus().undo().run())}
        {btn('↷', 'Redo', false, () => editor.chain().focus().redo().run())}
        <span className="grow" />
        <button type="button" className="btn primary small" data-testid="export-docx" onPointerDown={(e) => e.preventDefault()} onClick={exportDocx}>Word (.docx)</button>
        {btn('⎙', 'প্রিন্ট / PDF', false, print, 'print')}
        {p.toolbarRight}
      </nav>
      <main className="desk" ref={deskRef}
        style={{ ['--z' as string]: zoom, ['--doc-font' as string]: `"${p.format.font}"`, ['--doc-size' as string]: p.format.size + 'pt', ['--doc-title' as string]: p.format.titleSize + 'pt', ['--doc-line' as string]: p.format.lineSpacing } as React.CSSProperties}>
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
