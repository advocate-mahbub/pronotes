/**
 * "অ্যাপস" workspace: the Craft apps (WordCraft, PdfCraft, GridCraft, DeckCraft …) inside ProNotes.
 * The running app stays alive while you go back to the drafts or to the app list (▦ hides it, it does
 * not close it), so coming back finds it as it was. While an app is shown, ProNotes' own header steps
 * aside and only a thin bar stays: ← অ্যাপস · name · state · ✎ ProNotes.
 * Each app is the official, unchanged web build served from this site (/apps/<id>/<version>/), framed
 * in a same-origin iframe. Files it saves land in ProNotes' "pronotes-craft" database on this
 * device (store.ts) and can be downloaded from here. ProNotes' own editor and data are untouched.
 */
import { UserApps } from './UserApps';
import type { BridgeConfig } from '../../apps-site/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { saveFile } from '../storage/download';
import { callCommand, craftApp, craftAppUrl, enabledCraftApps, listedFamilies, manifestFonts, openMessage, readBridgeMessage, runCommand, type CraftApp } from './bridge';
import { deleteCraftFile, getCraftFile, listCraftFiles, saveCraftFile, type CraftFileInfo } from './store';
import './craft.css';

type Status = 'checking' | 'loading' | 'ready' | 'slow' | 'failed' | 'missing';
const SLOW_MS = 45_000;

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const when = (t: number) => new Date(t).toLocaleString();

/** A file to open as soon as the app is ready (e.g. the draft sent from ProNotes as .docx). */
export interface CraftOpenFile { name: string; bytes: ArrayBuffer }

/**
 * Fonts for apps that add fonts through their own command (WordCraft: font.add): the files listed in
 * the app folder's fonts/manifest.txt (craft-fonts/, e.g. Noto Sans Bengali) are added once; the app
 * keeps them on this device, so the next start skips them.
 */
async function addBanglaFonts(frame: HTMLIFrameElement | null, app: CraftApp): Promise<void> {
  if (!app.fonts || app.bridge !== 'parent') return;
  const base = craftAppUrl({ ...app, bridge: 'none' }, document.baseURI).replace(/index\.html$/, '');
  const res = await fetch(base + 'fonts/manifest.txt');
  if (!res.ok) return;
  const have = listedFamilies(await callCommand(frame, app.id, 'font.list', {}));
  for (const f of manifestFonts(await res.text())) {
    if (have.has(f.family)) continue;
    const file = await fetch(base + f.file);
    if (!file.ok) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    await callCommand(frame, app.id, 'font.add', { data: btoa(bin), name: f.file.split('/').pop() });
    have.add(f.family);
  }
}

/** A draft handed over from ProNotes (Share → "WordCraft-এ খুলুন"); n changes with every hand-over. */
export interface CraftHandoff { app: string; file: CraftOpenFile; n: number }
export type CraftView = 'launcher' | 'app';

interface Props {
  /** The Apps workspace is on screen (false: the drafts are shown, the running app waits). */
  visible: boolean;
  /** Open straight into this app (the /word/ address). */
  initialApp?: string | null;
  handoff?: CraftHandoff | null;
  /** Back to the drafts; the running app keeps running. */
  onShowDrafts: () => void;
  /** Tells ProNotes whether an app fills the screen (its header then steps aside). */
  onViewChange?: (v: CraftView) => void;
  say: (m: string, v?: Record<string, string | number>) => void;
  /** ProNotes' typing settings for the user's own apps (আমার অ্যাপ), and the language switch. */
  typing?: { cfg: BridgeConfig; onToggleLanguage: () => void };
}

