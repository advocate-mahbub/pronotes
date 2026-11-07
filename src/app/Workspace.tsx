import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { fixNukta, type LayoutMap } from '../bornona-engine';
import { editorExtensions, insertPlainText, textBeforeCaret, type BornonaConfig } from '../editor';
import { bijoyRuns, convertBijoyPaste, runsToClipboardHtml, isBijoyFont, type Run } from '../bijoy';
import { VoiceController, VoiceDeduper, cleanVoice, decideVoice, detectVoiceEnv, voiceInsertText } from '../voice';
import { voiceLang, type VoicePrefs } from './prefs-types';
import { BijoyPanel } from './BijoyPanel';
import { load, save } from './prefs';
import { registerFlush } from './flush';
import type { DocFormat } from '../docx-export/format';
import { FOOTER_DIST, digits, normalizePage, pageNumberParts, pageSize, type PageSetup } from '../docx-export/page';
import { pageCount, relayout, type PageLayout, } from '../editor';
import { GRID_CM, type GridPrefs, type ViewPrefs } from './prefs-types';
import { Ruler } from './Ruler';
import { learnTail, learnText, type WordBank } from '../suggest';
import { kindOf, type Doc } from '../storage';
import { useT } from '../i18n';
import { Ribbon } from './Ribbon';
import { FindBar, FontPanel, PageSetupSheet, ParagraphPanel, WordCount } from './Panels';
import { ShareMenu, type ExportFormat, type OutputMode } from './ShareMenu';
import { deliver, MIME } from '../export/deliver';
import { tr } from '../i18n';
import { attachBornona } from './bornona-input';
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
  /** Font families for the font box (document default first). */
  fonts: string[];
  /** Page setup of this (legal) document, already filled in. */
  page: PageSetup;
  onPage: (p: PageSetup) => void;
  onMakeDefaultPage: (p: PageSetup) => void;
  view: ViewPrefs;
  setView: (v: ViewPrefs) => void;
  fixChandra: boolean;
  toggleKey: import('../bornona-engine').ToggleKey;
  /** Experimental Bijoy (ANSI) typing. */
  ansiTyping: boolean;
  ansiKey: import('../bornona-engine').AnsiKey;
  onToggleAnsi: () => void;
  /** What copying puts on the clipboard: Unicode, or Bijoy (ANSI) for SutonnyMJ users. */
  output: OutputMode;
  setOutput: (m: OutputMode) => void;
  say: (msg: string, vars?: Record<string, string | number>) => void;
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
/** Notes use the app's own font, so they look the same on every device. */
export const NOTE_FONT = 'Noto Sans Bengali';
export const NOTE_SIZE = 13;
const LANG_NAMES: Record<string, string> = { 'bn-BD': 'বাংলা', 'bn-IN': 'বাংলা', 'en-US': 'English', 'en-GB': 'English', 'en-IN': 'English' };

