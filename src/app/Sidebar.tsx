import { useState } from 'react';
import type { Doc } from '../storage';
import { daysLeft, TRASH_DAYS } from '../storage';
import { formatDate, bnNum } from './format';

interface Props {
  docs: Doc[];
  trash: Doc[];
  currentId: string | null;
  view: 'docs' | 'trash';
  setView: (v: 'docs' | 'trash') => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onClose?: () => void;
}

/** Document list (and Trash). */
export function Sidebar(p: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const list = p.view === 'docs' ? p.docs : p.trash;
  return (
    <aside className="side" aria-label="ডকুমেন্টের তালিকা" data-testid="sidebar" data-view={p.view === 'trash' ? 'trash' : undefined}>
      <div className="side-head">
        <button type="button" className="btn primary" data-testid="new-doc" onClick={p.onNew}>+ নতুন ড্রাফট</button>
        {p.onClose && <button type="button" className="btn" aria-label="তালিকা বন্ধ" onClick={p.onClose}>✕</button>}
      </div>
      <div className="seg small" role="group" aria-label="তালিকা">
        <button type="button" aria-pressed={p.view === 'docs'} onClick={() => p.setView('docs')} data-testid="view-docs">ড্রাফট ({bnNum(p.docs.length)})</button>
        <button type="button" aria-pressed={p.view === 'trash'} onClick={() => p.setView('trash')} data-testid="view-trash">ট্র্যাশ ({bnNum(p.trash.length)})</button>
      </div>
      {p.view === 'trash' && <p className="note">ট্র্যাশের ড্রাফট {bnNum(TRASH_DAYS)} দিন পরে নিজে থেকে মুছে যায়।</p>}
      <ul className="docs">
        {list.length === 0 && <li className="empty">{p.view === 'docs' ? 'কোনো ড্রাফট নেই' : 'ট্র্যাশ খালি'}</li>}
        {list.map((d) => (
          <li key={d.id} className={d.id === p.currentId && p.view === 'docs' ? 'cur' : ''} data-testid="doc-row">
            {p.view === 'docs' ? (
              <button type="button" className="doc" onClick={() => p.onOpen(d.id)}>
                <span className="t">{d.title}</span>
                <span className="d">{formatDate(d.updatedAt)}</span>
              </button>
            ) : (
              <div className="doc">
                <span className="t">{d.title}</span>
                <span className="d">আর {bnNum(daysLeft(d))} দিন</span>
              </div>
            )}
            <div className="row-actions">
              {p.view === 'docs' ? (
                <>
                  <button type="button" className="mini" onClick={() => p.onDuplicate(d.id)} data-testid="dup">কপি</button>
                  <button type="button" className="mini" onClick={() => p.onTrash(d.id)} data-testid="trash">ট্র্যাশে</button>
                </>
              ) : (
                <>
                  <button type="button" className="mini" onClick={() => p.onRestore(d.id)} data-testid="restore">ফেরত আনুন</button>
                  {confirmId === d.id ? (
                    <button type="button" className="mini warn" data-testid="delete-confirm" onClick={() => { setConfirmId(null); p.onDeleteForever(d.id); }}>নিশ্চিত, মুছুন</button>
                  ) : (
                    <button type="button" className="mini" data-testid="delete" onClick={() => setConfirmId(d.id)}>স্থায়ীভাবে মুছুন</button>
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
