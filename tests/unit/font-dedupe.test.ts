import { describe, it, expect } from 'vitest';
import { fontHash, duplicateFonts, keeperOf } from '../../src/fonts/dedupe';
import { planFontSync, type DriveFont } from '../../src/storage/gdrive';

// decisions.md 85: one copy of each font file
describe('font dedupe', () => {
  it('the same bytes give the same fingerprint, other bytes another', async () => {
    const a = new Uint8Array([1, 2, 3]).buffer;
    const b = new Uint8Array([1, 2, 3]).buffer;
    const c = new Uint8Array([1, 2, 4]).buffer;
    expect(await fontHash(a)).toBe(await fontHash(b));
    expect(await fontHash(a)).not.toBe(await fontHash(c));
  });
  it('copies of one file: the smaller id stays on every device', () => {
    const h = new Map([['font-2', 'x'], ['font-1', 'x'], ['font-3', 'y'], ['font-4', 'x']]);
    expect(duplicateFonts(['font-2', 'font-1', 'font-3', 'font-4'], h)).toEqual([{ keep: 'font-1', drop: ['font-2', 'font-4'] }]);
    expect(keeperOf('font-9', 'font-10')).toBe('font-10');
    expect(duplicateFonts(['font-3'], h)).toEqual([]);
  });
  it('Drive: two files with one font id — one stays, the other is trashed, nothing downloaded twice', () => {
    const r = (id: string, pn: string): DriveFont => ({ id, name: pn + '.ttf', appProperties: { pnFont: pn, role: 'uni' } } as DriveFont);
    const plan = planFontSync([], [r('D1', 'font-1'), r('D2', 'font-1'), r('D3', 'font-2')], []);
    expect(plan.down.map((x) => x.id)).toEqual(['D1', 'D3']);
    expect(plan.trash.map((x) => x.id)).toEqual(['D2']);
  });
});
