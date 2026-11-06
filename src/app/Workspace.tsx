import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { fixNukta, type LayoutMap } from '../bornona-engine';
import { editorExtensions, insertPlainText, textBeforeCaret, PARAGRAPH_STYLES, type BornonaConfig, type ParagraphStyle } from '../editor';
import { convertBijoyPaste } from '../bijoy';
import { VoiceController, VoiceDeduper, cleanVoice, decideVoice, detectVoiceEnv, voiceInsertText } from '../voice';
import { voiceLang, type VoicePrefs } from './prefs-types';
import { BijoyPanel } from './BijoyPanel';
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
  voice: VoicePrefs;
  corrections: string;
  autoBijoy: boolean;
  ansiFont: string;
  enFont: string;
  /** The open editor (for "learn from this draft"); null when closed. */
  onEditor: (e: Editor | null) => void;
}

const MIC = (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6.2-3.6a.9.9 0 0 0-1.8 0 4.4 4.4 0 0 1-8.8 0 .9.9 0 0 0-1.8 0 6.2 6.2 0 0 0 5.3 6.1V20H8.6a.9.9 0 0 0 0 1.8h6.8a.9.9 0 0 0 0-1.8h-2.5v-2.5a6.2 6.2 0 0 0 5.3-6.1Z"/></svg>
);
const LANG_NAMES: Record<string, string> = { 'bn-BD': 'বাংলা', 'bn-IN': 'বাংলা', 'en-US': 'English', 'en-GB': 'English', 'en-IN': 'English' };

