/**
 * Local database (IndexedDB). Everything stays on this device.
 * Stores: docs (drafts, including Trash), meta (word bank, custom layouts, folders, …), fonts (v2)
 * and versions (v3: automatic snapshots of drafts, kept on this device only).
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
  /** Kept at the top of the list. */
  pinned?: boolean;
  /** Folder the document is in (missing = no folder). */
  folderId?: string;
}

export interface DictionarySource { id: string; title: string; author?: string; publisher?: string; year?: number; jurisdiction?: string; importedAt: number; }
export interface DictionaryEntry { id: string; title: string; normalizedTitle: string; language: 'en' | 'bn'; partOfSpeech?: string; pronunciation?: string; sourceId?: string; sourcePages?: number[]; jurisdiction?: string; verificationStatus: 'machine_unverified' | 'user_reviewed'; createdAt: number; updatedAt: number; }
export interface DictionarySense { id: string; entryId: string; definition: string; senseNumber?: number; subject?: string; sourcePage?: number; /** All PDF pages associated with the source entry; sourcePage remains for older records. */ sourcePages?: number[]; verificationStatus: 'machine_unverified' | 'user_reviewed'; }
export interface DictionaryEquivalent { id: string; entryId: string; /** Optional: scope a translation to one particular legal sense. */ senseId?: string; language: 'en' | 'bn'; text: string; normalizedText: string; kind: 'translation' | 'synonym' | 'near_equivalent'; note?: string; reviewStatus?: 'draft' | 'reviewed' | 'verified'; verificationEvidence?: { note: string; reviewer: string; authority: string; verifiedAt: number }; createdAt: number; updatedAt?: number; }
export interface DictionaryRelation { id: string; fromEntryId: string; toEntryId: string; type: 'see' | 'see_also' | 'compare' | 'related'; }

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

/** A saved earlier state of a document. */
export interface Version {
  id: string;
  docId: string;
  at: number;
  title: string;
  content: JSONContent;
  text: string;
  /** 'auto' = timed snapshot, 'restore' = taken just before an older version was brought back, 'manual' */
  reason: 'auto' | 'restore' | 'manual';
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
  versions: { key: string; value: Version; indexes: { docId: string } };
  dictionarySources: { key: string; value: DictionarySource };
  dictionaryEntries: { key: string; value: DictionaryEntry; indexes: { language: string; normalizedTitle: string; sourceId: string } };
  dictionarySenses: { key: string; value: DictionarySense; indexes: { entryId: string } };
  dictionaryEquivalents: { key: string; value: DictionaryEquivalent; indexes: { entryId: string; language: string; normalizedText: string } };
  dictionaryRelations: { key: string; value: DictionaryRelation; indexes: { fromEntryId: string; toEntryId: string } };
}

