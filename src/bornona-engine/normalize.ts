/**
 * Bangla nukta letters must always be stored as single code points:
 * ya-nukta U+09DF, rra U+09DC, rha U+09DD; never base letter + nukta (U+09BC).
 *
 * Never use String.prototype.normalize('NFC'/'NFKC') on Bangla text:
 * these three letters are composition exclusions, so NFC *decomposes* them.
 */
export function fixNukta(s: string): string {
  return s
    .replace(/\u09AF\u09BC/g, '\u09DF')
    .replace(/\u09A1\u09BC/g, '\u09DC')
    .replace(/\u09A2\u09BC/g, '\u09DD');
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** 2024 -> Bangla digits (ASCII digits only; everything else unchanged). */
export function toBanglaDigits(s: string | number): string {
  return String(s).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}
