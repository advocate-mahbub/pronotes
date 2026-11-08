import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetDbForTests, createDoc, listDocs, getDoc, saveContent, renameDoc, duplicateDoc, trashDoc, restoreDoc,
  deleteForever, purgeExpired, daysLeft, saveBank, loadBank, exportAll, restoreAll, parseBackup, TRASH_DAYS,
  listFonts, putFont, removeFont, saveLayouts, loadLayouts, saveCorrections, loadCorrections, mergeCorrections,
  saveAiKey, loadAiKey, savePrivateWords, loadPrivateWords,
  setPinned, moveToFolder, loadFolders, createFolder, renameFolder, deleteFolder, listVersions, snapshotNow, restoreVersion, VERSION_EVERY, VERSIONS_KEPT,
} from '../../src/storage';

const DAY = 864e5;
const para = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('documents', () => {
  it('create, save, rename, list newest first', async () => {
    const a = await createDoc('আরজি', undefined, '', 1000);
    const b = await createDoc('জবাব', undefined, '', 2000);
    await saveContent(a.id, para('বাদী'), 'বাদী', 3000);
    await renameDoc(b.id, '  লিখিত জবাব ', 2500);
    const list = await listDocs();
    expect(list.map((d) => d.title)).toEqual(['আরজি', 'লিখিত জবাব']);
    expect((await getDoc(a.id))!.text).toBe('বাদী');
  });
  it('duplicate copies content under a new id', async () => {
    const a = await createDoc('আরজি', para('তফসিল'), 'তফসিল');
    const c = (await duplicateDoc(a.id))!;
    expect(c.id).not.toBe(a.id);
    expect(c.title).toBe('আরজি (কপি)');
    expect(c.content).toEqual(a.content);
  });
  it('trash, restore, delete forever only from trash', async () => {
    const a = await createDoc('আরজি');
    expect(await deleteForever(a.id)).toBe(false);
    await trashDoc(a.id, 5000);
    expect(await listDocs()).toHaveLength(0);
    expect(await listDocs({ trash: true })).toHaveLength(1);
    await restoreDoc(a.id);
    expect(await listDocs()).toHaveLength(1);
    await trashDoc(a.id);
    expect(await deleteForever(a.id)).toBe(true);
    expect(await getDoc(a.id)).toBeUndefined();
  });
  it(`trash keeps documents ${TRASH_DAYS} days, then purges`, async () => {
    const a = await createDoc('পুরোনো');
    const b = await createDoc('নতুন');
    const now = 100 * DAY;
    await trashDoc(a.id, now - 31 * DAY);
    await trashDoc(b.id, now - 2 * DAY);
    expect(daysLeft((await getDoc(b.id))!, now)).toBe(28);
    expect(await purgeExpired(now)).toBe(1);
    expect((await listDocs({ trash: true })).map((d) => d.title)).toEqual(['নতুন']);
  });
});

describe('concurrent writes', () => {
  it('rename and content save at the same time keep both changes', async () => {
    const a = await createDoc('নতুন');
    await Promise.all([renameDoc(a.id, 'আরজি', 2000), saveContent(a.id, para('দলিল'), 'দলিল', 2001)]);
    const d = (await getDoc(a.id))!;
    expect([d.title, d.text]).toEqual(['আরজি', 'দলিল']);
  });
});

