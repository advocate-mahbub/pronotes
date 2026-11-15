/**
 * Files saved by the Craft apps (WordCraft, GridCraft, …), kept on this device in their own
 * IndexedDB database. ProNotes' own database ('pronotes': drafts, fonts, versions) is not touched,
 * so its schema and its backups stay exactly as they were.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface CraftFile {
  id: string;
  appId: string;
  /** File name the app gave it, e.g. "আরজি.docx". */
  name: string;
  bytes: ArrayBuffer;
  size: number;
  createdAt: number;
  updatedAt: number;
}
export type CraftFileInfo = Omit<CraftFile, 'bytes'>;

interface Schema extends DBSchema {
  files: { key: string; value: CraftFile; indexes: { appId: string; appName: [string, string] } };
}

export const CRAFT_DB_NAME = 'pronotes-craft';
let dbp: Promise<IDBPDatabase<Schema>> | null = null;
function db() {
  if (!dbp)
    dbp = openDB<Schema>(CRAFT_DB_NAME, 1, {
      upgrade(d) {
        const s = d.createObjectStore('files', { keyPath: 'id' });
        s.createIndex('appId', 'appId');
        s.createIndex('appName', ['appId', 'name']);
      },
    });
  return dbp;
}
/** For tests: forget the open connection. */
export const resetCraftDbForTests = () => { dbp = null; };

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/**
 * Keep a file an app saved. A file with the same app and name is replaced (that is what the
 * app's Save means); a new name makes a new file (Save As, or an export such as PDF).
 */
export async function saveCraftFile(appId: string, name: string, bytes: ArrayBuffer): Promise<CraftFileInfo> {
  const d = await db();
  const tx = d.transaction('files', 'readwrite');
  const old = await tx.store.index('appName').get([appId, name]);
  const now = Date.now();
  const file: CraftFile = { id: old?.id ?? newId(), appId, name, bytes, size: bytes.byteLength, createdAt: old?.createdAt ?? now, updatedAt: now };
  await tx.store.put(file);
  await tx.done;
  const { bytes: _b, ...info } = file;
  return info;
}

/** Saved files of one app (or all apps), newest first, without their contents. */
export async function listCraftFiles(appId?: string): Promise<CraftFileInfo[]> {
  const d = await db();
  const all = appId ? await d.getAllFromIndex('files', 'appId', appId) : await d.getAll('files');
  return all.map(({ bytes: _b, ...info }) => info).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getCraftFile(id: string): Promise<CraftFile | undefined> {
  return (await db()).get('files', id);
}

export async function deleteCraftFile(id: string): Promise<void> {
  await (await db()).delete('files', id);
}
