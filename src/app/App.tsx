import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { availableLayouts, PRONOTES_LAYOUT_ID, findLayout, fixNukta, parseAvroLayout, type Layout } from '../bornona-engine';
import { emptyBank, learnText, mergeBankFile, pruneBank, type WordBank, type WordBankFile, loadDictionary, clearDictionary, resetDictionaryLoad } from '../suggest';
import {
  listDocs, getDoc, createDoc, saveContent, renameDoc, duplicateDoc, trashDoc, restoreDoc, deleteForever, purgeExpired,
  loadBank, saveBank, requestPersistence, exportAll, restoreAll, parseBackup, backupFileName, mergeCorrections,
  listFonts, putFont, removeFont, loadLayouts, saveLayouts, loadCorrections, saveCorrections, loadAiKey, saveAiKey, loadPrivateWords, savePrivateWords, setDocKind,
  setPinned, moveToFolder, loadFolders, createFolder, renameFolder, deleteFolder, snapshotNow, restoreVersion, type Folder, setDocPage, kindOf, type Doc, type DocKind,
} from '../storage';
import { setAnsiFamilies } from '../bijoy';
import { MAX_FONT_BYTES, familyFor, registerFont, unregisterFont, LOCAL_ANSI, readFontStyle } from '../fonts';
import { decideVoice, detectVoiceEnv } from '../voice';
import { DEFAULT_GEMINI_MODEL } from '../ai/gemini';
import { Settings, type FontInfo } from './Settings';
import { InfoSheet, VersionsSheet } from './DocSheets';
import type { ListPrefs } from './Sidebar';
import type { ListFormat } from './doc-export';
import type { BornonaConfig } from '../editor';
import type { FontItem, FontLists } from './FontPicker';
import { canShareFiles } from '../export/deliver';
import type { OutputMode } from './ShareMenu';
import { DEFAULT_VOICE_PREFS, DEFAULT_VIEW, DEFAULT_GRID, voiceLang, type VoicePrefs, type ViewPrefs } from './prefs-types';
import { DEFAULT_PAGE, normalizePage, type PageSetup } from '../docx-export/page';
import type { ToggleKey, AnsiKey } from '../bornona-engine';
import { saveFile } from '../storage/download';
import { DEFAULT_FORMAT, type DocFormat } from '../docx-export/format';
import { Sidebar } from './Sidebar';
import { Workspace, type SaveState } from './Workspace';
import { LawDictionary } from './LawDictionary';
import { load, save, allPrefs, restorePrefs } from './prefs';
import { I18nContext, setUiLangGlobal, translate, tr, type UiLang } from '../i18n';
import { LOCAL_UNI, WEB_FONTS, ENGLISH_FONTS, isFontAvailable } from '../fonts';
import './fonts.css';
import './app.css';
import { flushAll } from './flush';
import { applyUpdate, canPromptInstall, checkForUpdate, isAppleDevice, isStandalone, onInstallChange, promptInstall, pwaSupported, startPwa } from './pwa';

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const wideQuery = typeof matchMedia === 'function' ? matchMedia('(min-width: 1000px)') : null;
/** Phones: keyboard layout moves into the ☰ list, short language labels. */
const phoneQuery = typeof matchMedia === 'function' ? matchMedia('(max-width: 640px)') : null;

/** One-time move of the M2 preview draft and word bank (localStorage) into the database. */
async function migrateFromM2(): Promise<void> {
  if (load('migratedM3', false)) return;
  const draft = load<{ content?: unknown[] } | null>('draft', null);
  if (draft && Array.isArray(draft.content) && JSON.stringify(draft).includes('"text"')) {
    await createDoc('আগের ড্রাফট', draft as never, '');
  }
  const old = load<WordBank | null>('bank', null);
  if (old?.w && Object.keys(old.w).length) {
    const bank = (await loadBank()) ?? emptyBank();
    for (const w in old.w) bank.w[w] = Math.max(bank.w[w] || 0, old.w[w]);
    for (const p in old.b || {}) bank.b[p] = { ...old.b[p], ...(bank.b[p] || {}) };
    await saveBank(bank);
  }
  save('migratedM3', true);
}

export type Theme = 'auto' | 'light' | 'dark';
export const KIND_LABEL: Record<DocKind, string> = { note: 'সাধারণ নোট', legal: 'লিগ্যাল ড্রাফট', chart: 'টাইটেল চার্ট' };
export const KIND_ICON: Record<DocKind, string> = { note: '📝', legal: '⚖', chart: '⛓' };

const svg = (d: string) => <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d={d} /></svg>;
const THEME_ICON: Record<Theme, React.ReactNode> = {
  auto: svg('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2v14a7 7 0 0 1 0-14Z'),
  light: svg('M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5 1.2 3h-2.4L12 2Zm0 20-1.2-3h2.4L12 22ZM2 12l3-1.2v2.4L2 12Zm20 0-3 1.2v-2.4L22 12ZM4.9 4.9l3 1.3-1.7 1.7-1.3-3Zm14.2 14.2-3-1.3 1.7-1.7 1.3 3Zm0-14.2-1.3 3-1.7-1.7 3-1.3ZM4.9 19.1l1.3-3 1.7 1.7-3 1.3Z'),
  dark: svg('M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z'),
};

