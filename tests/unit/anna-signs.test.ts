import { describe, it, expect } from 'vitest';
import { readAnnaSigns, annaSigns, readFrac, frac, add, cmp, type Frac } from '../../src/chart';

// the owner's examples (decisions.md 75); units: 1 আনা = 20 গণ্ডা, 1 গণ্ডা = 4 কড়া, 1 কড়া = 3 ক্রান্তি, 1 ক্রান্তি = 20 তিল
const share = (anna: number, ganda = 0, kara = 0, kranti = 0, til = 0): Frac =>
  [frac(BigInt(anna), 16n), frac(BigInt(ganda), 320n), frac(BigInt(kara), 1280n), frac(BigInt(kranti), 3840n), frac(BigInt(til), 76800n)].reduce((a, b) => add(a, b));
const same = (a: Frac | null, b: Frac) => expect(a && cmp(a, b)).toBe(0);

describe('আনা-গণ্ডা in signs', () => {
  it("reads the owner's forms", () => {
    same(readAnnaSigns('৵৯৷৷৴৴১০'), share(2, 9, 2, 2, 10)); // দুই আনা নয় গণ্ডা দুই কড়া দুই ক্রান্তি দশ তিল
    same(readAnnaSigns('৻৯৷৷'), share(0, 9, 2)); // no anna
    same(readAnnaSigns('৵৯৻১০'), share(2, 9, 0, 0, 10)); // ganda, then til only
    same(readAnnaSigns('৵৻৷৷'), share(2, 0, 2)); // no ganda, then kara
    same(readAnnaSigns('৵৻১০'), share(2, 0, 0, 0, 10)); // no ganda, til only: til, not ganda
    same(readAnnaSigns('৵১০'), share(2, 10)); // ganda right after annas, without ৻
    same(readAnnaSigns('৵৯৸'), share(2, 9, 3)); // ৸ after the ganda = 3 kara
    same(readAnnaSigns('৸৶'), share(15)); // ৸ among annas = 12
    same(readAnnaSigns('৷৹'), share(4));
    same(readAnnaSigns('৷৷৹৫'), share(8, 5));
    same(readAnnaSigns('১৲'), share(16));
  });
  it('refuses what is not this notation', () => {
    for (const s of ['', '১২', '৵২৫', '৸৷', '৵৯৷৷৷৷', '৵৯৴৴৴', '৵৯৷৷৴৴২০', 'ক৵']) expect(readAnnaSigns(s)).toBeNull();
  });
  it('readFrac takes the signs too; plain numbers are unchanged', () => {
    same(readFrac('৵৯৷৷৴৴১০'), share(2, 9, 2, 2, 10));
    same(readFrac('১/৩'), frac(1n, 3n));
    same(readFrac('২'), frac(2n));
  });
  it('writes them back the same way', () => {
    expect(annaSigns(share(2, 9, 2, 2, 10))).toBe('৵৯৷৷৴৴১০');
    expect(annaSigns(share(0, 9, 2))).toBe('৻৯৷৷');
    expect(annaSigns(share(2, 9, 0, 0, 10))).toBe('৵৯৻১০');
    expect(annaSigns(share(2, 0, 2))).toBe('৵৻৷৷');
    expect(annaSigns(share(2, 0, 0, 0, 10))).toBe('৵৻১০');
    expect(annaSigns(share(4))).toBe('৷৹');
    expect(annaSigns(share(8))).toBe('৷৷৹');
    expect(annaSigns(share(12, 1, 3))).toBe('৸১৸');
    expect(annaSigns(share(16))).toBe('১৲');
    expect(annaSigns(share(0, 0, 0, 0, 7))).toBeNull(); // til alone would read as ganda
    expect(annaSigns(frac(1n, 7n))).toBeNull(); // below a til
  });
  it('every share to the til survives writing and reading', () => {
    for (let t = 1n; t < 76800n; t += 97n) {
      const f = frac(t, 76800n);
      const w = annaSigns(f);
      if (w) same(readAnnaSigns(w), f);
    }
  });
});
