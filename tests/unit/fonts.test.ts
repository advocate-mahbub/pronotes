import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFontFamily, familyFor, fontKind } from '../../src/fonts/font-file';

/** Build a minimal sfnt with only a `name` table holding the given records. */
function sfnt(records: { platform: number; lang: number; id: number; text: string }[]): ArrayBuffer {
  const enc = (r: { platform: number; text: string }) =>
    r.platform === 1 ? [...r.text].map((c) => c.charCodeAt(0)) : [...r.text].flatMap((c) => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 255]);
  const strs = records.map(enc);
  const nameLen = 6 + records.length * 12 + strs.reduce((a, b) => a + b.length, 0);
  const buf = new ArrayBuffer(12 + 16 + nameLen);
  const v = new DataView(buf);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, 1);
  v.setUint32(12, 0x6e616d65);
  v.setUint32(20, 28);
  v.setUint32(24, nameLen);
  const n = 28;
  v.setUint16(n, 0);
  v.setUint16(n + 2, records.length);
  v.setUint16(n + 4, 6 + records.length * 12);
  let off = 0;
  records.forEach((r, i) => {
    const o = n + 6 + i * 12;
    v.setUint16(o, r.platform);
    v.setUint16(o + 2, r.platform === 3 ? 1 : 0);
    v.setUint16(o + 4, r.lang);
    v.setUint16(o + 6, r.id);
    v.setUint16(o + 8, strs[i].length);
    v.setUint16(o + 10, off);
    strs[i].forEach((b, j) => v.setUint8(n + 6 + records.length * 12 + off + j, b));
    off += strs[i].length;
  });
  return buf;
}

describe('font family from file', () => {
  it('prefers the Windows English typographic family', () => {
    const b = sfnt([
      { platform: 1, lang: 0, id: 1, text: 'MacName' },
      { platform: 3, lang: 0x409, id: 1, text: 'SutonnyOMJ' },
      { platform: 3, lang: 0x409, id: 16, text: 'Sutonny OMJ Family' },
    ]);
    expect(readFontFamily(b)).toBe('Sutonny OMJ Family');
  });
  it('falls back to the Mac record', () => {
    expect(readFontFamily(sfnt([{ platform: 1, lang: 0, id: 1, text: 'Kalpurush' }]))).toBe('Kalpurush');
  });
  it('WOFF and junk fall back to the file name', () => {
    const w = new ArrayBuffer(16);
    new DataView(w).setUint32(0, 0x774f4646);
    expect(fontKind(w)).toBe('woff');
    expect(familyFor(w, 'My-Font.woff')).toBe('My-Font');
    expect(familyFor(new ArrayBuffer(4), 'x"y.ttf')).toBe('xy');
  });
  const real = path.join(os.homedir(), '.fonts/NotoSansBengali_400Regular.ttf');
  it.skipIf(!fs.existsSync(real))('reads a real TTF (Noto Sans Bengali; runs only where that file exists)', () => {
    const b = fs.readFileSync(real);
    expect(readFontFamily(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)).toBe('Noto Sans Bengali');
  });
});
