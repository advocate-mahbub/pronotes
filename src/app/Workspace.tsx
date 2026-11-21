import type { Mark, Node as PMNode } from '@tiptap/pm/model';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { fixNukta, type LayoutMap, type KmxKeyboard } from '../bornona-engine';
import { editorExtensions, insertPlainText, textBeforeCaret, type BornonaConfig } from '../editor';
import { bijoyRuns, convertBijoyPaste, runsToClipboardHtml, isBijoyFont, type Run } from '../bijoy';
import { VoiceController, VoiceDeduper, cleanVoice, decideVoice, detectVoiceEnv, voiceInsertText, toBanglaVoice, banglaScript } from '../voice';
import { geminiRescript } from '../ai';
import { voiceLang, type VoicePrefs } from './prefs-types';
import { BijoyPanel } from './BijoyPanel';
import { AiPanel } from './AiPanel';
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
import { craftApp } from '../craft/bridge';
import { ShareMenu, type ExportFormat, type OutputMode } from './ShareMenu';
import { deliver, MIME } from '../export/deliver';
import { tr } from '../i18n';
import { attachBornona } from './bornona-input';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { useLiveVoice } from './LiveVoice';
import { FloatingKeyboard, LiftableKeyboard, useLandscape, useShortTouch, type KbMode } from './FloatingKeyboard';
import { GLOBE_ICON, KB_ICONS, type KbMenuItem } from './OnScreenKeyboard';
import type { Hand } from './kb-gestures';
import { AiVoiceKey, useAiVoice } from './AiVoiceKey';
import { VoiceControls } from './VoiceControls';
import { MicKey } from './MicKey';
import type { VoiceModes } from './voice-modes';
import type { FontLists } from './FontPicker';
import { SuggestionBar } from './SuggestionBar';
import { CaretOverlay } from './CaretOverlay';
import { ZoomBar } from './ZoomBar';

export type SaveState = 'saved' | 'saving' | 'error';