export const DB_NAME = 'pronotes';
export const TRASH_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
export function db(): Promise<IDBPDatabase<Schema>> {
  if (!dbp) {
    dbp = openDB<Schema>(DB_NAME, 4, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          const docs = d.createObjectStore('docs', { keyPath: 'id' });
          docs.createIndex('updatedAt', 'updatedAt');
          d.createObjectStore('meta');
        }
        if (oldVersion < 2) d.createObjectStore('fonts', { keyPath: 'id' });
        if (oldVersion < 3) d.createObjectStore('versions', { keyPath: 'id' }).createIndex('docId', 'docId');
        if (oldVersion < 4) {
          d.createObjectStore('dictionarySources', { keyPath: 'id' });
          const entries = d.createObjectStore('dictionaryEntries', { keyPath: 'id' });
          entries.createIndex('language', 'language'); entries.createIndex('normalizedTitle', 'normalizedTitle'); entries.createIndex('sourceId', 'sourceId');
          const senses = d.createObjectStore('dictionarySenses', { keyPath: 'id' }); senses.createIndex('entryId', 'entryId');
          const equivalents = d.createObjectStore('dictionaryEquivalents', { keyPath: 'id' });
          equivalents.createIndex('entryId', 'entryId'); equivalents.createIndex('language', 'language'); equivalents.createIndex('normalizedText', 'normalizedText');
          const relations = d.createObjectStore('dictionaryRelations', { keyPath: 'id' });
          relations.createIndex('fromEntryId', 'fromEntryId'); relations.createIndex('toEntryId', 'toEntryId');
        }
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
  await autoSnapshot(id, content, now);
  await update(id, (d) => ({ ...d, content, text, updatedAt: now }));
}

export async function renameDoc(id: string, title: string, now = Date.now()): Promise<void> {
  await update(id, (d) => ({ ...d, title: title.trim() || 'নামহীন ড্রাফট', updatedAt: now }));
}

export async function duplicateDoc(id: string, now = Date.now()): Promise<Doc | undefined> {
  const d = await getDoc(id);
  if (!d) return;
  const c = await createDoc(d.title + ' (কপি)', structuredClone(d.content), d.text, now, kindOf(d));
  const extra: Partial<Doc> = {};
  if (d.page) extra.page = structuredClone(d.page);
  if (d.folderId) extra.folderId = d.folderId;
  if (Object.keys(extra).length) await update(c.id, (x) => ({ ...x, ...extra }));
  return { ...c, ...extra };
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
  await deleteVersions(id);
  return true;
}

/** Remove documents that have been in Trash longer than TRASH_DAYS. Returns how many. */
export async function purgeExpired(now = Date.now()): Promise<number> {
  const trash = await listDocs({ trash: true });
  const old = trash.filter((d) => now - (d.deletedAt as number) > TRASH_DAYS * DAY);
  const tx = (await db()).transaction('docs', 'readwrite');
  await Promise.all([...old.map((d) => tx.store.delete(d.id)), tx.done]);
  for (const d of old) await deleteVersions(d.id);
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

/* ---------- pin and folders ---------- */

export async function setPinned(id: string, pinned: boolean): Promise<void> {
  // not a content change: updatedAt stays, so the list order by date does not jump
  await update(id, (d) => ({ ...d, pinned: pinned || undefined }));
}

/** Move documents into a folder ('' = out of any folder). */
export async function moveToFolder(ids: string[], folderId: string): Promise<void> {
  for (const id of ids) await update(id, (d) => ({ ...d, folderId: folderId || undefined }));
}

export const loadFolders = async (): Promise<Folder[]> => {
  const v = await getMeta<Folder[]>('folders');
  return Array.isArray(v) ? v : [];
};
const saveFolders = (f: Folder[]) => setMeta('folders', f);

export async function createFolder(name: string, now = Date.now()): Promise<Folder> {
  const f: Folder = { id: newId(), name: name.trim() || 'নতুন ফোল্ডার', createdAt: now };
  await saveFolders([...(await loadFolders()), f]);
  return f;
}
export async function renameFolder(id: string, name: string): Promise<void> {
  await saveFolders((await loadFolders()).map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)));
}
/** Delete a folder. Its documents are not deleted: they move out of the folder. */
export async function deleteFolder(id: string): Promise<number> {
  await saveFolders((await loadFolders()).filter((f) => f.id !== id));
  const inside = (await (await db()).getAll('docs')).filter((d) => d.folderId === id);
  await moveToFolder(inside.map((d) => d.id), '');
  return inside.length;
}

/* ---------- versions (automatic snapshots) ---------- */

/** A new snapshot at most this often while typing. */
export const VERSION_EVERY = 10 * 60 * 1000;
/** Snapshots kept per document (oldest dropped first). */
export const VERSIONS_KEPT = 30;

export async function listVersions(docId: string): Promise<Version[]> {
  const all = await (await db()).getAllFromIndex('versions', 'docId', docId);
  return all.sort((a, b) => b.at - a.at);
}

async function deleteVersions(docId: string): Promise<void> {
  const d = await db();
  for (const v of await d.getAllFromIndex('versions', 'docId', docId)) await d.delete('versions', v.id);
}