/** One open document: toolbar, title, page and the keyboard dock. Remounted per document (fresh undo history). */
export function Workspace(p: Props) {
  const [flash, setFlash] = useState<string | null>(null);
  const [title, setTitle] = useState(p.doc.title);
  /** Voice through the device keyboard's own mic: the engine is suspended and the device keyboard is used. */
  const [deviceKb, setDeviceKb] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [convOpen, setConvOpen] = useState(false);
  const cfg = useRef<BornonaConfig>({ bangla: p.bangla, map: p.map, vowelForming: p.vowelForming, oldReph: p.oldReph, suspended: false });
  cfg.current = { bangla: p.bangla, map: p.map, vowelForming: p.vowelForming, oldReph: p.oldReph, suspended: deviceKb };
  const inputMode = p.coarse && p.kbVisible && !deviceKb ? 'none' : 'text';
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
      convertPaste: (text, html) => (cb.current.autoBijoy ? convertBijoyPaste(text, html) : null),
      onNotice: (m) => cb.current.say(m),
    }),
    content: p.doc.content,
    // Tiptap re-applies these options on re-render, so inputmode must be part of them.
    editorProps: { attributes: { class: 'page-body', lang: 'bn', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', 'data-testid': 'editor', inputmode: inputMode } },
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
          inputmode: inputMode,
        },
      },
    });
  }, [editor, inputMode]);

  useEffect(() => {
    cb.current.onEditor(editor);
    return () => cb.current.onEditor(null);
  }, [editor]);

  // ---------- voice ----------
  const env = useMemo(() => detectVoiceEnv(), []);
  const dedupe = useRef(new VoiceDeduper());
  const lang = () => voiceLang(cb.current.voice, cfg.current.bangla);
  const voiceOpts = () => ({ commands: cb.current.voice.commands, banglaDigits: cb.current.voice.banglaDigits, corrections: cb.current.corrections });
  const ctrl = useRef<VoiceController | null>(null);
  const edRef = useRef(editor);
  edRef.current = editor;

  const enterDeviceKb = () => {
    const ed = edRef.current;
    if (!ed) return;
    setDeviceKb(true);
    // Raise the device keyboard inside this tap: set the attribute now, React catches up after.
    const dom = ed.view.dom as HTMLElement;
    dom.setAttribute('inputmode', 'text');
    dom.blur();
    ed.view.focus();
  };
  const exitDeviceKb = () => {
    setDeviceKb(false);
    const ed = edRef.current;
    if (!ed) return;
    (ed.view.dom as HTMLElement).blur();
    ed.view.focus();
  };

  if (!ctrl.current) {
    ctrl.current = new VoiceController(env, {
      lang,
      onFinal: (raw) => {
        const ed = edRef.current;
        if (!ed) return;
        const l = lang();
        const o = voiceOpts();
        const t = cleanVoice(raw, l, o);
        if (!t || !dedupe.current.accept(t)) return;
        insertPlainText(ed.view, voiceInsertText(textBeforeCaret(ed.view), raw, l, o));
      },
      onInterim: setInterim,
      onListening: setListening,
      onError: (msg, fallback) => {
        if (fallback) enterDeviceKb();
        cb.current.say(msg);
      },
    });
  }
  const toggleVoice = () => {
    const c = ctrl.current!;
    if (c.listening) return c.stop();
    if (deviceKb) return exitDeviceKb();
    const d = decideVoice(lang(), env);
    if (d.kind === 'device-keyboard') {
      enterDeviceKb();
      return p.say(d.message);
    }
    if (d.kind === 'unavailable') return p.say(d.message);
    dedupe.current.reset();
    editor?.commands.focus();
    c.start();
  };
  useEffect(() => {
    const c = ctrl.current!;
    const hide = () => document.hidden && c.stop();
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      c.stop();
    };
  }, []);
  // a language change restarts a running session in the new language (v8)
  const langNow = voiceLang(p.voice, p.bangla);
  useEffect(() => {
    const c = ctrl.current!;
    if (c.listening) {
      c.stop();
      c.start();
    }
  }, [langNow]);

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
        <span className="sep" />
        {btn('বিজয়', 'ইউনিকোড ⇄ বিজয়', convOpen, () => setConvOpen((v) => !v), 'bijoy-toggle')}
        <span className="grow" />
        <button type="button" className="btn primary small" data-testid="export-docx" onPointerDown={(e) => e.preventDefault()} onClick={exportDocx}>Word (.docx)</button>
        {btn('⎙', 'প্রিন্ট / PDF', false, print, 'print')}
        {p.toolbarRight}
      </nav>
      <div className="deskwrap">
      <main className="desk" ref={deskRef}
        style={{ ['--z' as string]: zoom, ['--doc-font' as string]: `"${p.format.font}"`, ['--doc-size' as string]: p.format.size + 'pt', ['--doc-title' as string]: p.format.titleSize + 'pt', ['--doc-line' as string]: p.format.lineSpacing } as React.CSSProperties}>
        <input className="title" data-testid="title" aria-label="ড্রাফটের নাম" value={title}
          onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTitle(); editor.commands.focus(); } }} />
        <div className="page">
          <EditorContent editor={editor} />
        </div>
      </main>
        <button type="button" className={'mic' + (listening ? ' live' : '') + (deviceKb ? ' device' : '')} data-testid="mic"
          aria-pressed={listening || deviceKb} aria-label={listening ? 'ভয়েস থামান' : 'ভয়েস টাইপিং'} title={listening ? 'ভয়েস থামান' : 'ভয়েস টাইপিং'}
          onPointerDown={(e) => e.preventDefault()} onClick={toggleVoice}>{MIC}</button>
      </div>
      {convOpen && <BijoyPanel editor={editor} ansiFont={p.ansiFont} enFont={p.enFont} say={p.say} />}
      <footer className="dock">
        {listening ? (
          <div className="sug voice" data-testid="voice-bar">
            <span className="dotrec" aria-hidden="true" />
            <span className="interim" data-testid="voice-interim">{interim ? fixNukta(interim) : `শুনছি… (${LANG_NAMES[langNow] || langNow}) বলুন`}</span>
            <button type="button" className="btn live" data-testid="voice-stop" onPointerDown={(e) => e.preventDefault()} onClick={() => ctrl.current!.stop()}>থামুন</button>
          </div>
        ) : deviceKb ? (
          <div className="sug voice" data-testid="voice-bar">
            <span className="interim">ডিভাইসের কিবোর্ডের মাইক চেপে বলুন</span>
            <button type="button" className="btn primary" data-testid="voice-back" onPointerDown={(e) => e.preventDefault()} onClick={exitDeviceKb}>বর্ণনা কিবোর্ডে ফিরুন</button>
          </div>
        ) : (
          <SuggestionBar editor={editor} bank={p.bank} version={p.bankVersion} />
        )}
        {p.kbVisible && !deviceKb && (
          <OnScreenKeyboard editor={editor} map={p.map} bangla={p.bangla} getConfig={getConfig} onToggleLanguage={p.onToggleLanguage}
            onWordDone={(before) => { if (learnTail(p.bank, before)) p.onBankChanged(); }} flash={flash} />
        )}
      </footer>
    </>
  );
}
