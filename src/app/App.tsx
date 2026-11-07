import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { BUILTIN_LAYOUTS, findLayout, fixNukta, parseAvroLayout, type Layout } from '../bornona-engine';
import { emptyBank, learnText, mergeBankFile, pruneBank, type WordBank, type WordBankFile } from '../suggest';
import {
  listDocs, getDoc, createDoc, saveContent, renameDoc, duplicateDoc, trashDoc, restoreDoc, deleteForever, purgeExpired,
  loadBank, saveBank, requestPersistence, exportAll, restoreAll, parseBackup, backupFileName, mergeCorrections,
  listFonts, putFont, removeFont, loadLayouts, saveLayouts, loadCorrections, saveCorrections, setDocKind, setDocPage, kindOf, type Doc, type DocKind,
} from '../storage';
import { MAX_FONT_BYTES, familyFor, registerFont, unregisterFont } from '../fonts';
import { decideVoice, detectVoiceEnv } from '../voice';
import { Settings, type FontInfo } from './Settings';
import type { OutputMode } from './ShareMenu';
import { DEFAULT_VOICE_PREFS, DEFAULT_VIEW, DEFAULT_GRID, voiceLang, type VoicePrefs, type ViewPrefs } from './prefs-types';
import { DEFAULT_PAGE, normalizePage, type PageSetup } from '../docx-export/page';
import type { ToggleKey } from '../bornona-engine';
import { saveFile } from '../storage/download';
import { DEFAULT_FORMAT, type DocFormat } from '../docx-export/format';
import { Sidebar } from './Sidebar';
import { Workspace, type SaveState } from './Workspace';
import { load, save } from './prefs';
import { I18nContext, setUiLangGlobal, translate, tr, type UiLang } from '../i18n';
import { Popover } from './ui';
import { LOCAL_UNI, WEB_FONTS, ENGLISH_FONTS } from '../fonts';
import './fonts.css';
import './app.css';
import { flushAll } from './flush';
import { applyUpdate, canPromptInstall, checkForUpdate, isAppleDevice, isStandalone, onInstallChange, promptInstall, pwaSupported, startPwa } from './pwa';

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const wideQuery = typeof matchMedia === 'function' ? matchMedia('(min-width: 1000px)') : null;

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
  const [layoutId, setLayoutId] = useState(() => load('layout', 'bornona'));
  const [bangla, setBangla] = useState(() => load('bangla', true));
  const [vf, setVf] = useState(() => load('vf', true));
  const [oldReph, setOldReph] = useState(() => load('oldReph', false));
  const [kbVisible, setKbVisible] = useState(() => load('kb', coarse));
  const [sideOpen, setSideOpen] = useState(() => load('side', true));
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
  const [ansiFont, setAnsiFont] = useState(() => load('ansiFont', 'SutonnyMJ'));
  const [enFont, setEnFont] = useState(() => load('enFont', 'Times New Roman'));
  const [corrections, setCorrectionsState] = useState('');
  const [customLayouts, setCustomLayouts] = useState<Layout[]>([]);
  const [fonts, setFonts] = useState<FontInfo[]>([]);
  const editorRef = useRef<Editor | null>(null);
  const [wide, setWide] = useState(() => wideQuery?.matches ?? true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(() => load('offlineReady', false));
  const [canInstall, setCanInstall] = useState(canPromptInstall);
  useEffect(() => onInstallChange(() => setCanInstall(canPromptInstall())), []);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [trash, setTrash] = useState<Doc[]>([]);
  const [current, setCurrent] = useState<Doc | null>(null);
  const [view, setView] = useState<'docs' | 'trash'>('docs');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [toast, setToast] = useState('');
  const [fatal, setFatal] = useState(false);
  const [bankVersion, setBankVersion] = useState(0);
  const bank = useRef<WordBank>(emptyBank());
  const layout = useMemo(() => findLayout(layoutId, customLayouts), [layoutId, customLayouts]);
  const map = layout.map;

  useEffect(() => save('layout', layoutId), [layoutId]);
  useEffect(() => save('bangla', bangla), [bangla]);
  useEffect(() => save('vf', vf), [vf]);
  useEffect(() => save('oldReph', oldReph), [oldReph]);
  useEffect(() => save('kb', kbVisible), [kbVisible]);
  useEffect(() => save('side', sideOpen), [sideOpen]);
  useEffect(() => save('format', format), [format]);
  useEffect(() => save('voice', voice), [voice]);
  useEffect(() => save('autoBijoy', autoBijoy), [autoBijoy]);
  useEffect(() => save('ansiFont', ansiFont), [ansiFont]);
  useEffect(() => save('enFont', enFont), [enFont]);
  useEffect(() => {
    const on = () => setWide(wideQuery?.matches ?? true);
    wideQuery?.addEventListener('change', on);
    return () => wideQuery?.removeEventListener('change', on);
  }, []);

  const toastTimer = useRef<number>(undefined);
  const toastNow = useRef('');
  /** Show a message. `m` is the Bangla text (translated here for the English interface). */
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
  const sayIfIdle = useCallback((m: string) => {
    if (!toastNow.current) say(m);
  }, [say]);

  const refresh = useCallback(async () => {
    setDocs(await listDocs());
    setTrash(await listDocs({ trash: true }));
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
      setCorrectionsState(await loadCorrections());
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
    await refresh();
    await open(d.id);
    setView('docs');
  };
  const toTrash = async (id: string) => {
    await trashDoc(id);
    await refresh();
    if (current?.id === id) {
      const rest = await listDocs();
      if (rest.length) await open(rest[0].id);
      else await newDoc();
    }
    say('ট্র্যাশে পাঠানো হয়েছে, ৩০ দিনের মধ্যে ফেরত আনা যাবে');
  };

  const prefs = () => ({ layout: layoutId, bangla, vf, oldReph, kb: kbVisible, format, voice, autoBijoy, ansiFont, enFont });
  const backup = async () => {
    try {
      const f = await exportAll(prefs());
      const ok = await saveFile(backupFileName(), new Blob([JSON.stringify(f)], { type: 'application/json' }));
      if (ok) say('{n}টা ড্রাফট আর শব্দভান্ডারের ব্যাকআপ তৈরি হয়েছে', { n: f.docs.length });
    } catch {
      say('ব্যাকআপ তৈরি করা যায়নি');
    }
  };
  const restore = async (file: File) => {
    try {
      const r = await restoreAll(parseBackup(await file.text()));
      bank.current = (await loadBank()) ?? bank.current;
      setBankVersion((v) => v + 1);
      setCustomLayouts(await loadLayouts());
      setCorrectionsState(await loadCorrections());
      await refresh();
      say('ফেরত এসেছে: নতুন {a}টা, আলাদা কপি {c}টা, আগে থেকেই ছিল {u}টা', { a: r.added, c: r.copies, u: r.unchanged });
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
    if (layoutId === id) setLayoutId('bornona');
    say('লেআউট মুছে ফেলা হয়েছে');
  };

  // ---------- fonts ----------
  const loadStoredFonts = async () => {
    const list: FontInfo[] = [];
    for (const f of await listFonts()) {
      try {
        await registerFont(f);
        list.push({ id: f.id, family: f.family, fileName: f.fileName, role: f.role });
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
    setFonts((l) => [...l, { id: rec.id, family: rec.family, fileName: rec.fileName, role }]);
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
    pageWrites.current = pageWrites.current.then(() => setDocPage(id, page)).catch(() => say('পাতার সেটিং সেভ করা যায়নি'));
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
  const themeNext: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };
  const themeLabel: Record<Theme, string> = { auto: 'রং: ডিভাইস অনুযায়ী', light: 'রং: আলো', dark: 'রং: অন্ধকার' };

  const showSide = sideOpen;
  const sidebar = (
    <Sidebar docs={docs} trash={trash} currentId={current?.id ?? null} view={view} setView={setView} kindIcon={KIND_ICON} kindLabel={KIND_LABEL}
      onOpen={open} onNew={newDoc}
      onDuplicate={async (id) => { const d = await duplicateDoc(id); await refresh(); if (d) await open(d.id); say('কপি তৈরি হয়েছে'); }}
      onTrash={toTrash}
      onRestore={async (id) => { await restoreDoc(id); await refresh(); say('ফেরত আনা হয়েছে'); }}
      onDeleteForever={async (id) => { await deleteForever(id); await refresh(); say('স্থায়ীভাবে মুছে ফেলা হয়েছে'); }}
      onClose={wide ? undefined : () => setSideOpen(false)} />
  );
  const statusText = t({ saved: 'এই ডিভাইসে সেভ হয়েছে', saving: 'সেভ হচ্ছে…', error: 'সেভ করা যায়নি' }[saveState]);
  const curKind = current ? kindOf(current) : 'legal';

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
    <div className={'app' + (showSide && wide ? ' with-side' : '')}>
      <header className="top">
        <div className="brand">
          <span className="name">ProNotes</span>
          {current && (
            <Popover label={<>{KIND_ICON[curKind]} {t(KIND_LABEL[curKind])} ▾</>} title={t('ডকুমেন্টের ধরন')} testid="kind" className="kind">
              {(close) => (
                <div className="menu">
                  <p className="note">{t('এই ডকুমেন্টের ধরন বদলান (লেখা যেমন আছে থাকবে):')}</p>
                  {(['note', 'legal'] as DocKind[]).map((k) => (
                    <button key={k} type="button" data-testid={'kind-' + k} aria-pressed={k === curKind} onClick={() => { close(); changeKind(k); }}>{KIND_ICON[k]} {t(KIND_LABEL[k])}</button>
                  ))}
                  <button type="button" disabled>{KIND_ICON.chart} {t(KIND_LABEL.chart)} ({t('শীঘ্রই')})</button>
                </div>
              )}
            </Popover>
          )}
        </div>
        <span className={'status ' + saveState} data-testid="save-status" role="status">{statusText}</span>
        <select className="layout" aria-label={t('কিবোর্ড লেআউট')} title={t('কিবোর্ড লেআউট')} data-testid="layout" value={layoutId} onChange={(e) => setLayoutId(e.target.value)}>
          <optgroup label={t('সাথে দেওয়া')}>{BUILTIN_LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
          {customLayouts.length > 0 && <optgroup label={t('আপনার যোগ করা')}>{customLayouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>}
        </select>
        <div className="seg" role="group" aria-label={t('টাইপিং-এর ভাষা')} title={t('টাইপিং-এর ভাষা (Ctrl+Space)')}>
          <button type="button" aria-pressed={bangla} data-testid="mode-bn" onClick={() => setBangla(true)}>বাংলা</button>
          <button type="button" aria-pressed={!bangla} data-testid="mode-en" onClick={() => setBangla(false)}>English</button>
        </div>
        <button type="button" className="tb theme" data-testid="theme" data-theme-mode={theme} title={t(themeLabel[theme])} aria-label={t(themeLabel[theme])}
          onClick={() => setTheme(themeNext[theme])}>{THEME_ICON[theme]}</button>
        <button type="button" className={'tb' + (settingsOpen ? ' on' : '')} title={t('সেটিংস')} aria-label={t('সেটিংস')} data-testid="settings"
          onClick={() => setSettingsOpen((v) => !v)}>⚙</button>
      </header>

      <div className="body">
        {showSide && (wide ? sidebar : <div className="drawer" onClick={(e) => e.target === e.currentTarget && setSideOpen(false)}>{sidebar}</div>)}
        <div className="work">
          {current && (
            <Workspace key={current.id} doc={current} map={map} bangla={bangla} vowelForming={vf} oldReph={oldReph}
              kbVisible={kbVisible} coarse={coarse} bank={bank.current} bankVersion={bankVersion} onBankChanged={onBankChanged}
              onToggleLanguage={() => setBangla((b) => !b)} onSave={onSave}
              onRename={async (id, t) => { await renameDoc(id, t); await refresh(); }}
              onSaveState={setSaveState} format={format} say={say} fonts={fontChoices}
              page={normalizePage(current.page, pageDefault)} onPage={changePage}
              onMakeDefaultPage={(pg) => { setPageDefault(pg); say('নতুন লিগ্যাল ড্রাফট এখন থেকে এই পাতায় খুলবে'); }}
              view={viewPrefs} setView={setViewPrefs} fixChandra={fixChandra} toggleKey={toggleKey}
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
          customLayouts={customLayouts} onAddLayout={addLayout} onDeleteLayout={deleteLayout}
          voice={voice} setVoice={setVoice} voiceNote={voiceNote} corrections={corrections} setCorrections={setCorrections}
          format={format} setFormat={setFormat} fonts={fonts} onAddFont={addFont} onDeleteFont={deleteFont}
          ansiFont={ansiFont} setAnsiFont={setAnsiFont} enFont={enFont} setEnFont={setEnFont}
          autoBijoy={autoBijoy} setAutoBijoy={setAutoBijoy}
          wordCount={Object.keys(bank.current.w).length + 0 * bankVersion}
          onLearnDoc={learnDoc} onExportWords={exportWords} onImportWords={importWords} onResetWords={resetWords}
          onBackup={backup} onRestore={restore} uiLang={uiLang} setUiLang={setUiLangState}
          fixChandra={fixChandra} setFixChandra={setFixChandra} toggleKey={toggleKey} setToggleKey={setToggleKey}
          app={{
            supported: pwaSupported(), offlineReady, standalone: isStandalone(), apple: isAppleDevice(), canInstall,
            onInstall: async () => { if (await promptInstall()) say('ProNotes ইনস্টল হয়েছে'); },
            onCheckUpdate: async () => { say((await checkForUpdate()) ? 'নতুন ভার্সন খোঁজা হলো; থাকলে উপরে জানানো হবে' : 'এখন খোঁজা গেল না (ইন্টারনেট নেই?)'); },
          }} />
      )}

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