async function addVersion(doc: Doc, reason: Version['reason'], now: number): Promise<Version> {
  const d = await db();
  const v: Version = { id: newId(), docId: doc.id, at: now, title: doc.title, content: structuredClone(doc.content), text: doc.text, reason };
  await d.put('versions', v);
  const all = await listVersions(doc.id);
  for (const old of all.slice(VERSIONS_KEPT)) await d.delete('versions', old.id);
  return v;
}

/**
 * Before a save, keep the state being replaced when the last snapshot is older than VERSION_EVERY
 * and the content really changes. So a version exists from before every working session.
 */
async function autoSnapshot(id: string, next: JSONContent, now: number): Promise<void> {
  const doc = await getDoc(id);
  if (!doc || JSON.stringify(doc.content) === JSON.stringify(next)) return;
  if (!doc.text.trim() && JSON.stringify(doc.content) === JSON.stringify(EMPTY_DOC)) return;
  const last = (await listVersions(id))[0];
  if (last && now - last.at < VERSION_EVERY) return;
  if (last && JSON.stringify(last.content) === JSON.stringify(doc.content)) return;
  await addVersion(doc, 'auto', now);
}

/** Keep the current state now (button "এখনই একটা ভার্সন রাখুন"). */
export async function snapshotNow(id: string, now = Date.now()): Promise<Version | undefined> {
  const doc = await getDoc(id);
  if (!doc) return;
  return addVersion(doc, 'manual', now);
}

/** Bring an older version back. The current state is kept as a version first, so this can be undone. */
export async function restoreVersion(versionId: string, now = Date.now()): Promise<Doc | undefined> {
  const d = await db();
  const v = await d.get('versions', versionId);
  if (!v) return;
  const doc = await getDoc(v.docId);
  if (!doc) return;
  await addVersion(doc, 'restore', now);
  await update(v.docId, (x) => ({ ...x, content: structuredClone(v.content), text: v.text, updatedAt: now }));
  return getDoc(v.docId);
}


const normDictionaryText = (value: string) => value.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
export async function countDictionaryEntries(language: 'en' | 'bn' = 'en'): Promise<number> {
  return (await (await db()).getAllFromIndex('dictionaryEntries', 'language', language)).length;
}
export async function searchDictionary(query: string, language: 'en' | 'bn' = 'en', limit = 60): Promise<DictionaryEntry[]> {
  const q = normDictionaryText(query); if (!q) return [];
  const database = await db();
  // Fast path for the common autocomplete case: use the normalizedTitle index.
  const prefix = await database.getAllFromIndex('dictionaryEntries', 'normalizedTitle', IDBKeyRange.bound(q, q + '\uffff'));
  const prefixMatches = prefix.filter((entry) => entry.language === language);
  if (prefixMatches.length >= limit) return prefixMatches.sort((a, b) => a.title.localeCompare(b.title)).slice(0, limit);
  // Preserve substring search for users who remember only a middle part of a term.
  const all = await database.getAllFromIndex('dictionaryEntries', 'language', language);
  const seen = new Set(prefixMatches.map((entry) => entry.id));
  const matches = [...prefixMatches, ...all.filter((entry) => !seen.has(entry.id) && entry.normalizedTitle.includes(q))];
  return matches.sort((a, b) => a.title.localeCompare(b.title)).slice(0, limit);
}
export async function getDictionarySenses(entryId: string): Promise<DictionarySense[]> {
  return (await db()).getAllFromIndex('dictionarySenses', 'entryId', entryId);
}
export async function getDictionaryEquivalents(entryId: string): Promise<DictionaryEquivalent[]> {
  return (await db()).getAllFromIndex('dictionaryEquivalents', 'entryId', entryId);
}
export async function addDictionaryTranslation(entryId: string, text: string, note = '', senseId?: string): Promise<void> {
  const value = text.trim(); if (!value) return;
  const entry = await (await db()).get('dictionaryEntries', entryId); if (!entry) throw new Error('Dictionary entry not found');
  const normalizedText = normDictionaryText(value);
  const existing = await (await db()).getAllFromIndex('dictionaryEquivalents', 'entryId', entryId);
  if (existing.some((item) => item.language === 'bn' && item.normalizedText === normalizedText && item.senseId === senseId)) return;
  if (senseId) { const sense = await (await db()).get('dictionarySenses', senseId); if (!sense || sense.entryId !== entryId) throw new Error('Sense does not belong to this entry'); }
  await (await db()).put('dictionaryEquivalents', { id: newId(), entryId, senseId, language: 'bn', text: value, normalizedText, kind: 'translation', note: note.trim() || undefined, reviewStatus: 'draft', createdAt: Date.now(), updatedAt: Date.now() });
}

