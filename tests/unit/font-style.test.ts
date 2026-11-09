import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { readFontStyle } from '../../src/fonts/font-file';

const dir = '/usr/share/fonts/truetype/dejavu/';
const buf = (f: string) => { const b = fs.readFileSync(dir + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const have = fs.existsSync(dir + 'DejaVuSerif.ttf');

describe('font file style (so an italic file never draws normal text)', () => {
  it.skipIf(!have)('reads regular, bold, italic and bold italic from real files', () => {
    expect(readFontStyle(buf('DejaVuSerif.ttf'))).toEqual({ style: 'normal', weight: 400 });
    expect(readFontStyle(buf('DejaVuSerif-Bold.ttf'))).toEqual({ style: 'normal', weight: 700 });
    expect(readFontStyle(buf('DejaVuSerif-Italic.ttf'))).toEqual({ style: 'italic', weight: 400 });
    expect(readFontStyle(buf('DejaVuSerif-BoldItalic.ttf'))).toEqual({ style: 'italic', weight: 700 });
  });
  it('falls back to the file name for compressed or unreadable files', () => {
    const junk = new ArrayBuffer(16);
    expect(readFontStyle(junk, 'SutonnyMJ-Italic.woff2')).toEqual({ style: 'italic', weight: 400 });
    expect(readFontStyle(junk, 'SutonnyMJ Bold.ttf')).toEqual({ style: 'normal', weight: 700 });
    expect(readFontStyle(junk, 'SutonnyMJ.ttf')).toEqual({ style: 'normal', weight: 400 });
  });
});