export function CraftWorkspace({ visible, initialApp, handoff, onShowDrafts, onViewChange, say, typing }: Props) {
  const { t } = useT();
  // the running app (its iframe stays alive) and what is on screen
  const [app, setApp] = useState<CraftApp | null>(() => craftApp(initialApp) ?? null);
  const [view, setView] = useState<CraftView | 'mine'>(() => (craftApp(initialApp) ? 'app' : 'launcher'));
  // আমার অ্যাপ: once opened it stays (its apps keep running) until the page is reloaded
  const [mineOn, setMineOn] = useState(false);
  const [run, setRun] = useState(0); // a new number restarts the app (fresh iframe)
  const [files, setFiles] = useState<CraftFileInfo[]>([]);
  const [status, setStatus] = useState<Status>('checking');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const pending = useRef<{ name: string; bytes: ArrayBuffer } | null>(null);

  useEffect(() => { onViewChange?.(visible ? (view === 'mine' ? 'app' : view) : 'launcher'); }, [visible, view, onViewChange]);

  const refresh = useCallback(async () => {
    try { setFiles(await listCraftFiles()); } catch { setFiles([]); }
  }, []);
  useEffect(() => { if (visible) void refresh(); }, [refresh, visible, view]);

  // an app (re)started: find out if its files are on this site, then wait for its "ready"
  useEffect(() => {
    if (!app) return;
    ready.current = false;
    setDirty(false);
    setError('');
    setStatus('checking');
    let gone = false;
    const page = craftAppUrl({ ...app, bridge: 'none' }, document.baseURI);
    fetch(page, { method: 'HEAD', cache: 'no-cache' })
      .then((r) => { if (!gone) setStatus(r.ok ? 'loading' : 'missing'); })
      .catch(() => { if (!gone) setStatus('loading'); }); // offline: let the iframe try (it may be cached)
    const slow = setTimeout(() => { if (!gone && !ready.current && app.bridge === 'parent') setStatus((s) => (s === 'loading' ? 'slow' : s)); }, SLOW_MS);
    if (app.bridge !== 'parent') say('{app}: এখানে Save বা Export করলে সাধারণ ডাউনলোড হবে', { app: app.name });
    return () => { gone = true; clearTimeout(slow); };
  }, [app, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback((name: string, bytes: ArrayBuffer) => {
    const w = frame.current?.contentWindow;
    if (!app || !w) return;
    w.postMessage(openMessage(app.id, name, bytes), location.origin, [bytes]);
  }, [app]);

  // messages from the app (only from our own iframe, on our own origin)
  useEffect(() => {
    if (!app || app.bridge !== 'parent') return;
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      const ev = readBridgeMessage(app.id, e.data);
      if (!ev) return;
      if (ev.kind === 'ready') {
        ready.current = true;
        setStatus('ready');
        // Bangla font first (so the document is drawn with it), then the waiting file or a blank one
        await addBanglaFonts(frame.current, app).catch(() => {});
        const p = pending.current;
        pending.current = null;
        if (p) send(p.name, p.bytes);
        else void runCommand(frame.current, app.id, 'file.new').catch(() => {});
      } else if (ev.kind === 'save') {
        try {
          await saveCraftFile(app.id, ev.name, ev.bytes);
          say('{name} এই ডিভাইসে রাখা হলো', { name: ev.name });
          void refresh();
        } catch {
          say('ফাইলটা এই ডিভাইসে রাখা গেল না; ডাউনলোড করে দেওয়া হচ্ছে');
          void saveFile(ev.name, new Blob([ev.bytes]));
        }
      } else if (ev.kind === 'dirty') setDirty(ev.dirty);
      else if (ev.kind === 'failed') { setStatus('failed'); setError(ev.error); }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [app, refresh, say, send]);

  // never lose unsaved work by closing the tab
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  /** Show this app; if another one is running, it is closed first (asks when it has unsaved work). */
  const start = (a: CraftApp, file?: { name: string; bytes: ArrayBuffer }): boolean => {
    if (app && app.id === a.id && status !== 'failed' && status !== 'missing') {
      if (file) {
        if (dirty && !confirm(t('এই অ্যাপে সেভ না করা পরিবর্তন আছে। তবুও অন্য ফাইল খুলবেন?'))) return false;
        if (ready.current) send(file.name, file.bytes);
        else pending.current = file;
      }
      setView('app');
      return true;
    }
    if (app && dirty && !confirm(t('{app}-এ সেভ না করা পরিবর্তন আছে। তবুও বন্ধ করে {next} খুলবেন?', { app: app.name, next: a.name }))) return false;
    pending.current = file ?? null;
    setApp(a);
    setRun((n) => n + 1);
    setView('app');
    return true;
  };
  /** Close the running app (frees its memory). */
  const stop = () => {
    if (!app) return;
    if (dirty && !confirm(t('এই অ্যাপে সেভ না করা পরিবর্তন আছে। তবুও বন্ধ করবেন?'))) return;
    setApp(null);
    setDirty(false);
    setView('launcher');
  };

  // a draft handed over from ProNotes
  const lastHandoff = useRef(0);
  useEffect(() => {
    if (!handoff || handoff.n === lastHandoff.current) return;
    lastHandoff.current = handoff.n;
    const a = craftApp(handoff.app);
    if (a) start(a, handoff.file);
  }, [handoff]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async (id: string) => { const f = await getCraftFile(id); if (f) await saveFile(f.name, new Blob([f.bytes])); };
  const remove = async (f: CraftFileInfo) => {
    if (!confirm(t('{name} এই ডিভাইস থেকে মুছে ফেলবেন?', { name: f.name }))) return;
    await deleteCraftFile(f.id);
    void refresh();
  };
  const openKept = async (f: CraftFileInfo) => {
    const a = craftApp(f.appId);
    const x = await getCraftFile(f.id);
    if (a && x) start(a, { name: x.name, bytes: x.bytes });
  };

  const statusText: Record<Status, string> = {
    checking: 'অ্যাপ খোঁজা হচ্ছে…',
    loading: 'অ্যাপ লোড হচ্ছে… (প্রথমবার কিছুটা সময় লাগে)',
    ready: dirty ? 'সেভ না করা পরিবর্তন আছে' : 'প্রস্তুত',
    slow: 'অ্যাপ এখনো সাড়া দিচ্ছে না — ইন্টারনেট ধীর হতে পারে',
    failed: 'অ্যাপ চালু হলো না',
    missing: 'এই সাইটে অ্যাপটির ফাইল নেই',
  };
  const busy = status === 'checking' || status === 'loading' || status === 'slow';

  return (
    <section className={'craft' + ((view === 'app' && app) || view === 'mine' ? ' craft-running' : '')} hidden={!visible} data-testid="craft">
      {view === 'launcher' && (
        <div className="craft-launcher" data-testid="craft-launcher">
          <header className="craft-bar">
            <strong>{t('অ্যাপস')}</strong>
            <span className="craft-spacer" />
            <button type="button" className="btn small" data-testid="craft-close" onClick={onShowDrafts}>✎ {t('ড্রাফটে ফিরুন')}</button>
          </header>
          {app && (
            <div className="craft-running-card" data-testid="craft-running">
              <span>{t('চলছে')}: <strong>{app.name}</strong>{dirty ? ' · ' + t('সেভ না করা পরিবর্তন আছে') : ''}</span>
              <button type="button" className="btn small primary" data-testid="craft-resume" onClick={() => setView('app')}>{t('ফিরে যান')}</button>
              <button type="button" className="btn small" data-testid="craft-stop" onClick={stop}>{t('বন্ধ করুন')}</button>
            </div>
          )}
          <div className="craft-grid">
            {enabledCraftApps().map((a) => (
              <button type="button" key={a.id} className={'craft-card' + (app?.id === a.id ? ' running' : '')} data-testid={'craft-app-' + a.id} onClick={() => start(a)}>
                <strong>{a.name}</strong>
                <span>{t(a.label)}</span>
                <small>v{a.version}{app?.id === a.id ? ' · ' + t('চলছে') : ''}</small>
              </button>
            ))}
          </div>
          {typing && (
            <>
              <h3 className="craft-h">{t('আমার অ্যাপ')}</h3>
              <div className="craft-grid">
                <button type="button" className={'craft-card' + (mineOn ? ' running' : '')} data-testid="craft-mine" onClick={() => { setMineOn(true); setView('mine'); }}>
                  <strong>{t('আমার অ্যাপ')}</strong>
                  <span>{t('নিজের ওয়েব অ্যাপ (.zip) যোগ করুন ও চালান; লেখার ঘরে ProNotes-এর কিবোর্ড লেআউট')}</span>
                  <small>{mineOn ? t('চলছে') : 'apps.mahbuburrahman.bd'}</small>
                </button>
              </div>
            </>
          )}
          <p className="craft-note">{t('অ্যাপগুলো ArtCraft-এর ওপেন-সোর্স (MIT/Apache-2.0) web build, অপরিবর্তিত অবস্থায় এই সাইট থেকে চলে। ProNotes-এর সাথে এদের দলের কোনো সম্পর্ক নেই।')}</p>
          <h3 className="craft-h">{t('এই ডিভাইসে রাখা ফাইল')}</h3>
          <ul className="craft-files" data-testid="craft-files">
            {files.length === 0 && <li className="craft-empty">{t('এখনো কোনো ফাইল রাখা হয়নি')}</li>}
            {files.map((f) => (
              <li key={f.id}>
                <span className="craft-file-name" title={f.name}>{f.name}</span>
                <small>{(craftApp(f.appId)?.name ?? f.appId) + ' · '}{kb(f.size)} · {when(f.updatedAt)}</small>
                <span className="craft-file-actions">
                  {craftApp(f.appId)?.bridge === 'parent' && <button type="button" className="btn small" onClick={() => void openKept(f)}>{t('খুলুন')}</button>}
                  <button type="button" className="btn small" onClick={() => void download(f.id)}>{t('ডাউনলোড')}</button>
                  <button type="button" className="btn small" onClick={() => void remove(f)}>{t('মুছুন')}</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {app && (
        <div className="craft-app" hidden={view !== 'app'} data-testid="craft-app">
          <header className="craft-slim">
            <button type="button" className="craft-slim-btn" data-testid="craft-back" onClick={() => setView('launcher')}>← {t('অ্যাপস')}</button>
            <strong>{app.name}</strong>
            <span className={'craft-dot ' + status + (dirty ? ' dirty' : '')} data-testid="craft-status" role="status" title={t(statusText[status])} aria-label={t(statusText[status])}>
              <span className="craft-dot-text">{t(statusText[status])}</span>
            </span>
            <span className="craft-spacer" />
            <button type="button" className="craft-slim-btn" data-testid="craft-drafts" onClick={onShowDrafts}>✎ ProNotes</button>
          </header>
          {status === 'failed' && <p className="craft-error" role="alert">{t('অ্যাপ চালু হলো না। এই ব্রাউজারে WebGPU বা WebGL2 নেই, বা মেমরি কম।')} {error && <code>{error}</code>}</p>}
          {status === 'missing' ? (
            <p className="craft-error" role="alert">{t('অ্যাপটির ফাইল এই build-এ নেই। কম্পিউটারে চালান: npm run craft:fetch')}</p>
          ) : (
            <div className="craft-stage">
              {status !== 'checking' && (
                <iframe key={app.id + app.version + ':' + run} ref={frame} className="craft-frame" title={app.name} data-testid="craft-frame"
                  src={craftAppUrl(app, document.baseURI)} allow="fullscreen; clipboard-read; clipboard-write" allowFullScreen
                  onLoad={() => { if (app.bridge !== 'parent') setStatus('ready'); }} />
              )}
              {busy && <div className="craft-loading" role="status"><span className="craft-spinner" aria-hidden="true" />{t(statusText[status])}</div>}
            </div>
          )}
        </div>
      )}
      {typing && mineOn && (
        <div className="craft-app" hidden={view !== 'mine'} data-testid="user-apps">
          <header className="craft-slim">
            <button type="button" className="craft-slim-btn" data-testid="user-apps-back" onClick={() => setView('launcher')}>← {t('অ্যাপস')}</button>
            <strong>{t('আমার অ্যাপ')}</strong>
            <span className="craft-spacer" />
            <button type="button" className="craft-slim-btn" onClick={onShowDrafts}>✎ ProNotes</button>
          </header>
          <UserApps cfg={typing.cfg} onToggleLanguage={typing.onToggleLanguage} />
        </div>
      )}
    </section>
  );
}