export async function setDictionaryEquivalentReviewStatus(
  id: string,
  reviewStatus: DictionaryEquivalent['reviewStatus'],
  evidence?: { note: string; reviewer: string; authority: string },
): Promise<void> {
  const database = await db();
  const current = await database.get('dictionaryEquivalents', id);
  if (!current) throw new Error('Translation not found');
  if (reviewStatus === 'verified') {
    const note = evidence?.note.trim();
    const reviewer = evidence?.reviewer.trim();
    const authority = evidence?.authority.trim();
    if (!note || !reviewer || !authority) throw new Error('Verified status requires a reviewer, verification note, and cited authority.');
    await database.put('dictionaryEquivalents', { ...current, reviewStatus, verificationEvidence: { note, reviewer, authority, verifiedAt: Date.now() }, updatedAt: Date.now() });
    return;
  }
  await database.put('dictionaryEquivalents', { ...current, reviewStatus, ...(reviewStatus === 'draft' ? { verificationEvidence: undefined } : {}), updatedAt: Date.now() });
}

/** Search Bengali user headwords and Bengali equivalents attached to English entries. */
export async function searchBanglaDictionary(query: string, limit = 60): Promise<DictionaryEntry[]> {
  const q = normDictionaryText(query);
  if (!q) return [];
  const database = await db();
  const direct = await searchDictionary(q, 'bn', limit);
  const equivalents = await database.getAllFromIndex('dictionaryEquivalents', 'language', 'bn');
  const ranked = equivalents.filter((item) => item.normalizedText.includes(q))
    .sort((a, b) => Number(b.normalizedText.startsWith(q)) - Number(a.normalizedText.startsWith(q)));
  const seen = new Set(direct.map((entry) => entry.id));
  const results = [...direct];
  for (const item of ranked) {
    if (results.length >= limit) break;
    if (seen.has(item.entryId)) continue;
    const entry = await database.get('dictionaryEntries', item.entryId);
    if (entry) { seen.add(entry.id); results.push(entry); }
  }
  return results.slice(0, limit);
}

/** Add a user-authored Bengali lemma without changing the Oxford source records. */
export async function createBanglaDictionaryEntry(title: string, definition = ''): Promise<DictionaryEntry> {
  const clean = title.trim();
  if (!clean) throw new Error('বাংলা headword লিখুন');
  const database = await db();
  const normalizedTitle = normDictionaryText(clean);
  const matches = await database.getAllFromIndex('dictionaryEntries', 'normalizedTitle', normalizedTitle);
  if (matches.some((item) => item.language === 'bn')) throw new Error('এই বাংলা headword আগে থেকেই রয়েছে');
  const now = Date.now();
  const entry: DictionaryEntry = { id: newId(), title: clean, normalizedTitle, language: 'bn', jurisdiction: 'Bangladesh (user-authored; not legally verified)', verificationStatus: 'user_reviewed', createdAt: now, updatedAt: now };
  const tx = database.transaction(['dictionaryEntries', 'dictionarySenses'], 'readwrite');
  await tx.objectStore('dictionaryEntries').add(entry);
  if (definition.trim()) await tx.objectStore('dictionarySenses').add({ id: newId(), entryId: entry.id, definition: definition.trim(), verificationStatus: 'user_reviewed' });
  await tx.done;
  return entry;
}

