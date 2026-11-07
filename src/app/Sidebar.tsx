import { useState } from 'react';
import type { Doc, DocKind } from '../storage';
import { daysLeft, kindOf, TRASH_DAYS } from '../storage';
import { formatDateTime, useT } from '../i18n';
import { Popover } from './ui';

interface Props {
  docs: Doc[];
  trash: Doc[];
  currentId: string | null;
  view: 'docs' | 'trash';
  setView: (v: 'docs' | 'trash') => void;
  kindIcon: Record<DocKind, string>;
  kindLabel: Record<DocKind, string>;
  onOpen: (id: string) => void;
  onNew: (kind: DocKind) => void;
  onDuplicate: (id: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onClose?: () => void;
}

/** Document list (and Trash). */
export function Sidebar(p: Props) {
  const { t, lang } = useT();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const list = p.view === 'docs' ? p.docs : p.trash;
  return (
    <aside className="side" aria-label={t('ডকুমেন্টের তালিকা')} data-testid="sidebar" data-view={p.view === 'trash' ? 'trash' : undefined}>
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
        <button type="button" aria-pressed={p.view === 'docs'} onClick={() => p.setView('docs')} data-testid="view-docs">{t('ডকুমেন্ট ({n})', { n: p.docs.length })}</button>
        <button type="button" aria-pressed={p.view === 'trash'} onClick={() => p.setView('trash')} data-testid="view-trash">{t('ট্র্যাশ ({n})', { n: p.trash.length })}</button>
      </div>
      {p.view === 'trash' && <p className="note">{t('ট্র্যাশের ডকুমেন্ট {n} দিন পরে নিজে থেকে মুছে যায়।', { n: TRASH_DAYS })}</p>}
      <ul className="docs">
        {list.length === 0 && <li className="empty">{p.view === 'docs' ? t('কোনো ডকুমেন্ট নেই') : t('ট্র্যাশ খালি')}</li>}
        {list.map((d) => (
          <li key={d.id} className={d.id === p.currentId && p.view === 'docs' ? 'cur' : ''} data-testid="doc-row" data-kind={kindOf(d)}>
            {p.view === 'docs' ? (
              <button type="button" className="doc" onClick={() => p.onOpen(d.id)}>
                <span className="t"><span className="ki" title={t(p.kindLabel[kindOf(d)])}>{p.kindIcon[kindOf(d)]}</span> {d.title}</span>
                <span className="d">{formatDateTime(d.updatedAt, lang)}</span>
              </button>
            ) : (
              <div className="doc">
                <span className="t">{d.title}</span>
                <span className="d">{t('আর {n} দিন', { n: daysLeft(d) })}</span>
              </div>
            )}
            <div className="row-actions">
              {p.view === 'docs' ? (
                <>
                  <button type="button" className="mini" onClick={() => p.onDuplicate(d.id)} data-testid="dup">{t('কপি')}</button>
                  <button type="button" className="mini" onClick={() => p.onTrash(d.id)} data-testid="trash">{t('ট্র্যাশে')}</button>
                </>
              ) : (
                <>
                  <button type="button" className="mini" onClick={() => p.onRestore(d.id)} data-testid="restore">{t('ফেরত আনুন')}</button>
                  {confirmId === d.id ? (
                    <button type="button" className="mini warn" data-testid="delete-confirm" onClick={() => { setConfirmId(null); p.onDeleteForever(d.id); }}>{t('নিশ্চিত, মুছুন')}</button>
                  ) : (
                    <button type="button" className="mini" data-testid="delete" onClick={() => setConfirmId(d.id)}>{t('স্থায়ীভাবে মুছুন')}</button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