interface Props {
  doc: Doc;
  map: LayoutMap;
  /** Keyman keyboard with rules (the chosen layout), if any. */
  rules?: KmxKeyboard;
  /** ProNotes Phonetic layout chosen. */
  phonetic?: boolean;
  bangla: boolean;
  vowelForming: boolean;
  /** The ProNotes layout's hasanta rules (্ + kar = vowel, ্্ = fixed hasanta). */
  hasantaRules?: boolean;
  oldReph: boolean;
  kbVisible: boolean;
  coarse: boolean;
  /** Phone-size screen: the page reflows to the screen width (no paper view). */
  phone: boolean;
  /** Which voice the one microphone key uses. */
  voiceEngine: 'ai' | 'device';
  bank: WordBank;
  bankVersion: number;
  onBankChanged: () => void;
  onToggleLanguage: () => void;
  onSave: (id: string, json: object, text: string) => Promise<void>;
  onRename: (id: string, title: string) => void;
  onSaveState: (s: SaveState) => void;
  toolbarExtra: React.ReactNode;
  /** Opens the law dictionary (button in the Tools tab). */
  onLawDictionary?: () => void;
  /** Hand this draft (as .docx) to WordCraft. */
  onOpenWordCraft?: (name: string, bytes: ArrayBuffer) => void;
  toolbarRight: React.ReactNode;
  format: DocFormat;
  /** Font families for the font box (document default first). */
  fonts: string[];
  /** Unicode and Bijoy font lists for the font box. */
  fontLists: FontLists;
  /** Page setup of this (legal) document, already filled in. */
  page: PageSetup;
  onPage: (p: PageSetup) => void;
  onMakeDefaultPage: (p: PageSetup) => void;
  view: ViewPrefs;
  setView: (v: ViewPrefs) => void;
  fixChandra: boolean;
  toggleKey: import('../bornona-engine').ToggleKey;
  /** AI assistant */
  gemini: { key: string; model: string; setModel?: (m: string) => void };
  /** Which voice modes are on and their models (Settings → voice, decisions.md 77). */
  voiceModes: VoiceModes;
  privateWords: string[];
  setPrivateWords: (w: string[]) => void;
  onOpenSettings: () => void;
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
const clampZoom = (pct: number) => Math.max(25, Math.min(300, pct));
const clampText = (pct: number) => Math.max(60, Math.min(250, pct));

export function Workspace(p: Props) {
  const { t } = useT();
  const kind = kindOf(p.doc);
  const [flash, setFlash] = useState<string | null>(null);
  const [find, setFind] = useState<{ replace: boolean } | null>(null);
  const [panel, setPanel] = useState<'font' | 'para' | 'wc' | 'page' | null>(null);
  const [title, setTitle] = useState(p.doc.title);
  // renamed from the list while open
  useEffect(() => setTitle(p.doc.title), [p.doc.title]);
  /** Voice through the device keyboard's own mic: the engine is suspended and the device keyboard is used. */
  const [deviceKb, setDeviceKb] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [convOpen, setConvOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  /** One-time notice before the first live voice session (audio goes to the browser's speech service). */
  const [consentOpen, setConsentOpen] = useState(false);
  const cfg = useRef<BornonaConfig>({ bangla: p.bangla, map: p.map, phonetic: p.phonetic, vowelForming: p.vowelForming, oldReph: p.oldReph, suspended: false });
  cfg.current = { bangla: p.bangla, map: p.map, phonetic: p.phonetic, hasantaRules: p.hasantaRules, vowelForming: p.vowelForming, oldReph: p.oldReph, suspended: deviceKb, fixChandra: p.fixChandra, toggleKey: p.toggleKey,
    ansi: { on: p.ansiTyping, bijoyFont: p.ansiFont || 'SutonnyMJ', englishFont: p.enFont || 'Times New Roman' }, ansiKey: p.ansiKey, rules: p.rules };
  const inputMode = p.coarse && p.kbVisible && !deviceKb ? 'none' : 'text';
  const getConfig = useCallback(() => cfg.current, []);

  // ----- page geometry (legal drafts) -----
  const legal = kind === 'legal';
  const pg = normalizePage(p.page);
  const { w: pwTw, h: phTw } = pageSize(pg);
  const geo = { pw: pwTw / 15, ph: phTw / 15, mt: pg.margins.top / 15, mr: pg.margins.right / 15, mb: pg.margins.bottom / 15, ml: pg.margins.left / 15 };
  const deskRef = useRef<HTMLDivElement>(null);
  // the zoom bar comes back for a moment when the page is scrolled or touched (decisions.md 82)
  const [zoomWake, setZoomWake] = useState(0);
  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    let last = 0;
    const wake = () => { const now = Date.now(); if (now - last > 400) { last = now; setZoomWake((n) => n + 1); } };
    el.addEventListener('scroll', wake, { passive: true });
    el.addEventListener('pointerdown', wake, { passive: true });
    return () => { el.removeEventListener('scroll', wake); el.removeEventListener('pointerdown', wake); };
  }, []);
  /** On-screen keyboard put down for reading (not saved; a tap on the page brings it back). */
  const [kbDown, setKbDown] = useState(false);
  // phones: one-handed keyboard; iPad and computers: a small floating keyboard (both: long-press the language key)
  const [hand, setHand0] = useState<Hand>(() => load('kb.hand', null));
  const setHand = (h: Hand) => { setHand0(h); save('kb.hand', h); };
  // iPad and computers: docked, floating, split (the full keyboard in two), split-phone (the phone keyboard in two)
  // one split only, the phone-style one (decisions.md 76): a saved 'split' (the full keyboard in two) becomes it
  const [kbMode, setKbMode0] = useState<KbMode>(() => { const m = load<KbMode>('kb.mode', load('kb.float', false) ? 'float' : 'dock'); return m === 'split' ? 'splitPhone' : m; });
  const setKbMode = (m: KbMode) => { setKbMode0(m); save('kb.mode', m); };
  // phones held sideways may split the keyboard
  const [splitLand, setSplitLand0] = useState<boolean>(() => load('kb.splitLand', false));
  const setSplitLand = (v: boolean) => { setSplitLand0(v); save('kb.splitLand', v); };
  // phones too may float the keyboard, held upright or sideways (decisions.md 97)
  const [phoneFloat, setPhoneFloat0] = useState<boolean>(() => load('kb.phoneFloat', false));
  const setPhoneFloat = (v: boolean) => { setPhoneFloat0(v); save('kb.phoneFloat', v); };
  // the split keyboard's gap may hold the anna-ganda signs (Settings → কিবোর্ড)
  const annaGap = load('kb.splitAnna', false);
  const landscape = useLandscape();
  // the phone keyboard also for a phone turned sideways (wide, but short)
  const shortTouch = useShortTouch();
  // the phone-style keyboards (phone, floating, split) have the strip with 🌐 and 🎙 under their keys
  const kbCompact = p.phone || shortTouch || kbMode === 'float' || kbMode === 'splitPhone';
  const stripShown = p.kbVisible && !deviceKb && (kbDown || kbCompact);
  const [desk, setDesk] = useState({ w: 900, h: 700 });
  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDesk((d) => (d.w === el.clientWidth && d.h === el.clientHeight ? d : { w: el.clientWidth, h: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fitW = Math.min(1.25, Math.max(0.3, (desk.w - 24) / geo.pw));
  // phones: the text reflows to the screen at its real size (like Word's Mobile View); the paper comes back in files and print
  const reflow = legal && p.phone;
  const zoom = !legal || reflow ? 1 : p.view.zoom === 'width' ? fitW : p.view.zoom === 'page' ? Math.max(0.2, Math.min(fitW, (desk.h - 60) / geo.ph)) : p.view.zoom / 100;
  // notes and the phone view have no paper: a pinch makes their text bigger or smaller instead
  const textZoom = (p.view.textZoom ?? 100) / 100;
  const paper = legal && !reflow;

  const footerText = (n: number, total: number) => {
    if (!pg.pageNumbers.show) return '';
    const parts = pageNumberParts(pg);
    return parts.before + digits(n, pg.lang) + (parts.between !== null ? parts.between + digits(total, pg.lang) : '') + parts.after;
  };
  const layoutRef = useRef<PageLayout>({ on: false } as PageLayout);
  layoutRef.current = {
    on: legal && !reflow && p.view.layout === 'print', zoom, pageW: geo.pw, pageH: geo.ph, mt: geo.mt, mb: geo.mb, ml: geo.ml, mr: geo.mr,
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
    }, { getLayout: () => layoutRef.current, getDefaultSize: () => (kindOf(cb.current.doc) === 'note' ? NOTE_SIZE : cb.current.format.size) }),
    content: p.doc.content,
    // Tiptap re-applies these options on re-render, so inputmode must be part of them.
    editorProps: {
      attributes: { class: 'page-body', lang: 'bn', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', 'data-testid': 'editor', inputmode: inputMode },
      // keep the caret clear of the sticky draft title above and the mic below
      scrollMargin: { top: 64, bottom: 72, left: 8, right: 8 },
      scrollThreshold: { top: 64, bottom: 72, left: 8, right: 8 },
    },
    onUpdate: ({ editor }: { editor: Editor }) => {
      pending.current = true;
      cb.current.onSaveState('saving');
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => flush(editor), 600);
    },
  });