/** Link an English term to a Bengali lemma, preserving both entries and preventing duplicate links. */
export async function linkDictionaryEquivalent(entryId: string, equivalentId: string, type: DictionaryRelation['type'] = 'related'): Promise<void> {
  if (entryId === equivalentId) throw new Error('Cannot link an entry to itself');
  const database = await db();
  const [entry, equivalent] = await Promise.all([database.get('dictionaryEntries', entryId), database.get('dictionaryEntries', equivalentId)]);
  if (!entry || !equivalent || entry.language === equivalent.language) throw new Error('Choose existing English and Bengali entries');
  const existing = await database.getAllFromIndex('dictionaryRelations', 'fromEntryId', entryId);
  if (existing.some((relation) => relation.toEntryId === equivalentId && relation.type === type)) return;
  await database.put('dictionaryRelations', { id: newId(), fromEntryId: entryId, toEntryId: equivalentId, type });
}

export async function getDictionaryLinkedEntries(entryId: string): Promise<DictionaryEntry[]> {
  const database = await db();
  const [outgoing, incoming] = await Promise.all([
    database.getAllFromIndex('dictionaryRelations', 'fromEntryId', entryId),
    database.getAllFromIndex('dictionaryRelations', 'toEntryId', entryId),
  ]);
  const ids = [...new Set([...outgoing.map((item) => item.toEntryId), ...incoming.map((item) => item.fromEntryId)])];
  return (await Promise.all(ids.map((id) => database.get('dictionaryEntries', id)))).filter((entry): entry is DictionaryEntry => Boolean(entry));
}

export async function addDictionaryEquivalent(entryId: string, text: string, language: 'en' | 'bn', note = ''): Promise<void> {
  const value = text.trim(); if (!value) return;
  const database = await db();
  const entry = await database.get('dictionaryEntries', entryId);
  if (!entry || entry.language === language) throw new Error('Equivalent must be in the other language');
  const normalizedText = normDictionaryText(value);
  const existing = await database.getAllFromIndex('dictionaryEquivalents', 'entryId', entryId);
  if (existing.some((item) => item.language === language && item.normalizedText === normalizedText)) return;
  await database.put('dictionaryEquivalents', { id: newId(), entryId, language, text: value, normalizedText, kind: 'translation', note: note.trim() || undefined, createdAt: Date.now(), updatedAt: Date.now() });
}

export async function updateDictionaryEquivalent(id: string, text: string, note?: string): Promise<void> {
  const value = text.trim(); if (!value) throw new Error('Translation cannot be empty');
  const database = await db(); const current = await database.get('dictionaryEquivalents', id);
  if (!current) throw new Error('Translation not found');
  const normalizedText = normDictionaryText(value);
  const siblings = await database.getAllFromIndex('dictionaryEquivalents', 'entryId', current.entryId);
  if (siblings.some((item) => item.id !== id && item.language === current.language && item.senseId === current.senseId && item.normalizedText === normalizedText)) throw new Error('This equivalent already exists');
  await database.put('dictionaryEquivalents', { ...current, text: value, normalizedText, ...(note === undefined ? {} : { note: note.trim() || undefined }), updatedAt: Date.now() });
}

export async function deleteDictionaryEquivalent(id: string): Promise<void> {
  await (await db()).delete('dictionaryEquivalents', id);
}

export async function addDictionarySense(entryId: string, definition: string, subject = ''): Promise<DictionarySense> {
  const clean = definition.trim(); if (!clean) throw new Error('Sense definition cannot be empty');
  const database = await db(); if (!await database.get('dictionaryEntries', entryId)) throw new Error('Dictionary entry not found');
  const existing = await database.getAllFromIndex('dictionarySenses', 'entryId', entryId);
  const sense: DictionarySense = { id: newId(), entryId, definition: clean, senseNumber: existing.length + 1, subject: subject.trim() || undefined, verificationStatus: 'user_reviewed' };
  await database.put('dictionarySenses', sense); return sense;
}

/** Update a sense without changing its stable identity or source provenance. */
export async function updateDictionarySense(id: string, definition: string, subject?: string): Promise<void> {
  const clean = definition.trim(); if (!clean) throw new Error('Sense definition cannot be empty');
  const database = await db(); const current = await database.get('dictionarySenses', id);
  if (!current) throw new Error('Sense not found');
  await database.put('dictionarySenses', { ...current, definition: clean, ...(subject === undefined ? {} : { subject: subject.trim() || undefined }) });
}

