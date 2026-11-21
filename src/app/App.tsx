import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { availableLayouts, PRONOTES_LAYOUT_ID, findLayout, fixNukta, type Layout } from '../bornona-engine';
import { readLayoutFile, LAYOUT_MSG, type NewLayout } from './layout-files';
import { emptyBank, learnText, mergeBankFile, pruneBank, type WordBank, type WordBankFile, loadDictionary, clearDictionary, resetDictionaryLoad } from '../suggest';
import {
  listDocs, getDoc, createDoc, saveContent, renameDoc, duplicateDoc, trashDoc, restoreDoc, deleteForever, purgeExpired,
  loadBank, saveBank, requestPersistence, exportAll, restoreAll, parseBackup, backupFileName, mergeCorrections,
  listFonts, putFont, removeFont, loadLayouts, saveLayouts, loadCorrections, saveCorrections, loadAiKey, saveAiKey, loadPrivateWords, savePrivateWords, setDocKind,
  setPinned, moveToFolder, loadFolders, createFolder, renameFolder, deleteFolder, snapshotNow, restoreVersion, type Folder, setDocPage, kindOf, type Doc, type DocKind,
} from '../storage';
import { setAnsiFamilies } from '../bijoy';
import { MAX_FONT_BYTES, familyFor, registerFont, unregisterFont, LOCAL_ANSI, readFontStyle, prepareFontFile, fontHash, duplicateFonts, keeperOf } from '../fonts';
import { decideVoice, detectVoiceEnv } from '../voice';
import { AUTO_MODEL } from '../ai/gemini';
import { DEFAULT_VOICE_MODES, type VoiceModes } from './voice-modes';
import { agoKey, agoN, type BackupLast, type ToastAction } from './backup-status';
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
import { ChartWorkspace } from './ChartWorkspace';
import { listDriveFonts, uploadDriveFont, downloadDriveFont, planFontSync, currentToken, downloadBackup, DriveError, autoDeviceName, fitDevice, driveBackupName, driveEnabled, KEEP_DEFAULT, listBackups, pruneBackups, signIn, signOut, takeRedirect, trashBackup, uploadBackup, type AfterSignIn, type DriveBackup } from '../storage/gdrive';
import { CraftWorkspace, type CraftHandoff, type CraftView } from '../craft/CraftWorkspace';
import { craftApp } from '../craft/bridge';
import { load, save, allPrefs, restorePrefs } from './prefs';
import { applyPalette, loadPalette, applyKbLook, loadKbLook, applyKbHeight, loadKbHeight } from './look';
import { I18nContext, setUiLangGlobal, translate, tr, type UiLang } from '../i18n';
import { LOCAL_UNI, WEB_FONTS, ENGLISH_FONTS, isFontAvailable, applyAppFonts, fontFileUrl, DEFAULT_APP_BN, DEFAULT_APP_EN, type AppFonts } from '../fonts';
import './fonts.css';
import './app.css';
import { flushAll } from './flush';
import { applyUpdate, canPromptInstall, checkForUpdate, isAppleDevice, isStandalone, onInstallChange, promptInstall, pwaSupported, startPwa } from './pwa';

/**
 * Hidden layouts for one kind of device. The first version stored the shown layouts
 * ("enabledLayouts.*", empty = all); a non-empty one of those is turned into a hidden list once.
 */
