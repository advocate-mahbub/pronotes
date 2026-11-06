import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BUILTIN_LAYOUTS, findLayout } from '../bornona-engine';
import { editorExtensions, type BornonaConfig } from '../editor';
import { emptyBank, learnTail, learnText, pruneBank, type WordBank } from '../suggest';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { SuggestionBar } from './SuggestionBar';
import { load, save } from './prefs';
import './app.css';

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function App() {
  const [layoutId, setLayoutId] = useState(() => load('layout', 'bornona'));
  const [bangla, setBangla] = useState(() => load('bangla', true));
  const [vf, setVf] = useState(() => load('vf', true));
  const [oldReph, setOldReph] = useState(() => load('oldReph', false));
  const [kbVisible, setKbVisible] = useState(() => load('kb', coarse));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [bankVersion, setBankVersion] = useState(0);
  const map = useMemo(() => findLayout(layoutId).map, [layoutId]);

  useEffect(() => save('layout', layoutId), [layoutId]);
  useEffect(() => save('bangla', bangla), [bangla]);
  useEffect(() => save('vf', vf), [vf]);
  useEffect(() => save('oldReph', oldReph), [oldReph]);
  useEffect(() => save('kb', kbVisible), [kbVisible]);

  // The editor is created once; it reads the current settings through this ref.
  const cfg = useRef<BornonaConfig>({ bangla, map, vowelForming: vf, oldReph, suspended: false });
  cfg.current = { bangla, map, vowelForming: vf, oldReph, suspended: false };
  const getConfig = useCallback(() => cfg.current, []);

  const bank = useRef<WordBank>(load('bank', emptyBank()));
  const bankTimer = useRef<number>(undefined);
  const bankChanged = useCallback(() => {
    setBankVersion((v) => v + 1);
    clearTimeout(bankTimer.current);
    bankTimer.current = window.setTimeout(() => {
      pruneBank(bank.current);
      save('bank', bank.current);
    }, 500);
  }, []);

  const draftTimer = useRef<number>(undefined);
  const editor = useEditor({
    extensions: editorExtensions({
      getConfig,
      onToggleLanguage: () => setBangla((b) => !b),
      onKey: (code) => {
        setFlash(code);
        setTimeout(() => setFlash((f) => (f === code ? null : f)), 120);
      },
      onWordDone: (before) => {
        if (learnTail(bank.current, before)) bankChanged();
      },
      onTextInserted: (text) => {
        if (learnText(bank.current, text)) bankChanged();
      },
    }),
    content: load('draft', null) ?? '<p></p>',
    editorProps: {
      attributes: { class: 'page-body', lang: 'bn', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', 'data-testid': 'editor' },
    },
    onUpdate: ({ editor }) => {
      clearTimeout(draftTimer.current);
      draftTimer.current = window.setTimeout(() => save('draft', editor.getJSON()), 400);
    },
  });

  // On touch screens, keep the iPad's own keyboard closed while the Bornona keyboard is shown.
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        attributes: {
          class: 'page-body', lang: 'bn', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', 'data-testid': 'editor',
          inputmode: coarse && kbVisible ? 'none' : 'text',
        },
      },
    });
  }, [editor, kbVisible]);

  if (!editor) return null;
  const btn = (label: string, title: string, active: boolean, run: () => void, testid?: string) => (
    <button type="button" className={'tb' + (active ? ' on' : '')} title={title} aria-label={title} aria-pressed={active} data-testid={testid}
      onPointerDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="name">ProNotes</span>
          <span className="sub">{findLayout(layoutId).name} layout</span>
        </div>
        <div className="seg" role="group" aria-label="ভাষা">
          <button type="button" aria-pressed={bangla} data-testid="mode-bn" onClick={() => setBangla(true)}>বাংলা</button>
          <button type="button" aria-pressed={!bangla} data-testid="mode-en" onClick={() => setBangla(false)}>English</button>
        </div>
      </header>

      <nav className="toolbar" aria-label="লেখার সরঞ্জাম">
        {btn('B', 'Bold (Ctrl/⌘+B)', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'bold')}
        {btn('U', 'Underline (Ctrl/⌘+U)', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run())}
        {btn('H', 'Highlight', editor.isActive('highlight'), () => editor.chain().focus().toggleHighlight().run())}
        <span className="sep" />
        {btn('↶', 'Undo (Ctrl/⌘+Z)', false, () => editor.chain().focus().undo().run())}
        {btn('↷', 'Redo', false, () => editor.chain().focus().redo().run())}
        <span className="grow" />
        <select className="layout" aria-label="কিবোর্ড লেআউট" data-testid="layout" value={layoutId} onChange={(e) => setLayoutId(e.target.value)}>
          {BUILTIN_LAYOUTS.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        {btn('⌨', 'অন-স্ক্রিন কিবোর্ড', kbVisible, () => setKbVisible((v) => !v), 'kb-toggle')}
        {btn('⚙', 'সেটিংস', settingsOpen, () => setSettingsOpen((v) => !v), 'settings')}
      </nav>

      {settingsOpen && (
        <section className="settings" aria-label="সেটিংস">
          <label><input type="checkbox" data-testid="vf" checked={vf} onChange={(e) => setVf(e.target.checked)} /> স্বর-গঠন: শব্দের শুরুতে বা স্বরবর্ণের পরে কার চাপুন (ি চাপলে হবে ই, ে চাপলে এ, অ-এর পরে া চাপলে আ)</label>
          <label><input type="checkbox" data-testid="oldreph" checked={oldReph} onChange={(e) => setOldReph(e.target.checked)} /> বিজয়-ধাঁচের রেফ: বর্ণ লেখার পরে রেফ চাপুন (ক ম রেফ লিখলে হবে কর্ম)</label>
          <p className="note">M2 পরীক্ষামূলক সংস্করণ: লেখা এই ব্রাউজারে সাময়িকভাবে সেভ থাকে। ডকুমেন্টের তালিকা আর পূর্ণ ব্যাকআপ আসবে M3-এ।</p>
        </section>
      )}

      <main className="desk">
        <div className="page">
          <EditorContent editor={editor} />
        </div>
      </main>

      <footer className="dock">
        <SuggestionBar editor={editor} bank={bank.current} version={bankVersion} />
        {kbVisible && (
          <OnScreenKeyboard editor={editor} map={map} bangla={bangla} getConfig={getConfig} onToggleLanguage={() => setBangla((b) => !b)}
            onWordDone={(before) => { if (learnTail(bank.current, before)) bankChanged(); }} flash={flash} />
        )}
      </footer>
    </div>
  );
}