/** One open document: toolbar, title, page and the keyboard dock. Remounted per document (fresh undo history). */
export function Workspace(p: Props) {
  const { t } = useT();
  const kind = kindOf(p.doc);
  const [flash, setFlash] = useState<string | null>(null);
  const [find, setFind] = useState<{ replace: boolean } | null>(null);
  const [panel, setPanel] = useState<'font' | 'para' | 'wc' | 'page' | null>(null);
  const [title, setTitle] = useState(p.doc.title);
  /** Voice through the device keyboard's own mic: the engine is suspended and the device keyboard is used. */
  const [deviceKb, setDeviceKb] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [convOpen, setConvOpen] = useState(false);
  /** One-time notice before the first live voice session (audio goes to the browser's speech service). */
  const [consentOpen, setConsentOpen] = useState(false);
  const cfg = useRef<BornonaConfig>({ bangla: p.bangla, map: p.map, vowelForming: p.vowelForming, oldReph: p.oldReph, suspended: false });
  cfg.current = { bangla: p.bangla, map: p.map, vowelForming: p.vowelForming, oldReph: p.oldReph, suspended: deviceKb, fixChandra: p.fixChandra, toggleKey: p.toggleKey,
    ansi: { on: p.ansiTyping, bijoyFont: p.ansiFont || 'SutonnyMJ', englishFont: p.enFont || 'Times New Roman' }, ansiKey: p.ansiKey };
  const inputMode = p.coarse && p.kbVisible && !deviceKb ? 'none' : 'text';
  const getConfig = useCallback(() => cfg.current, []);

  // ----- page geometry (legal drafts) -----
  const legal = kind === 'legal';
  const pg = normalizePage(p.page);
  const { w: pwTw, h: phTw } = pageSize(pg);
  const geo = { pw: pwTw / 15, ph: phTw / 15, mt: pg.margins.top / 15, mr: pg.margins.right / 15, mb: pg.margins.bottom / 15, ml: pg.margins.left / 15 };
  const deskRef = useRef<HTMLDivElement>(null);
  const [desk, setDesk] = useState({ w: 900, h: 700 });
  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDesk((d) => (d.w === el.clientWidth && d.h === el.clientHeight ? d : { w: el.clientWidth, h: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fitW = Math.min(1.25, Math.max(0.3, (desk.w - 24) / geo.pw));
  const zoom = !legal ? 1 : p.view.zoom === 'width' ? fitW : p.view.zoom === 'page' ? Math.max(0.2, Math.min(fitW, (desk.h - 60) / geo.ph)) : p.view.zoom / 100;
  const footerText = (n: number, total: number) => {
    if (!pg.pageNumbers.show) return '';
    const parts = pageNumberParts(pg);
    return parts.before + digits(n, pg.lang) + (parts.between !== null ? parts.between + digits(total, pg.lang) : '') + parts.after;
  };
  const layoutRef = useRef<PageLayout>({ on: false } as PageLayout);
  layoutRef.current = {
    on: legal && p.view.layout === 'print', zoom, pageW: geo.pw, pageH: geo.ph, mt: geo.mt, mb: geo.mb, ml: geo.ml, mr: geo.mr,
    footerDist: FOOTER_DIST / 15, gap: 24, footer: footerText, footerAlign: pg.pageNumbers.align,
  };
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
      onToggleAnsi: () => cb.current.onToggleAnsi(),
    }, { getLayout: () => layoutRef.current }),
    content: p.doc.content,
    // Tiptap re-applies these options on re-render, so inputmode must be part of them.
    editorProps: {
      attributes: { class: 'page-body', lang: 'bn', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', 'data-testid': 'editor', inputmode: inputMode },
      // keep the caret clear of the sticky draft title above and the mic below
      scrollMargin: { top: 64, bottom: 72, left: 8, right: 8 },
      scrollThreshold: { top: 64, bottom: 72, left: 8, right: 8 },
    },
    onUpdate: ({ editor }) => {
      pending.current = true;
      cb.current.onSaveState('saving');
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => flush(editor), 600);
    },
  });

  // Save before the app reloads itself (update).
  useEffect(() => {
    if (!editor) return;
    return registerFlush(() => flush(editor));
  }, [editor, flush]);

  // Save immediately when leaving the document, hiding the app, or pressing Ctrl/⌘+S.
  useEffect(() => {
    if (!editor) return;
    const hide = () => document.visibilityState === 'hidden' && flush(editor);
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        pending.current = true;
        flush(editor);
      } else if (k === 'f' || k === 'h') {
        e.preventDefault();
        setFind({ replace: k === 'h' });
      } else if (editor.isFocused && ['l', 'e', 'r', 'j'].includes(k) && !e.shiftKey) {
        // Word's alignment shortcuts
        e.preventDefault();
        editor.chain().focus().setTextAlign({ l: 'left', e: 'center', r: 'right', j: 'justify' }[k]!).run();
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
        scrollMargin: { top: 64, bottom: 72, left: 8, right: 8 },
        scrollThreshold: { top: 64, bottom: 72, left: 8, right: 8 },
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
    if (!load('voiceConsent', false)) return setConsentOpen(true);
    startLive();
  };
  const startLive = () => {
    dedupe.current.reset();
    edRef.current?.commands.focus();
    ctrl.current!.start();
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

  // measure pages again when the page, zoom, layout or fonts change
  const layoutKey = JSON.stringify([pg, zoom, p.view.layout, p.format, legal]);
  useEffect(() => {
    if (editor) relayout(editor.view);
  }, [editor, layoutKey]);
  const [pages, setPages] = useState(1);
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editor) return;
    const up = () => setPages(pageCount(editor.state));
    editor.on('transaction', up);
    return () => {
      editor.off('transaction', up);
    };
  }, [editor]);
  // print with this document's paper and margins
  useEffect(() => {
    const id = 'pn-page-style';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    const inch = (tw: number) => (tw / 1440).toFixed(3) + 'in';
    if (!legal) {
      el.textContent = '@page { size: A4; margin: 1in; }';
      return;
    }
    const parts = pageNumberParts(pg);
    const counter = pg.lang === 'bn' ? 'counter(page, bengali)' : 'counter(page)';
    const total = pg.lang === 'bn' ? 'counter(pages, bengali)' : 'counter(pages)';
    const content = parts.between !== null ? `"${parts.before}" ${counter} "${parts.between}" ${total}` : counter;
    const box = { left: '@bottom-left', center: '@bottom-center', right: '@bottom-right' }[pg.pageNumbers.align];
    if (pg.textDir === 'tb' || pg.textDir === 'bt') {
      // envelope fed narrow side first: upright paper, the page turned on it
      const W = inch(pwTw), H = inch(phTw);
      const turn = pg.textDir === 'tb' ? `translateX(${H}) rotate(90deg)` : `translateY(${W}) rotate(-90deg)`;
      el.textContent = `@page { size: ${H} ${W}; margin: 0; }` +
        ` @media print { .page-body { position: absolute !important; top: 0; left: 0; box-sizing: border-box; width: ${W}; height: ${H}; overflow: hidden;` +
        ` padding: ${inch(pg.margins.top)} ${inch(pg.margins.right)} ${inch(pg.margins.bottom)} ${inch(pg.margins.left)} !important; transform-origin: 0 0; transform: ${turn}; } }`;
      return;
    }
    el.textContent = `@page { size: ${inch(pwTw)} ${inch(phTw)}; margin: ${inch(pg.margins.top)} ${inch(pg.margins.right)} ${inch(pg.margins.bottom)} ${inch(pg.margins.left)};` +
      (pg.pageNumbers.show ? ` ${box} { content: ${content}; font: 11pt "Noto Sans Bengali", sans-serif; vertical-align: top; padding-top: ${inch(pg.margins.bottom - FOOTER_DIST)}; }` : '') + ' }';
  }, [legal, layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Make a file in one format and save it or share it. Large converters are loaded on first use. */
  const exportAs = async (fmt: ExportFormat, mode: 'save' | 'share') => {
    if (!editor) return;
    pending.current = true;
    await flush(editor);
    const json = editor.getJSON();
    const ansi = { bijoyFont: p.ansiFont || 'SutonnyMJ', englishFont: p.enFont || 'Times New Roman' };
    const page = legal ? pg : null;
    const textOpts = { lang: legal ? pg.lang : 'bn', legal } as const;
    try {
      const { docxFileName } = await import('../docx-export/name');
      const name = (ext: string, suffix = '') => docxFileName(title + suffix, ext);
      let blob: Blob;
      let filename: string;
      if (fmt === 'docx' || fmt === 'docx-ansi') {
        const { docxBlob } = await import('../docx-export');
        blob = await docxBlob(json, title, p.format, { kind, page, ansi: fmt === 'docx-ansi' ? ansi : null });
        filename = name('.docx', fmt === 'docx-ansi' ? ' (বিজয়)' : '');
      } else if (fmt === 'doc' || fmt === 'doc-ansi') {
        const { toRtf } = await import('../export/rtf');
        blob = new Blob([toRtf(json, title, p.format, { kind, page, ansi: fmt === 'doc-ansi' ? ansi : null })], { type: MIME.doc });
        filename = name('.doc', fmt === 'doc-ansi' ? ' (বিজয়)' : '');
      } else if (fmt === 'txt') {
        const { toPlainText } = await import('../export/text');
        blob = new Blob(['\uFEFF' + toPlainText(json, textOpts)], { type: MIME.txt });
        filename = name('.txt');
      } else if (fmt === 'md') {
        const { toMarkdown } = await import('../export/text');
        blob = new Blob([toMarkdown(json, title, textOpts)], { type: MIME.md });
        filename = name('.md');
      } else if (fmt === 'html') {
        const { toHtmlDocument } = await import('../export/html');
        blob = new Blob([toHtmlDocument(editor.getHTML(), title, p.format, { kind, page })], { type: MIME.html });
        filename = name('.html');
      } else {
        const el = pageRef.current;
        if (!el) return;
        p.say('ছবি তৈরি হচ্ছে…');
        const { pagesToPng } = await import('../export/png');
        const pics = await pagesToPng(el, { pageW: legal ? geo.pw : el.offsetWidth, pageH: legal ? geo.ph : el.offsetWidth * 1.414, gap: legal && p.view.layout === 'print' ? 24 : 0, pages });
        if (pics.length === 1) {
          blob = pics[0];
          filename = name('.png');
        } else {
          const JSZip = (await import('jszip')).default;
          const zip = new JSZip();
          pics.forEach((b, i) => zip.file(`${title || 'ProNotes'} - ${tr('পাতা')} ${i + 1}.png`, b));
          blob = await zip.generateAsync({ type: 'blob', mimeType: MIME.zip });
          filename = name('.zip');
        }
      }
      const r = await deliver(blob, filename, mode, title);
      if (r === 'saved' && (fmt === 'doc' || fmt === 'doc-ansi') && page?.textDir === 'bt')
        p.say('{name} তৈরি হয়েছে, তবে .doc ফাইলে “নিচ থেকে উপরে” লেখা ঘোরে না। ঘোরানো খামের জন্য .docx বা প্রিন্ট ব্যবহার করুন।', { name: filename });
      else if (r === 'saved') p.say('{name} তৈরি হয়েছে', { name: filename });
      else if (r === 'shared') p.say('শেয়ার করা হয়েছে');
    } catch {
      p.say('ফাইল তৈরি করা যায়নি');
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

  // Copy and cut in Bijoy (ANSI) when that output is chosen: plain text in Bijoy, rich text with the fonts
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      if (cb.current.output !== 'ansi' || !e.clipboardData) return;
      const { from, to, empty } = editor.state.selection;
      if (empty) return;
      // text already typed in Bijoy (ANSI typing) is passed through, the rest is converted
      const r: Run[] = [];
      let first = true;
      editor.state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.isBlock && node.isTextblock) {
          if (!first) r.push({ en: true, text: '\n' });
          first = false;
        }
        if (!node.isText) return;
        const t = node.text!.slice(Math.max(0, from - pos), to - pos);
        const f = node.marks.find((m) => m.type.name === 'textStyle')?.attrs.fontFamily;
        if (isBijoyFont(f, cb.current.ansiFont)) r.push({ en: false, text: t });
        else r.push(...bijoyRuns(t));
      });
      e.preventDefault();
      e.clipboardData.setData('text/plain', r.map((x) => x.text).join(''));
      e.clipboardData.setData('text/html', runsToClipboardHtml(r, cb.current.ansiFont || 'SutonnyMJ', cb.current.enFont || 'Times New Roman'));
      if (cut) editor.chain().focus().deleteSelection().run();
    };
    const copy = (e: ClipboardEvent) => onCopy(e, false);
    const cutH = (e: ClipboardEvent) => onCopy(e, true);
    dom.addEventListener('copy', copy);
    dom.addEventListener('cut', cutH);
    return () => {
      dom.removeEventListener('copy', copy);
      dom.removeEventListener('cut', cutH);
    };
  }, [editor]);

  // Bornona typing in the title box too
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!titleRef.current) return;
    return attachBornona(titleRef.current, getConfig, () => cb.current.onToggleLanguage());
  }, [editor, getConfig]);
  const toggleLang = useCallback(() => cb.current.onToggleLanguage(), []);

  if (!editor) return null;
  const commitTitle = () => {
    if (title.trim() !== p.doc.title) p.onRename(p.doc.id, title);
  };
  const share = <ShareMenu output={p.output} setOutput={p.setOutput} onExport={exportAs} onPrint={print} />;

  return (
    <>
      <Ribbon page={pg} onPage={p.onPage} onPageSheet={() => setPanel('page')} view={p.view} setView={p.setView} pages={pages} zoomPct={Math.round(zoom * 100)}
        editor={editor} kind={kind} fonts={p.fonts} defaultFont={kind === 'note' ? NOTE_FONT : p.format.font} defaultSize={kind === 'note' ? NOTE_SIZE : p.format.size} bangla={p.bangla}
        start={p.toolbarExtra} end={<>{share}{p.toolbarRight}</>}
        onFind={(replace) => setFind({ replace })} onConverter={() => setConvOpen((v) => !v)} converterOpen={convOpen}
        onWordCount={() => setPanel('wc')} onFontPanel={() => setPanel('font')} onParagraphPanel={() => setPanel('para')} />
      {find && <FindBar editor={editor} showReplace={find.replace} getConfig={getConfig} onToggleLanguage={toggleLang}
        onClose={() => { setFind(null); editor.commands.focus(); }} />}
      {panel === 'font' && <FontPanel editor={editor} onClose={() => setPanel(null)} />}
      {panel === 'para' && <ParagraphPanel editor={editor} onClose={() => setPanel(null)} />}
      {panel === 'wc' && <WordCount editor={editor} onClose={() => setPanel(null)} />}
      {panel === 'page' && <PageSetupSheet page={pg} onApply={p.onPage} onMakeDefault={p.onMakeDefaultPage} onClose={() => setPanel(null)} />}
      <div className="deskwrap">
      <main className="desk" ref={deskRef}
        style={{ ['--z' as string]: zoom, ['--pw' as string]: geo.pw + 'px', ['--ph' as string]: geo.ph + 'px', ['--mt' as string]: geo.mt + 'px', ['--mr' as string]: geo.mr + 'px', ['--mb' as string]: geo.mb + 'px', ['--ml' as string]: geo.ml + 'px',
          ['--doc-font' as string]: `"${pg.lang === 'en' && legal ? p.format.fontEn : p.format.font}"`, ['--doc-size' as string]: p.format.size + 'pt', ['--doc-title' as string]: p.format.titleSize + 'pt', ['--doc-line' as string]: p.format.lineSpacing } as React.CSSProperties}>
        <input ref={titleRef} className="title" data-testid="title" aria-label={t('ড্রাফটের নাম')} value={title}
          onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTitle(); editor.commands.focus(); } }} />
        {legal && p.view.ruler && (
          <div className="ruler-wrap"><Ruler editor={editor} pageW={geo.pw} ml={geo.ml} mr={geo.mr} zoom={zoom} unit={p.view.rulerUnit} legal={legal} /></div>
        )}
        <div className={'page ' + kind + (legal && p.view.layout === 'print' ? ' print-layout' : '') + (legal && p.view.grid.on && p.view.grid.tables ? ' grid-tables' : '')}
          data-kind={kind} data-lang={legal ? pg.lang : undefined} data-testid="page" ref={pageRef}>
          {legal && p.view.grid.on && <GridOverlay g={p.view.grid} geo={geo} lineH={(p.format.size * 4) / 3 * p.format.lineSpacing * 1.3} />}
          <EditorContent editor={editor} />
        </div>
      </main>
        {p.ansiTyping && (
          <button type="button" className="ansi-badge typing" data-testid="ansi-typing-badge" title={t('বাংলা বিজয়-এ (SutonnyMJ) লেখা হচ্ছে। চাপলে ইউনিকোডে ফিরবে।')}
            onPointerDown={(e) => e.preventDefault()} onClick={p.onToggleAnsi}>{t('টাইপ: বিজয় ANSI (পরীক্ষামূলক)')}</button>
        )}
        {p.output === 'ansi' && !p.ansiTyping && (
          <button type="button" className="ansi-badge" data-testid="ansi-badge" title={t('কপি করলে বিজয় (ANSI) যাবে। চাপলে ইউনিকোডে ফিরবে।')}
            onPointerDown={(e) => e.preventDefault()} onClick={() => p.setOutput('unicode')}>{t('কপি: ANSI')}</button>
        )}
        <button type="button" className={'mic' + (listening ? ' live' : '') + (deviceKb ? ' device' : '')} data-testid="mic"
          aria-pressed={listening || deviceKb} aria-label={listening ? t('ভয়েস থামান') : t('ভয়েস টাইপিং')} title={listening ? t('ভয়েস থামান') : t('ভয়েস টাইপিং')}
          disabled={p.ansiTyping}
          onPointerDown={(e) => e.preventDefault()} onClick={toggleVoice}>{MIC}</button>
      </div>
      {consentOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="vc-title" data-testid="voice-consent">
          <div className="box">
            <h2 id="vc-title">{t('সরাসরি ভয়েস চালুর আগে')}</h2>
            <p>{t('সরাসরি ভয়েস টাইপিং-এ আপনার কথা (অডিও) ব্রাউজারের ভয়েস সার্ভিসে যায়; Chrome বা Edge-এ সেটা Google বা Microsoft-এর সার্ভারে। লেখা ও ড্রাফট এই ডিভাইসেই থাকে, কিন্তু যা বলবেন তা বাইরে যাবে।')}</p>
            <p>{t('মক্কেলের নাম, ঠিকানা, দলিল নম্বর বা গোপন তথ্য বলার দরকার হলে কিবোর্ডে লিখুন। মাইক না চাপলে কিছুই বাইরে যায় না।')}</p>
            <div className="row">
              <button type="button" className="btn primary" data-testid="voice-consent-ok" onClick={() => { save('voiceConsent', true); setConsentOpen(false); startLive(); }}>{t('বুঝেছি, চালু করুন')}</button>
              <button type="button" className="btn" data-testid="voice-consent-cancel" onClick={() => { setConsentOpen(false); edRef.current?.commands.focus(); }}>{t('বাতিল')}</button>
            </div>
          </div>
        </div>
      )}
      {convOpen && <BijoyPanel editor={editor} ansiFont={p.ansiFont} enFont={p.enFont} say={p.say} />}
      <footer className="dock">
        {listening ? (
          <div className="sug voice" data-testid="voice-bar">
            <span className="dotrec" aria-hidden="true" />
            <span className="interim" data-testid="voice-interim">{interim ? fixNukta(interim) : t('শুনছি… ({lang}) বলুন', { lang: t(LANG_NAMES[langNow] || langNow) })}</span>
            <button type="button" className="btn live" data-testid="voice-stop" onPointerDown={(e) => e.preventDefault()} onClick={() => ctrl.current!.stop()}>{t('থামুন')}</button>
          </div>
        ) : deviceKb ? (
          <div className="sug voice" data-testid="voice-bar">
            <span className="interim">{t('ডিভাইসের কিবোর্ডের মাইক চেপে বলুন')}</span>
            <button type="button" className="btn primary" data-testid="voice-back" onPointerDown={(e) => e.preventDefault()} onClick={exitDeviceKb}>{t('বর্ণনা কিবোর্ডে ফিরুন')}</button>
          </div>
        ) : (
          p.ansiTyping ? null : <SuggestionBar editor={editor} bank={p.bank} version={p.bankVersion} />
        )}
        {p.kbVisible && !deviceKb && (
          <OnScreenKeyboard editor={editor} map={p.map} bangla={p.bangla} getConfig={getConfig} onToggleLanguage={p.onToggleLanguage}
            onWordDone={(before) => { if (learnTail(p.bank, before)) p.onBankChanged(); }} flash={flash} />
        )}
      </footer>
    </>
  );
}

