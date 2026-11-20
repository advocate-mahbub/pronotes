/**
 * A small .zip reader (decisions.md 81): stored and deflate entries, UTF-8 names; deflate through the
 * browser's own DecompressionStream, so nothing is added to the download. ZIP64 (files over 4 GB) is not read.
 */
export interface ZipEntry { path: string; data: Uint8Array }

const SIG_END = 0x06054b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50;

async function inflate(raw: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([raw as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

export async function readZip(buf: ArrayBuffer, limits = { files: 5000, bytes: 300 * 1024 * 1024 }): Promise<ZipEntry[]> {
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let end = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65535); i--) {
    if (v.getUint32(i, true) === SIG_END) { end = i; break; }
  }
  if (end < 0) throw new Error('not-zip');
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  if (count === 0xffff || at === 0xffffffff) throw new Error('zip64');
  if (count > limits.files) throw new Error('too-many');
  const dec = new TextDecoder('utf-8');
  const out: ZipEntry[] = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (v.getUint32(at, true) !== SIG_CEN) throw new Error('bad-zip');
    const flags = v.getUint16(at + 8, true), method = v.getUint16(at + 10, true);
    const csize = v.getUint32(at + 20, true), usize = v.getUint32(at + 24, true);
    const nlen = v.getUint16(at + 28, true), xlen = v.getUint16(at + 30, true), clen = v.getUint16(at + 32, true);
    const loc = v.getUint32(at + 42, true);
    const path = dec.decode(u8.subarray(at + 46, at + 46 + nlen));
    at += 46 + nlen + xlen + clen;
    if (path.endsWith('/')) continue; // a folder
    if (flags & 1) throw new Error('encrypted');
    if (v.getUint32(loc, true) !== SIG_LOC) throw new Error('bad-zip');
    const start = loc + 30 + v.getUint16(loc + 26, true) + v.getUint16(loc + 28, true);
    const raw = u8.subarray(start, start + csize);
    total += usize;
    if (total > limits.bytes) throw new Error('too-big');
    const data = method === 0 ? raw.slice() : method === 8 ? await inflate(raw) : null;
    if (!data) throw new Error('method');
    out.push({ path, data });
  }
  return out;
}

/** Safe paths only (no "..", no absolute paths, no hidden Mac folders); one shared top folder is dropped. */
export function tidyPaths(entries: ZipEntry[]): ZipEntry[] {
  const ok = entries
    .map((e) => ({ ...e, path: e.path.replace(/\\/g, '/').replace(/^\.\/+/, '') }))
    .filter((e) => e.path && !e.path.startsWith('/') && !e.path.split('/').some((p) => p === '..' || p === '') && !e.path.startsWith('__MACOSX/') && !/(^|\/)\.DS_Store$/.test(e.path));
  const tops = new Set(ok.map((e) => e.path.split('/')[0]));
  const hasRootIndex = ok.some((e) => e.path === 'index.html');
  if (tops.size === 1 && !hasRootIndex && ok.every((e) => e.path.includes('/'))) {
    const top = [...tops][0] + '/';
    return ok.map((e) => ({ ...e, path: e.path.slice(top.length) }));
  }
  return ok;
}

/** The page the app starts at: index.html at the top, else the shallowest .html. */
export function findEntry(paths: string[]): string | null {
  if (paths.includes('index.html')) return 'index.html';
  const html = paths.filter((p) => /\.html?$/i.test(p)).sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length);
  return html.find((p) => /(^|\/)index\.html?$/i.test(p)) ?? html[0] ?? null;
}