export function App() {
  const [uiLang, setUiLangState] = useState<UiLang>(() => load<UiLang>('uiLang', 'bn'));
  setUiLangGlobal(uiLang);
  const i18n = useMemo(() => ({ lang: uiLang, t: (s: string, v?: Record<string, string | number>) => translate(uiLang, s, v) }), [uiLang]);
  const t = i18n.t;
  const [theme, setTheme] = useState<Theme>(() => load<Theme>('theme', 'auto'));
  useEffect(() => save('uiLang', uiLang), [uiLang]);
  useEffect(() => {
    save('theme', theme);
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  const [layoutId, setLayoutId] = useState(() => load('layout', PRONOTES_LAYOUT_ID));
  const [enabledDesktop, setEnabledDesktop] = useState<string[]>(() => load('enabledLayouts.desktop', []));
  const [enabledMobile, setEnabledMobile] = useState<string[]>(() => load('enabledLayouts.mobile', []));
  const [bangla, setBangla] = useState(() => load('bangla', true));
  const [vf, setVf] = useState(() => load('vf', true));
  const [oldReph, setOldReph] = useState(() => load('oldReph', false));
  const [kbTablet, setKbTablet] = useState(() => load('kb', coarse));
  /** Phones: tap the page → the phone's own keyboard, typing through the Bornona layout. */
  const [kbPhone, setKbPhone] = useState(() => load('kbPhone', false));
  const [sideOpen, setSideOpen] = useState(() => load('side', true));
  const [lawDictionaryOpen, setLawDictionaryOpen] = useState(false);
  const [format, setFormat] = useState<DocFormat>(() => ({ ...DEFAULT_FORMAT, ...load<Partial<DocFormat>>('format', {}) }));
  const [voice, setVoice] = useState<VoicePrefs>(() => ({ ...DEFAULT_VOICE_PREFS, ...load<Partial<VoicePrefs>>('voice', {}) }));
  const [autoBijoy, setAutoBijoy] = useState(() => load('autoBijoy', true));
  const [viewPrefs, setViewPrefs] = useState<ViewPrefs>(() => {
    const v = load<Partial<ViewPrefs>>('view', {});
    return { ...DEFAULT_VIEW, ...v, grid: { ...DEFAULT_GRID, ...(v.grid ?? {}) } };
  });
  const [pageDefault, setPageDefault] = useState<PageSetup>(() => normalizePage(load<Partial<PageSetup> | null>('pageDefault', null), DEFAULT_PAGE));
  const [fixChandra, setFixChandra] = useState(() => load('fixChandra', true));
  const [output, setOutput] = useState<OutputMode>(() => load<OutputMode>('output', 'unicode'));
  useEffect(() => save('output', output), [output]);
  const [toggleKey, setToggleKey] = useState<ToggleKey>(() => load<ToggleKey>('toggleKey', 'ctrl+space'));
  useEffect(() => save('view', viewPrefs), [viewPrefs]);
  useEffect(() => save('pageDefault', pageDefault), [pageDefault]);
  useEffect(() => save('fixChandra', fixChandra), [fixChandra]);
  useEffect(() => save('toggleKey', toggleKey), [toggleKey]);
  /** Experimental Bijoy (ANSI) typing: on/off and the key that switches it. */
  const [ansiTyping, setAnsiTypingState] = useState(() => load('ansiTyping', false));
  const [ansiKey, setAnsiKey] = useState<AnsiKey>(() => load<AnsiKey>('ansiKey', 'ctrl+shift+a'));
  useEffect(() => save('ansiTyping', ansiTyping), [ansiTyping]);
  useEffect(() => save('ansiKey', ansiKey), [ansiKey]);
  const [ansiFont, setAnsiFont] = useState(() => load('ansiFont', 'SutonnyMJ'));
  const [enFont, setEnFont] = useState(() => load('enFont', 'Times New Roman'));
  const [corrections, setCorrectionsState] = useState('');
  const [customLayouts, setCustomLayouts] = useState<Layout[]>([]);
  const [layoutsReady, setLayoutsReady] = useState(false);
  const [fonts, setFonts] = useState<FontInfo[]>([]);
  const editorRef = useRef<Editor | null>(null);
  const [wide, setWide] = useState(() => wideQuery?.matches ?? true);
  const [phone, setPhone] = useState(() => phoneQuery?.matches ?? false);
  // touch devices (phone and iPad): the device's own keyboard types Bornona; ⌨ switches to the on-screen keyboard
  const kbVisible = coarse || phone ? kbPhone : kbTablet;
  /** Ask the browser not to clear this site's data (Safari otherwise may after 7 days unused, outside the home screen). */
  const [persisted, setPersisted] = useState<boolean | null>(null);
  /** One microphone key: AI voice (Gemini) or the device's voice. 'auto' = AI when a key is set. */
  /** The large Bangla word list in suggestions (decision 56). */
  const [dictOn, setDictOn] = useState(() => load('dictOn', true));
  const [dictCount, setDictCount] = useState(0);
  useEffect(() => {
    save('dictOn', dictOn);
    if (!dictOn) { clearDictionary(); resetDictionaryLoad(); setDictCount(0); return; }
    // after the first paint, so opening the app stays quick
    const id = window.setTimeout(() => { loadDictionary().then(setDictCount); }, 1200);
    return () => clearTimeout(id);
  }, [dictOn]);
  const [voiceEngine, setVoiceEngine] = useState<'auto' | 'ai' | 'device'>(() => load('voiceEngine', 'auto'));
  useEffect(() => save('voiceEngine', voiceEngine), [voiceEngine]);
  const askPersist = async () => {
    try {
      const ok = await navigator.storage.persist();
      setPersisted(ok);
      say(ok ? 'স্টোরেজ স্থায়ী হলো' : 'ব্রাউজার এখন রাজি হলো না; হোম স্ক্রিনে অ্যাপ হিসেবে বসালে সাধারণত রাজি হয়');
    } catch {
      setPersisted(false);
    }
  };
  useEffect(() => {
    const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!st?.persisted) return;
    st.persisted().then(async (p) => {
      // Firefox asks the user, so it is only asked from Settings
      if (!p && st.persist && !/firefox/i.test(navigator.userAgent)) p = await st.persist().catch(() => false);
      setPersisted(p);
    }).catch(() => setPersisted(false));
  }, []);
  const setKbVisible = coarse || phone ? setKbPhone : setKbTablet;
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** AI assistant: Gemini key (IndexedDB, device only), model, words to hide. */
  const [geminiKey, setGeminiKeyState] = useState('');
  const [geminiModel, setGeminiModel] = useState(() => load('geminiModel', DEFAULT_GEMINI_MODEL));
  useEffect(() => save('geminiModel', geminiModel), [geminiModel]);
  const [privateWords, setPrivateWordsState] = useState<string[]>([]);
  const setGeminiKey = (k: string) => { setGeminiKeyState(k.trim()); saveAiKey(k).catch(() => say('key সেভ করা যায়নি')); };
  const setPrivateWords = (w: string[]) => { setPrivateWordsState(w); savePrivateWords(w).catch(() => {}); };
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(() => load('offlineReady', false));
  const [canInstall, setCanInstall] = useState(canPromptInstall);
  useEffect(() => onInstallChange(() => setCanInstall(canPromptInstall())), []);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [trash, setTrash] = useState<Doc[]>([]);
  const [current, setCurrent] = useState<Doc | null>(null);
  const [view, setView] = useState<'docs' | 'trash'>('docs');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [listPrefs, setListPrefs] = useState<ListPrefs>(() => ({ sort: 'updated', kind: 'all', folder: 'all', ...load<Partial<ListPrefs>>('listPrefs', {}) }));
  useEffect(() => save('listPrefs', listPrefs), [listPrefs]);
  /** Bumped to reload the open document (after an earlier version is brought back). */
  const [reloadKey, setReloadKey] = useState(0);
  const [docSheet, setDocSheet] = useState<{ type: 'info' | 'versions'; id: string } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [toast, setToast] = useState('');
  const [fatal, setFatal] = useState(false);
  const [bankVersion, setBankVersion] = useState(0);
  const bank = useRef<WordBank>(emptyBank());
  const layout = useMemo(() => findLayout(layoutId, customLayouts), [layoutId, customLayouts]);
  const allKeyboardLayouts = useMemo(() => availableLayouts(customLayouts), [customLayouts]);
  const enabledIds = phone ? enabledMobile : enabledDesktop;
  const enabledKeyboardLayouts = useMemo(() => allKeyboardLayouts.filter((l) => !enabledIds.length || enabledIds.includes(l.id)), [allKeyboardLayouts, enabledIds]);
  useEffect(() => { if (layoutsReady && !enabledKeyboardLayouts.some((l) => l.id === layoutId)) setLayoutId(PRONOTES_LAYOUT_ID); }, [enabledKeyboardLayouts, layoutId, layoutsReady]);
  const map = layout.map;

  useEffect(() => save('layout', layoutId), [layoutId]);
  useEffect(() => save('enabledLayouts.desktop', enabledDesktop), [enabledDesktop]);
  useEffect(() => save('enabledLayouts.mobile', enabledMobile), [enabledMobile]);
  useEffect(() => save('bangla', bangla), [bangla]);
  useEffect(() => save('vf', vf), [vf]);
  useEffect(() => save('oldReph', oldReph), [oldReph]);
  useEffect(() => save('kb', kbTablet), [kbTablet]);
  useEffect(() => save('kbPhone', kbPhone), [kbPhone]);
  useEffect(() => save('side', sideOpen), [sideOpen]);
  useEffect(() => save('format', format), [format]);
  useEffect(() => save('voice', voice), [voice]);
  useEffect(() => save('autoBijoy', autoBijoy), [autoBijoy]);
  useEffect(() => save('ansiFont', ansiFont), [ansiFont]);
  useEffect(() => save('enFont', enFont), [enFont]);
  useEffect(() => {
    const on = () => {
      setWide(wideQuery?.matches ?? true);
      setPhone(phoneQuery?.matches ?? false);
    };
    wideQuery?.addEventListener('change', on);
    phoneQuery?.addEventListener('change', on);
    return () => {
      wideQuery?.removeEventListener('change', on);
      phoneQuery?.removeEventListener('change', on);
    };
  }, []);

  const toastTimer = useRef<number>(undefined);
  const toastNow = useRef('');
  /** Show a message. `m` is the Bangla text (translated here for the English interface). */
  // a message saved before a restart (restore with settings)
  useEffect(() => {
    try {
      const m = sessionStorage.getItem('pronotes.afterRestart');
      if (m) { sessionStorage.removeItem('pronotes.afterRestart'); setTimeout(() => say(m), 300); }
    } catch { /* blocked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const say = useCallback((m0: string, vars?: Record<string, string | number>) => {
    const m = tr(m0, vars);
    setToast(m);
    toastNow.current = m;
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToast('');
      toastNow.current = '';
    }, m.length > 40 ? 4500 : 2200);
  }, []);
  /** A message that must not push away one the user is reading (background events). */
  const ansiTypingRef = useRef(ansiTyping);
  ansiTypingRef.current = ansiTyping;
  const setAnsiTyping = useCallback((on: boolean) => {
    setAnsiTypingState(on);
    if (!on) return say('টাইপ: ইউনিকোড');
    const fontOk = fonts.some((f) => f.family === ansiFont) || isFontAvailable(ansiFont, true);
    say(fontOk ? 'টাইপ: বিজয় ANSI (পরীক্ষামূলক)। কথা বলে লেখা আর শব্দের পরামর্শ এই সময় বন্ধ।'
      : 'টাইপ: বিজয় ANSI। এই ডিভাইসে {font} ফন্ট নেই, তাই লেখা ভাঙা দেখাবে। Settings → ফন্ট থেকে ফন্ট যোগ করুন।', { font: ansiFont });
  }, [say, fonts, ansiFont]);
  const sayIfIdle = useCallback((m: string) => {
    if (!toastNow.current) say(m);
  }, [say]);

  const refresh = useCallback(async () => {
    setDocs(await listDocs());
    setTrash(await listDocs({ trash: true }));
    setFolders(await loadFolders());
  }, []);

  const open = useCallback(async (id: string) => {
    const d = await getDoc(id);
    if (!d) return;
    setCurrent(d);
    save('current', id);
    if (!wideQuery?.matches) setSideOpen(false);
  }, []);

  // iPad/iPhone: keep the app inside the visible area when the device keyboard opens
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => {
      document.documentElement.style.setProperty('--app-h', vv.height + 'px');
      if (window.scrollY) window.scrollTo(0, 0);
    };
    fit();
    vv.addEventListener('resize', fit);
    return () => vv.removeEventListener('resize', fit);
  }, []);

  // service worker: offline copy and update notice (once per page load)
  const pwaStarted = useRef(false);
  useEffect(() => {
    if (pwaStarted.current) return;
    pwaStarted.current = true;
    startPwa({
      onNeedRefresh: () => setNeedRefresh(true),
      onOfflineReady: () => {
        setOfflineReady(true);
        save('offlineReady', true);
        sayIfIdle('অ্যাপ এখন ইন্টারনেট ছাড়াও চলবে');
      },
    });
  }, [sayIfIdle]);
  const [updating, setUpdating] = useState(false);
  const doUpdate = async () => {
    setUpdating(true);
    await flushAll(); // the open draft is saved before the reload
    await applyUpdate();
  };

  // start-up
  useEffect(() => {
    (async () => {
      try {
        await purgeExpired();
      } catch {
        setFatal(true); // IndexedDB unavailable (e.g. blocked storage)
        return;
      }
      await migrateFromM2();
      bank.current = (await loadBank()) ?? emptyBank();
      setBankVersion((v) => v + 1);
      setCustomLayouts(await loadLayouts());
      setLayoutsReady(true);
      setCorrectionsState(await loadCorrections());
      setGeminiKeyState(await loadAiKey());
      setPrivateWordsState(await loadPrivateWords());
      loadStoredFonts();
      let list = await listDocs();
      if (!list.length) list = [await createDoc(tr('নতুন ড্রাফট'))];
      const last = load<string | null>('current', null);
      await open(list.find((d) => d.id === last)?.id ?? list[0].id);
      await refresh();
      requestPersistence();
    })();
  }, [open, refresh]);

  const bankTimer = useRef<number>(undefined);
  const onBankChanged = useCallback(() => {
    setBankVersion((v) => v + 1);
    clearTimeout(bankTimer.current);
    bankTimer.current = window.setTimeout(() => {
      pruneBank(bank.current);
      saveBank(bank.current).catch(() => say('শব্দভান্ডার সেভ করা যায়নি'));
    }, 500);
  }, [say]);

  const onSave = useCallback(async (id: string, json: object, text: string) => {
    await saveContent(id, json, text);
    await refresh();
  }, [refresh]);

  const newDoc = async (kind: DocKind = 'legal') => {
    const d = await createDoc(tr(kind === 'note' ? 'নতুন নোট' : 'নতুন ড্রাফট'), undefined, '', Date.now(), kind);
    // a new document goes into the folder being looked at
    if (listPrefs.folder && listPrefs.folder !== 'all') await moveToFolder([d.id], listPrefs.folder);
    await refresh();
    await open(d.id);
    setView('docs');
  };
  const toTrash = async (id: string | string[]) => {
    const ids = Array.isArray(id) ? id : [id];
    for (const x of ids) await trashDoc(x);
    await refresh();
    if (current && ids.includes(current.id)) {
      const rest = await listDocs();
      if (rest.length) await open(rest[0].id);
      else await newDoc();
    }
    say('ট্র্যাশে পাঠানো হয়েছে, ৩০ দিনের মধ্যে ফেরত আনা যাবে');
  };

  // ---------- document list actions ----------
  const renameAny = async (id: string, title: string) => {
    await renameDoc(id, title);
    const d = await getDoc(id);
    if (d) setCurrent((c) => (c && c.id === id ? { ...c, title: d.title } : c));
    await refresh();
  };
  const copyText = async (id: string) => {
    const d = await getDoc(id);
    if (!d) return;
    try {
      await navigator.clipboard.writeText(d.text || '');
      say('লেখা কপি হয়েছে');
    } catch {
      say('কপি করা গেল না');
    }
  };
  const pinDoc = async (id: string, v: boolean) => {
    await setPinned(id, v);
    if (current?.id === id) setCurrent((c) => (c ? { ...c, pinned: v || undefined } : c));
    await refresh();
    say(v ? 'উপরে আটকানো হলো' : 'আটকানো তোলা হলো');
  };
  const moveDocs = async (ids: string[], folderId: string) => {
    await moveToFolder(ids, folderId);
    await refresh();
    const f = folders.find((x) => x.id === folderId);
    say(f ? '{n}টা ডকুমেন্ট “{f}” ফোল্ডারে সরানো হলো' : '{n}টা ডকুমেন্ট ফোল্ডারের বাইরে আনা হলো', { n: ids.length, f: f?.name ?? '' });
  };
  const kindOfAny = async (id: string, kind: DocKind) => {
    if (current?.id === id) return changeKind(kind);
    await setDocKind(id, kind);
    await refresh();
    say('ধরন বদলে {kind} করা হলো', { kind: tr(KIND_LABEL[kind]) });
  };
  const exportDocs = async (ids: string[], fmt: ListFormat, mode: 'save' | 'share') => {
    if (current && ids.includes(current.id)) await flushAll();
    const list = (await Promise.all(ids.map((id) => getDoc(id)))).filter((d): d is Doc => !!d);
    if (!list.length) return;
    try {
      const { docFile, docsZip } = await import('./doc-export');
      const { deliver } = await import('../export/deliver');
      const ctx = { format, pageDefault };
      let blob: Blob;
      let name: string;
      if (list.length === 1) ({ blob, name } = await docFile(list[0], fmt, ctx));
      else {
        blob = await docsZip(list, fmt, ctx);
        name = `ProNotes - ${list.length} ${tr('ডকুমেন্ট')}.zip`;
      }
      const r = await deliver(blob, name, mode, list.length === 1 ? list[0].title : name);
      if (r === 'saved') say('{name} তৈরি হয়েছে', { name });
      else if (r === 'shared') say('শেয়ার করা হয়েছে');
    } catch {
      say('ফাইল তৈরি করা যায়নি');
    }
  };
  const restoreOld = async (versionId: string, docId: string) => {
    if (current?.id === docId) await flushAll();
    const d = await restoreVersion(versionId);
    if (!d) return say('ভার্সনটা পাওয়া গেল না');
    if (current?.id === docId) {
      setCurrent(d);
      setReloadKey((k) => k + 1);
    }
    await refresh();
    say('আগের ভার্সন ফেরত আনা হলো; এখনকার অবস্থাও ভার্সন হিসেবে রাখা আছে');
  };
  const sideCfg = useRef<BornonaConfig>({ bangla, map, vowelForming: vf, oldReph, suspended: false });
  sideCfg.current = { bangla, map, vowelForming: vf, oldReph, suspended: false, fixChandra, toggleKey };
  const getSideConfig = useCallback(() => sideCfg.current, []);
  const toggleBangla = useCallback(() => setBangla((b) => !b), []);

  // every setting on this device goes into the backup (store), and comes back on restore
  const prefs = () => ({ layout: layoutId, bangla, vf, oldReph, kb: kbVisible, format, voice, autoBijoy, ansiFont, enFont, store: allPrefs() });
  const backup = async (withKey = false) => {
    try {
      const f = await exportAll(prefs(), new Date(), withKey && geminiKey ? geminiKey : undefined);
      const ok = await saveFile(backupFileName(), new Blob([JSON.stringify(f)], { type: 'application/json' }));
      if (ok) say('{n}টা ড্রাফট আর শব্দভান্ডারের ব্যাকআপ তৈরি হয়েছে', { n: f.docs.length });
    } catch {
      say('ব্যাকআপ তৈরি করা যায়নি');
    }
  };
  const restore = async (file: File) => {
    try {
      const f = parseBackup(await file.text());
      const r = await restoreAll(f);
      if (f.aiKey && !geminiKey) setGeminiKey(f.aiKey);
      bank.current = (await loadBank()) ?? bank.current;
      setBankVersion((v) => v + 1);
      setCustomLayouts(await loadLayouts());
      setCorrectionsState(await loadCorrections());
      await refresh();
      const msg = tr('ফেরত এসেছে: নতুন {a}টা, আলাদা কপি {c}টা, আগে থেকেই ছিল {u}টা', { a: r.added, c: r.copies, u: r.unchanged });
      say(msg);
      const store = (r.prefs as { store?: Record<string, unknown> }).store;
      if (store && restorePrefs(store)) {
        // settings take effect after a fresh start; the open draft is saved first, the message is shown again after it
        await flushAll();
        try { sessionStorage.setItem('pronotes.afterRestart', msg + ' ' + tr('সেটিংও ফেরত এসেছে।')); } catch { /* blocked */ }
        setTimeout(() => location.reload(), 900);
      }
    } catch {
      say('ফাইলটা ProNotes-এর ব্যাকআপ না, বা পড়া যায়নি');
    }
  };

  // ---------- custom layouts ----------
  const addLayout = async (file: File) => {
    try {
      const L: Layout = { ...parseAvroLayout(await file.text()), id: 'custom-' + Date.now() };
      const next = [...customLayouts, L];
      await saveLayouts(next);
      setCustomLayouts(next);
      setLayoutId(L.id);
      say('{name} লেআউট যোগ হলো', { name: L.name });
    } catch {
      say('ফাইলটা Avro লেআউট (.avrolayout) হিসেবে পড়া গেল না');
    }
  };
  const deleteLayout = async (id: string) => {
    const next = customLayouts.filter((l) => l.id !== id);
    await saveLayouts(next);
    setCustomLayouts(next);
    if (layoutId === id) setLayoutId(PRONOTES_LAYOUT_ID);
    say('লেআউট মুছে ফেলা হয়েছে');
  };

  // ---------- fonts ----------
  const loadStoredFonts = async () => {
    const list: FontInfo[] = [];
    for (const f of await listFonts()) {
      try {
        await registerFont(f);
        const st = readFontStyle(f.data, f.fileName);
        list.push({ id: f.id, family: f.family, fileName: f.fileName, role: f.role, italic: st.style === 'italic', weight: st.weight });
      } catch {
        /* unreadable file: keep it stored, skip it on screen */
      }
    }
    setFonts(list);
  };
  const addFont = async (file: File, role: 'uni' | 'ansi') => {
    if (file.size > MAX_FONT_BYTES) return say('ফন্ট ফাইলটা অনেক বড় (১৫ MB-এর বেশি)');
    const data = await file.arrayBuffer();
    const rec = { id: 'font-' + Date.now(), family: familyFor(data, file.name), fileName: file.name, role, data, addedAt: Date.now() };
    try {
      await registerFont(rec);
    } catch {
      return say('এই ফাইলটা ফন্ট হিসেবে খোলা গেল না');
    }
    try {
      await putFont(rec);
    } catch {
      say('ফন্ট এবার কাজ করবে, কিন্তু ডিভাইসে সেভ করা গেল না');
    }
    const st = readFontStyle(data, file.name);
    setFonts((l) => [...l, { id: rec.id, family: rec.family, fileName: rec.fileName, role, italic: st.style === 'italic', weight: st.weight }]);
    if (role === 'ansi') setAnsiFont(rec.family);
    else setFormat((f) => ({ ...f, font: rec.family }));
    say('{name} যোগ হয়েছে', { name: rec.family });
  };
  const deleteFont = async (id: string) => {
    try {
      await removeFont(id);
    } catch {
      /* already gone */
    }
    unregisterFont(id);
    setFonts((l) => l.filter((f) => f.id !== id));
    say('ফন্ট মুছে ফেলা হয়েছে');
  };

  // ---------- voice corrections (IndexedDB, debounced) ----------
  const corrTimer = useRef<number>(undefined);
  const setCorrections = (s: string) => {
    setCorrectionsState(s);
    clearTimeout(corrTimer.current);
    corrTimer.current = window.setTimeout(() => saveCorrections(s).catch(() => say('সংশোধনের তালিকা সেভ করা যায়নি')), 500);
  };
  const voiceNote = useMemo(() => {
    const d = decideVoice(voiceLang(voice, bangla), detectVoiceEnv());
    return d.kind === 'live'
      ? 'এই ব্রাউজারে সরাসরি ভয়েস চলবে। পাতার কোণের লাল মাইক চাপুন, আবার চাপলে থামবে। ইন্টারনেট লাগে।'
      : d.message;
  }, [voice, bangla]);

  // ---------- word bank ----------
  const learnDoc = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const n = learnText(bank.current, ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', ' '));
    onBankChanged();
    if (n) say('{n}টা শব্দ শেখা হলো', { n });
    else say('শেখার মতো শব্দ পাওয়া যায়নি');
  };
  const exportWords = async () => {
    const data: WordBankFile = { app: 'bornona-pad', version: 1, exported: new Date().toISOString(), words: bank.current.w, next: bank.current.b, corrections };
    const ok = await saveFile('bornona-words-' + new Date().toISOString().slice(0, 10) + '.json', new Blob([JSON.stringify(data)], { type: 'application/json' }));
    if (ok) say('{n}টা শব্দ এক্সপোর্ট হলো', { n: Object.keys(bank.current.w).length });
  };
  const importWords = async (file: File) => {
    try {
      const d = JSON.parse(await file.text()) as WordBankFile;
      const n = mergeBankFile(bank.current, d, fixNukta);
      if (d.corrections) setCorrections(mergeCorrections(corrections, d.corrections));
      onBankChanged();
      say('{n}টা নতুন শব্দ যোগ হলো', { n });
    } catch {
      say('ফাইলটা বর্ণনা প্যাডের শব্দভান্ডার না');
    }
  };
  const resetWords = () => {
    bank.current = emptyBank();
    onBankChanged();
    say('শেখা শব্দ মুছে ফেলা হয়েছে');
  };

  // page changes show at once; the database writes run one after another, in order
  const pageWrites = useRef<Promise<void>>(Promise.resolve());
  const changePage = (page: PageSetup) => {
    if (!current) return;
    const id = current.id;
    setCurrent((d) => (d && d.id === id ? { ...d, page } : d));
    pageWrites.current = pageWrites.current.then(() => setDocPage(id, page)).then(() => refresh()).catch(() => say('পাতার সেটিং সেভ করা যায়নি'));
  };
  const changeKind = async (kind: DocKind) => {
    if (!current || kind === kindOf(current)) return;
    await flushAll();
    await setDocKind(current.id, kind);
    const d = await getDoc(current.id);
    if (d) setCurrent(d);
    await refresh();
    say('ধরন বদলে {kind} করা হলো', { kind: tr(KIND_LABEL[kind]) });
  };
  const fontChoices = useMemo(
    () => [...new Set([format.font, ...LOCAL_UNI, ...WEB_FONTS, ...fonts.filter((f) => f.role === 'uni').map((f) => f.family), ...ENGLISH_FONTS])],
    [format.font, fonts],
  );
  // every Bijoy (ANSI) family the app should treat as Bijoy: the user's ANSI fonts and the chosen Bijoy font
  useEffect(() => setAnsiFamilies([ansiFont, ...fonts.filter((f) => f.role === 'ansi').map((f) => f.family)]), [ansiFont, fonts]);
  /** Both font lists for the font box, each font marked as usable on this device or not. */
  const fontLists = useMemo((): FontLists => {
    const own = new Set(fonts.map((f) => f.family));
    const item = (name: string, ansi: boolean): FontItem => ({
      name, ansi, own: own.has(name),
      available: own.has(name) || WEB_FONTS.includes(name) || isFontAvailable(name, ansi),
    });
    const ansiNames = [...new Set([ansiFont, ...fonts.filter((f) => f.role === 'ansi').map((f) => f.family), ...LOCAL_ANSI])];
    return { uni: fontChoices.map((n) => item(n, false)), ansi: ansiNames.map((n) => item(n, true)) };
  }, [fontChoices, fonts, ansiFont]);
  const themeNext: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };
  const themeLabel: Record<Theme, string> = { auto: 'রং: ডিভাইস অনুযায়ী', light: 'রং: আলো', dark: 'রং: অন্ধকার' };

  const showSide = sideOpen;
  const layoutSelect = (
    <select className="layout" aria-label={t('কিবোর্ড লেআউট')} title={t('কিবোর্ড লেআউট')} data-testid="layout" value={layoutId} onChange={(e) => setLayoutId(e.target.value)}>
      <optgroup label={t('সাথে দেওয়া')}>{enabledKeyboardLayouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
      {customLayouts.length > 0 && <optgroup label={t('আপনার যোগ করা')}>{customLayouts.filter((l) => !enabledIds.length || enabledIds.includes(l.id)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>}
    </select>
  );
  const sidebar = (
    <Sidebar top={
      <>
        <div className="side-brand">ProNotes</div>
        {phone && <label className="side-layout">{t('কিবোর্ড লেআউট')}{layoutSelect}</label>}
      </>
    } docs={docs} trash={trash} folders={folders} currentId={current?.id ?? null} view={view} setView={setView} kindIcon={KIND_ICON} kindLabel={KIND_LABEL}
      prefs={listPrefs} setPrefs={setListPrefs} getConfig={getSideConfig} onToggleLanguage={toggleBangla}
      onOpen={open} onNew={newDoc}
      onRename={renameAny} onCopyText={copyText} onPin={pinDoc} onMove={moveDocs} onChangeKind={kindOfAny}
      onExport={exportDocs} canShare={canShareFiles()}
      onInfo={(id) => setDocSheet({ type: 'info', id })} onVersions={async (id) => { if (current?.id === id) await flushAll(); setDocSheet({ type: 'versions', id }); }}
      onDuplicate={async (id) => { if (current?.id === id) await flushAll(); const d = await duplicateDoc(id); await refresh(); if (d) await open(d.id); say('ডুপ্লিকেট তৈরি হয়েছে'); }}
      onTrash={toTrash}
      onRestore={async (id) => { await restoreDoc(id); await refresh(); say('ফেরত আনা হয়েছে'); }}
      onDeleteForever={async (id) => { await deleteForever(id); await refresh(); say('স্থায়ীভাবে মুছে ফেলা হয়েছে'); }}
      onCreateFolder={async (name) => { await createFolder(name); await refresh(); say('ফোল্ডার তৈরি হয়েছে'); }}
      onRenameFolder={async (id, name) => { await renameFolder(id, name); await refresh(); }}
      onDeleteFolder={async (id) => { const n = await deleteFolder(id); await refresh(); say('ফোল্ডার মোছা হলো; ভেতরের {n}টা ডকুমেন্ট আছে, শুধু ফোল্ডারের বাইরে এসেছে', { n }); }}
      onClose={wide ? undefined : () => setSideOpen(false)} />
  );
  const statusText = t({ saved: 'এই ডিভাইসে সেভ হয়েছে', saving: 'সেভ হচ্ছে…', error: 'সেভ করা যায়নি' }[saveState]);

  if (fatal)
    return (
      <div className="fatal" role="alert" data-testid="fatal">
        <h1>ProNotes</h1>
        <p>{t('এই ব্রাউজারে লেখা সেভ করার জায়গা (IndexedDB) খোলা যাচ্ছে না, তাই লেখা হারানোর ঝুঁকি এড়াতে অ্যাপ বন্ধ রাখা হলো।')}</p>
        <p>{t('Private/Incognito মোড বন্ধ করে, বা ব্রাউজারের সেটিংসে এই সাইটের ডেটা রাখার অনুমতি দিয়ে আবার খুলুন।')}</p>
      </div>
    );

  return (
    <I18nContext.Provider value={i18n}>
    <div className={'app' + (!lawDictionaryOpen && showSide && wide ? ' with-side' : '')}>
      <header className="top">
        <div className="brand" id="title-slot">
          {!current && <span className="name">ProNotes</span>}
        </div>
        {/* quiet: a small ✓ when saved; words only while saving fails */}
        <span className={'status ' + saveState} data-testid="save-status" role="status" title={statusText}>{statusText}</span>
        {!phone && layoutSelect}
        <button type="button" className="tb lang" data-testid="lang-toggle" data-lang={bangla ? 'bn' : 'en'}
          title={t(bangla ? 'টাইপ: বাংলা — চাপলে English' : 'টাইপ: English — চাপলে বাংলা')}
          aria-label={t(bangla ? 'টাইপ: বাংলা — চাপলে English' : 'টাইপ: English — চাপলে বাংলা')}
          onPointerDown={(e) => e.preventDefault()} onClick={() => setBangla((b) => !b)}>{bangla ? 'বা' : 'e'}</button>
        <button type="button" className={'tb' + (lawDictionaryOpen ? ' on' : '')} title="ProNotes Law Dictionary" aria-label="ProNotes Law Dictionary" data-testid="law-dictionary-toggle" onClick={() => setLawDictionaryOpen((v) => !v)}>⚖</button>
        <button type="button" className="tb theme" data-testid="theme" data-theme-mode={theme} title={t(themeLabel[theme])} aria-label={t(themeLabel[theme])}
          onClick={() => setTheme(themeNext[theme])}>{THEME_ICON[theme]}</button>
        <button type="button" className={'tb' + (settingsOpen ? ' on' : '')} title={t('সেটিংস')} aria-label={t('সেটিংস')} data-testid="settings"
          onClick={() => setSettingsOpen((v) => !v)}>⚙</button>
      </header>

      <div className="body">
        {!lawDictionaryOpen && showSide && (wide ? sidebar : <div className="drawer" onClick={(e) => e.target === e.currentTarget && setSideOpen(false)}>{sidebar}</div>)}
        <div className="work">
          {lawDictionaryOpen ? <LawDictionary onClose={() => setLawDictionaryOpen(false)} /> : current && (
            <Workspace key={current.id + ':' + reloadKey} doc={current} map={map} phonetic={layoutId === 'pronotes-phonetic'} bangla={bangla} vowelForming={vf} oldReph={oldReph}
              kbVisible={kbVisible} coarse={coarse} phone={phone} voiceEngine={voiceEngine === 'auto' ? (geminiKey ? 'ai' : 'device') : voiceEngine} bank={bank.current} bankVersion={bankVersion} onBankChanged={onBankChanged}
              onToggleLanguage={() => setBangla((b) => !b)} onSave={onSave}
              onRename={renameAny}
              onSaveState={setSaveState} format={format} say={say} fonts={fontChoices} fontLists={fontLists}
              page={normalizePage(current.page, pageDefault)} onPage={changePage}
              onMakeDefaultPage={(pg) => { setPageDefault(pg); say('নতুন লিগ্যাল ড্রাফট এখন থেকে এই পাতায় খুলবে'); }}
              view={viewPrefs} setView={setViewPrefs} fixChandra={fixChandra} toggleKey={toggleKey}
              gemini={{ key: geminiKey, model: geminiModel, setModel: (m: string) => { setGeminiModel(m); say('Gemini মডেল বদলে {m} বাছা হলো', { m }); } }} privateWords={privateWords} setPrivateWords={setPrivateWords}
              onOpenSettings={() => setSettingsOpen(true)}
              ansiTyping={ansiTyping} ansiKey={ansiKey} onToggleAnsi={() => setAnsiTyping(!ansiTypingRef.current)}
              output={output} setOutput={setOutput}
              voice={voice} corrections={corrections} autoBijoy={autoBijoy} ansiFont={ansiFont} enFont={enFont}
              onEditor={(e) => { editorRef.current = e; }}
              toolbarExtra={
                <>
                  <button type="button" className={'tb' + (showSide ? ' on' : '')} title={t('ডকুমেন্টের তালিকা')} aria-label={t('ডকুমেন্টের তালিকা')}
                    data-testid="side-toggle" onPointerDown={(e) => e.preventDefault()} onClick={() => setSideOpen((v) => !v)}>☰</button>
                </>
              }
              toolbarRight={
        <button type="button" className={'tb' + (kbVisible ? ' on' : '')} title={t('অন-স্ক্রিন কিবোর্ড')} aria-label={t('অন-স্ক্রিন কিবোর্ড')} data-testid="kb-toggle"
          onPointerDown={(e) => e.preventDefault()} onClick={() => setKbVisible((v) => !v)}>⌨</button>
              } />
          )}
        </div>
      </div>


      {settingsOpen && (
        <Settings vf={vf} setVf={setVf} oldReph={oldReph} setOldReph={setOldReph}
          keyboardLayouts={allKeyboardLayouts} enabledDesktop={enabledDesktop} setEnabledDesktop={setEnabledDesktop}
          enabledMobile={enabledMobile} setEnabledMobile={setEnabledMobile}
          customLayouts={customLayouts} onAddLayout={addLayout} onDeleteLayout={deleteLayout}
          voice={voice} setVoice={setVoice} voiceEngine={voiceEngine} setVoiceEngine={setVoiceEngine} voiceNote={voiceNote} corrections={corrections} setCorrections={setCorrections}
          format={format} setFormat={setFormat} fonts={fonts} onAddFont={addFont} onDeleteFont={deleteFont}
          ansiFont={ansiFont} setAnsiFont={setAnsiFont} enFont={enFont} setEnFont={setEnFont}
          autoBijoy={autoBijoy} setAutoBijoy={setAutoBijoy}
          dict={{ on: dictOn, setOn: setDictOn, count: dictCount }}
          wordCount={Object.keys(bank.current.w).length + 0 * bankVersion}
          onLearnDoc={learnDoc} onExportWords={exportWords} onImportWords={importWords} onResetWords={resetWords}
          onBackup={backup} onRestore={restore} uiLang={uiLang} setUiLang={setUiLangState}
          fixChandra={fixChandra} setFixChandra={setFixChandra} toggleKey={toggleKey} setToggleKey={setToggleKey}
          ansiTyping={ansiTyping} setAnsiTyping={setAnsiTyping} ansiKey={ansiKey} setAnsiKey={setAnsiKey}
          ai={{ key: geminiKey, setKey: setGeminiKey, model: geminiModel, setModel: setGeminiModel, privateWords, setPrivateWords }}
          app={{
            supported: pwaSupported(), offlineReady, standalone: isStandalone(), apple: isAppleDevice(), canInstall,
            onInstall: async () => { if (await promptInstall()) say('ProNotes ইনস্টল হয়েছে'); },
            persisted, onPersist: askPersist,
            onCheckUpdate: async () => { say((await checkForUpdate()) ? 'নতুন ভার্সন খোঁজা হলো; থাকলে উপরে জানানো হবে' : 'এখন খোঁজা গেল না (ইন্টারনেট নেই?)'); },
          }} />
      )}

      {docSheet && (() => {
        const d = [...docs, ...trash].find((x) => x.id === docSheet.id);
        if (!d) return null;
        return docSheet.type === 'info'
          ? <InfoSheet doc={d} folders={folders} kindLabel={KIND_LABEL} onClose={() => setDocSheet(null)} />
          : <VersionsSheet doc={d} onClose={() => setDocSheet(null)} onRestore={(v) => restoreOld(v.id, d.id)}
              onSnapshot={async () => { if (current?.id === d.id) await flushAll(); await snapshotNow(d.id); say('এখনকার অবস্থা ভার্সন হিসেবে রাখা হলো'); }} />;
      })()}
      {needRefresh && (
        <div className="update" role="status" data-testid="update-banner">
          <span>{t('ProNotes-এর নতুন ভার্সন এসেছে। আপনার লেখা সেভ করে আপডেট হবে।')}</span>
          <button type="button" className="btn primary small" data-testid="update-now" disabled={updating} onClick={doUpdate}>{updating ? t('আপডেট হচ্ছে…') : t('এখন আপডেট করুন')}</button>
          <button type="button" className="btn small" data-testid="update-later" onClick={() => setNeedRefresh(false)}>{t('পরে')}</button>
        </div>
      )}

      {toast && <div className="toast" role="status" data-testid="toast">{toast}</div>}
    </div>
    </I18nContext.Provider>
  );
}
