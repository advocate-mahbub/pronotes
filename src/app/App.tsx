import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BUILTIN_LAYOUTS, findLayout } from '../bornona-engine';
import { emptyBank, pruneBank, type WordBank } from '../suggest';
import {
  listDocs, getDoc, createDoc, saveContent, renameDoc, duplicateDoc, trashDoc, restoreDoc, deleteForever, purgeExpired,
  loadBank, saveBank, requestPersistence, exportAll, restoreAll, parseBackup, backupFileName, type Doc,
} from '../storage';
import { saveFile } from '../storage/download';
import { Sidebar } from './Sidebar';
import { Workspace, type SaveState } from './Workspace';
import { load, save } from './prefs';
import { bnNum } from './format';
import './app.css';

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

export function App() {
  const [layoutId, setLayoutId] = useState(() => load('layout', 'bornona'));
  const [bangla, setBangla] = useState(() => load('bangla', true));
  const [vf, setVf] = useState(() => load('vf', true));
  const [oldReph, setOldReph] = useState(() => load('oldReph', false));
  const [kbVisible, setKbVisible] = useState(() => load('kb', coarse));
  const [sideOpen, setSideOpen] = useState(() => load('side', true));
  const [wide, setWide] = useState(() => wideQuery?.matches ?? true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [trash, setTrash] = useState<Doc[]>([]);
  const [current, setCurrent] = useState<Doc | null>(null);
  const [view, setView] = useState<'docs' | 'trash'>('docs');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [toast, setToast] = useState('');
  const [bankVersion, setBankVersion] = useState(0);
  const bank = useRef<WordBank>(emptyBank());
  const map = useMemo(() => findLayout(layoutId).map, [layoutId]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => save('layout', layoutId), [layoutId]);
  useEffect(() => save('bangla', bangla), [bangla]);
  useEffect(() => save('vf', vf), [vf]);
  useEffect(() => save('oldReph', oldReph), [oldReph]);
  useEffect(() => save('kb', kbVisible), [kbVisible]);
  useEffect(() => save('side', sideOpen), [sideOpen]);
  useEffect(() => {
    const on = () => setWide(wideQuery?.matches ?? true);
    wideQuery?.addEventListener('change', on);
    return () => wideQuery?.removeEventListener('change', on);
  }, []);

  const toastTimer = useRef<number>(undefined);
  const say = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), m.length > 40 ? 4500 : 2200);
  }, []);

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

  // start-up
  useEffect(() => {
    (async () => {
      await purgeExpired();
      await migrateFromM2();
      bank.current = (await loadBank()) ?? emptyBank();
      setBankVersion((v) => v + 1);
      let list = await listDocs();
      if (!list.length) list = [await createDoc()];
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

  const newDoc = async () => {
    const d = await createDoc();
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

  const prefs = () => ({ layout: layoutId, bangla, vf, oldReph, kb: kbVisible });
  const backup = async () => {
    try {
      const f = await exportAll(prefs());
      const ok = await saveFile(backupFileName(), new Blob([JSON.stringify(f)], { type: 'application/json' }));
      if (ok) say(`${bnNum(f.docs.length)}টা ড্রাফট আর শব্দভান্ডারের ব্যাকআপ তৈরি হয়েছে`);
    } catch {
      say('ব্যাকআপ তৈরি করা যায়নি');
    }
  };
  const restore = async (file: File) => {
    try {
      const r = await restoreAll(parseBackup(await file.text()));
      bank.current = (await loadBank()) ?? bank.current;
      setBankVersion((v) => v + 1);
      await refresh();
      say(`ফেরত এসেছে: নতুন ${bnNum(r.added)}টা, আলাদা কপি ${bnNum(r.copies)}টা, আগে থেকেই ছিল ${bnNum(r.unchanged)}টা`);
    } catch {
      say('ফাইলটা ProNotes-এর ব্যাকআপ না, বা পড়া যায়নি');
    }
  };

  const showSide = sideOpen;
  const sidebar = (
    <Sidebar docs={docs} trash={trash} currentId={current?.id ?? null} view={view} setView={setView}
      onOpen={open} onNew={newDoc}
      onDuplicate={async (id) => { const d = await duplicateDoc(id); await refresh(); if (d) await open(d.id); say('কপি তৈরি হয়েছে'); }}
      onTrash={toTrash}
      onRestore={async (id) => { await restoreDoc(id); await refresh(); say('ফেরত আনা হয়েছে'); }}
      onDeleteForever={async (id) => { await deleteForever(id); await refresh(); say('স্থায়ীভাবে মুছে ফেলা হয়েছে'); }}
      onClose={wide ? undefined : () => setSideOpen(false)} />
  );
  const statusText = { saved: 'এই ডিভাইসে সেভ হয়েছে', saving: 'সেভ হচ্ছে…', error: 'সেভ করা যায়নি' }[saveState];

  return (
    <div className={'app' + (showSide && wide ? ' with-side' : '')}>
      <header className="top">
        <div className="brand">
          <span className="name">ProNotes</span>
          <span className="sub">{findLayout(layoutId).name} layout</span>
        </div>
        <span className={'status ' + saveState} data-testid="save-status" role="status">{statusText}</span>
        <div className="seg" role="group" aria-label="ভাষা">
          <button type="button" aria-pressed={bangla} data-testid="mode-bn" onClick={() => setBangla(true)}>বাংলা</button>
          <button type="button" aria-pressed={!bangla} data-testid="mode-en" onClick={() => setBangla(false)}>English</button>
        </div>
      </header>

      <div className="body">
        {showSide && (wide ? sidebar : <div className="drawer" onClick={(e) => e.target === e.currentTarget && setSideOpen(false)}>{sidebar}</div>)}
        <div className="work">
          {current && (
            <Workspace key={current.id} doc={current} map={map} bangla={bangla} vowelForming={vf} oldReph={oldReph}
              kbVisible={kbVisible} coarse={coarse} bank={bank.current} bankVersion={bankVersion} onBankChanged={onBankChanged}
              onToggleLanguage={() => setBangla((b) => !b)} onSave={onSave}
              onRename={async (id, t) => { await renameDoc(id, t); await refresh(); }}
              onSaveState={setSaveState}
              toolbarExtra={
                <>
                  <button type="button" className={'tb' + (showSide ? ' on' : '')} title="ডকুমেন্টের তালিকা" aria-label="ডকুমেন্টের তালিকা"
                    data-testid="side-toggle" onPointerDown={(e) => e.preventDefault()} onClick={() => setSideOpen((v) => !v)}>☰</button>
                  <span className="sep" />
                </>
              }
              toolbarRight={
                <>
        <select className="layout" aria-label="কিবোর্ড লেআউট" data-testid="layout" value={layoutId} onChange={(e) => setLayoutId(e.target.value)}>
          {BUILTIN_LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button type="button" className={'tb' + (kbVisible ? ' on' : '')} title="অন-স্ক্রিন কিবোর্ড" aria-label="অন-স্ক্রিন কিবোর্ড" data-testid="kb-toggle"
          onPointerDown={(e) => e.preventDefault()} onClick={() => setKbVisible((v) => !v)}>⌨</button>
        <button type="button" className={'tb' + (settingsOpen ? ' on' : '')} title="সেটিংস" aria-label="সেটিংস" data-testid="settings"
          onClick={() => setSettingsOpen((v) => !v)}>⚙</button>
                </>
              } />
          )}
        </div>
      </div>


      {settingsOpen && (
        <section className="settings" aria-label="সেটিংস" data-testid="settings-panel">
          <h2>টাইপিং</h2>
          <label><input type="checkbox" data-testid="vf" checked={vf} onChange={(e) => setVf(e.target.checked)} /> স্বর-গঠন: শব্দের শুরুতে বা স্বরবর্ণের পরে কার চাপুন (ি চাপলে হবে ই, ে চাপলে এ, অ-এর পরে া চাপলে আ)</label>
          <label><input type="checkbox" data-testid="oldreph" checked={oldReph} onChange={(e) => setOldReph(e.target.checked)} /> বিজয়-ধাঁচের রেফ: বর্ণ লেখার পরে রেফ চাপুন (ক ম রেফ লিখলে হবে কর্ম)</label>
          <h2>ব্যাকআপ</h2>
          <p className="note">সব ড্রাফট (ট্র্যাশসহ), শেখা শব্দ আর সেটিংস একটা ফাইলে। iPad-এ ফাইলটা Files বা iCloud Drive-এ রাখুন। ফেরত আনলে আগের কিছু মুছবে না; বদলে যাওয়া ড্রাফট আলাদা কপি হয়ে আসবে।</p>
          <div className="row">
            <button type="button" className="btn primary" data-testid="backup" onClick={backup}>সব কিছুর ব্যাকআপ নিন</button>
            <button type="button" className="btn" data-testid="restore-btn" onClick={() => fileInput.current?.click()}>ব্যাকআপ থেকে ফেরত আনুন</button>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden data-testid="restore-file"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) restore(f); }} />
          </div>
        </section>
      )}

      {toast && <div className="toast" role="status" data-testid="toast">{toast}</div>}
    </div>
  );
}
