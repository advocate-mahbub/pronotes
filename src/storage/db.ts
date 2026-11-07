/**
 * Local database (IndexedDB). Everything stays on this device.
 * Stores: docs (drafts, including Trash), meta (word bank, custom layouts, …) and fonts (v2).
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { JSONContent } from '@tiptap/core';
import type { WordBank } from '../suggest';
import type { Layout } from '../bornona-engine';
import type { PageSetup } from '../docx-export/page';

/** 'note' = free notes, 'legal' = court draft on a page, 'chart' = title chart (v2.2). Missing = 'legal' (drafts made before v2). */
export type DocKind = 'note' | 'legal' | 'chart';
export const kindOf = (d: Pick<Doc, 'kind'>): DocKind => d.kind ?? 'legal';

export interface Doc {
  id: string;
  kind?: DocKind;
  /** Page setup of a legal draft (missing = the app's default page). */
  page?: PageSetup;
  title: string;
  content: JSONContent;
  /** Plain text, kept for search (Phase 2) and backup readability. */
  text: string;
  createdAt: number;
  updatedAt: number;
  /** Set when moved to Trash; null otherwise. */
  deletedAt: number | null;
}

/** A font file the user added (kept only in this browser; never put in backups). */
export interface StoredFont {
  id: string;
  /** Family name from the font file (used on screen and written into .docx). */
  family: string;
  /** File name the user picked. */
  fileName: string;
  /** 'uni' = Unicode Bangla font, 'ansi' = Bijoy/ANSI font (SutonnyMJ etc.). */
  role: 'uni' | 'ansi';
  data: ArrayBuffer;
  addedAt: number;
}

interface Schema extends DBSchema {
  docs: { key: string; value: Doc; indexes: { updatedAt: number } };
  meta: { key: string; value: unknown };
  fonts: { key: string; value: StoredFont };
}