  // live voice typing: words appear as they are spoken (🎙 on the keyboard, or the round button by the page)
  const live = useLiveVoice({ editor: editor as Editor, geminiKey: p.gemini.key, bangla: p.bangla, say: p.say,
    voice: { lang: p.voice.lang, commands: p.voice.commands, corrections: p.corrections, banglaDigits: p.voice.banglaDigits }, disabled: p.ansiTyping, model: p.voiceModes.liveModel });
  // record-to-text (Gemini): one recording, shared by the page's ✦ key and the keyboard strip's 🎙
  const aiv = useAiVoice({ editor: editor as Editor, gemini: { ...p.gemini, model: p.voiceModes.recModel || p.gemini.model }, say: p.say,
    onOpenSettings: p.onOpenSettings, disabled: p.ansiTyping, voice: { corrections: p.corrections, banglaDigits: p.voice.banglaDigits, lang: p.voice.lang } });
  // one 🎙: a tap = Live, held = record-to-text (decisions.md 77); each can be turned off in Settings
  const liveOk = p.voiceModes.live && live.available;
  const recOk = p.voiceModes.rec && p.voiceEngine === 'ai';
  const voicing = live.on || aiv.state !== 'idle';
  // Settings → voice → ভাসমান রেকর্ডার (decisions.md 86): the controls float over the page's lower right, the strips
  // keep only a red dot; off (the usual), they sit in the keyboard's strip as before
  const floatRec = Boolean(p.voice.float);
  const recDot = <span className="k rec-dot" data-testid="strip-rec-dot" aria-hidden="true"><span className="vc-dot" /></span>;
  const liveFloat = live.on && (!stripShown || floatRec);
  const aiFloat = floatRec && aiv.state !== 'idle';
  const toggleVoiceRef = useRef<() => void>(() => {});
  // the page's one 🎙: Live first, then record-to-text (AI) or the device's voice; whatever is on is shown
  const deviceOk = p.voiceEngine === 'device';
  const tapAct = liveOk ? live.toggle : recOk ? aiv.press : deviceOk ? () => toggleVoiceRef.current() : null;
  const holdAct = liveOk ? (recOk ? aiv.press : deviceOk ? () => toggleVoiceRef.current() : undefined) : undefined;
  const floatMic = aiFloat ? null : recOk && aiv.state !== 'idle' && !stripShown ? <AiVoiceKey v={aiv} disabled={p.ansiTyping} icon={MIC} />
    : !tapAct || stripShown ? null
    : (
      <MicKey onTap={tapAct} onHold={holdAct} disabled={p.ansiTyping && !liveOk}
        testid={liveOk ? 'live-mic' : recOk ? 'ai-voice' : 'mic'}
        className={'mic one-mic' + (liveOk ? ' is-live' : recOk ? ' ai-voice' : '') + (live.on || listening ? ' live' : '') + (deviceKb ? ' device' : '')}
        pressed={live.on || listening || deviceKb}
        label={listening ? t('ভয়েস থামান') : holdAct ? t('ভয়েস: চাপলে Live, চেপে ধরলে রেকর্ড করে লেখা') : liveOk ? t('Live ভয়েস: বলার সাথে সাথে লেখা') : recOk ? t('AI ভয়েস টাইপিং (Gemini)') : t('ভয়েস টাইপিং')}>
        {live.on ? <span aria-hidden="true">●</span> : MIC}
      </MicKey>
    );
  const micSlot = voicing ? (floatRec ? recDot : <VoiceControls live={live} ai={aiv} />)
    : liveOk || recOk ? <MicKey onTap={liveOk ? live.toggle : aiv.press} onHold={liveOk && recOk ? aiv.press : undefined} /> : null;

