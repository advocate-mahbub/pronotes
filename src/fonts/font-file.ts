/**
 * Reads the family name from a TrueType/OpenType font file (the `name` table).
 * WOFF/WOFF2 files are compressed, so for them (or any unreadable file) the caller
 * falls back to the file name.
 */
export type FontKind = 'ttf' | 'otf' | 'woff' | 'woff2' | 'collection' | 'unknown';

export function fontKind(buf: ArrayBuffer): FontKind {
  if (buf.byteLength < 12) return 'unknown';
  const tag = new DataView(buf).getUint32(0);
  if (tag === 0x00010000 || tag === 0x74727565 /* 'true' */) return 'ttf';
  if (tag === 0x4f54544f /* 'OTTO' */) return 'otf';
  if (tag === 0x774f4646 /* 'wOFF' */) return 'woff';
  if (tag === 0x774f4632 /* 'wOF2' */) return 'woff2';
  if (tag === 0x74746366 /* 'ttcf' */) return 'collection';
  return 'unknown';
}

function decode(v: DataView, off: number, len: number, platform: number): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset + off, len);
  if (platform === 0 || platform === 3) {
    let s = '';
    for (let i = 0; i + 1 < len; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return s;
  }
  try {
    return new TextDecoder('macintosh').decode(bytes);
  } catch {
    return String.fromCharCode(...bytes);
  }
}

/**
 * Family name of a .ttf/.otf file, or null. Prefers the typographic family (name ID 16),
 * then the family (ID 1); prefers Windows English, then any Windows/Unicode, then Mac.
 */
export function readFontFamily(buf: ArrayBuffer): string | null {
  const kind = fontKind(buf);
  if (kind !== 'ttf' && kind !== 'otf') return null;
  try {
    const v = new DataView(buf);
    const numTables = v.getUint16(4);
    let nameOff = -1;
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      if (v.getUint32(rec) === 0x6e616d65 /* 'name' */) nameOff = v.getUint32(rec + 8);
    }
    if (nameOff < 0) return null;
    const count = v.getUint16(nameOff + 2);
    const strOff = nameOff + v.getUint16(nameOff + 4);
    const found: { id: number; score: number; text: string }[] = [];
    for (let i = 0; i < count; i++) {
      const r = nameOff + 6 + i * 12;
      const platform = v.getUint16(r);
      const lang = v.getUint16(r + 4);
      const id = v.getUint16(r + 6);
      if (id !== 1 && id !== 16) continue;
      const text = decode(v, strOff + v.getUint16(r + 10), v.getUint16(r + 8), platform).replace(/\0/g, '').trim();
      if (!text) continue;
      const score = (id === 16 ? 10 : 0) + (platform === 3 ? (lang === 0x409 ? 3 : 2) : platform === 0 ? 2 : 1);
      found.push({ id, score, text });
    }
    found.sort((a, b) => b.score - a.score);
    return found[0]?.text ?? null;
  } catch {
    return null;
  }
}

/** Family name for an uploaded font: from the file, else from the file name. */
export function familyFor(buf: ArrayBuffer, fileName: string): string {
  return (readFontFamily(buf) || fileName.replace(/\.(ttf|otf|woff2?|ttc)$/i, '')).replace(/["'\\;{}<>]/g, '').trim() || 'Custom font';
}

export interface FontStyle {
  /** CSS font-style for the FontFace. */
  style: 'normal' | 'italic';
  /** CSS font-weight (100–900). */
  weight: number;
}

/**
 * Regular, bold or italic: from the OS/2 table (weight class, fsSelection), else the head table
 * (macStyle), else the file name. A face registered without this would count as "regular", and the
 * browser could then draw normal text with an italic or bold file of the same family.
 */
export function readFontStyle(buf: ArrayBuffer, fileName = ''): FontStyle {
  const byName = (): FontStyle => ({
    style: /italic|oblique/i.test(fileName) ? 'italic' : 'normal',
    weight: /black|heavy/i.test(fileName) ? 900 : /extra ?bold/i.test(fileName) ? 800 : /semi ?bold|demi/i.test(fileName) ? 600 : /bold/i.test(fileName) ? 700 : /light/i.test(fileName) ? 300 : 400,
  });
  const kind = fontKind(buf);
  if (kind !== 'ttf' && kind !== 'otf') return byName();
  try {
    const v = new DataView(buf);
    const numTables = v.getUint16(4);
    let os2 = -1;
    let head = -1;
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = v.getUint32(rec);
      if (tag === 0x4f532f32 /* 'OS/2' */) os2 = v.getUint32(rec + 8);
      if (tag === 0x68656164 /* 'head' */) head = v.getUint32(rec + 8);
    }
    if (os2 >= 0 && os2 + 64 <= buf.byteLength) {
      const weight = v.getUint16(os2 + 4);
      const fsSelection = v.getUint16(os2 + 62);
      return { style: fsSelection & 1 ? 'italic' : 'normal', weight: weight >= 100 && weight <= 1000 ? Math.min(900, weight) : fsSelection & 32 ? 700 : 400 };
    }
    if (head >= 0 && head + 46 <= buf.byteLength) {
      const macStyle = v.getUint16(head + 44);
      return { style: macStyle & 2 ? 'italic' : 'normal', weight: macStyle & 1 ? 700 : 400 };
    }
  } catch {
    /* fall back to the name */
  }
  return byName();
}
