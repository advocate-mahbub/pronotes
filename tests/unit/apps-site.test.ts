// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { readZip, tidyPaths, findEntry } from '../../apps-site/zip';
import { withBridge } from '../../apps-site/inject';
import { allowedHost } from '../../apps-site/host';
import { typeOf } from '../../apps-site/store';
import { appsOrigin } from '../../src/craft/UserApps';
(globalThis as { __PN_TEST__?: boolean }).__PN_TEST__ = true;
const { typeInBox } = await import('../../apps-site/bridge');
import { PRO_NOTES_LAYOUT } from '../../src/bornona-engine';

/** A zip as made by any zip tool: local headers, data, central directory, end record. */
function zip(files: { path: string; text: string; deflate?: boolean }[]): ArrayBuffer {
  const enc = new TextEncoder();
  const parts: Buffer[] = [], cen: Buffer[] = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(enc.encode(f.path));
    const raw = Buffer.from(enc.encode(f.text));
    const data = f.deflate ? deflateRawSync(raw) : raw;
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(f.deflate ? 8 : 0, 8);
    loc.writeUInt32LE(data.length, 18); loc.writeUInt32LE(raw.length, 22); loc.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(f.deflate ? 8 : 0, 10);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    parts.push(loc, name, data); cen.push(c, name);
    off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(cen);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  const all = Buffer.concat([...parts, cd, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length) as ArrayBuffer;
}

describe('apps site (decisions.md 81)', () => {
  it('reads stored and deflated files, Bangla names too', async () => {
    const z = zip([{ path: 'app/index.html', text: '<title>খাতা</title>' }, { path: 'app/js/main.js', text: 'x'.repeat(5000), deflate: true }, { path: 'app/নোট.txt', text: 'ক' }]);
    const files = await readZip(z);
    expect(files.map((f) => f.path)).toEqual(['app/index.html', 'app/js/main.js', 'app/নোট.txt']);
    expect(new TextDecoder().decode(files[1].data)).toBe('x'.repeat(5000));
  });

  it('drops one shared top folder, unsafe paths and Mac leftovers; finds the start page', () => {
    const t = tidyPaths([
      { path: 'app/index.html', data: new Uint8Array() }, { path: 'app/a/../../evil.js', data: new Uint8Array() },
      { path: '__MACOSX/app/._index.html', data: new Uint8Array() }, { path: 'app/css/x.css', data: new Uint8Array() },
    ]);
    expect(t.map((f) => f.path)).toEqual(['index.html', 'css/x.css']);
    expect(findEntry(['docs/start.html', 'a/b/index.html'])).toBe('a/b/index.html');
    expect(findEntry(['x.js'])).toBeNull();
  });

  it('refuses what is not a zip, and too much', async () => {
    await expect(readZip(new TextEncoder().encode('hello').buffer as ArrayBuffer)).rejects.toThrow('not-zip');
    await expect(readZip(zip([{ path: 'a', text: 'x' }, { path: 'b', text: 'y' }]), { files: 1, bytes: 10 })).rejects.toThrow('too-many');
  });

  it('puts the bridge first in every app page; types the files', () => {
    expect(withBridge('<html><head><title>x</title>')).toBe('<html><head><script src="/bridge.js"></script><title>x</title>');
    expect(withBridge('<p>hi</p>')).toBe('<script src="/bridge.js"></script><p>hi</p>');
    expect(typeOf('a/b.WASM')).toBe('application/wasm');
    expect(typeOf('x.mjs')).toContain('javascript');
  });

  it('only ProNotes’ own addresses may drive it', () => {
    expect(allowedHost('https://notes.mahbuburrahman.bd')).toBe('https://notes.mahbuburrahman.bd');
    expect(allowedHost('http://localhost:4173')).toBe('http://localhost:4173');
    expect(allowedHost('https://evil.example')).toBeNull();
    expect(allowedHost('https://mahbuburrahman.bd.evil.example')).toBeNull();
    expect(allowedHost('http://notes.mahbuburrahman.bd')).toBeNull();
    expect(appsOrigin({ hostname: 'notes.mahbuburrahman.bd' })).toBe('https://apps.mahbuburrahman.bd');
    expect(appsOrigin({ hostname: 'localhost' })).toBe('http://localhost:4174');
  });

  it('the bridge types with the ProNotes rules in an app’s text box', () => {
    const map = PRO_NOTES_LAYOUT.map;
    const box = document.createElement('textarea');
    document.body.append(box);
    let seen = 0;
    box.addEventListener('input', () => seen++);
    const cfg = { bangla: true, map, vowelForming: true, oldReph: false, hasantaRules: true };
    typeInBox(box, 'ক', cfg);
    typeInBox(box, '্', cfg);
    typeInBox(box, 'ি', cfg); // ্ + kar = the vowel (ProNotes rule)
    expect(box.value).toBe('কই');
    expect(seen).toBe(3); // the app hears every change
  });
});

// decisions.md 91: a zipped app's own icon
import { iconOf } from '../../apps-site/icon';
describe('iconOf', () => {
  const f = (path: string, text = '') => ({ path, data: new TextEncoder().encode(text) });
  it('the largest manifest icon that is in the zip', () => {
    const files = [f('index.html'), f('manifest.json', JSON.stringify({ icons: [{ src: 'i/48.png', sizes: '48x48' }, { src: './i/512.png', sizes: '512x512' }, { src: 'gone.png', sizes: '1024x1024' }] })), f('i/48.png'), f('i/512.png')];
    expect(iconOf(files, 'index.html')).toBe('i/512.png');
  });
  it('else the page\'s apple-touch-icon or icon link (relative to the page), else a root favicon, else none', () => {
    expect(iconOf([f('app/index.html', '<link rel="icon" href="../img/f.svg"><link rel="apple-touch-icon" href="t.png">'), f('app/t.png'), f('img/f.svg')], 'app/index.html')).toBe('app/t.png');
    expect(iconOf([f('index.html', '<link rel="icon" href="https://x.com/a.png">'), f('favicon.ico')], 'index.html')).toBe('favicon.ico');
    expect(iconOf([f('index.html', '<p>')], 'index.html')).toBe('');
  });
});
