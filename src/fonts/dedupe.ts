/**
 * One copy of each font file (decisions.md 85). The same file added twice, or once here and once on another
 * device and then brought over by Drive, used to show up twice in the list. Two files are the same font when
 * their bytes are the same; of such a pair every device keeps the one with the smaller id, so two devices that
 * each had their own copy end up with the same one instead of trading them back and forth through Drive.
 */

/** A short fingerprint of the file's bytes (SHA-256, hex). */
export async function fontHash(data: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Of two copies of the same file, the one every device keeps. */
export const keeperOf = (a: string, b: string): string => (a < b ? a : b);

/**
 * Same-file groups among the fonts here: for each group, the one to keep and the ones to drop.
 * `hashes` maps id → fingerprint (fonts without one are left alone).
 */
export function duplicateFonts(ids: string[], hashes: Map<string, string>): { keep: string; drop: string[] }[] {
  const byHash = new Map<string, string[]>();
  for (const id of ids) {
    const h = hashes.get(id);
    if (!h) continue;
    byHash.set(h, [...(byHash.get(h) ?? []), id]);
  }
  const out: { keep: string; drop: string[] }[] = [];
  for (const group of byHash.values()) {
    if (group.length < 2) continue;
    const keep = group.reduce(keeperOf);
    out.push({ keep, drop: group.filter((id) => id !== keep) });
  }
  return out;
}
