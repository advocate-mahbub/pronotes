// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { authUrl, takeRedirect, currentToken, uploadBackup, listBackups, downloadBackup, DriveError, DRIVE_SCOPE, pruneBackups, trashBackup, driveBackupName } from '../../src/storage/gdrive';

beforeEach(() => sessionStorage.clear());

describe('Google sign-in by redirect', () => {
  it('asks only for drive.file, with our state and a token response', () => {
    const u = new URL(authUrl('cid.apps.googleusercontent.com', 'https://notes.example/', 'abc'));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('scope')).toBe(DRIVE_SCOPE);
    expect(u.searchParams.get('response_type')).toBe('token');
    expect(u.searchParams.get('state')).toBe('abc');
    expect(u.searchParams.get('redirect_uri')).toBe('https://notes.example/');
  });
  it('keeps the token only when the state matches, for this session only', () => {
    sessionStorage.setItem('pronotes.gdrive.state', 's1');
    sessionStorage.setItem('pronotes.gdrive.after', 'backup');
    const r = takeRedirect('#access_token=TOKEN&expires_in=3600&state=s1', 1000);
    expect(r).toEqual({ ok: true, after: 'backup' });
    expect(currentToken(2000)).toBe('TOKEN');
    expect(currentToken(1000 + 3600_000)).toBeNull(); // expired
    expect(localStorage.length).toBe(0); // nothing kept beyond this session
  });
  it('refuses a token it did not ask for', () => {
    sessionStorage.setItem('pronotes.gdrive.state', 's1');
    expect(takeRedirect('#access_token=EVIL&state=other')).toEqual({ ok: false, error: 'state' });
    expect(currentToken()).toBeNull();
    expect(takeRedirect('#error=access_denied&state=s1')).toEqual({ ok: false, error: 'access_denied' });
    expect(takeRedirect('#section-2')).toBeNull();
  });
});

describe('Drive calls', () => {
  /** A tiny Drive: one folder, files in it. */
  function fakeDrive() {
    const calls: { url: string; init: RequestInit }[] = [];
    let folder: string | null = null;
    const files: { id: string; name: string; createdTime: string; body: string }[] = [];
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    const f = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const u = new URL(url);
      if (u.pathname === '/drive/v3/files' && init.method === 'GET') {
        const q = u.searchParams.get('q') ?? '';
        if (q.includes('folder')) return json({ files: folder ? [{ id: folder }] : [] });
        return json({ files: [...files].reverse().map(({ body: _b, ...x }) => x) });
      }
      if (u.pathname === '/drive/v3/files' && init.method === 'POST') { folder = 'F1'; return json({ id: folder }); }
      if (u.pathname === '/upload/drive/v3/files') {
        const body = String(init.body);
        const name = JSON.parse(body.split('\r\n')[3]).name;
        const content = body.split('\r\n')[7];
        files.push({ id: 'B' + files.length, name, createdTime: new Date(files.length * 1000).toISOString(), body: content });
        return json({ id: 'B' + (files.length - 1), name });
      }
      const m = u.pathname.match(/^\/drive\/v3\/files\/(.+)$/);
      if (m && init.method === 'PATCH') { const i = files.findIndex((x) => x.id === m[1]); files.splice(i, 1); return json({ id: m[1] }); }
      if (m) return new Response(files.find((x) => x.id === m[1])!.body, { headers: { 'content-type': 'application/json' } });
      return json({}, 404);
    }) as unknown as typeof fetch;
    return { f, calls, files };
  }

  it('makes the folder once, uploads into it, lists newest first, downloads', async () => {
    const d = fakeDrive();
    await uploadBackup('T', 'a.json', '{"v":1}', d.f);
    await uploadBackup('T', 'b.json', '{"v":2}', d.f);
    expect(d.calls.filter((c) => c.init.method === 'POST' && c.url.startsWith('https://www.googleapis.com/drive/v3/files?'))).toHaveLength(1); // one folder
    expect(d.calls.every((c) => (c.init.headers as Record<string, string>).Authorization === 'Bearer T')).toBe(true);
    const list = await listBackups('T', d.f);
    expect(list.map((x) => x.name)).toEqual(['b.json', 'a.json']);
    expect(await downloadBackup('T', list[1].id, d.f)).toBe('{"v":1}');
  });

  it('an expired sign-in is told apart from a network problem', async () => {
    const r401 = (async () => new Response('', { status: 401 })) as unknown as typeof fetch;
    await expect(listBackups('T', r401)).rejects.toMatchObject({ code: 'auth' });
    const off = (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    const e = await listBackups('T', off).catch((x) => x);
    expect(e).toBeInstanceOf(DriveError);
    expect(e.code).toBe('network');
  });

  it('keeps the newest N, sends only the older ones to the Trash', async () => {
    const d = fakeDrive();
    for (let i = 0; i < 7; i++) await uploadBackup('T', `pronotes-backup-${i}.json`, '{}', d.f);
    expect(await pruneBackups('T', 5, d.f)).toBe(2);
    expect((await listBackups('T', d.f)).map((x) => x.name)).toEqual([6, 5, 4, 3, 2].map((i) => `pronotes-backup-${i}.json`));
    expect(d.calls.filter((c) => c.init.method === 'PATCH').every((c) => JSON.parse(String(c.init.body)).trashed === true)).toBe(true); // Trash, not delete
    expect(await pruneBackups('T', 0, d.f)).toBe(0); // "all" never removes
    expect(await pruneBackups('T', 10, d.f)).toBe(0);
  });

  it('never trashes a file that is not a ProNotes backup', async () => {
    const d = fakeDrive();
    await uploadBackup('T', 'my-notes.json', '{}', d.f);
    await uploadBackup('T', 'pronotes-backup-a.json', '{}', d.f);
    await uploadBackup('T', 'pronotes-backup-b.json', '{}', d.f);
    expect(await pruneBackups('T', 1, d.f)).toBe(1);
    expect((await listBackups('T', d.f)).map((x) => x.name)).toEqual(['pronotes-backup-b.json', 'my-notes.json']);
    await trashBackup('T', d.files[0].id, d.f);
    expect(d.files.map((x) => x.name)).toEqual(['pronotes-backup-b.json']);
  });

  it('names Drive backups with the time, so a day can hold several', () => {
    expect(driveBackupName(new Date(2026, 10, 18, 8, 46))).toBe('pronotes-backup-2026-11-18-0846.json');
  });
});