  // Pinch (two fingers, or a trackpad pinch) zooms only the page; the rest of the app stays as it is.
  // While the fingers move only a CSS variable changes; the zoom is kept when they lift.
  const [pinchPct, setPinchPct] = useState<number | null>(null);
  const pinchRef = useRef({ zoom, textZoom, paper, view: p.view, setView: p.setView });
  pinchRef.current = { zoom, textZoom, paper, view: p.view, setView: p.setView };
  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    let base = 0;
    let factor = 1;
    let startDist = 0;
    let wheelTimer = 0;
    const live = (f: number) => {
      factor = f;
      const c = pinchRef.current;
      // the zoom bar shows the number as the fingers move
      setPinchPct(Math.round(c.paper ? clampZoom(c.zoom * f * 100) : clampText(c.textZoom * f * 100)));
      // a factor on top of the set zoom, kept inside the same limits
      if (c.paper) el.style.setProperty('--pz', String(clampZoom(c.zoom * f * 100) / 100 / c.zoom));
      else el.style.setProperty('--ptz', String(clampText(c.textZoom * f * 100) / 100 / c.textZoom));
    };
    const begin = () => { factor = 1; base = 1; };
    const end = () => {
      if (!base) return;
      base = 0;
      setPinchPct(null);
      const c = pinchRef.current;
      if (Math.abs(factor - 1) < 0.02) { el.style.removeProperty('--pz'); el.style.removeProperty('--ptz'); return; }
      if (c.paper) c.setView({ ...c.view, zoom: Math.round(clampZoom(c.zoom * factor * 100)) });
      else c.setView({ ...c.view, textZoom: Math.round(clampText(c.textZoom * factor * 100)) });
      // the new zoom comes back through the view; the live factor is dropped then (layout effect below)
    };
    // Safari (iPad, iPhone, Mac trackpad)
    const gs = (e: Event) => { e.preventDefault(); begin(); };
    const gc = (e: Event) => { e.preventDefault(); live((e as unknown as { scale: number }).scale); };
    const ge = (e: Event) => { e.preventDefault(); end(); };
    // other touch screens: two fingers
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const ts = (e: TouchEvent) => { if (e.touches.length === 2) { startDist = dist(e.touches); begin(); } };
    const tm = (e: TouchEvent) => { if (e.touches.length === 2 && startDist) { e.preventDefault(); live(dist(e.touches) / startDist); } };
    const te = (e: TouchEvent) => { if (startDist && e.touches.length < 2) { startDist = 0; end(); } };
    // trackpad pinch and Ctrl + wheel in Chrome/Edge
    const wh = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (!base) begin();
      live(factor * Math.exp(-e.deltaY / 200));
      clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(end, 250);
    };
    el.addEventListener('gesturestart', gs);
    el.addEventListener('gesturechange', gc);
    el.addEventListener('gestureend', ge);
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: false });
    el.addEventListener('touchend', te);
    el.addEventListener('touchcancel', te);
    el.addEventListener('wheel', wh, { passive: false });
    return () => {
      clearTimeout(wheelTimer);
      el.removeEventListener('gesturestart', gs);
      el.removeEventListener('gesturechange', gc);
      el.removeEventListener('gestureend', ge);
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', te);
      el.removeEventListener('touchcancel', te);
      el.removeEventListener('wheel', wh);
    };
  }, [editor]); // the page exists once the editor does
  useLayoutEffect(() => {
    deskRef.current?.style.removeProperty('--pz');
    deskRef.current?.style.removeProperty('--ptz');
  }, [zoom, textZoom]);

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
      } else if ((k === 'f' || k === 'h') && !e.shiftKey) {
        e.preventDefault();
        setFind({ replace: k === 'h' });
      } else if (k === 'p' && !e.shiftKey) {
        e.preventDefault();
        void printRef.current();
      } else if (editor.isFocused && (e.code === 'KeyD' && !e.shiftKey || e.code === 'KeyF' && e.shiftKey)) {
        // Word: Ctrl+D / Ctrl+Shift+F — the font list
        e.preventDefault();
        document.querySelector<HTMLElement>('[data-testid="font"]')?.click();
      } else if (editor.isFocused && e.code === 'KeyP' && e.shiftKey) {
        // Word: Ctrl+Shift+P — the font size box
        e.preventDefault();
        const box = document.querySelector<HTMLInputElement>('[data-testid="size"]');
        box?.focus();
        box?.select();
      }
      // the rest of Word's keys live in the editor (src/editor/word-shortcuts.ts)
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
  const voiceQueue = useRef(Promise.resolve());
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
      onFinal: (raw0) => {
        // Bangla in Bengali letters only (decisions.md 82); the rewrite of Latin letters needs a moment
        const l0 = lang();
        voiceQueue.current = voiceQueue.current.then(async () => putFinal(await toBanglaVoice(raw0, l0, geminiRescript(cb.current.gemini.key))));
      },
      onInterim: (s) => setInterim(lang().startsWith('bn') ? banglaScript(s).text : s),
      onListening: setListening,
      onError: (msg, fallback) => {
        if (fallback) enterDeviceKb();
        cb.current.say(msg);
      },
    });
  }
  function putFinal(raw: string) {
        const ed = edRef.current;
        if (!ed) return;
        const l = lang();
        const o = voiceOpts();
        const t = cleanVoice(raw, l, o);
        if (!t || !dedupe.current.accept(t)) return;
        insertPlainText(ed.view, voiceInsertText(textBeforeCaret(ed.view), raw, l, o));
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
  toggleVoiceRef.current = toggleVoice;
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
  const layoutKey = JSON.stringify([pg, zoom, p.view.layout, p.format, legal, reflow]);
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

  const printRef = useRef<() => Promise<void>>(async () => {});
  const print = async () => {
    if (!editor) return;
    pending.current = true;
    await flush(editor);
    try {
      window.print();
    } catch {
      p.say('এখানে প্রিন্ট করা যায় না');
    }
  };  printRef.current = print;


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
      editor.state.doc.nodesBetween(from, to, (node: PMNode, pos: number) => {
        if (node.isBlock && node.isTextblock) {
          if (!first) r.push({ en: true, text: '\n' });
          first = false;
        }
        if (!node.isText) return;
        const t = node.text!.slice(Math.max(0, from - pos), to - pos);
        const f = node.marks.find((m: Mark) => m.type.name === 'textStyle')?.attrs.fontFamily;
        if (isBijoyFont(f, cb.current.ansiFont)) r.push({ en: false, text: t });
        else {
          const at = Math.max(pos, from);
          r.push(...bijoyRuns(t, editor.state.doc.textBetween(Math.max(0, at - 1), at)));
        }
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
  /** The draft's name sits in the app's top bar (one line less above the page). */
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setTitleSlot(document.getElementById('title-slot')), []);
  useEffect(() => {
    if (!titleRef.current) return;
    return attachBornona(titleRef.current, getConfig, () => cb.current.onToggleLanguage());
  }, [editor, getConfig, titleSlot]);
  const toggleLang = useCallback(() => cb.current.onToggleLanguage(), []);

  if (!editor) return null;
  const commitTitle = () => {
    if (title.trim() !== p.doc.title) p.onRename(p.doc.id, title);
  };
  /** The draft as Unicode .docx, opened in WordCraft (Apps). Nothing in the draft changes. */
  const openInWordCraft = async () => {
    if (!editor || !p.onOpenWordCraft) return;
    pending.current = true;
    await flush(editor);
    try {
      const { docxFileName } = await import('../docx-export/name');
      const { docxBlob } = await import('../docx-export');
      const blob = await docxBlob(editor.getJSON(), title, p.format, { kind, page: legal ? pg : null, ansi: null });
      p.onOpenWordCraft(docxFileName(title, '.docx'), await blob.arrayBuffer());
    } catch {
      p.say('WordCraft-এর জন্য ফাইল বানানো গেল না');
    }
  };
  const share = <ShareMenu output={p.output} setOutput={p.setOutput} onExport={exportAs} onPrint={print} onOpenWordCraft={p.onOpenWordCraft && craftApp('wordcraft') ? () => void openInWordCraft() : undefined} />;

  return (
    <>
      <Ribbon page={pg} onPage={p.onPage} onPageSheet={() => setPanel('page')} view={p.view} setView={p.setView} pages={pages} zoomPct={Math.round(zoom * 100)}
        editor={editor} kind={kind} fonts={p.fonts} fontLists={p.fontLists} ansiTyping={p.ansiTyping} ansiFont={p.ansiFont} enFont={p.enFont} onToggleAnsi={p.onToggleAnsi} defaultFont={kind === 'note' ? NOTE_FONT : p.format.font} defaultSize={kind === 'note' ? NOTE_SIZE : p.format.size} bangla={p.bangla}
        start={p.toolbarExtra} end={<>{share}{p.toolbarRight}</>}
        onFind={(replace) => setFind({ replace })} onConverter={() => setConvOpen((v) => !v)} converterOpen={convOpen}
        onAi={() => setAiOpen((v) => !v)} aiOpen={aiOpen} say={(m, v) => p.say(m, v)}
        onWordCount={() => setPanel('wc')} onFontPanel={() => setPanel('font')} onParagraphPanel={() => setPanel('para')} onLawDictionary={p.onLawDictionary} />
      {find && <FindBar editor={editor} showReplace={find.replace} getConfig={getConfig} onToggleLanguage={toggleLang}
        onClose={() => { setFind(null); editor.commands.focus(); }} />}
      {panel === 'font' && <FontPanel editor={editor} onClose={() => setPanel(null)} />}
      {panel === 'para' && <ParagraphPanel editor={editor} onClose={() => setPanel(null)} />}
      {panel === 'wc' && <WordCount editor={editor} onClose={() => setPanel(null)} />}
      {panel === 'page' && <PageSetupSheet page={pg} onApply={p.onPage} onMakeDefault={p.onMakeDefaultPage} onClose={() => setPanel(null)} />}
      <div className="deskwrap">
      {editor && <CaretOverlay editor={editor as Editor} active={inputMode === 'none'} />}
      <main className={'desk' + (inputMode === 'none' ? ' caret-on' : '')} ref={deskRef} onClick={() => kbDown && setKbDown(false)}
        style={{ ['--z' as string]: zoom, ['--tz' as string]: textZoom, ['--pw' as string]: geo.pw + 'px', ['--ph' as string]: geo.ph + 'px', ['--mt' as string]: geo.mt + 'px', ['--mr' as string]: geo.mr + 'px', ['--mb' as string]: geo.mb + 'px', ['--ml' as string]: geo.ml + 'px',
          ['--doc-font' as string]: `"${pg.lang === 'en' && legal ? p.format.fontEn : p.format.font}"`, ['--doc-size' as string]: p.format.size + 'pt', ['--doc-title' as string]: p.format.titleSize + 'pt', ['--doc-line' as string]: p.format.lineSpacing } as React.CSSProperties}>
        {(() => {
          const input = (
            <input ref={titleRef} className="title" data-testid="title" aria-label={t('ড্রাফটের নাম')} title={t('ড্রাফটের নাম (চাপলে বদলানো যায়)')} value={title}
              onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTitle(); editor.commands.focus(); } }} />
          );
          return titleSlot ? createPortal(input, titleSlot) : input;
        })()}
        {legal && !reflow && p.view.ruler && (
          <div className="ruler-wrap"><Ruler editor={editor} pageW={geo.pw} ml={geo.ml} mr={geo.mr} zoom={zoom} unit={p.view.rulerUnit} legal={legal} /></div>
        )}
        <div className={'page ' + kind + (reflow ? ' phone' : '') + (legal && !reflow && p.view.layout === 'print' ? ' print-layout' : '') + (legal && p.view.grid.on && p.view.grid.tables ? ' grid-tables' : '')}
          data-kind={kind} data-lang={legal ? pg.lang : undefined} data-testid="page" ref={pageRef}>
          {legal && !reflow && p.view.grid.on && <GridOverlay g={p.view.grid} geo={geo} lineH={(p.format.size * 4) / 3 * p.format.lineSpacing * 1.3} />}
          <EditorContent editor={editor} />
        </div>
        <ZoomBar wake={zoomWake} pct={paper ? Math.round(zoom * 100) : Math.round(textZoom * 100)} live={pinchPct} paper={paper} min={paper ? 25 : 60} max={paper ? 300 : 250}
          setPct={(z) => {
            setPinchPct(null);
            if (paper) p.setView({ ...p.view, zoom: z });
            else if (typeof z === 'number') p.setView({ ...p.view, textZoom: Math.round(clampText(z)) });
          }} />
      </main>
        {p.ansiTyping && (
          <button type="button" className="ansi-badge typing" data-testid="ansi-typing-badge" title={t('বাংলা বিজয়-এ (SutonnyMJ) লেখা হচ্ছে। চাপলে ইউনিকোডে ফিরবে।')}
            onPointerDown={(e) => e.preventDefault()} onClick={p.onToggleAnsi}>{t('টাইপ: বিজয় ANSI (পরীক্ষামূলক)')}</button>
        )}
        {p.output === 'ansi' && !p.ansiTyping && (
          <button type="button" className="ansi-badge" data-testid="ansi-badge" title={t('কপি করলে বিজয় (ANSI) যাবে। চাপলে ইউনিকোডে ফিরবে।')}
            onPointerDown={(e) => e.preventDefault()} onClick={() => p.setOutput('unicode')}>{t('কপি: ANSI')}</button>
        )}
        {/* one 🎙 on the page (decisions.md 82): a tap = the first voice mode, held = the second, as in the keyboard strip.
            The compact keyboard's strip has its own 🎙, so this one steps aside while that strip is up. */}
        {!liveFloat && floatMic}
        {/* the record mode's consent box: AiVoiceKey shows its own while it is on screen */}
        {!(recOk && aiv.state !== 'idle' && !stripShown) && aiv.consentUi}
        {live.ui}
        {/* the controls and the red button on one line, centred on each other (decisions.md 86) */}
        {(liveFloat || aiFloat) && (
          <div className="voice-float" data-testid="voice-float">
            <div className="voice-pill-wrap"><VoiceControls live={live} ai={aiFloat ? aiv : undefined} /></div>
            {liveFloat && !stripShown && floatMic ? floatMic : (
              <button type="button" className="mic one-mic live" data-testid="voice-float-stop" aria-label={t('বন্ধ করুন')} title={t('বন্ধ করুন')}
                onPointerDown={(e) => e.preventDefault()} onClick={() => (live.on ? live.stop() : aiv.state === 'rec' || aiv.state === 'paused' ? aiv.write() : undefined)}>
                <span aria-hidden="true">●</span>
              </button>
            )}
          </div>
        )}
        {kbDown && p.kbVisible && !deviceKb && (
          // the keyboard put down: its bottom strip stays (🌐 · ⌨ · 🎙), so voice and the language are a tap away
          <div className={'kb-strip down' + (voicing ? ' voicing' : '')} data-testid="kb-strip-down" onPointerDown={(e) => e.preventDefault()}>
            <button type="button" className="k" data-testid="strip-globe" aria-label={t('লেখার ভাষা বদলান')} title={t('লেখার ভাষা বদলান')} onClick={p.onToggleLanguage}>{GLOBE_ICON}</button>
            <button type="button" className="k" data-testid="kb-show" aria-label={t('কিবোর্ড দেখান')} title={t('কিবোর্ড দেখান')} onClick={() => setKbDown(false)}>⌨</button>
            {micSlot ?? <span className="k" aria-hidden="true" />}
          </div>
        )}
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
      {aiOpen && <AiPanel editor={editor} say={p.say} gemini={p.gemini} privateWords={p.privateWords} setPrivateWords={p.setPrivateWords} onOpenSettings={p.onOpenSettings} onClose={() => { setAiOpen(false); editor.commands.focus(); }} />}
      {convOpen && <BijoyPanel editor={editor} ansiFont={p.ansiFont} enFont={p.enFont} say={p.say} onClose={() => { setConvOpen(false); editor.commands.focus(); }} />}
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
          p.ansiTyping || kbDown ? null : <SuggestionBar editor={editor} bank={p.bank} version={p.bankVersion} tools={p.kbVisible && !deviceKb} />
        )}
        {p.kbVisible && !deviceKb && !kbDown && (() => {
          const phoneKb = p.phone || shortTouch;
          const float = phoneKb ? phoneFloat : kbMode === 'float';
          const split = !float && (phoneKb ? landscape && splitLand : kbMode === 'splitPhone');
          const compact = phoneKb || float || kbMode === 'splitPhone';
          // iPad split/floating (decisions.md 83): the strip's middle is voice — a tap starts it (held: the second
          // mode, as on 🎙); while it runs, its controls and the words being heard sit there instead of at 🎙
          const voiceGap = compact && !phoneKb ? (
            voicing && floatRec ? <div className="kb-gap" data-testid="kb-voice-gap" aria-hidden="true" /> : voicing ? (
              <div className="kb-gap on" data-testid="kb-voice-gap" onPointerDown={(e) => e.preventDefault()}>
                <VoiceControls live={live} ai={aiv} />
                {live.heard && <span className="kb-heard" data-testid="kb-heard">{live.heard.length > 60 ? "…" + live.heard.slice(-60) : live.heard}</span>}
              </div>
            ) : tapAct ? (
              <MicKey onTap={tapAct} onHold={holdAct} disabled={p.ansiTyping && !liveOk} className="kb-gap" testid="kb-voice-gap"
                label={holdAct ? t('ভয়েস: চাপলে Live, চেপে ধরলে রেকর্ড করে লেখা') : t('ভয়েস টাইপিং')}><span aria-hidden="true" /></MicKey>
            ) : null
          ) : undefined;
          // 🌐 held (decisions.md 97): the iPhone's left / full / right, then floating (and split where it fits)
          const items: KbMenuItem[] = phoneKb
            ? landscape
              ? [
                { id: 'hand-full', label: t('পুরো চওড়া কিবোর্ড'), icon: KB_ICONS.full, on: !phoneFloat && !splitLand, act: () => { setPhoneFloat(false); setSplitLand(false); } },
                { id: 'float', label: t('ভাসমান'), icon: KB_ICONS.float, on: phoneFloat, act: () => setPhoneFloat(true) },
                { id: 'split', label: t('Split কিবোর্ড'), icon: KB_ICONS.split, on: !phoneFloat && splitLand, act: () => { setPhoneFloat(false); setSplitLand(true); } },
              ]
              : [
                { id: 'hand-left', label: t('বাম হাতের কিবোর্ড'), icon: KB_ICONS.left, on: !phoneFloat && hand === 'left', act: () => { setPhoneFloat(false); setHand('left'); } },
                { id: 'hand-full', label: t('পুরো চওড়া কিবোর্ড'), icon: KB_ICONS.full, on: !phoneFloat && !hand, act: () => { setPhoneFloat(false); setHand(null); } },
                { id: 'hand-right', label: t('ডান হাতের কিবোর্ড'), icon: KB_ICONS.right, on: !phoneFloat && hand === 'right', act: () => { setPhoneFloat(false); setHand('right'); } },
                { id: 'float', label: t('ভাসমান'), icon: KB_ICONS.float, on: phoneFloat, act: () => setPhoneFloat(true) },
              ]
            : [
              { id: 'dock', label: t('পুরো চওড়া কিবোর্ড'), icon: KB_ICONS.full, on: kbMode === 'dock', act: () => setKbMode('dock') },
              { id: 'float', label: t('ভাসমান'), icon: KB_ICONS.float, on: kbMode === 'float', act: () => setKbMode('float') },
              { id: 'split-phone', label: t('Split কিবোর্ড'), icon: KB_ICONS.split, on: kbMode === 'splitPhone', act: () => setKbMode('splitPhone') },
            ];
          const kb = (
            <OnScreenKeyboard compact={compact} onHide={() => setKbDown(true)} editor={editor} map={p.map} bangla={p.bangla} getConfig={getConfig} onToggleLanguage={p.onToggleLanguage}
              onWordDone={(before) => { if (learnTail(p.bank, before)) p.onBankChanged(); }} flash={flash}
              hand={phoneKb && !landscape && !float ? hand : null} setHand={phoneKb ? setHand : undefined} split={split} annaGap={annaGap} menuItems={items} live={live.available ? { on: live.on, toggle: live.toggle } : undefined} mic={voiceGap && voicing ? <span className="k" aria-hidden="true" /> : micSlot} voicing={voicing} gap={voiceGap} />
          );
          if (float) return <FloatingKeyboard phone={phoneKb} onDock={() => (phoneKb ? setPhoneFloat(false) : setKbMode('dock'))}>{kb}</FloatingKeyboard>;
          return <LiftableKeyboard landscape={landscape} phone={phoneKb} edgeToEdge={split && !phoneKb}>{kb}</LiftableKeyboard>;
        })()}
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