/** Delete a sense and its sense-scoped translations atomically; general translations remain. */
export async function deleteDictionarySense(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['dictionarySenses', 'dictionaryEquivalents'], 'readwrite');
  const sense = await tx.objectStore('dictionarySenses').get(id);
  if (!sense) { await tx.done; return; }
  const equivalents = await tx.objectStore('dictionaryEquivalents').index('entryId').getAll(sense.entryId);
  for (const item of equivalents) if (item.senseId === id) await tx.objectStore('dictionaryEquivalents').delete(item.id);
  await tx.objectStore('dictionarySenses').delete(id);
  await tx.done;
}

/** Return duplicate headword groups for review; never merges or deletes user data. */
export async function findDictionaryDuplicateGroups(language?: 'en' | 'bn'): Promise<DictionaryEntry[][]> {
  const database = await db();
  const entries = language ? await database.getAllFromIndex('dictionaryEntries', 'language', language) : await database.getAll('dictionaryEntries');
  const groups = new Map<string, DictionaryEntry[]>();
  for (const entry of entries) {
    const key = `${entry.language}:${entry.normalizedTitle || normDictionaryText(entry.title)}`;
    const group = groups.get(key) || []; group.push(entry); groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.length > 1).sort((a, b) => a[0].title.localeCompare(b[0].title));
}

