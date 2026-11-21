/** Installed apps in this site's own IndexedDB (never ProNotes' database: a different origin). */
export interface AppInfo { id: string; name: string; entry: string; size: number; files: number; addedAt: number; source: string; /** the app's own icon, a path inside it (decisions.md 91) */ icon?: string }
interface FileRec { key: string; type: string; data: Blob }

const DB = 'pronotes-apps';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('apps')) db.createObjectStore('apps', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const done = (t: IDBTransaction) => new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function listApps(): Promise<AppInfo[]> {
  const db = await open();
  const all = await req(db.transaction('apps').objectStore('apps').getAll() as IDBRequest<AppInfo[]>);
  return all.sort((a, b) => b.addedAt - a.addedAt);
}
export async function getApp(id: string): Promise<AppInfo | undefined> {
  const db = await open();
  return req(db.transaction('apps').objectStore('apps').get(id) as IDBRequest<AppInfo | undefined>);
}
export async function putApp(info: AppInfo, files: { path: string; type: string; data: Blob }[]): Promise<void> {
  await removeApp(info.id);
  const db = await open();
  const t = db.transaction(['apps', 'files'], 'readwrite');
  for (const f of files) t.objectStore('files').put({ key: info.id + '/' + f.path, type: f.type, data: f.data } satisfies FileRec);
  t.objectStore('apps').put(info);
  await done(t);
}
export async function removeApp(id: string): Promise<void> {
  const db = await open();
  const t = db.transaction(['apps', 'files'], 'readwrite');
  t.objectStore('apps').delete(id);
  t.objectStore('files').delete(IDBKeyRange.bound(id + '/', id + '/￿'));
  await done(t);
}
export async function getFile(id: string, path: string): Promise<FileRec | undefined> {
  const db = await open();
  return req(db.transaction('files').objectStore('files').get(id + '/' + path) as IDBRequest<FileRec | undefined>);
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', webmanifest: 'application/manifest+json', map: 'application/json', txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', avif: 'image/avif',
  wasm: 'application/wasm', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf', xml: 'application/xml',
};
export const typeOf = (path: string) => TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