export const DB_NAME = 'pronotes';
export const TRASH_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
export function db(): Promise<IDBPDatabase<Schema>> {
  if (!dbp) {
    dbp = openDB<Schema>(DB_NAME, 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          const docs = d.createObjectStore('docs', { keyPath: 'id' });
          docs.createIndex('updatedAt', 'updatedAt');
          d.createObjectStore('meta');
        }
        if (oldVersion < 2) d.createObjectStore('fonts', { keyPath: 'id' });
      },
    });
  }
  return dbp;
}
/** For tests: forget the open connection. */
export function resetDbForTests(): void {
  dbp = null;
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

/** Ask the browser not to evict our data (best effort; Safari may still decide). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function listDocs(opts: { trash?: boolean } = {}): Promise<Doc[]> {
  const all = await (await db()).getAll('docs');
  return all.filter((d) => (opts.trash ? d.deletedAt !== null : d.deletedAt === null)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDoc(id: string): Promise<Doc | undefined> {
  return (await db()).get('docs', id);
}

export async function createDoc(title = 'নতুন ড্রাফট', content: JSONContent = EMPTY_DOC, text = '', now = Date.now(), kind: DocKind = 'legal'): Promise<Doc> {
  const d: Doc = { id: newId(), kind, title, content, text, createdAt: now, updatedAt: now, deletedAt: null };
  await (await db()).put('docs', d);
  return d;
}

/** Read-modify-write in one transaction, so concurrent saves (content, title, trash) never undo each other. */
async function update(id: string, fn: (d: Doc) => Doc): Promise<boolean> {
  const tx = (await db()).transaction('docs', 'readwrite');
  const d = await tx.store.get(id);
  if (d) await tx.store.put(fn(d));
  await tx.done;
  return Boolean(d);
}

export async function saveContent(id: string, content: JSONContent, text: string, now = Date.now()): Promise<void> {
  await update(id, (d) => ({ ...d, content, text, updatedAt: now }));
}

export async function renameDoc(id: string, title: string, now = Date.now()): Promise<void> {
  await update(id, (d) => ({ ...d, title: title.trim() || 'নামহীন ড্রাফট', updatedAt: now }));
}

export async function duplicateDoc(id: string, now = Date.now()): Promise<Doc | undefined> {
  const d = await getDoc(id);
  if (!d) return;
  const c = await createDoc(d.title + ' (কপি)', structuredClone(d.content), d.text, now, kindOf(d));
  if (d.page) await setDocPage(c.id, structuredClone(d.page), now);
  return d.page ? { ...c, page: d.page } : c;
}

export async function setDocKind(id: string, kind: DocKind, now = Date.now()): Promise<void> {
  await update(id, (d) => ({ ...d, kind, updatedAt: now }));
}

export async function setDocPage(id: string, page: PageSetup, now = Date.now()): Promise<void> {
  await update(id, (d) => ({ ...d, page, updatedAt: now }));
}

export async function trashDoc(id: string, now = Date.now()): Promise<void> {
  await update(id, (d) => ({ ...d, deletedAt: now }));
}

export async function restoreDoc(id: string): Promise<void> {
  await update(id, (d) => ({ ...d, deletedAt: null }));
}

/** Permanently delete. Only documents already in Trash can be deleted. */
export async function deleteForever(id: string): Promise<boolean> {
  const d = await getDoc(id);
  if (!d || d.deletedAt === null) return false;
  await (await db()).delete('docs', id);
  return true;
}

/** Remove documents that have been in Trash longer than TRASH_DAYS. Returns how many. */
export async function purgeExpired(now = Date.now()): Promise<number> {
  const trash = await listDocs({ trash: true });
  const old = trash.filter((d) => now - (d.deletedAt as number) > TRASH_DAYS * DAY);
  const tx = (await db()).transaction('docs', 'readwrite');
  await Promise.all([...old.map((d) => tx.store.delete(d.id)), tx.done]);
  return old.length;
}

/** Days left before a trashed document is removed. */
export function daysLeft(d: Doc, now = Date.now()): number {
  return d.deletedAt === null ? TRASH_DAYS : Math.max(0, Math.ceil((d.deletedAt + TRASH_DAYS * DAY - now) / DAY));
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('meta', key)) as T | undefined;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
}

export const loadBank = () => getMeta<WordBank>('wordBank');
export const saveBank = (b: WordBank) => setMeta('wordBank', b);

export const listFonts = async (): Promise<StoredFont[]> => (await (await db()).getAll('fonts')).sort((a, b) => a.addedAt - b.addedAt);
export const putFont = async (f: StoredFont): Promise<void> => {
  await (await db()).put('fonts', f);
};
export const removeFont = async (id: string): Promise<void> => {
  await (await db()).delete('fonts', id);
};

/** Custom .avrolayout layouts the user added. */
export const loadLayouts = async (): Promise<Layout[]> => {
  const v = await getMeta<Layout[]>('layouts');
  return Array.isArray(v) ? v : [];
};
export const saveLayouts = (l: Layout[]) => setMeta('layouts', l);

/** Voice corrections ("ভুল = ঠিক" lines) travel with the word bank, as in v8. */
export const loadCorrections = async (): Promise<string> => (await getMeta<string>('corrections')) ?? '';
export const saveCorrections = (s: string) => setMeta('corrections', s);

/**
 * AI assistant: the user's Gemini key and the extra words to hide. Device only: not in backups
 * (a backup file may be shared or kept elsewhere), never sent anywhere except the key to Google.
 */
export const loadAiKey = async (): Promise<string> => (await getMeta<string>('geminiKey')) ?? '';
export const saveAiKey = (k: string) => setMeta('geminiKey', k.trim());
export const loadPrivateWords = async (): Promise<string[]> => {
  const v = await getMeta<string[]>('aiPrivateWords');
  return Array.isArray(v) ? v : [];
};
export const savePrivateWords = (w: string[]) => setMeta('aiPrivateWords', w);
