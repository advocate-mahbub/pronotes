/** Sheets opened from a document's ⋯ menu: information, and earlier versions. */
import { useEffect, useState } from 'react';
import type { Doc, DocKind, Folder, Version } from '../storage';
import { kindOf, listVersions, VERSIONS_KEPT } from '../storage';
import { countText } from '../convert';
import { formatDateTime, useT } from '../i18n';
import { Sheet } from './ui';
import { isEnvelope } from './Sidebar';

export function InfoSheet({ doc, folders, kindLabel, onClose }: { doc: Doc; folders: Folder[]; kindLabel: Record<DocKind, string>; onClose: () => void }) {
  const { t, lang } = useT();
  const [versions, setVersions] = useState<number | null>(null);
  useEffect(() => { listVersions(doc.id).then((v) => setVersions(v.length)).catch(() => setVersions(0)); }, [doc.id]);
  const c = countText(doc.text || '');
  const folder = folders.find((f) => f.id === doc.folderId);
  const row = (k: string, v: React.ReactNode, id?: string) => <tr><th>{t(k)}</th><td data-testid={id}>{v}</td></tr>;
  return (
    <Sheet title={doc.title} onClose={onClose} testid="info-sheet">
      <table className="wc"><tbody>
        {row('ধরন', isEnvelope(doc) ? t('খাম') : t(kindLabel[kindOf(doc)]))}
        {row('ফোল্ডার', folder ? '📁 ' + folder.name : t('কোনো ফোল্ডারে না'))}
        {row('তৈরি', formatDateTime(doc.createdAt, lang), 'info-created')}
        {row('শেষ বদল', formatDateTime(doc.updatedAt, lang))}
        {row('শব্দ', t('{n}', { n: c.words }), 'info-words')}
        {row('অক্ষর (স্পেসসহ)', t('{n}', { n: c.chars }))}
        {row('অনুচ্ছেদ', t('{n}', { n: c.paragraphs }))}
        {row('আগের ভার্সন', versions === null ? '…' : t('{n}', { n: versions }))}
        {row('উপরে আটকানো', doc.pinned ? t('হ্যাঁ') : t('না'))}
      </tbody></table>
    </Sheet>
  );
}

const REASON_LABEL: Record<Version['reason'], string> = { auto: 'নিজে থেকে', manual: 'হাতে রাখা', restore: 'ফেরত আনার আগে' };

export function VersionsSheet({ doc, onClose, onRestore, onSnapshot }: {
  doc: Doc;
  onClose: () => void;
  onRestore: (v: Version) => Promise<void>;
  onSnapshot: () => Promise<void>;
}) {
  const { t, lang } = useT();
  const [list, setList] = useState<Version[] | null>(null);
  const [sel, setSel] = useState<Version | null>(null);
  const [armed, setArmed] = useState(false);
  const load = () => listVersions(doc.id).then((v) => { setList(v); setSel((s) => v.find((x) => x.id === s?.id) ?? v[0] ?? null); });
  useEffect(() => { load(); }, [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet title={t('আগের ভার্সন: {name}', { name: doc.title })} onClose={onClose} testid="versions-sheet"
      footer={
        <>
          <button type="button" className="btn" data-testid="ver-snapshot" onClick={async () => { await onSnapshot(); await load(); }}>{t('এখনই একটা ভার্সন রাখুন')}</button>
          {sel && (armed ? (
            <button type="button" className="btn primary" data-testid="ver-restore-ok" onClick={async () => { setArmed(false); await onRestore(sel); onClose(); }}>{t('নিশ্চিত, এটা ফেরত আনুন')}</button>
          ) : (
            <button type="button" className="btn primary" data-testid="ver-restore" onClick={() => setArmed(true)}>{t('এই ভার্সন ফেরত আনুন')}</button>
          ))}
        </>
      }>
      <p className="note">{t('লেখার সময় প্রতি ১০ মিনিটে আগের অবস্থা নিজে থেকে রাখা হয় (শেষ {n}টা), শুধু এই ডিভাইসে; ব্যাকআপ ফাইলে যায় না। ফেরত আনলে এখনকার অবস্থাও একটা ভার্সন হিসেবে থেকে যায়।', { n: VERSIONS_KEPT })}</p>
      {list && list.length === 0 && <p data-testid="ver-empty">{t('এখনো কোনো আগের ভার্সন নেই।')}</p>}
      {list && list.length > 0 && (
        <div className="versions">
          <ul data-testid="ver-list">
            {list.map((v) => (
              <li key={v.id}>
                <button type="button" aria-pressed={sel?.id === v.id} data-testid="ver-item" onClick={() => { setSel(v); setArmed(false); }}>
                  <b>{formatDateTime(v.at, lang)}</b>
                  <small>{t(REASON_LABEL[v.reason])} · {t('{n} শব্দ', { n: countText(v.text).words })}</small>
                </button>
              </li>
            ))}
          </ul>
          <pre className="ver-preview" data-testid="ver-preview">{sel?.text ?? ''}</pre>
        </div>
      )}
    </Sheet>
  );
}
