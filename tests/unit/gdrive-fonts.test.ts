// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { listDriveFonts, uploadDriveFont, downloadDriveFont, planFontSync, FONTS_FOLDER, type DriveFont } from '../../src/storage/gdrive';

// decisions.md 80: own fonts kept in the user's own Drive, so each device gets them without adding again
function fakeDrive() {
  const folders: Record<string, string> = {};
  const files: { id: string; name: string; parent: string; appProperties: Record<string, string>; data: Uint8Array }[] = [];
  const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
  const f = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    if (u.pathname === '/drive/v3/files' && init.method === 'GET') {
      const q = u.searchParams.get('q') ?? '';
      const name = q.match(/^name='([^']+)'/)?.[1];
      if (name) return json({ files: folders[name] ? [{ id: folders[name] }] : [] });
      const parent = q.match(/^'([^']+)' in parents/)![1];
      return json({ files: files.filter((x) => x.parent === parent).map(({ data: _d, parent: _p, ...x }) => x) });
    }
    if (u.pathname === '/drive/v3/files' && init.method === 'POST') { const b = JSON.parse(String(init.body)); folders[b.name] = 'F-' + b.name; return json({ id: folders[b.name] }); }
    if (u.pathname === '/upload/drive/v3/files') {
      const bytes = new Uint8Array(await (init.body as Blob).arrayBuffer());
      const text = new TextDecoder('latin1').decode(bytes);
      const meta = JSON.parse(text.split('\r\n')[3]);
      const start = text.indexOf('octet-stream\r\n\r\n') + 'octet-stream\r\n\r\n'.length;
      const end = text.lastIndexOf('\r\n--');
      files.push({ id: 'D' + files.length, name: meta.name, parent: meta.parents[0], appProperties: meta.appProperties, data: bytes.slice(start, end) });
      return json({ id: 'D' + (files.length - 1) });
    }
    const m = u.pathname.match(/^\/drive\/v3\/files\/(.+)$/);
    if (m) return new Response(files.find((x) => x.id === m[1])!.data.slice().buffer as ArrayBuffer);
    return json({});
  }) as unknown as typeof fetch;
  return { f, files, folders };
}

describe('own fonts in Google Drive', () => {
  it('uploads the bytes unchanged into "ProNotes Fonts" with the font id and kind, and brings them back', async () => {
    const d = fakeDrive();
    const data = new Uint8Array([0, 1, 0, 0, 13, 10, 255, 45, 45]).buffer; // binary, with \r\n and -- inside
    await uploadDriveFont('T', { id: 'font-1', role: 'ansi', fileName: 'SutonnyMJ.ttf', data }, d.f);
    expect(Object.keys(d.folders)).toEqual([FONTS_FOLDER]);
    const list = await listDriveFonts('T', d.f);
    expect(list[0].appProperties).toEqual({ pnFont: 'font-1', role: 'ansi' });
    expect([...new Uint8Array(await downloadDriveFont('T', list[0].id, d.f))]).toEqual([...new Uint8Array(data)]);
  });

  it('plans: missing here comes down, missing there goes up, deleted here goes to Drive’s trash and never comes back', () => {
    const r = (id: string, pnFont: string): DriveFont => ({ id, name: pnFont + '.ttf', appProperties: { pnFont, role: 'uni' } });
    const p = planFontSync([{ id: 'a' }, { id: 'b' }], [r('D1', 'b'), r('D2', 'c'), r('D3', 'x')], ['x']);
    expect(p.down.map((x) => x.appProperties!.pnFont)).toEqual(['c']);
    expect(p.up).toEqual(['a']);
    expect(p.trash.map((x) => x.id)).toEqual(['D3']);
  });
});
