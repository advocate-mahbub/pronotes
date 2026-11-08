/**
 * Document list (and Trash): search, folders, sort and filter, pin, rename in place,
 * a ⋯ menu per document, and choosing several documents at once.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Doc, DocKind, Folder } from '../storage';
import { daysLeft, kindOf, TRASH_DAYS } from '../storage';
import { fixNukta } from '../bornona-engine';
import type { BornonaConfig } from '../editor';
import { formatDateTime, useT } from '../i18n';
import { attachBornona } from './bornona-input';
import { LIST_FORMATS, type ListFormat } from './doc-export';
import { Popover } from './ui';

export type SortBy = 'updated' | 'created' | 'title';
export type KindFilter = 'all' | 'note' | 'legal' | 'envelope';
/** 'all' = every folder, '' = documents in no folder, otherwise a folder id */
export type FolderFilter = string;

export interface ListPrefs {
  sort: SortBy;
  kind: KindFilter;
  folder: FolderFilter;
}

interface Props {
  /** Shown above the list (phones: the keyboard layout picker). */
  top?: ReactNode;
  docs: Doc[];
  trash: Doc[];
  folders: Folder[];
  currentId: string | null;
  view: 'docs' | 'trash';
  setView: (v: 'docs' | 'trash') => void;
  prefs: ListPrefs;
  setPrefs: (p: ListPrefs) => void;
  kindIcon: Record<DocKind, string>;
  kindLabel: Record<DocKind, string>;
  /** Bangla typing in the search, rename and folder boxes */
  getConfig: () => BornonaConfig;
  onToggleLanguage: () => void;
  onOpen: (id: string) => void;
  onNew: (kind: DocKind) => void;
  onRename: (id: string, title: string) => void;
  onCopyText: (id: string) => void;
  onDuplicate: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onMove: (ids: string[], folderId: string) => void;
  onChangeKind: (id: string, kind: DocKind) => void;
  onExport: (ids: string[], fmt: ListFormat, mode: 'save' | 'share') => void;
  canShare: boolean;
  onInfo: (id: string) => void;
  onVersions: (id: string) => void;
  onTrash: (ids: string[]) => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onClose?: () => void;
}

export const isEnvelope = (d: Doc) => !!d.page?.paper?.startsWith('env-');
const kindMatch = (d: Doc, k: KindFilter) =>
  k === 'all' || (k === 'envelope' ? isEnvelope(d) : k === 'legal' ? kindOf(d) === 'legal' && !isEnvelope(d) : kindOf(d) === k);

const clean = (s: string) => fixNukta(s).toLowerCase().replace(/\s+/g, ' ').trim();

/** First line of the text, or the words around a search hit. */
function snippet(d: Doc, q: string): string {
  const text = (d.text || '').replace(/\s+/g, ' ').trim();
  const body = text.startsWith(d.title) ? text.slice(d.title.length).trim() : text;
  if (q) {
    const i = clean(body).indexOf(q);
    if (i >= 0) return (i > 30 ? '…' : '') + body.slice(Math.max(0, i - 30), i + q.length + 50);
  }
  return body.slice(0, 90);
}

/** A text box with Bornona typing. */
function BnInput(props: React.InputHTMLAttributes<HTMLInputElement> & { cfg: () => BornonaConfig; toggle: () => void; autoSelect?: boolean }) {
  const { cfg, toggle, autoSelect, ...rest } = props;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    if (autoSelect) {
      ref.current.focus();
      ref.current.select();
    }
    return attachBornona(ref.current, cfg, toggle);
  }, [cfg, toggle, autoSelect]);
  return <input ref={ref} {...rest} />;
}

