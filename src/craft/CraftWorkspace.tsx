/**
 * "অ্যাপস" workspace: the Craft apps (WordCraft, PdfCraft, GridCraft, DeckCraft …) inside ProNotes.
 * Each app is the official, unchanged web build served from this site (/apps/<id>/<version>/), framed
 * in a same-origin iframe. Files it saves land in ProNotes' "pronotes-craft" database on this
 * device (store.ts) and can be downloaded from here. ProNotes' own editor and data are untouched.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { saveFile } from '../storage/download';
import { craftApp, craftAppUrl, enabledCraftApps, openMessage, readBridgeMessage, runCommand, type CraftApp } from './bridge';
import { deleteCraftFile, getCraftFile, listCraftFiles, saveCraftFile, type CraftFileInfo } from './store';
import './craft.css';

type Status = 'checking' | 'loading' | 'ready' | 'slow' | 'failed' | 'missing';
const SLOW_MS = 45_000;

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const when = (t: number) => new Date(t).toLocaleString();

export function CraftWorkspace({ initialApp, onClose, say }: { initialApp?: string | null; onClose: () => void; say: (m: string, v?: Record<string, string | number>) => void }) {
  const { t } = useT();
  const [app, setApp] = useState<CraftApp | null>(() => craftApp(initialApp) ?? null);
  const [files, setFiles] = useState<CraftFileInfo[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [status, setStatus] = useState<Status>('checking');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const pending = useRef<{ name: string; bytes: ArrayBuffer } | null>(null);

  const refresh = useCallback(async () => {
    try { setFiles(await listCraftFiles(app?.id)); } catch { setFiles([]); }
  }, [app]);
  useEffect(() => { void refresh(); }, [refresh]);

  // a new app: find out if its files are on this site, then wait for its "ready"
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
    return () => { gone = true; clearTimeout(slow); };
  }, [app]);

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
        const p = pending.current;
        pending.current = null;
        // in host mode the app starts with no document: open the waiting file, or a blank one
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

  const leave = (next: () => void) => {
    if (dirty && !confirm(t('এই অ্যাপে সেভ না করা পরিবর্তন আছে। তবুও বন্ধ করবেন?'))) return;
    next();
  };

  const openBytes = (name: string, bytes: ArrayBuffer) => {
    if (dirty && !confirm(t('এই অ্যাপে সেভ না করা পরিবর্তন আছে। তবুও অন্য ফাইল খুলবেন?'))) return;
    if (ready.current) send(name, bytes);
    else pending.current = { name, bytes };
    setShowFiles(false);
  };
  const openDeviceFile = async (f: File | undefined) => { if (f) openBytes(f.name, await f.arrayBuffer()); };
  const openSaved = async (id: string) => { const f = await getCraftFile(id); if (f) openBytes(f.name, f.bytes); };
  const download = async (id: string) => { const f = await getCraftFile(id); if (f) await saveFile(f.name, new Blob([f.bytes])); };
  const remove = async (f: CraftFileInfo) => {
    if (!confirm(t('{name} এই ডিভাইস থেকে মুছে ফেলবেন?', { name: f.name }))) return;
    await deleteCraftFile(f.id);
    void refresh();
  };

  const fileList = (
    <ul className="craft-files" data-testid="craft-files">
      {files.length === 0 && <li className="craft-empty">{t('এখনো কোনো ফাইল রাখা হয়নি')}</li>}
      {files.map((f) => (
        <li key={f.id}>
          <span className="craft-file-name" title={f.name}>{f.name}</span>
          <small>{!app && (craftApp(f.appId)?.name ?? f.appId) + ' · '}{kb(f.size)} · {when(f.updatedAt)}</small>
          <span className="craft-file-actions">
            {app?.bridge === 'parent' && <button type="button" className="btn small" onClick={() => void openSaved(f.id)}>{t('খুলুন')}</button>}
            {!app && craftApp(f.appId)?.bridge === 'parent' && <button type="button" className="btn small" onClick={async () => { const a = craftApp(f.appId)!; const x = await getCraftFile(f.id); setApp(a); if (x) pending.current = { name: x.name, bytes: x.bytes }; }}>{t('খুলুন')}</button>}
            <button type="button" className="btn small" onClick={() => void download(f.id)}>{t('ডাউনলোড')}</button>
            <button type="button" className="btn small" onClick={() => void remove(f)}>{t('মুছুন')}</button>
          </span>
        </li>
      ))}
    </ul>
  );

  if (!app)
    return (
      <section className="craft" data-testid="craft-launcher">
        <header className="craft-bar">
          <strong>{t('অ্যাপস')}</strong>
          <span className="craft-spacer" />
          <button type="button" className="btn small" data-testid="craft-close" onClick={onClose}>{t('বন্ধ')}</button>
        </header>
        <div className="craft-grid">
          {enabledCraftApps().map((a) => (
            <button type="button" key={a.id} className="craft-card" data-testid={'craft-app-' + a.id} onClick={() => setApp(a)}>
              <strong>{a.name}</strong>
              <span>{t(a.label)}</span>
              <small>v{a.version}</small>
            </button>
          ))}
        </div>
        <p className="craft-note">{t('অ্যাপগুলো ArtCraft-এর ওপেন-সোর্স (MIT/Apache-2.0) web build, অপরিবর্তিত অবস্থায় এই সাইট থেকে চলে। ProNotes-এর সাথে এদের দলের কোনো সম্পর্ক নেই।')}</p>
        <h3 className="craft-h">{t('এই ডিভাইসে রাখা ফাইল')}</h3>
        {fileList}
      </section>
    );

  const statusText: Record<Status, string> = {
    checking: 'অ্যাপ খোঁজা হচ্ছে…',
    loading: 'অ্যাপ লোড হচ্ছে… (প্রথমবার কিছুটা সময় লাগে)',
    ready: dirty ? 'সেভ না করা পরিবর্তন আছে' : 'প্রস্তুত',
    slow: 'অ্যাপ এখনো সাড়া দিচ্ছে না — ইন্টারনেট ধীর হতে পারে',
    failed: 'অ্যাপ চালু হলো না',
    missing: 'এই সাইটে অ্যাপটির ফাইল নেই',
  };

  return (
    <section className="craft craft-running" data-testid="craft-app">
      <header className="craft-bar">
        <button type="button" className="btn small" data-testid="craft-back" onClick={() => leave(() => setApp(null))}>← {t('অ্যাপস')}</button>
        <strong>{app.name}</strong>
        <span className={'craft-status ' + status + (dirty ? ' dirty' : '')} data-testid="craft-status" role="status">{t(statusText[status])}</span>
        <span className="craft-spacer" />
        {app.bridge === 'parent' && (
          <>
            <button type="button" className="btn small" data-testid="craft-new" disabled={status !== 'ready'}
              onClick={() => { if (!dirty || confirm(t('এই অ্যাপে সেভ না করা পরিবর্তন আছে। তবুও নতুন ফাইল খুলবেন?'))) void runCommand(frame.current, app.id, 'file.new').catch(() => {}); }}>{t('নতুন')}</button>
            <label className="btn small">{t('ফাইল খুলুন')}<input type="file" accept={app.accept} hidden onChange={(e) => { void openDeviceFile(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
            <button type="button" className={'btn small' + (showFiles ? ' on' : '')} data-testid="craft-files-toggle" onClick={() => setShowFiles((v) => !v)}>{t('রাখা ফাইল')} ({files.length})</button>
          </>
        )}
        <button type="button" className="btn small" data-testid="craft-close" onClick={() => leave(onClose)}>{t('বন্ধ')}</button>
      </header>
      {app.bridge !== 'parent' && <p className="craft-note">{t('এই অ্যাপ এখনো ProNotes-এ ফাইল দিতে পারে না: সেভ বা এক্সপোর্ট করলে সাধারণ ডাউনলোড হবে।')}</p>}
      {status === 'failed' && <p className="craft-error" role="alert">{t('অ্যাপ চালু হলো না। এই ব্রাউজারে WebGPU বা WebGL2 নেই, বা মেমরি কম।')} {error && <code>{error}</code>}</p>}
      {status === 'missing' ? (
        <p className="craft-error" role="alert">{t('অ্যাপটির ফাইল এই build-এ নেই। কম্পিউটারে চালান: npm run craft:fetch')}</p>
      ) : (
        <div className="craft-stage">
          {showFiles && <aside className="craft-side">{fileList}</aside>}
          {status !== 'checking' && (
            <iframe key={app.id + app.version} ref={frame} className="craft-frame" title={app.name} data-testid="craft-frame"
              src={craftAppUrl(app, document.baseURI)} allow="fullscreen; clipboard-read; clipboard-write" allowFullScreen
              onLoad={() => { if (app.bridge !== 'parent') setStatus('ready'); }} />
          )}
        </div>
      )}
    </section>
  );
}
