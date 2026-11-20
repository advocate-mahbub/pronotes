import { describe, expect, it } from 'vitest';
import { prepareFontFile, splitCollection, unwrapEot, fontKind } from '../../src/fonts';
import { appFontCss, BN_RANGE } from '../../src/fonts/app-font';

/** A tiny sfnt: one table with the given bytes. */
function sfnt(tag: string, body: number[]): Uint8Array {
  const out = new Uint8Array(12 + 16 + ((body.length + 3) & ~3));
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x00010000); v.setUint16(4, 1);
  for (let i = 0; i < 4; i++) out[12 + i] = tag.charCodeAt(i);
  v.setUint32(20, 28); v.setUint32(24, body.length);
  out.set(body, 28);
  return out;
}
/** Two sfnts in one collection, tables at absolute offsets (as in real .ttc files). */
function ttc(a: Uint8Array, b: Uint8Array): ArrayBuffer {
  const head = 12 + 8;
  const total = head + a.length + b.length;
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x74746366); v.setUint32(4, 0x00010000); v.setUint32(8, 2);
  v.setUint32(12, head); v.setUint32(16, head + a.length);
  [a, b].forEach((f, i) => {
    const at = i ? head + a.length : head;
    out.set(f, at);
    v.setUint32(at + 20, at + 28); // the table's offset becomes absolute
  });
  return out.buffer;
}

describe('any font file (decisions.md 80)', () => {
  it('splits a collection into standalone fonts that keep their tables', () => {
    const files = splitCollection(ttc(sfnt('test', [1, 2, 3, 4, 5]), sfnt('abcd', [9, 8, 7])));
    expect(files).toHaveLength(2);
    expect(fontKind(files[0])).toBe('ttf');
    const v = new DataView(files[1]);
    expect(v.getUint32(20)).toBe(28);
    expect([...new Uint8Array(files[1], 28, 3)]).toEqual([9, 8, 7]);
    const r = prepareFontFile(ttc(sfnt('test', [1]), sfnt('test', [2])), 'Fonts.ttc');
    expect(r.ok && r.files.map((f) => f.fileName)).toEqual(['Fonts-1.ttf', 'Fonts-2.ttf']);
  });

  it('unwraps an .eot, also with the XOR flag; refuses a MicroType-compressed one', () => {
    const font = sfnt('test', [1, 2, 3, 4]);
    const eot = (flags: number, xor: boolean) => {
      const out = new Uint8Array(82 + font.length);
      const v = new DataView(out.buffer);
      v.setUint32(0, out.length, true); v.setUint32(4, font.length, true); v.setUint32(8, 0x20001, true); v.setUint32(12, flags, true);
      v.setUint16(34, 0x504c, true);
      out.set(xor ? font.map((x) => x ^ 0x50) : font, 82);
      return out.buffer;
    };
    expect(fontKind(unwrapEot(eot(0, false)) as ArrayBuffer)).toBe('ttf');
    expect(fontKind(unwrapEot(eot(0x10000000, true)) as ArrayBuffer)).toBe('ttf');
    expect(unwrapEot(eot(0x4, false))).toBe('compressed');
    const r = prepareFontFile(eot(0, false), 'Old.eot');
    expect(r.ok && r.files[0].fileName).toBe('Old.ttf');
  });

  it('says plainly why .fon and Type 1 cannot be used; keeps .ttf as it is', () => {
    const fon = new Uint8Array(64); fon[0] = 0x4d; fon[1] = 0x5a;
    const r1 = prepareFontFile(fon.buffer, 'x.fon');
    expect(r1.ok).toBe(false);
    expect(!r1.ok && r1.reason).toContain('.fon');
    const pfb = new Uint8Array(64); pfb[0] = 0x80; pfb[1] = 0x01;
    expect(!prepareFontFile(pfb.buffer, 'x.pfb').ok).toBe(true);
    const ttf = sfnt('test', [1]).buffer as ArrayBuffer;
    const r = prepareFontFile(ttf, 'SutonnyOMJ.TTF');
    expect(r.ok && r.files[0].data).toBe(ttf);
  });
});

describe('the app font (decisions.md 80)', () => {
  it('Bangla and English share one family, split by Unicode range; the default ships with the app', () => {
    const css = appFontCss({ bn: 'Kalpurush', en: 'Georgia' }, () => undefined);
    expect(css).toContain('font-family: "PN UI"');
    expect(css).toContain(BN_RANGE);
    expect(css).toMatch(/kalpurush[^)]*\.woff2/);
    expect(css).toContain('local("Georgia")');
    // an own file is used through its blob: URL; an empty English side adds no rule
    const own = appFontCss({ bn: 'SutonnyOMJ', en: '' }, (n) => (n === 'SutonnyOMJ' ? 'blob:x' : undefined));
    expect(own).toContain('url("blob:x")');
    expect(own.split('@font-face')).toHaveLength(3); // menus' Bangla + the keys' Bangla (PN KB); no English rule
  });

  it('sizes (decisions.md 82): Bangla, English and the keys each by size-adjust, only when not 100%', () => {
    const css = appFontCss({ bn: 'Kalpurush', en: '', bnScale: 120, enScale: 90, kb: 'SutonnyOMJ', kbScale: 130 }, (n) => (n === 'SutonnyOMJ' ? 'blob:s' : undefined));
    const rules = css.split('\n');
    expect(rules[0]).toMatch(/"PN UI".*U\+0980.*size-adjust: 120%/);
    expect(rules[1]).toMatch(/"PN UI".*local\("Helvetica Neue"\).*size-adjust: 90%/); // the device's own English font, smaller
    expect(rules[2]).toMatch(/"PN KB".*blob:s.*size-adjust: 130%/);
    expect(appFontCss({ bn: 'Kalpurush', en: '' }, () => undefined)).not.toContain('size-adjust');
    expect(appFontCss({ bn: 'Kalpurush', en: '', bnScale: 999 }, () => undefined)).toContain('size-adjust: 150%');
  });
});