describe('backup and restore', () => {
  it('round trip into an empty device', async () => {
    const a = await createDoc('আরজি', para('দলিল মূলে খরিদ করেন'), 'দলিল মূলে খরিদ করেন');
    const t = await createDoc('ট্র্যাশে');
    await trashDoc(t.id);
    await saveBank({ w: { দলিল: 3 }, b: { দলিল: { মূলে: 2 } } });
    const file = parseBackup(JSON.stringify(await exportAll({ layout: 'bornona' })));
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    const r = await restoreAll(file);
    expect(r).toMatchObject({ added: 2, copies: 0, unchanged: 0, words: 1, prefs: { layout: 'bornona' } });
    expect((await getDoc(a.id))!.content).toEqual(para('দলিল মূলে খরিদ করেন'));
    expect(await listDocs({ trash: true })).toHaveLength(1);
    expect(await loadBank()).toEqual({ w: { দলিল: 3 }, b: { দলিল: { মূলে: 2 } } });
  });
  it('never overwrites a changed document; restoring twice changes nothing', async () => {
    const a = await createDoc('আরজি', para('পুরোনো'), 'পুরোনো', 1000);
    await saveBank({ w: { দলিল: 3 }, b: {} });
    const file = await exportAll({});
    await saveContent(a.id, para('নতুন লেখা'), 'নতুন লেখা', 2000);
    const r1 = await restoreAll(file);
    expect(r1.copies).toBe(1);
    expect((await getDoc(a.id))!.text).toBe('নতুন লেখা');
    const titles = (await listDocs()).map((d) => d.title).sort();
    expect(titles).toEqual(['আরজি', 'আরজি (ব্যাকআপ থেকে)']);
    const r2 = await restoreAll(await exportAll({}));
    expect(r2.copies).toBe(0);
    expect(r2.unchanged).toBe(2);
    expect((await loadBank())!.w['দলিল']).toBe(3);
  });
  it('rejects files that are not ProNotes backups', () => {
    expect(() => parseBackup('{"app":"bornona-pad","version":1,"words":{}}')).toThrow();
    expect(() => parseBackup('not json')).toThrow();
  });
});

describe('M5 data: fonts, layouts, corrections', () => {
  it('upgrading a v1 database keeps the drafts and adds the fonts store', async () => {
    const { openDB } = await import('idb');
    const v1 = await openDB('pronotes', 1, {
      upgrade(d) {
        d.createObjectStore('docs', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        d.createObjectStore('meta');
      },
    });
    await v1.put('docs', { id: 'old', title: 'পুরোনো', content: para('ক'), text: 'ক', createdAt: 1, updatedAt: 1, deletedAt: null });
    v1.close();
    resetDbForTests();
    expect((await listDocs()).map((d) => d.id)).toEqual(['old']);
    expect(await listFonts()).toEqual([]);
  });
  it('fonts are stored, listed oldest first and removed', async () => {
    const data = new ArrayBuffer(8);
    await putFont({ id: 'b', family: 'Kalpurush', fileName: 'k.ttf', role: 'uni', data, addedAt: 2 });
    await putFont({ id: 'a', family: 'SutonnyMJ', fileName: 's.ttf', role: 'ansi', data, addedAt: 1 });
    expect((await listFonts()).map((f) => f.family)).toEqual(['SutonnyMJ', 'Kalpurush']);
    await removeFont('a');
    expect((await listFonts()).map((f) => f.id)).toEqual(['b']);
  });
  it('backup carries layouts and corrections (not fonts); restore adds without removing', async () => {
    const L = { id: 'custom-1', name: 'আমার', dev: '', map: { KeyA: ['া', 'আ'] } };
    await saveLayouts([L]);
    await saveCorrections('এক্তিয়ার = এখতিয়ার');
    await putFont({ id: 'f', family: 'X', fileName: 'x.ttf', role: 'uni', data: new ArrayBuffer(4), addedAt: 1 });
    const f = parseBackup(JSON.stringify(await exportAll({})));
    expect(f.layouts).toEqual([L]);
    expect(JSON.stringify(f)).not.toContain('"fonts"');
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await saveCorrections('নাই = নেই');
    await restoreAll(f);
    expect(await loadLayouts()).toEqual([L]);
    expect(await loadCorrections()).toBe('নাই = নেই\nএক্তিয়ার = এখতিয়ার');
    await restoreAll(f);
    expect(await loadLayouts()).toHaveLength(1);
    expect(await loadCorrections()).toBe('নাই = নেই\nএক্তিয়ার = এখতিয়ার');
  });
  it('mergeCorrections skips duplicates and blank lines', () => {
    expect(mergeCorrections('ক = খ\n', 'ক = খ\n\nগ = ঘ')).toBe('ক = খ\nগ = ঘ');
  });
});

describe('AI assistant data', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
  });
  it('key and hidden words stay on the device and never go into a backup file', async () => {
    await saveAiKey(' AIzaSECRET ');
    await savePrivateWords(['করিম']);
    expect(await loadAiKey()).toBe('AIzaSECRET');
    expect(await loadPrivateWords()).toEqual(['করিম']);
    const json = JSON.stringify(await exportAll({}));
    expect(json).not.toContain('AIzaSECRET');
    expect(json).not.toContain('aiPrivateWords');
  });
});

