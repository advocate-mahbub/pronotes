import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetDbForTests, createDoc, listDocs, getDoc, saveContent, renameDoc, duplicateDoc, trashDoc, restoreDoc,
  deleteForever, purgeExpired, daysLeft, saveBank, loadBank, exportAll, restoreAll, parseBackup, TRASH_DAYS,
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