function hiddenLayoutsPref(kind: 'desktop' | 'mobile'): string[] {
  const hidden = load<string[] | null>('hiddenLayouts.' + kind, null);
  if (Array.isArray(hidden)) return hidden;
  const shown = load<string[]>('enabledLayouts.' + kind, []);
  if (!Array.isArray(shown) || !shown.length) return [];
  return availableLayouts().map((l) => l.id).filter((id) => !shown.includes(id));
}

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
  // the app's own Bangla and English fonts (menus, buttons, keyboard keys); decisions.md 80
  // the top bar folded away to a thin strip (decisions.md 82); remembered on this device
  const [topMin, setTopMin0] = useState<boolean>(() => load('device.topMin', false));
  const setTopMin = (v: boolean) => { setTopMin0(v); save('device.topMin', v); };
  const [appFonts, setAppFonts] = useState<AppFonts>(() => ({ bn: DEFAULT_APP_BN, en: DEFAULT_APP_EN, ...load<Partial<AppFonts>>('appFonts', {}) }));
  useEffect(() => {
    save('theme', theme);
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    // the colour set and the light/dark in effect, which follows the device while ◐ is on auto (decisions.md 88)
    applyPalette(loadPalette(), theme);
    const m = window.matchMedia?.('(prefers-color-scheme: dark)');
    const on = () => applyPalette(loadPalette(), theme);
    m?.addEventListener?.('change', on);
    return () => m?.removeEventListener?.('change', on);
  }, [theme]);
  // the keyboard's own colours and height (decisions.md 88)
  useEffect(() => { applyKbLook(loadKbLook()); applyKbHeight(loadKbHeight()); }, []);
  const [layoutId, setLayoutId] = useState(() => load('layout', PRONOTES_LAYOUT_ID));
  // Layouts hidden from the layout box, separately for computers and touch devices (phone, iPad).
  // Stored as "hidden" so that an empty list means "show all" and newly added layouts show up.
  const [hiddenDesktop, setHiddenDesktop] = useState<string[]>(() => hiddenLayoutsPref('desktop'));
  const [hiddenMobile, setHiddenMobile] = useState<string[]>(() => hiddenLayoutsPref('mobile'));
  const [bangla, setBangla] = useState(() => load('bangla', true));
  const [vf, setVf] = useState(() => load('vf', true));
  const [oldReph, setOldReph] = useState(() => load('oldReph', false));
  const [kbTablet, setKbTablet] = useState(() => load('kb', coarse));
  /** Phones: tap the page → the phone's own keyboard, typing through the Bornona layout. */
  const [kbPhone, setKbPhone] = useState(() => load('kbPhone', false));
  const [sideOpen, setSideOpen] = useState(() => load('side', true));
  const [lawDictionaryOpen, setLawDictionaryOpen] = useState(false);
  // Craft apps workspace; ?app=wordcraft (the /word/ address) opens straight into that app
  const [craftStart] = useState(() => (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('app')));
  const [craftOpen, setCraftOpen] = useState(() => !!craftApp(craftStart));
  // a draft sent from the Share menu ("WordCraft-এ খুলুন")
  const [craftHandoff, setCraftHandoff] = useState<CraftHandoff | null>(null);
  // once opened, the Apps workspace stays mounted (hidden) so a running app is not reloaded
  const [craftMounted, setCraftMounted] = useState(() => !!craftApp(craftStart));
  useEffect(() => { if (craftOpen) setCraftMounted(true); }, [craftOpen]);
  // an app fills the screen: ProNotes' header steps aside (the app's thin bar has the way back)
  const [craftView, setCraftView] = useState<CraftView>('launcher');
  const appFullscreen = craftOpen && craftView === 'app';
  useEffect(() => {
    if (craftStart) history.replaceState(null, '', location.pathname + location.hash);
  }, [craftStart]);
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
  /** false until the saved custom layouts are read; until then a stored custom layout id is not "missing" */
  const [layoutsReady, setLayoutsReady] = useState(false);
  const [fonts, setFonts] = useState<FontInfo[]>([]);
  // own font files register first; the rules are written again once they have, so their blob: URLs exist
  useEffect(() => { save('appFonts', appFonts); applyAppFonts(appFonts, fontFileUrl); }, [appFonts, fonts]);
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
  // Live and record-to-text: each on or off, each with its own model (decisions.md 77)
  const [voiceModes, setVoiceModes] = useState<VoiceModes>(() => ({ ...DEFAULT_VOICE_MODES, ...load<Partial<VoiceModes>>('voice.modes', {}) }));
  useEffect(() => save('voice.modes', voiceModes), [voiceModes]);
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
  const [geminiModel, setGeminiModel] = useState(() => load('geminiModel', AUTO_MODEL));
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
  // an iPad is a touch device: it uses the "Mobile / iPad" list, whatever its width
  const hiddenIds = coarse || phone ? hiddenMobile : hiddenDesktop;
  const enabledKeyboardLayouts = useMemo(() => {
    const shown = allKeyboardLayouts.filter((l) => !hiddenIds.includes(l.id));
    return shown.length ? shown : allKeyboardLayouts;
  }, [allKeyboardLayouts, hiddenIds]);
  useEffect(() => {
    // Keep an older stored Bornona selection readable for migration/tests, but never
    // add it to the user-facing layout list.
    // Wait for the saved custom layouts: after a reload the list is empty for a moment, and the
    // chosen custom layout would otherwise be thrown away.
    if (!layoutsReady) return;
    if (layoutId !== 'bornona' && !enabledKeyboardLayouts.some((l) => l.id === layoutId)) setLayoutId(enabledKeyboardLayouts[0]?.id ?? PRONOTES_LAYOUT_ID);
  }, [enabledKeyboardLayouts, layoutId, layoutsReady]);
  const map = layout.map;

  useEffect(() => save('layout', layoutId), [layoutId]);
  useEffect(() => save('hiddenLayouts.desktop', hiddenDesktop), [hiddenDesktop]);
  useEffect(() => save('hiddenLayouts.mobile', hiddenMobile), [hiddenMobile]);
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
  // a message may carry buttons ("ডিভাইসে নামান"…): then it stays until one is pressed or it is closed
  const [toastActs, setToastActs] = useState<ToastAction[]>([]);
  const say = useCallback((m0: string, vars?: Record<string, string | number>, acts: ToastAction[] = []) => {
    const m = tr(m0, vars);
    setToast(m);
    setToastActs(acts);
    toastNow.current = m;
    clearTimeout(toastTimer.current);
    if (acts.length) return;
    toastTimer.current = window.setTimeout(() => {
      setToast('');
      toastNow.current = '';
    }, m.length > 40 ? 4500 : 2200);
  }, []);
  const closeToast = () => { clearTimeout(toastTimer.current); setToast(''); setToastActs([]); toastNow.current = ''; };
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

  // iPad/iPhone: keep the app inside the visible area when the device keyboard opens, and never let the
  // whole screen scroll away (the header and the ribbon always stay in view; only the page scrolls)
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const fit = () => {
      if (vv) {
        root.style.setProperty('--app-h', vv.height + 'px');
        root.style.setProperty('--app-top', Math.max(0, vv.offsetTop) + 'px');
      }
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    };
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    window.addEventListener('scroll', fit);
    return () => { vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit); window.removeEventListener('scroll', fit); };
  }, []);

  // the screen itself never zooms: a pinch is for the page only (Workspace), not the buttons and bars
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const twoFingers = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    const ctrlWheel = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    document.addEventListener('gesturestart', stop);
    document.addEventListener('gesturechange', stop);
    document.addEventListener('touchmove', twoFingers, { passive: false });
    document.addEventListener('wheel', ctrlWheel, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', stop);
      document.removeEventListener('gesturechange', stop);
      document.removeEventListener('touchmove', twoFingers);
      document.removeEventListener('wheel', ctrlWheel);
    };
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
    // keep the open document's copy current too: when the editor comes back (after the law
    // dictionary or the Apps workspace), it starts from this copy, not from the old one
    setCurrent((c) => (c && c.id === id ? { ...c, content: json as Doc['content'], text, updatedAt: Date.now() } : c));
    await refresh();
  }, [refresh]);

  const newDoc = async (kind: DocKind = 'legal') => {
    const d = await createDoc(tr(kind === 'note' ? 'নতুন নোট' : kind === 'chart' ? 'নতুন টাইটেল চার্ট' : 'নতুন ড্রাফট'), undefined, '', Date.now(), kind);
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
  sideCfg.current = { bangla, map, vowelForming: vf, oldReph, suspended: false, fixChandra, toggleKey, hasantaRules: layoutId === PRONOTES_LAYOUT_ID };
  const getSideConfig = useCallback(() => sideCfg.current, []);
  // the same layout and rules for the user's own apps (▦ → আমার অ্যাপ; decisions.md 81)
  const appTyping = useMemo(() => ({
    cfg: { bangla, map, vowelForming: vf, oldReph, fixChandra, toggleKey, hasantaRules: layoutId === PRONOTES_LAYOUT_ID },
    onToggleLanguage: () => setBangla((b) => !b),
    // ProNotes' own on-screen keyboard under an app's text box (decisions.md 82): the same on/off as for drafts
    keyboard: { on: kbVisible, compact: phone || (typeof window !== 'undefined' && window.innerWidth < 700), getConfig: getSideConfig },
  }), [bangla, map, vf, oldReph, fixChandra, toggleKey, layoutId, kbVisible, phone, getSideConfig]);
  const toggleBangla = useCallback(() => setBangla((b) => !b), []);

  // every setting on this device goes into the backup (store), and comes back on restore
  const prefs = () => ({ layout: layoutId, bangla, vf, oldReph, kb: kbVisible, format, voice, autoBijoy, ansiFont, enFont, store: allPrefs() });
  // ---------- one backup system, two places: this device (a file) and Google Drive (decisions.md 74) ----------
  // when each was last done, on this device only (never in a backup file)
  const [lastBackup, setLastBackup0] = useState<BackupLast>(() => load('device.backupLast', {}));
  const markBackup = (where: keyof BackupLast) => setLastBackup0((b) => { const n = { ...b, [where]: Date.now() }; save('device.backupLast', n); return n; });
  // remind after so many hours without any backup (0 = never); Drive backs up by itself while connected
  const [backupRemind, setBackupRemind0] = useState<number>(() => load('device.backupRemind', 24));
  const setBackupRemind = (h: number) => { setBackupRemind0(h); save('device.backupRemind', h); };
  const [autoDrive, setAutoDrive0] = useState<boolean>(() => load('device.autoDrive', true));
  const setAutoDrive = (v: boolean) => { setAutoDrive0(v); save('device.autoDrive', v); };

  const backup = async (withKey = false, withFonts = false) => {
    try {
      const f = await exportAll(prefs(), new Date(), withKey && geminiKey ? geminiKey : undefined, withFonts);
      const ok = await saveFile(backupFileName(), new Blob([JSON.stringify(f)], { type: 'application/json' }));
      if (ok) { markBackup('device'); say(f.fonts?.length ? '{n}টা ড্রাফট, শব্দভান্ডার আর {f}টা ফন্টের ব্যাকআপ তৈরি হয়েছে' : '{n}টা ড্রাফট আর শব্দভান্ডারের ব্যাকআপ তৈরি হয়েছে', { n: f.docs.length, f: f.fonts?.length ?? 0 }); }
    } catch {
      say('ব্যাকআপ তৈরি করা যায়নি');
    }
  };
  /** The way out when Drive cannot take the backup: the same backup, saved on this device. */
  const toDevice: ToastAction = { id: 'to-device', label: 'ডিভাইসে নামান', run: () => void backup() };
  // ---------- Google Drive backups (the Gemini key never goes to Drive) ----------
  const [driveTick, setDriveTick] = useState(0);
  const [driveList, setDriveList] = useState<DriveBackup[] | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveKeep, setDriveKeep0] = useState<number>(() => load('drive.keep', KEEP_DEFAULT));
  const setDriveKeep = (n: number) => { setDriveKeep0(n); save('drive.keep', n); };
  // this device's name on its Drive backups (kept out of backup files, see prefs.ts)
  const [deviceName, setDeviceName0] = useState<string>(() => load('device.name', ''));
  const setDeviceName = (s: string) => { setDeviceName0(s); save('device.name', s); };
  const thisDevice = fitDevice(deviceName) || autoDeviceName(); // the same text that goes to Drive, so "this device" matches
  const driveConnected = driveTick >= 0 && Boolean(currentToken());
  /** A Drive job failed. When it was a backup, the way out is offered right there: save it on this device. */
  const driveFail = (e: unknown, wasBackup = false) => {
    const c = e instanceof DriveError ? e.code : 'other';
    const reconnect: ToastAction = { id: 'reconnect', label: 'আবার যুক্ত করুন', run: () => void driveConnect(wasBackup ? 'backup' : 'list') };
    if (c === 'auth') setDriveTick((n) => n + 1);
    if (!wasBackup) {
      if (c === 'auth') return say('Google-এর অনুমতির মেয়াদ শেষ; আবার যুক্ত করুন', undefined, [reconnect]);
      return say(c === 'network' ? 'ইন্টারনেট নেই, Google Drive-এ যাওয়া গেল না' : c === 'quota' ? 'Google Drive এখন নিচ্ছে না (জায়গা বা সীমা); পরে চেষ্টা করুন' : 'Google Drive-এ কাজটা হলো না');
    }
    if (c === 'auth') return say('Google-এর অনুমতির মেয়াদ শেষ; ব্যাকআপ Drive-এ যায়নি', undefined, [reconnect, toDevice]);
    say(c === 'network' ? 'ইন্টারনেট নেই, ব্যাকআপ Drive-এ যায়নি' : c === 'quota' ? 'Google Drive এখন নিচ্ছে না (জায়গা বা সীমা); ব্যাকআপ যায়নি' : 'Google Drive-এ ব্যাকআপ হলো না', undefined, [toDevice]);
  };


  const driveRefresh = async () => {
    const tk = currentToken();
    if (!tk) return setDriveTick((n) => n + 1);
    setDriveBusy(true);
    try { setDriveList(await listBackups(tk)); } catch (e) { driveFail(e); } finally { setDriveBusy(false); }
  };
  const driveConnect = async (after?: AfterSignIn) => {
    await flushAll(); // the page leaves for Google's sign-in and comes back
    signIn(after);
  };
  /** quiet: the automatic backup — no message on success, none on failure (the reminder covers a long gap). */
  const driveBackup = async (quiet = false) => {
    if (!navigator.onLine) return quiet ? undefined : say('ইন্টারনেট নেই, ব্যাকআপ Drive-এ যাবে না', undefined, [toDevice]);
    const tk = currentToken();
    if (!tk) return quiet ? undefined : driveConnect('backup');
    setDriveBusy(true);
    try {
      await flushAll();
      const f = await exportAll(prefs(), new Date());
      await uploadBackup(tk, driveBackupName(), JSON.stringify(f), undefined, thisDevice);
      // only after the new one is safely in Drive: the oldest beyond the chosen number go to the Trash
      const gone = await pruneBackups(tk, driveKeep).catch(() => 0);
      markBackup('drive');
      if (!quiet) say(gone ? '{n}টা ড্রাফট Google Drive-এ রাখা হলো; পুরোনো {m}টা ব্যাকআপ Trash-এ গেল' : '{n}টা ড্রাফট Google Drive-এ রাখা হলো', { n: f.docs.length, m: gone });
      setDriveList(await listBackups(tk));
    } catch (e) { if (!quiet) driveFail(e, true); } finally { setDriveBusy(false); }
  };
  /** A Drive backup saved as a file on this device (to keep, or to restore from the file later). */
  const driveDownload = async (b: DriveBackup) => {
    const tk = currentToken();
    if (!tk) return driveConnect('list');
    try {
      const json = await downloadBackup(tk, b.id);
      if (await saveFile(b.name, new Blob([json], { type: 'application/json' }))) say('ব্যাকআপ ফাইলটা ডিভাইসে নামানো হলো');
    } catch (e) { driveFail(e); }
  };
  // while connected to Drive: a quiet backup when the drafts changed since the last one — when ProNotes
  // goes to the background, and every 15 minutes
  const latestChange = docs.reduce((m, d) => Math.max(m, d.updatedAt), 0);
  const autoRef = useRef({ run: () => {} });
  autoRef.current.run = () => {
    if (!autoDrive || !driveEnabled() || !currentToken() || driveBusy || !navigator.onLine) return;
    if (latestChange > (lastBackup.drive ?? 0)) void driveBackup(true);
  };
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') autoRef.current.run(); };
    document.addEventListener('visibilitychange', onHide);
    const t = window.setInterval(() => autoRef.current.run(), 15 * 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', onHide); clearInterval(t); };
  }, []);
  // no backup for too long: say so when ProNotes opens or comes back, with the ways to do it now
  const remindRef = useRef({ run: (_tries?: number) => {} });
  remindRef.current.run = (tries = 0) => {
    if (!backupRemind || !docs.length) return;
    // another message is up (e.g. "works offline now"): ask a little later instead
    if (toastNow.current) { if (tries < 6) window.setTimeout(() => remindRef.current.run(tries + 1), 5000); return; }
    // a new install is not asked at once: the clock starts on the first day ProNotes is used here
    let first = load('device.firstSeen', 0);
    if (!first) save('device.firstSeen', (first = Date.now()));
    const last = Math.max(lastBackup.drive ?? 0, lastBackup.device ?? 0, first);
    const now = Date.now();
    if (now - last < backupRemind * 3600_000 || now < load('device.backupSnooze', 0)) return;
    const acts: ToastAction[] = [
      ...(driveEnabled() && navigator.onLine ? [{ id: 'remind-drive', label: 'Drive-এ নিন', run: () => void driveBackup() }] : []),
      { id: 'remind-device', label: 'ডিভাইসে নিন', run: () => void backup() },
      { id: 'remind-later', label: 'পরে', run: () => save('device.backupSnooze', Date.now() + 12 * 3600_000) },
    ];
    if (!lastBackup.drive && !lastBackup.device) say('এখনো কোনো ব্যাকআপ নেওয়া হয়নি', undefined, acts);
    else say('শেষ ব্যাকআপ {ago}', { ago: tr(agoKey(last, now), { n: agoN(last, now) }) }, acts);
  };
  useEffect(() => {
    const t = window.setTimeout(() => remindRef.current.run(), 3000);
    const onShow = () => { if (document.visibilityState === 'visible') remindRef.current.run(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onShow); };
  }, [docs.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const driveRestore = async (b: DriveBackup) => {
    const tk = currentToken();
    if (!tk) return driveConnect('list');
    setDriveBusy(true);
    try { await restore(new File([await downloadBackup(tk, b.id)], b.name, { type: 'application/json' })); } catch (e) { driveFail(e); } finally { setDriveBusy(false); }
  };
  const driveDelete = async (b: DriveBackup) => {
    const tk = currentToken();
    if (!tk) return driveConnect('list');
    setDriveBusy(true);
    try {
      await trashBackup(tk, b.id);
      setDriveList((l) => l?.filter((x) => x.id !== b.id) ?? null);
      say('ব্যাকআপটা Drive-এর Trash-এ গেল (৩০ দিন ফেরত আনা যায়)');
    } catch (e) { driveFail(e); } finally { setDriveBusy(false); }
  };
  const driveDisconnect = async () => {
    await signOut();
    setDriveList(null);
    setDriveTick((n) => n + 1);
    say('Google Drive থেকে বিচ্ছিন্ন হলো');
  };
  // back from Google's sign-in: keep the token for this session, then finish what was asked
  useEffect(() => {
    const back = takeRedirect();
    if (!back) return;
    save('settings.tab', 'app');
    save('device.fold.backup', true); // back from Google: show the Drive part
    setSettingsOpen(true);
    if (!back.ok) { setTimeout(() => say(back.error === 'access_denied' ? 'Google-এ অনুমতি দেওয়া হয়নি' : 'Google-এ যুক্ত হওয়া গেল না'), 300); return; }
    setDriveTick((n) => n + 1);
    setTimeout(() => { if (back.after === 'backup') void driveBackup(); else void driveRefresh(); }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const syncFontsRef = useRef<() => Promise<void>>(async () => {});
  const restore = async (file: File) => {
    try {
      const f = parseBackup(await file.text());
      await flushAll(); // the open draft is saved first, so "which is newer" is decided on what is really there
      const r = await restoreAll(f);
      if (f.aiKey && !geminiKey) setGeminiKey(f.aiKey);
      bank.current = (await loadBank()) ?? bank.current;
      setBankVersion((v) => v + 1);
      setCustomLayouts(await loadLayouts());
      setCorrectionsState(await loadCorrections());
      await refresh();
      // the open draft was updated from the backup: show the updated text
      if (current && r.updatedIds.includes(current.id)) await open(current.id);
      // the same draft is updated, never copied (decisions.md 78); the other state is in its history
      const msg = tr('ফেরত এসেছে: নতুন {a}টা, হালনাগাদ {up}টা, আগে থেকেই ছিল {u}টা', { a: r.added, up: r.updated, u: r.unchanged })
        + (r.kept ? ' · ' + tr('এখানে নতুনতর {k}টা যেমন ছিল রইল', { k: r.kept }) : '')
        + (r.updated + r.kept ? ' · ' + tr('অন্যটা ড্রাফটের ভার্সন-ইতিহাসে আছে') : '')
        + (r.fonts ? ' · ' + tr('ফন্ট {f}টা', { f: r.fonts }) : '');
      // fonts from the backup: in use at once, and into Drive when it is on
      if (r.fonts) { await loadStoredFonts(); void syncFontsRef.current(); }
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
    let got: NewLayout[];
    try {
      got = await readLayoutFile(file);
    } catch (e) {
      return say(e instanceof Error && e.message ? e.message : LAYOUT_MSG.unknown);
    }
    const stamp = Date.now();
    const added: Layout[] = got.map(({ notes: _n, ...l }, i) => ({ ...l, id: 'custom-' + stamp + (i ? '-' + i : '') }));
    const next = [...customLayouts, ...added];
    // Update the UI immediately; IndexedDB persistence must not block the
    // active selection (especially on mobile and in browser automation).
    setCustomLayouts(next);
    setLayoutId(added[0].id);
    await saveLayouts(next);
    let msg = tr('{name} লেআউট যোগ হলো', { name: added.map((l) => l.name).join(', ') });
    if (added.some((l) => l.kmx?.enc === 'ansi')) msg += ' ' + tr('এই কিবোর্ড বিজয় (ANSI)-তে লেখে: ইউনিকোড ডকুমেন্টে লিখলে ইউনিকোডে বদলে বসবে।');
    const notes = [...new Set(got.flatMap((l) => l.notes))];
    if (notes.length) msg += ' ' + tr('যা চলবে না: {list}', { list: notes.map((n) => tr(n)).join('; ') });
    say(msg);
  };
  const deleteLayout = async (id: string) => {
    const next = customLayouts.filter((l) => l.id !== id);
    await saveLayouts(next);
    setCustomLayouts(next);
    if (layoutId === id) setLayoutId(PRONOTES_LAYOUT_ID);
    say('লেআউট মুছে ফেলা হয়েছে');
  };

  // ---------- fonts ----------
  // each stored font's fingerprint, so the same file is never kept twice (decisions.md 85)
  const fontHashes = useRef(new Map<string, string>());
  const forgetFont = async (id: string) => {
    try { await removeFont(id); } catch { /* already gone */ }
    unregisterFont(id);
    fontHashes.current.delete(id);
    // its Drive copy goes at the next sync
    save('device.fontsGone', [...new Set([...load<string[]>('device.fontsGone', []), id])]);
  };
  const loadStoredFonts = async () => {
    const list: FontInfo[] = [];
    let stored = await listFonts();
    for (const f of stored) if (!fontHashes.current.has(f.id)) { try { fontHashes.current.set(f.id, await fontHash(f.data)); } catch { /* no crypto: left alone */ } }
    // copies of one file that came in before this check: the keeper stays, the rest go
    const dups = duplicateFonts(stored.map((f) => f.id), fontHashes.current);
    if (dups.length) {
      const drop = new Set(dups.flatMap((d) => d.drop));
      for (const id of drop) await forgetFont(id);
      stored = stored.filter((f) => !drop.has(f.id));
    }
    for (const f of stored) {
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
  const addFont = async (file: File, role: 'uni' | 'ansi' | 'en') => {
    if (file.size > MAX_FONT_BYTES * 4) return say('ফন্ট ফাইলটা অনেক বড় (১৫ MB-এর বেশি)');
    // any font file: a collection (.ttc) is split, an .eot unwrapped; .fon/Type 1 get a clear no (decisions.md 80)
    const prep = prepareFontFile(await file.arrayBuffer(), file.name);
    if (!prep.ok) return say(prep.reason);
    for (const part of prep.files) await addFontData(part.data, part.fileName, role);
  };
  const addFontData = async (data: ArrayBuffer, fileName: string, role: 'uni' | 'ansi' | 'en') => {
    if (data.byteLength > MAX_FONT_BYTES) return say('ফন্ট ফাইলটা অনেক বড় (১৫ MB-এর বেশি)');
    let hash = '';
    try { hash = await fontHash(data); } catch { /* no crypto: no check */ }
    const same = hash ? [...fontHashes.current].find(([, h]) => h === hash)?.[0] : undefined;
    if (same) return say('{name} আগে থেকেই আছে', { name: fonts.find((f) => f.id === same)?.family ?? familyFor(data, fileName) });
    const rec = { id: 'font-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), family: familyFor(data, fileName), fileName, role, data, addedAt: Date.now() };
    try {
      await registerFont(rec);
    } catch {
      return say('এই ফাইলটা ফন্ট হিসেবে খোলা গেল না');
    }
    let stored = true;
    try {
      await putFont(rec);
      if (hash) fontHashes.current.set(rec.id, hash);
    } catch {
      stored = false;
      say('ফন্ট এবার কাজ করবে, কিন্তু ডিভাইসে সেভ করা গেল না');
    }
    // into the user's Drive as well, so their other devices get it (only when Drive is on here)
    const tk = currentToken();
    if (stored && tk && driveEnabled()) void uploadDriveFont(tk, rec).catch(() => undefined);
    const st = readFontStyle(data, fileName);
    setFonts((l) => [...l, { id: rec.id, family: rec.family, fileName: rec.fileName, role, italic: st.style === 'italic', weight: st.weight }]);
    if (role === 'ansi') setAnsiFont(rec.family);
    else if (role === 'en') setFormat((f) => ({ ...f, fontEn: rec.family }));
    else setFormat((f) => ({ ...f, font: rec.family }));
    say('{name} যোগ হয়েছে', { name: rec.family });
  };
  const deleteFont = async (id: string) => {
    // gone from Drive too, now or at the next sync (until then it is not brought back)
    await forgetFont(id);
    setFonts((l) => l.filter((f) => f.id !== id));
    say('ফন্ট মুছে ফেলা হয়েছে');
    void syncFonts();
  };

  // ---------- own fonts in the user's Google Drive (decisions.md 80) ----------
  const fontSyncBusy = useRef(false);
  const syncFonts = async () => {
    const tk = currentToken();
    if (!tk || !driveEnabled() || fontSyncBusy.current || !navigator.onLine) return;
    fontSyncBusy.current = true;
    try {
      const local = await listFonts();
      const gone = load<string[]>('device.fontsGone', []);
      const plan = planFontSync(local, await listDriveFonts(tk), gone);
      for (const r of plan.trash) await trashBackup(tk, r.id);
      if (plan.trash.length || gone.length) save('device.fontsGone', []);
      for (const id of plan.up) {
        const f = local.find((l) => l.id === id);
        if (f) await uploadDriveFont(tk, { id: f.id, role: f.role, fileName: f.fileName, data: f.data });
      }
      let got = 0;
      let merged = false;
      for (const r of plan.down) {
        const data = await downloadDriveFont(tk, r.id);
        const id = r.appProperties!.pnFont!;
        // the same file already here under another id (added on two devices): every device keeps the smaller id
        let hash = '';
        try { hash = await fontHash(data); } catch { /* no crypto: no check */ }
        const twin = hash ? [...fontHashes.current].find(([, h]) => h === hash)?.[0] : undefined;
        if (twin && keeperOf(twin, id) === twin) { await trashBackup(tk, r.id); continue; }
        const role = (['uni', 'ansi', 'en'].includes(r.appProperties?.role ?? '') ? r.appProperties!.role : 'uni') as 'uni' | 'ansi' | 'en';
        const rec = { id, family: familyFor(data, r.name), fileName: r.name, role, data, addedAt: Date.now() };
        try {
          await registerFont(rec); await putFont(rec);
          if (hash) fontHashes.current.set(id, hash);
          if (twin) { await forgetFont(twin); merged = true; } else got++;
        } catch { /* not a usable font: leave it in Drive */ }
      }
      if (got || merged) await loadStoredFonts();
      if (got) say('Google Drive থেকে {n}টা ফন্ট এল', { n: got });
    } catch {
      /* Drive away or the sign-in ran out: tried again the next time Drive is on */
    } finally {
      fontSyncBusy.current = false;
    }
  };
  syncFontsRef.current = syncFonts;
  // whenever Drive comes on (sign-in, a new session with a token) and once the fonts here are loaded
  useEffect(() => { if (driveConnected) void syncFonts(); }, [driveConnected]); // eslint-disable-line react-hooks/exhaustive-deps

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
    () => [...new Set([format.font, ...LOCAL_UNI, ...WEB_FONTS, ...fonts.filter((f) => f.role === 'uni').map((f) => f.family)])],
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
    // English fonts in their own list (decisions.md 79): the built-in names, the English draft font, the ones added
    const enNames = [...new Set([format.fontEn, ...ENGLISH_FONTS, ...fonts.filter((f) => f.role === 'en').map((f) => f.family)])];
    return { uni: fontChoices.map((n) => item(n, false)), ansi: ansiNames.map((n) => item(n, true)), en: enNames.map((n) => item(n, false)) };
  }, [fontChoices, fonts, ansiFont, format.fontEn]);
  const themeNext: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };
  const themeLabel: Record<Theme, string> = { auto: 'রং: ডিভাইস অনুযায়ী', light: 'রং: আলো', dark: 'রং: অন্ধকার' };

  const showSide = sideOpen;
  const layoutSelect = (
    <select className="layout" aria-label={t('কিবোর্ড লেআউট')} title={t('কিবোর্ড লেআউট')} data-testid="layout" value={layoutId} onChange={(e) => setLayoutId(e.target.value)}>
      <optgroup label={t('সাথে দেওয়া')}>{enabledKeyboardLayouts.filter((l) => !customLayouts.some((c) => c.id === l.id)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
      {/* layouts the user imported stay in their own group, as before a22c74e */}
      {enabledKeyboardLayouts.some((l) => customLayouts.some((c) => c.id === l.id)) && (
        <optgroup label={t('আপনার যোগ করা')}>{enabledKeyboardLayouts.filter((l) => customLayouts.some((c) => c.id === l.id)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
      )}
      {/* Compatibility target for older saved/test selections; hidden from normal users. */}
      <option value="bornona" hidden aria-hidden="true">Bornona</option>
    </select>
  );
  const sidebar = (
    <Sidebar top={
      <>
        <div className="side-brand">
          <picture>
            <source media="(prefers-color-scheme: dark)" srcSet="./branding/brand-dark.svg" />
            <img className="brand-logo" src={theme === 'dark' ? './branding/brand-dark.svg' : './branding/brand-light.svg'} alt="ProNotes" />
          </picture>
        </div>
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
    <div className={'app' + (!lawDictionaryOpen && !craftOpen && showSide && wide ? ' with-side' : '')}>
      <header className="top" hidden={appFullscreen || topMin}>
        <div className="brand" id="title-slot">
          {!current && <picture className="brand-picture">
            <source media="(prefers-color-scheme: dark)" srcSet="./branding/brand-dark.svg" />
            <img className="brand-logo" src={theme === 'dark' ? './branding/brand-dark.svg' : './branding/brand-light.svg'} alt="ProNotes" />
          </picture>}
        </div>
        {/* quiet: a small ✓ when saved; words only while saving fails */}
        <span className={'status ' + saveState} data-testid="save-status" role="status" title={statusText}>{statusText}</span>
        {!phone && layoutSelect}
        <button type="button" className="tb lang" data-testid="lang-toggle" data-lang={bangla ? 'bn' : 'en'}
          title={t(bangla ? 'টাইপ: বাংলা — চাপলে English' : 'টাইপ: English — চাপলে বাংলা')}
          aria-label={t(bangla ? 'টাইপ: বাংলা — চাপলে English' : 'টাইপ: English — চাপলে বাংলা')}
          onPointerDown={(e) => e.preventDefault()} onClick={() => setBangla((b) => !b)}>{uiLang === 'en' ? (bangla ? 'BN' : 'EN') : bangla ? 'বা' : 'e'}</button>
        <button type="button" className={'tb' + (lawDictionaryOpen ? ' on' : '')} title="ProNotes Law Dictionary" aria-label="ProNotes Law Dictionary" data-testid="law-dictionary-toggle" onClick={() => { setCraftOpen(false); setLawDictionaryOpen((v) => !v); }}>⚖</button>
        <button type="button" className={'tb' + (craftOpen ? ' on' : '')} title={t('অ্যাপস: Word, PDF, Sheet, Slides')} aria-label={t('অ্যাপস: Word, PDF, Sheet, Slides')} data-testid="craft-toggle" onClick={() => { setLawDictionaryOpen(false); setCraftOpen((v) => !v); }}>▦</button>
        <button type="button" className="tb theme" data-testid="theme" data-theme-mode={theme} title={t(themeLabel[theme])} aria-label={t(themeLabel[theme])}
          onClick={() => setTheme(themeNext[theme])}>{THEME_ICON[theme]}</button>
        <button type="button" className={'tb' + (settingsOpen ? ' on' : '')} title={t('সেটিংস')} aria-label={t('সেটিংস')} data-testid="settings"
          onClick={() => setSettingsOpen((v) => !v)}>⚙</button>
        <button type="button" className="tb top-fold" title={t('উপরের বার গুটিয়ে রাখুন')} aria-label={t('উপরের বার গুটিয়ে রাখুন')} data-testid="top-collapse"
          onPointerDown={(e) => e.preventDefault()} onClick={() => setTopMin(true)}>⌃</button>
      </header>
      {/* the top bar folded away (decisions.md 82): a thin strip with ⌄ brings it back */}
      {topMin && !appFullscreen && (
        <div className="top-mini" data-testid="top-mini">
          <span className={'status ' + saveState} role="status" title={statusText} />
          <button type="button" className="top-unfold" title={t('উপরের বার দেখান')} aria-label={t('উপরের বার দেখান')} data-testid="top-expand"
            onPointerDown={(e) => e.preventDefault()} onClick={() => setTopMin(false)}>⌄</button>
        </div>
      )}

      <div className="body">
        {!lawDictionaryOpen && !craftOpen && showSide && (wide ? sidebar : <div className="drawer" onClick={(e) => e.target === e.currentTarget && setSideOpen(false)}>{sidebar}</div>)}
        <div className="work">
          {craftMounted && <CraftWorkspace visible={craftOpen} initialApp={craftStart} handoff={craftHandoff} onShowDrafts={() => setCraftOpen(false)} onViewChange={setCraftView} say={say} typing={appTyping} />}
          {craftOpen ? null : lawDictionaryOpen ? <LawDictionary onClose={() => setLawDictionaryOpen(false)} /> : current && kindOf(current) === 'chart' ? (
            <ChartWorkspace key={current.id + ':' + reloadKey} doc={current} cfg={getSideConfig} toggle={toggleBangla} say={say} onRename={renameAny}
              toolbarExtra={<button type="button" className={'tb' + (showSide ? ' on' : '')} title={t('ডকুমেন্টের তালিকা')} aria-label={t('ডকুমেন্টের তালিকা')}
                data-testid="side-toggle" onPointerDown={(e) => e.preventDefault()} onClick={() => setSideOpen((v) => !v)}>☰</button>} />
          ) : current && (
            <Workspace key={current.id + ':' + reloadKey} doc={current} map={map} phonetic={layoutId === 'pronotes-phonetic'} hasantaRules={layoutId === PRONOTES_LAYOUT_ID} rules={layout.kmx} bangla={bangla} vowelForming={vf} oldReph={oldReph}
              kbVisible={kbVisible} coarse={coarse} phone={phone} voiceEngine={voiceEngine === 'auto' ? (geminiKey ? 'ai' : 'device') : voiceEngine} voiceModes={voiceModes} bank={bank.current} bankVersion={bankVersion} onBankChanged={onBankChanged}
              onToggleLanguage={() => setBangla((b) => !b)} onSave={onSave}
              onRename={renameAny}
              onSaveState={setSaveState} format={format} say={say} fonts={fontChoices} fontLists={fontLists}
              page={normalizePage(current.page, pageDefault)} onPage={changePage}
              onMakeDefaultPage={(pg) => { setPageDefault(pg); say('নতুন লিগ্যাল ড্রাফট এখন থেকে এই পাতায় খুলবে'); }}
              view={viewPrefs} setView={setViewPrefs} fixChandra={fixChandra} toggleKey={toggleKey}
              gemini={{ key: geminiKey, model: geminiModel, setModel: (m: string) => { setGeminiModel(m); say('Gemini মডেল বদলে {m} বাছা হলো', { m }); } }} privateWords={privateWords} setPrivateWords={setPrivateWords}
              onOpenSettings={() => { save('settings.tab', 'voice'); setSettingsOpen(true); }} // the Gemini key lives under Voice and AI
              ansiTyping={ansiTyping} ansiKey={ansiKey} onToggleAnsi={() => setAnsiTyping(!ansiTypingRef.current)}
              output={output} setOutput={setOutput}
              voice={voice} corrections={corrections} autoBijoy={autoBijoy} ansiFont={ansiFont} enFont={enFont}
              onEditor={(e) => { editorRef.current = e; }}
              onLawDictionary={() => setLawDictionaryOpen(true)}
              onOpenWordCraft={(name, bytes) => { setLawDictionaryOpen(false); setCraftHandoff({ app: 'wordcraft', file: { name, bytes }, n: Date.now() }); setCraftMounted(true); setCraftOpen(true); }}
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
        <Settings drive={{ enabled: driveEnabled(), connected: driveConnected, busy: driveBusy, list: driveList, onConnect: () => void driveConnect('list'), onBackup: () => void driveBackup(), onDownload: (b) => void driveDownload(b), onRefresh: () => void driveRefresh(), onRestore: (b) => void driveRestore(b), onDelete: (b) => void driveDelete(b), keep: driveKeep, setKeep: setDriveKeep, deviceName, setDeviceName, autoDevice: autoDeviceName(), thisDevice, onDisconnect: () => void driveDisconnect(), auto: autoDrive, setAuto: setAutoDrive }}
          backupInfo={{ last: lastBackup, remind: backupRemind, setRemind: setBackupRemind }}
          onClose={() => setSettingsOpen(false)} platform={coarse || phone ? 'mobile' : 'desktop'} vf={vf} setVf={setVf} oldReph={oldReph} setOldReph={setOldReph}
          keyboardLayouts={allKeyboardLayouts} hiddenDesktop={hiddenDesktop} setHiddenDesktop={setHiddenDesktop}
          hiddenMobile={hiddenMobile} setHiddenMobile={setHiddenMobile}
          customLayouts={customLayouts} onAddLayout={addLayout} onDeleteLayout={deleteLayout}
          voice={voice} setVoice={setVoice} voiceEngine={voiceEngine} setVoiceEngine={setVoiceEngine} voiceModes={voiceModes} setVoiceModes={setVoiceModes} voiceNote={voiceNote} corrections={corrections} setCorrections={setCorrections}
          format={format} setFormat={setFormat} fonts={fonts} onAddFont={addFont} onDeleteFont={deleteFont}
          ansiFont={ansiFont} setAnsiFont={setAnsiFont} enFont={enFont} setEnFont={setEnFont}
          autoBijoy={autoBijoy} setAutoBijoy={setAutoBijoy}
          dict={{ on: dictOn, setOn: setDictOn, count: dictCount }}
          wordCount={Object.keys(bank.current.w).length + 0 * bankVersion}
          onLearnDoc={learnDoc} onExportWords={exportWords} onImportWords={importWords} onResetWords={resetWords}
          onBackup={backup} onRestore={restore} uiLang={uiLang} setUiLang={setUiLangState} appFonts={appFonts} setAppFonts={setAppFonts}
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

      {toast && (
        <div className={'toast' + (toastActs.length ? ' acts' : '')} role="status" data-testid="toast">
          <span>{toast}</span>
          {toastActs.map((a) => (
            <button key={a.id} type="button" className="btn small" data-testid={'toast-' + a.id} onClick={() => { closeToast(); a.run(); }}>{tr(a.label)}</button>
          ))}
          {toastActs.length > 0 && <button type="button" className="toast-x" aria-label={tr('বন্ধ')} data-testid="toast-close" onClick={closeToast}>✕</button>}
        </div>
      )}
    </div>
    </I18nContext.Provider>
  );
}