export function Sidebar(p: Props) {
  const { t, lang } = useT();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [newFolder, setNewFolder] = useState('');
  const [folderEdit, setFolderEdit] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const menuBtns = useRef(new Map<string, HTMLDivElement>());
  const folderById = useMemo(() => new Map(p.folders.map((f) => [f.id, f])), [p.folders]);
  const { sort, kind, folder } = p.prefs;
  const q = clean(query);

  const list = useMemo(() => {
    const src = p.view === 'docs' ? p.docs : p.trash;
    const f = src.filter((d) => {
      if (p.view === 'docs') {
        if (!kindMatch(d, kind)) return false;
        if (folder !== 'all' && (d.folderId ?? '') !== folder) return false;
      }
      return !q || clean(d.title).includes(q) || clean(d.text || '').includes(q);
    });
    const by: Record<SortBy, (a: Doc, b: Doc) => number> = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      created: (a, b) => b.createdAt - a.createdAt,
      title: (a, b) => a.title.localeCompare(b.title, 'bn'),
    };
    return f.sort((a, b) => (p.view === 'docs' ? Number(!!b.pinned) - Number(!!a.pinned) : 0) || by[sort](a, b));
  }, [p.view, p.docs, p.trash, kind, folder, q, sort]);

  const startRename = (d: Doc) => {
    setRenaming(d.id);
    setDraft(d.title);
  };
  const commitRename = () => {
    if (renaming && draft.trim()) p.onRename(renaming, draft.trim());
    setRenaming(null);
  };
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const endPick = () => { setPicking(false); setPicked(new Set()); };
  const ids = [...picked].filter((id) => list.some((d) => d.id === id));

  const moveMenu = (go: (folderId: string) => void, close: () => void, except?: string) => (
    <>
      <button type="button" data-testid="move-none" disabled={except === ''} onClick={() => { close(); go(''); }}>{t('কোনো ফোল্ডারে না')}</button>
      {p.folders.map((f) => (
        <button key={f.id} type="button" data-testid={'move-' + f.id} disabled={except === f.id} onClick={() => { close(); go(f.id); }}>📁 {f.name}</button>
      ))}
    </>
  );

  return (
    <aside className="side" aria-label={t('ডকুমেন্টের তালিকা')} data-testid="sidebar" data-view={p.view === 'trash' ? 'trash' : undefined}>
      {p.top}
      <div className="side-head">
        <Popover label={'+ ' + t('নতুন')} title={t('নতুন ডকুমেন্ট')} testid="new-doc" className="btn primary newdoc">
          {(close) => (
            <div className="menu">
              {(['legal', 'note'] as DocKind[]).map((k) => (
                <button key={k} type="button" data-testid={'new-' + k} onClick={() => { close(); p.onNew(k); }}>
                  {p.kindIcon[k]} {t(p.kindLabel[k])}
                </button>
              ))}
              <button type="button" disabled>{p.kindIcon.chart} {t(p.kindLabel.chart)} ({t('শীঘ্রই')})</button>
            </div>
          )}
        </Popover>
        {p.onClose && <button type="button" className="btn" aria-label={t('তালিকা বন্ধ')} onClick={p.onClose}>✕</button>}
      </div>
      <div className="seg small" role="group" aria-label={t('তালিকা')}>
        <button type="button" aria-pressed={p.view === 'docs'} onClick={() => { p.setView('docs'); endPick(); }} data-testid="view-docs">{t('ডকুমেন্ট ({n})', { n: p.docs.length })}</button>
        <button type="button" aria-pressed={p.view === 'trash'} onClick={() => { p.setView('trash'); endPick(); }} data-testid="view-trash">{t('ট্র্যাশ ({n})', { n: p.trash.length })}</button>
      </div>

      <div className="side-search">
        <BnInput type="search" data-testid="doc-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('খুঁজুন: নাম বা লেখা')}
          aria-label={t('খুঁজুন: নাম বা লেখা')} cfg={p.getConfig} toggle={p.onToggleLanguage} />
      </div>

      {p.view === 'docs' && (
        <>
          <div className="side-row">
            <select data-testid="doc-folder" aria-label={t('ফোল্ডার')} value={folder} onChange={(e) => p.setPrefs({ ...p.prefs, folder: e.target.value })}>
              <option value="all">{t('সব ফোল্ডার')}</option>
              <option value="">{t('ফোল্ডার ছাড়া')}</option>
              {p.folders.map((f) => <option key={f.id} value={f.id}>📁 {f.name}</option>)}
            </select>
            <Popover label="📁 ▾" title={t('ফোল্ডার সাজান')} testid="folders">
              {(close) => (
                <div className="menu folder-menu">
                  <div className="row">
                    <BnInput data-testid="folder-new" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder={t('নতুন ফোল্ডারের নাম')}
                      cfg={p.getConfig} toggle={p.onToggleLanguage}
                      onKeyDown={(e) => { if (e.key === 'Enter' && newFolder.trim()) { p.onCreateFolder(newFolder); setNewFolder(''); } }} />
                    <button type="button" className="mini" data-testid="folder-add" disabled={!newFolder.trim()} onClick={() => { p.onCreateFolder(newFolder); setNewFolder(''); }}>{t('তৈরি করুন')}</button>
                  </div>
                  {p.folders.length === 0 && <p className="note">{t('এখনো কোনো ফোল্ডার নেই। মামলা বা মক্কেলের নামে ফোল্ডার বানাতে পারেন।')}</p>}
                  {p.folders.map((f) => (
                    <div key={f.id} className="row folder-item">
                      {folderEdit === f.id ? (
                        <>
                          <BnInput data-testid="folder-rename-in" value={folderName} onChange={(e) => setFolderName(e.target.value)} cfg={p.getConfig} toggle={p.onToggleLanguage} autoSelect
                            onKeyDown={(e) => { if (e.key === 'Enter') { p.onRenameFolder(f.id, folderName); setFolderEdit(null); } }} />
                          <button type="button" className="mini" data-testid="folder-rename-ok" onClick={() => { p.onRenameFolder(f.id, folderName); setFolderEdit(null); }}>{t('রাখুন')}</button>
                        </>
                      ) : (
                        <>
                          <span className="fname">📁 {f.name} <small>({t('{n}', { n: p.docs.filter((d) => d.folderId === f.id).length })})</small></span>
                          <button type="button" className="mini" data-testid={'folder-rename-' + f.id} onClick={() => { setFolderEdit(f.id); setFolderName(f.name); }}>{t('নাম')}</button>
                          {confirmId === 'f:' + f.id ? (
                            <button type="button" className="mini warn" data-testid={'folder-del-ok-' + f.id} onClick={() => { setConfirmId(null); p.onDeleteFolder(f.id); if (folder === f.id) p.setPrefs({ ...p.prefs, folder: 'all' }); close(); }}>{t('নিশ্চিত?')}</button>
                          ) : (
                            <button type="button" className="mini" data-testid={'folder-del-' + f.id} title={t('ফোল্ডার মুছলে ভেতরের ডকুমেন্ট মোছে না, শুধু ফোল্ডারের বাইরে আসে')} onClick={() => setConfirmId('f:' + f.id)}>{t('মুছুন')}</button>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Popover>
            <button type="button" className={'mini' + (picking ? ' on' : '')} data-testid="pick" aria-pressed={picking} onClick={() => (picking ? endPick() : setPicking(true))}>{picking ? t('বাতিল') : t('বাছাই')}</button>
          </div>
          <div className="side-row">
            <select data-testid="doc-sort" aria-label={t('সাজানো')} value={sort} onChange={(e) => p.setPrefs({ ...p.prefs, sort: e.target.value as SortBy })}>
              <option value="updated">{t('শেষ বদল আগে')}</option>
              <option value="created">{t('নতুন তৈরি আগে')}</option>
              <option value="title">{t('নাম (ক-খ)')}</option>
            </select>
            <select data-testid="doc-kind" aria-label={t('ধরন')} value={kind} onChange={(e) => p.setPrefs({ ...p.prefs, kind: e.target.value as KindFilter })}>
              <option value="all">{t('সব ধরন')}</option>
              <option value="legal">{t('লিগ্যাল ড্রাফট')}</option>
              <option value="note">{t('সাধারণ নোট')}</option>
              <option value="envelope">{t('খাম')}</option>
            </select>
          </div>
          {picking && (
            <div className="pick-bar" data-testid="pick-bar">
              <span>{t('{n}টা বাছাই', { n: ids.length })}</span>
              <button type="button" className="mini" data-testid="pick-all" onClick={() => setPicked(new Set(list.map((d) => d.id)))}>{t('সব')}</button>
              <Popover label={t('সরান ▾')} title={t('ফোল্ডারে সরান')} testid="pick-move" disabled={!ids.length}>
                {(close) => <div className="menu">{moveMenu((f) => { p.onMove(ids, f); endPick(); }, close)}</div>}
              </Popover>
              <Popover label="Export ▾" title="Export" testid="pick-export" disabled={!ids.length}>
                {(close) => (
                  <div className="menu">
                    {LIST_FORMATS.map((f) => (
                      <button key={f.id} type="button" data-testid={'pick-export-' + f.id} onClick={() => { close(); p.onExport(ids, f.id, 'save'); }}>{t(f.label)} (.zip)</button>
                    ))}
                  </div>
                )}
              </Popover>
              <button type="button" className="mini warn" data-testid="pick-trash" disabled={!ids.length} onClick={() => { p.onTrash(ids); endPick(); }}>{t('ট্র্যাশে')}</button>
            </div>
          )}
        </>
      )}

      {p.view === 'trash' && <p className="note">{t('ট্র্যাশের ডকুমেন্ট {n} দিন পরে নিজে থেকে মুছে যায়।', { n: TRASH_DAYS })}</p>}
      <ul className="docs">
        {list.length === 0 && (
          <li className="empty">{q ? t('কিছু পাওয়া যায়নি') : p.view === 'docs' ? t('কোনো ডকুমেন্ট নেই') : t('ট্র্যাশ খালি')}</li>
        )}
        {list.map((d) => (
          <li key={d.id} className={(d.id === p.currentId && p.view === 'docs' ? 'cur' : '') + (picked.has(d.id) ? ' picked' : '')} data-testid="doc-row" data-kind={kindOf(d)}
            data-pinned={d.pinned ? 'true' : undefined}
            onContextMenu={(e) => {
              if (p.view !== 'docs' || picking) return;
              e.preventDefault();
              menuBtns.current.get(d.id)?.querySelector('button')?.click();
            }}>
            {p.view === 'docs' ? (
              <div className="doc-line">
                {picking && <input type="checkbox" className="pick-box" data-testid="pick-box" aria-label={d.title} checked={picked.has(d.id)} onChange={() => toggle(d.id)} />}
                {renaming === d.id ? (
                  <div className="doc">
                    <BnInput className="rename-in" data-testid="rename-in" value={draft} onChange={(e) => setDraft(e.target.value)} cfg={p.getConfig} toggle={p.onToggleLanguage} autoSelect
                      aria-label={t('নতুন নাম')} onBlur={commitRename}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }} />
                  </div>
                ) : (
                  <button type="button" className="doc" data-testid="doc-open" onClick={() => (picking ? toggle(d.id) : p.onOpen(d.id))}
                    onDoubleClick={() => !picking && startRename(d)} title={t('খুলতে চাপুন; নাম বদলাতে দুবার চাপুন')}>
                    <span className="t">
                      {d.pinned && <span className="pin" title={t('উপরে আটকানো')}>📌</span>}
                      <span className="ki" title={t(p.kindLabel[kindOf(d)])}>{isEnvelope(d) ? '✉' : p.kindIcon[kindOf(d)]}</span> <span className="name" data-testid="doc-title">{d.title}</span>
                    </span>
                    {snippet(d, q) && <span className="pv" data-testid="doc-preview">{snippet(d, q)}</span>}
                    <span className="d">
                      {formatDateTime(sort === 'created' ? d.createdAt : d.updatedAt, lang)}
                      {folder === 'all' && d.folderId && folderById.get(d.folderId) && <span className="fchip">📁 {folderById.get(d.folderId)!.name}</span>}
                    </span>
                  </button>
                )}
                {!picking && renaming !== d.id && (
                  <div className="row-menu" ref={(el) => { if (el) menuBtns.current.set(d.id, el); else menuBtns.current.delete(d.id); }}>
                    <Popover label="⋯" title={t('আরও')} testid="doc-menu">
                      {(close) => (
                        <div className="menu" data-testid="doc-menu-items">
                          <button type="button" data-testid="m-open" onClick={() => { close(); p.onOpen(d.id); }}>{t('খুলুন')}</button>
                          <button type="button" data-testid="m-rename" onClick={() => { close(); startRename(d); }}>{t('নাম বদলান')}</button>
                          <button type="button" data-testid="m-copy" onClick={() => { close(); p.onCopyText(d.id); }}>{t('লেখা কপি করুন')}</button>
                          <button type="button" data-testid="dup" onClick={() => { close(); p.onDuplicate(d.id); }}>{t('ডুপ্লিকেট')}</button>
                          <button type="button" data-testid="m-pin" onClick={() => { close(); p.onPin(d.id, !d.pinned); }}>{d.pinned ? t('আটকানো তুলুন') : t('উপরে আটকান (Pin)')}</button>
                          <hr />
                          <span className="menu-h">{t('ফোল্ডারে সরান')}</span>
                          {moveMenu((f) => p.onMove([d.id], f), close, d.folderId ?? '')}
                          <hr />
                          <span className="menu-h">{t('ধরন')}</span>
                          {(['legal', 'note'] as DocKind[]).map((k) => (
                            <button key={k} type="button" data-testid={'m-kind-' + k} disabled={kindOf(d) === k} onClick={() => { close(); p.onChangeKind(d.id, k); }}>
                              {p.kindIcon[k]} {t(p.kindLabel[k])}
                            </button>
                          ))}
                          <hr />
                          <span className="menu-h">{t('শেয়ার / Export')}</span>
                          {LIST_FORMATS.map((f) => (
                            <div key={f.id} className="menu-pair">
                              <button type="button" data-testid={'m-save-' + f.id} onClick={() => { close(); p.onExport([d.id], f.id, 'save'); }}>{t(f.label)}</button>
                              {p.canShare && <button type="button" className="share-x" data-testid={'m-share-' + f.id} onClick={() => { close(); p.onExport([d.id], f.id, 'share'); }}>{t('শেয়ার')}</button>}
                            </div>
                          ))}
                          <hr />
                          <button type="button" data-testid="m-info" onClick={() => { close(); p.onInfo(d.id); }}>{t('তথ্য')}</button>
                          <button type="button" data-testid="m-versions" onClick={() => { close(); p.onVersions(d.id); }}>{t('আগের ভার্সন…')}</button>
                          <button type="button" data-testid="trash" className="danger" onClick={() => { close(); p.onTrash([d.id]); }}>{t('ট্র্যাশে')}</button>
                        </div>
                      )}
                    </Popover>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="doc">
                  <span className="t">{d.title}</span>
                  <span className="d">{t('আর {n} দিন', { n: daysLeft(d) })}</span>
                </div>
                <div className="row-actions">
                  <button type="button" className="mini" onClick={() => p.onRestore(d.id)} data-testid="restore">{t('ফেরত আনুন')}</button>
                  {confirmId === d.id ? (
                    <button type="button" className="mini warn" data-testid="delete-confirm" onClick={() => { setConfirmId(null); p.onDeleteForever(d.id); }}>{t('নিশ্চিত, মুছুন')}</button>
                  ) : (
                    <button type="button" className="mini" data-testid="delete" onClick={() => setConfirmId(d.id)}>{t('স্থায়ীভাবে মুছুন')}</button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
