/**
 * Full backup: every document (Trash included), the word bank and settings in one JSON file.
 * Restore never overwrites silently: a document that already exists with different content
 * comes back as a separate copy.
 * Font files are never included (size, and font licences such as SutonnyMJ's).
 */
import { db, getMeta, setMeta, type Doc, type Folder, type DictionarySource, type DictionaryEntry, type DictionarySense, type DictionaryEquivalent, type DictionaryRelation } from './db';
import { emptyBank, type WordBank } from '../suggest';
import { fixNukta, type Layout } from '../bornona-engine';

export interface BackupFile {
  app: 'pronotes';
  version: 1;
  exportedAt: string;
  docs: Doc[];
  wordBank: WordBank;
  prefs: Record<string, unknown>;
  /** M5+: custom keyboard layouts and voice corrections (optional, older backups lack them). */
  layouts?: Layout[];
  corrections?: string;
  /** v2.0+: folders (documents carry folderId). Versions are not in backups (size). */
  folders?: Folder[];
  /** Only when the owner ticks "Gemini key-ও রাখুন": the key in plain text. */
  aiKey?: string;
  /** v4+: offline legal dictionary data; optional for backward compatibility. */
  dictionary?: { sources: DictionarySource[]; entries: DictionaryEntry[]; senses: DictionarySense[]; equivalents: DictionaryEquivalent[]; relations: DictionaryRelation[] };
}

export async function exportAll(prefs: Record<string, unknown>, now = new Date(), aiKey?: string): Promise<BackupFile> {
  const docs = await (await db()).getAll('docs');
  const wordBank = (await getMeta<WordBank>('wordBank')) ?? emptyBank();
  const layouts = (await getMeta<Layout[]>('layouts')) ?? [];
  const corrections = (await getMeta<string>('corrections')) ?? '';
  const folders = (await getMeta<Folder[]>('folders')) ?? [];
  const database = await db();
  const dictionary = {
    sources: await database.getAll('dictionarySources'),
    entries: await database.getAll('dictionaryEntries'),
    senses: await database.getAll('dictionarySenses'),
    equivalents: await database.getAll('dictionaryEquivalents'),
    relations: await database.getAll('dictionaryRelations'),
  };
  return { app: 'pronotes', version: 1, exportedAt: now.toISOString(), docs, wordBank, prefs, layouts, corrections, folders, dictionary, ...(aiKey ? { aiKey } : {}) };
}

export function backupFileName(now = new Date()): string {
  return 'pronotes-backup-' + now.toISOString().slice(0, 10) + '.json';
}

export interface RestoreResult {
  added: number;
  copies: number;
  unchanged: number;
  words: number;
  dictionaryAdded: number;
  dictionaryUnchanged: number;
  prefs: Record<string, unknown>;
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const same = (a: Doc, b: Doc) => a.updatedAt === b.updatedAt && JSON.stringify(a.content) === JSON.stringify(b.content) && a.title === b.title;

/** Word counts: keep the larger count, so restoring the same backup twice does not inflate them. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const safeEntries = (value: unknown): [string, unknown][] => {
  if (!isRecord(value)) return [];
  return Object.entries(value).filter(([key]) => !DANGEROUS_KEYS.has(key));
};
const safeCount = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Merge untrusted backup word-bank data without mutating prototypes. Malformed nested
 * values are ignored; valid counts are merged by maximum so repeated restores are idempotent.
 */
export function mergeBankMax(into: WordBank, from: WordBank): number {
  if (!isRecord(into) || !isRecord(from)) return 0;
  if (!isRecord(into.w)) into.w = {};
  if (!isRecord(into.b)) into.b = {};
  let added = 0;

  for (const [word, rawCount] of safeEntries(from.w)) {
    const key = fixNukta(word);
    if (!key || DANGEROUS_KEYS.has(key)) continue;
    const current = safeCount(into.w[key]);
    const incoming = safeCount(rawCount);
    if (!Object.prototype.hasOwnProperty.call(into.w, key) && incoming > 0) added++;
    into.w[key] = Math.max(current, incoming);
  }

  for (const [previous, rawNext] of safeEntries(from.b)) {
    const p = fixNukta(previous);
    if (!p || DANGEROUS_KEYS.has(p) || !isRecord(rawNext)) continue;
    let target = into.b[p];
    if (!isRecord(target)) {
      target = {};
      into.b[p] = target;
    }
    for (const [next, rawCount] of safeEntries(rawNext)) {
      const w = fixNukta(next);
      if (!w || DANGEROUS_KEYS.has(w)) continue;
      const current = safeCount(target[w]);
      target[w] = Math.max(current, safeCount(rawCount));
    }
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
  const r: RestoreResult = { added: 0, copies: 0, unchanged: 0, words: 0, dictionaryAdded: 0, dictionaryUnchanged: 0, prefs: f.prefs || {} };
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
  // Dictionary restore is additive and ID-based: never overwrite local records silently.
  if (f.dictionary) {
    const stores = ['dictionarySources', 'dictionaryEntries', 'dictionarySenses', 'dictionaryEquivalents', 'dictionaryRelations'] as const;
    const tx = d.transaction([...stores], 'readwrite');
    const groups = [
      ['dictionarySources', f.dictionary.sources || []],
      ['dictionaryEntries', f.dictionary.entries || []],
      ['dictionarySenses', f.dictionary.senses || []],
      ['dictionaryEquivalents', f.dictionary.equivalents || []],
      ['dictionaryRelations', f.dictionary.relations || []],
    ] as const;
    for (const [storeName, records] of groups) {
      const store = tx.objectStore(storeName);
      for (const record of records) {
        const id = (record as { id: string }).id;
        if (!id) continue;
        const existing = await store.get(id);
        if (existing) r.dictionaryUnchanged++;
        else { await store.put(record as never); r.dictionaryAdded++; }
      }
    }
    await tx.done;
  }
  const bank = (await getMeta<WordBank>('wordBank')) ?? emptyBank();
  r.words = mergeBankMax(bank, f.wordBank || emptyBank());
  await setMeta('wordBank', bank);
  if (Array.isArray(f.layouts) && f.layouts.length) {
    const have = (await getMeta<Layout[]>('layouts')) ?? [];
    for (const l of f.layouts) if (l && l.id && l.map && !have.some((h) => h.id === l.id)) have.push(l);
    await setMeta('layouts', have);
  }
  if (Array.isArray(f.folders) && f.folders.length) {
    const have = (await getMeta<Folder[]>('folders')) ?? [];
    for (const x of f.folders) if (x && x.id && !have.some((h) => h.id === x.id)) have.push({ ...x, name: fixNukta(x.name) });
    await setMeta('folders', have);
  }
  if (f.corrections) await setMeta('corrections', mergeCorrections((await getMeta<string>('corrections')) ?? '', f.corrections));
  return r;
}

/** Add correction lines that are not there yet (nothing is removed). */
export function mergeCorrections(have: string, add: string): string {
  const lines = have.split('\n').filter((l) => l.trim());
  for (const l of fixNukta(add).split('\n')) if (l.trim() && !lines.includes(l)) lines.push(l);
  return lines.join('\n');
}