describe('pin, folders and versions', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
  });
  it('pin does not change the date; folders hold documents; deleting a folder keeps its documents', async () => {
    const d = await createDoc('ক', para('এক'), 'এক', 1000);
    await setPinned(d.id, true);
    expect(await getDoc(d.id)).toMatchObject({ pinned: true, updatedAt: 1000 });
    const f = await createFolder(' মামলা ১২/২০২৪ ');
    expect((await loadFolders()).map((x) => x.name)).toEqual(['মামলা ১২/২০২৪']);
    await moveToFolder([d.id], f.id);
    expect((await getDoc(d.id))!.folderId).toBe(f.id);
    const copy = await duplicateDoc(d.id);
    expect(copy!.folderId).toBe(f.id);
    await renameFolder(f.id, 'দেওয়ানি');
    expect((await loadFolders())[0].name).toBe('দেওয়ানি');
    expect(await deleteFolder(f.id)).toBe(2);
    expect(await loadFolders()).toEqual([]);
    expect((await getDoc(d.id))!.folderId).toBeUndefined();
    expect(await listDocs()).toHaveLength(2);
  });
  it('folders and pins travel in the backup', async () => {
    const d = await createDoc('ক', para('এক'), 'এক');
    const f = await createFolder('ফোল্ডার');
    await moveToFolder([d.id], f.id);
    const file = await exportAll({});
    expect(file.folders).toEqual([f]);
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await restoreAll(file);
    expect(await loadFolders()).toEqual([f]);
    expect((await getDoc(d.id))!.folderId).toBe(f.id);
  });
  it('a snapshot of the old state before saves, at most every 10 minutes; restore keeps the current one first', async () => {
    const d = await createDoc('ক', para('এক'), 'এক', 0);
    await saveContent(d.id, para('দুই'), 'দুই', 1000);
    let v = await listVersions(d.id);
    expect(v.map((x) => x.text)).toEqual(['এক']);
    await saveContent(d.id, para('তিন'), 'তিন', 2000); // too soon
    expect(await listVersions(d.id)).toHaveLength(1);
    await saveContent(d.id, para('চার'), 'চার', 2000 + VERSION_EVERY);
    v = await listVersions(d.id);
    expect(v.map((x) => x.text)).toEqual(['তিন', 'এক']);
    const back = await restoreVersion(v[1].id, 5e6);
    expect(back!.text).toBe('এক');
    expect((await listVersions(d.id))[0]).toMatchObject({ text: 'চার', reason: 'restore' });
  });
  it('keeps the newest versions only; deleted with the document', async () => {
    const d = await createDoc('ক', para('এক'), 'এক');
    for (let i = 0; i < VERSIONS_KEPT + 3; i++) await snapshotNow(d.id, i);
    const v = await listVersions(d.id);
    expect(v).toHaveLength(VERSIONS_KEPT);
    expect(v[0].at).toBe(VERSIONS_KEPT + 2);
    await trashDoc(d.id);
    await deleteForever(d.id);
    expect(await listVersions(d.id)).toEqual([]);
  });
});
