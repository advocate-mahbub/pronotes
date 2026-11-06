/**
 * Full backup: every document (Trash included), the word bank and settings in one JSON file.
 * Restore never overwrites silently: a document that already exists with different content
 * comes back as a separate copy.
 */
import { db, getMeta, setMeta, type Doc } from './db';
import { emptyBank, type WordBank } from '../suggest';
import { fixNukta } from '../bornona-engine';

export interface BackupFile {
  app: 'pronotes';
  version: 1;
  exportedAt: string;
  docs: Doc[];
  wordBank: WordBank;
  prefs: Record<string, unknown>;
}

export async function exportAll(prefs: Record<string, unknown>, now = new Date()): Promise<BackupFile> {
  const docs = await (await db()).getAll('docs');
  const wordBank = (await getMeta<WordBank>('wordBank')) ?? emptyBank();
  return { app: 'pronotes', version: 1, exportedAt: now.toISOString(), docs, wordBank, prefs };
}

export function backupFileName(now = new Date()): string {
  return 'pronotes-backup-' + now.toISOString().slice(0, 10) + '.json';
}

export interface RestoreResult {
  added: number;
  copies: number;
  unchanged: number;
  words: number;
  prefs: Record<string, unknown>;
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const same = (a: Doc, b: Doc) => a.updatedAt === b.updatedAt && JSON.stringify(a.content) === JSON.stringify(b.content) && a.title === b.title;

/** Word counts: keep the larger count, so restoring the same backup twice does not inflate them. */
function mergeBankMax(into: WordBank, from: WordBank): number {
  let added = 0;
  for (const w in from.w || {}) {
    const k = fixNukta(w);
    if (!into.w[k]) added++;
    into.w[k] = Math.max(into.w[k] || 0, Number(from.w[w]) || 0);
  }
  for (const p in from.b || {}) {
    const m = into.b[fixNukta(p)] || (into.b[fixNukta(p)] = {});
    for (const w in from.b[p]) m[fixNukta(w)] = Math.max(m[fixNukta(w)] || 0, Number(from.b[p][w]) || 0);
  }
  return added;
}

export function parseBackup(json: string): BackupFile {
  const f = JSON.parse(json);
  if (!f || f.app !== 'pronotes' || f.version !== 1 || !Array.isArray(f.docs)) throw new Error('not a ProNotes backup');
  return f as BackupFile;
}

export async function restoreAll(f: BackupFile): Promise<RestoreResult> {
  const d = await db();
  const r: RestoreResult = { added: 0, copies: 0, unchanged: 0, words: 0, prefs: f.prefs || {} };
  for (const raw of f.docs) {
    const doc: Doc = { ...raw, title: fixNukta(raw.title), text: fixNukta(raw.text || ''), content: JSON.parse(fixNukta(JSON.stringify(raw.content))) };
    const existing = await d.get('docs', doc.id);
    if (!existing) {
      await d.put('docs', doc);
      r.added++;
    } else if (same(existing, doc)) {
      r.unchanged++;
    } else {
      await d.put('docs', { ...doc, id: newId(), title: doc.title + ' (ব্যাকআপ থেকে)' });
      r.copies++;
    }
  }
  const bank = (await getMeta<WordBank>('wordBank')) ?? emptyBank();
  r.words = mergeBankMax(bank, f.wordBank || emptyBank());
  await setMeta('wordBank', bank);
  return r;
}
