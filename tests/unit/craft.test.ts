import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { CRAFT_APPS, craftApp, craftAppUrl, openMessage, readBridgeMessage, safeName } from '../../src/craft/bridge';
import { deleteCraftFile, getCraftFile, listCraftFiles, resetCraftDbForTests, saveCraftFile } from '../../src/craft/store';
import { newer } from '../../tools/check-craft-updates.mjs';
import { zipUrl } from '../../tools/fetch-craft-apps.mjs';

describe('Craft apps manifest', () => {
  it('every entry is complete and safe to put in a path', () => {
    const ids = new Set<string>();
    for (const a of CRAFT_APPS) {
      expect(a.id).toMatch(/^[a-z0-9-]+$/);
      expect(a.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(a.repo).toMatch(/^storytold\/[a-z0-9-]+$/);
      expect(['parent', 'none', 'unknown']).toContain(a.bridge);
      expect(ids.has(a.id)).toBe(false);
      ids.add(a.id);
    }
  });
  it('keeps the four chosen apps switched on', () => {
    expect(CRAFT_APPS.filter((a) => a.enabled).map((a) => a.id)).toEqual(['wordcraft', 'pdfcraft', 'gridcraft', 'deckcraft']);
  });
  it('builds the official release address and the app page address', () => {
    const w = craftApp('wordcraft')!;
    expect(zipUrl(w)).toBe('https://github.com/storytold/wordcraft/releases/download/v0.18.1/wordcraft-web-0.18.1.zip');
    expect(craftAppUrl(w, 'https://notes.mahbuburrahman.bd/')).toBe('https://notes.mahbuburrahman.bd/apps/wordcraft/0.18.1/index.html?host=parent');
    expect(craftAppUrl(craftApp('pdfcraft')!, 'https://x.test/sub/')).toBe('https://x.test/sub/apps/pdfcraft/0.21.1/index.html');
    expect(craftApp('nope')).toBeUndefined();
  });
  it('compares versions', () => {
    expect(newer('0.19.0', '0.18.1')).toBe(true);
    expect(newer('0.18.10', '0.18.9')).toBe(true);
    expect(newer('0.18.1', '0.18.1')).toBe(false);
    expect(newer('0.9.9', '0.18.1')).toBe(false);
  });
});

describe('Craft bridge messages', () => {
  it('reads ready, save, dirty and failed for its own app only', () => {
    expect(readBridgeMessage('wordcraft', { type: 'wordcraft:ready', version: '1', appVersion: '0.18.1', extra: 1 })).toEqual({ kind: 'ready', appVersion: '0.18.1' });
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    expect(readBridgeMessage('wordcraft', { type: 'wordcraft:save', name: 'আরজি.docx', bytes, saveAs: true })).toEqual({ kind: 'save', name: 'আরজি.docx', bytes, saveAs: true });
    expect(readBridgeMessage('wordcraft', { type: 'wordcraft:dirty', dirty: true })).toEqual({ kind: 'dirty', dirty: true });
    expect(readBridgeMessage('wordcraft', { type: 'wordcraft:failed', error: 'no WebGPU' })).toEqual({ kind: 'failed', error: 'no WebGPU' });
    expect(readBridgeMessage('wordcraft', { type: 'gridcraft:ready' })).toBeNull();
    expect(readBridgeMessage('wordcraft', { type: 'wordcraft:save', name: 'x' })).toBeNull(); // no bytes
    expect(readBridgeMessage('wordcraft', 'wordcraft:ready')).toBeNull();
  });
  it('copies a typed-array save and cleans the file name', () => {
    const ev = readBridgeMessage('gridcraft', { type: 'gridcraft:save', name: '../../hisab.xlsx', bytes: new Uint8Array([9, 8]) });
    expect(ev?.kind === 'save' && [ev.name, new Uint8Array(ev.bytes)[0]]).toEqual(['hisab.xlsx', 9]);
    expect(safeName('', 'deckcraft')).toBe('deckcraft-file');
  });
  it('builds the open message', () => {
    const b = new ArrayBuffer(2);
    expect(openMessage('deckcraft', 'a.pptx', b)).toEqual({ type: 'deckcraft:open', name: 'a.pptx', bytes: b });
  });
});

describe('Craft file store', () => {
  beforeEach(() => resetCraftDbForTests());
  it('Save replaces the same name, a new name is a new file', async () => {
    const a = await saveCraftFile('wordcraft', 'Test-1.docx', new Uint8Array([1]).buffer);
    const b = await saveCraftFile('wordcraft', 'Test-1.docx', new Uint8Array([1, 2]).buffer);
    expect(b.id).toBe(a.id);
    expect(b.size).toBe(2);
    await saveCraftFile('wordcraft', 'Test-1.pdf', new Uint8Array([3]).buffer);
    await saveCraftFile('gridcraft', 'Test-1.docx', new Uint8Array([4]).buffer);
    expect((await listCraftFiles('wordcraft')).map((f) => f.name).sort()).toEqual(['Test-1.docx', 'Test-1.pdf']);
    expect(new Uint8Array((await getCraftFile(a.id))!.bytes)).toEqual(new Uint8Array([1, 2]));
    await deleteCraftFile(a.id);
    expect(await getCraftFile(a.id)).toBeUndefined();
  });
});