/** Gridlines over the page (screen only). */
function GridOverlay({ g, geo, lineH }: { g: GridPrefs; geo: { pw: number; ml: number; mr: number; mt: number }; lineH: number }) {
  const alpha = { light: 0.14, medium: 0.26, dark: 0.42 }[g.strength];
  const c = `rgba(40, 100, 200, ${alpha})`;
  const step = (g.size === 'custom' ? g.custom : GRID_CM[g.size]) * (96 / 2.54);
  const sy = g.lineGrid ? lineH : step;
  const h = `linear-gradient(to bottom, transparent ${sy - 1}px, ${c} ${sy - 1}px) 0 0 / 100% ${sy}px`;
  const v = `linear-gradient(to right, ${c} 1px, transparent 1px) 0 0 / ${step}px 100%`;
  const dots = `radial-gradient(circle, ${c.replace(String(alpha), String(Math.min(1, alpha * 2.5)))} 1.3px, transparent 1.7px) 0 0 / ${step}px ${sy}px`;
  const bg = g.dir === 'dots' ? dots : g.dir === 'h' ? h : g.dir === 'v' ? v : `${h}, ${v}`;
  return (
    <div className="grid-overlay" aria-hidden="true" data-testid="grid" data-dir={g.dir}>
      <div className="grid-area" style={{ left: geo.ml, right: geo.mr, top: geo.mt, background: bg }} />
      {g.margins && <div className="grid-margins" style={{ left: geo.ml, right: geo.mr, top: geo.mt, borderColor: c }} />}
      {g.center && <div className="grid-center" style={{ left: geo.ml + (geo.pw - geo.ml - geo.mr) / 2, top: geo.mt, borderColor: c }} />}
    </div>
  );
}