export async function importOxfordDictionaryJsonl(
  file: File,
  options: { sensesFile?: File; crossReferencesFile?: File; signal?: AbortSignal; onProgress?: (progress: { processed: number; total: number; imported: number; skipped: number }) => void; batchSize?: number } = {},
): Promise<{ imported: number; skipped: number; sensesImported: number; relationsImported: number; unresolvedRelations: number; cancelled: boolean }> {
  const sourceId = 'oxford-dictionary-of-law-5e-2002';
  const database = await db();
  const source: DictionarySource = { id: sourceId, title: 'A Dictionary of Law', author: 'Elizabeth A. Martin', publisher: 'Oxford University Press', year: 2002, jurisdiction: 'Primarily United Kingdom; source context must be retained', importedAt: Date.now() };
  const lines = (await file.text()).split(/\r?\n/).filter(Boolean);
  const batchSize = Math.max(10, Math.min(500, options.batchSize ?? 100));
  let imported = 0, skipped = 0, processed = 0, cancelled = false;
  for (let offset = 0; offset < lines.length; offset += batchSize) {
    if (options.signal?.aborted) { cancelled = true; break; }
    const tx = database.transaction(options.sensesFile ? ['dictionarySources', 'dictionaryEntries'] : ['dictionarySources', 'dictionaryEntries', 'dictionarySenses'], 'readwrite');
    await tx.objectStore('dictionarySources').put(source);
    for (const line of lines.slice(offset, offset + batchSize)) {
      if (options.signal?.aborted) { cancelled = true; break; }
      try {
        const item = JSON.parse(line) as { id: string; title: string; content: string; language?: string; source?: { pdf_pages?: number[] }; metadata?: { part_of_speech_candidate?: string }; jurisdiction_context?: string };
        if (!item.id || !item.title || !item.content || (item.language && item.language !== 'en')) { skipped++; continue; }
        const existing = await tx.objectStore('dictionaryEntries').get(item.id); if (existing) { skipped++; continue; }
        await tx.objectStore('dictionaryEntries').put({ id: item.id, title: item.title, normalizedTitle: normDictionaryText(item.title), language: 'en', partOfSpeech: item.metadata?.part_of_speech_candidate, sourceId, sourcePages: item.source?.pdf_pages, jurisdiction: item.jurisdiction_context, verificationStatus: 'machine_unverified', createdAt: Date.now(), updatedAt: Date.now() });
        if (!options.sensesFile) await tx.objectStore('dictionarySenses').put({ id: `${item.id}-source`, entryId: item.id, definition: item.content, verificationStatus: 'machine_unverified', sourcePage: item.source?.pdf_pages?.[0] });
        imported++;
      } catch { skipped++; }
      finally { processed++; }
    }
    await tx.done;
    options.onProgress?.({ processed, total: lines.length, imported, skipped });
    if (cancelled) break;
  }

  // Structured sense segmentation is imported separately from headwords. It is never
  // treated as legally verified; the extraction status remains machine-unverified.
  let sensesImported = 0;
  if (!cancelled && options.sensesFile) {
    const senseLines = (await options.sensesFile.text()).split(/\r?\n/).filter(Boolean);
    for (let offset = 0; offset < senseLines.length; offset += batchSize) {
      if (options.signal?.aborted) { cancelled = true; break; }
      const tx = database.transaction(['dictionaryEntries', 'dictionarySenses'], 'readwrite');
      for (const line of senseLines.slice(offset, offset + batchSize)) {
        try {
          const item = JSON.parse(line) as { entry_id: string; sense_id: string; sense_number?: number | null; sense_text: string; status?: string };
          if (!item.entry_id || !item.sense_id || !item.sense_text?.trim()) continue;
          const entry = await tx.objectStore('dictionaryEntries').get(item.entry_id);
          if (!entry) continue;
          const existing = await tx.objectStore('dictionarySenses').get(item.sense_id);
          if (existing) continue;
          const legacyPlaceholder = await tx.objectStore('dictionarySenses').get(`${item.entry_id}-source`);
          if (legacyPlaceholder?.verificationStatus === 'machine_unverified') await tx.objectStore('dictionarySenses').delete(`${item.entry_id}-source`);
          await tx.objectStore('dictionarySenses').put({ id: item.sense_id, entryId: item.entry_id, definition: item.sense_text.trim(), senseNumber: typeof item.sense_number === 'number' ? item.sense_number : undefined, sourcePage: entry.sourcePages?.[0], sourcePages: entry.sourcePages, verificationStatus: 'machine_unverified' });
          sensesImported++;
        } catch { /* malformed line is safely ignored */ }
      }
      await tx.done;
    }
  }

  let relationsImported = 0, unresolvedRelations = 0;
  if (!cancelled && options.crossReferencesFile) {
    const relationLines = (await options.crossReferencesFile.text()).split(/\r?\n/).filter(Boolean);
    for (let offset = 0; offset < relationLines.length; offset += batchSize) {
      if (options.signal?.aborted) { cancelled = true; break; }
      const tx = database.transaction(['dictionaryEntries', 'dictionaryRelations'], 'readwrite');
      for (const line of relationLines.slice(offset, offset + batchSize)) {
        try {
          const item = JSON.parse(line) as { entry_id: string; relation: string; targets?: Array<{ text: string; matched_entry_ids?: string[]; match_status?: string }> };
          if (!item.entry_id || !await tx.objectStore('dictionaryEntries').get(item.entry_id)) continue;
          for (let index = 0; index < (item.targets ?? []).length; index++) {
            const target = item.targets![index];
            if (target.match_status !== 'exact_unique' || target.matched_entry_ids?.length !== 1) { unresolvedRelations++; continue; }
            const toEntryId = target.matched_entry_ids[0];
            if (!await tx.objectStore('dictionaryEntries').get(toEntryId)) { unresolvedRelations++; continue; }
            const type: DictionaryRelation['type'] = /also/i.test(item.relation) ? 'see_also' : /^see$/i.test(item.relation) ? 'see' : /^compare$/i.test(item.relation) ? 'compare' : 'related';
            const id = `oxlaw-rel-${item.entry_id}-${index}-${toEntryId}`;
            if (!await tx.objectStore('dictionaryRelations').get(id)) {
              await tx.objectStore('dictionaryRelations').put({ id, fromEntryId: item.entry_id, toEntryId, type });
              relationsImported++;
            }
          }
        } catch { /* malformed line is safely ignored */ }
      }
      await tx.done;
    }
  }
  return { imported, skipped, sensesImported, relationsImported, unresolvedRelations, cancelled };
}
