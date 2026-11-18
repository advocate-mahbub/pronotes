/**
 * Backups in the user's own Google Drive.
 *
 * Sign-in is a plain OAuth redirect to Google and back (no Google script runs in ProNotes, which also
 * works in the iPad Home Screen app where popups lose their way back). The access is `drive.file`:
 * ProNotes sees only the files it made itself, in a "ProNotes Backups" folder — nothing else in Drive.
 * The access token lives in this tab's sessionStorage only (about an hour), never in the repository,
 * the backup files or localStorage. The OAuth Client ID comes from the build (GitHub Actions secret
 * GOOGLE_CLIENT_ID → VITE_GOOGLE_CLIENT_ID); without it the feature stays off.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
export const DRIVE_FOLDER = 'ProNotes Backups';

const KEY_TOKEN = 'pronotes.gdrive.token';
const KEY_STATE = 'pronotes.gdrive.state';
const KEY_AFTER = 'pronotes.gdrive.after';

export const clientId = (): string => (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';
export const driveEnabled = () => Boolean(clientId());

interface Token { access: string; expires: number }
const ss = () => { try { return window.sessionStorage; } catch { return null; } };

export function currentToken(now = Date.now()): string | null {
  try {
    const t = JSON.parse(ss()?.getItem(KEY_TOKEN) ?? 'null') as Token | null;
    return t && t.expires - 60_000 > now ? t.access : null;
  } catch { return null; }
}

/** What to do once back from Google (e.g. "backup"). */
export type AfterSignIn = 'backup' | 'list';

/** The address Google sends the user back to: the app itself. Register exactly this in Google Cloud. */
export const redirectUri = (base = document.baseURI) => new URL('./', base).href;

export function authUrl(id: string, redirect: string, state: string): string {
  const q = new URLSearchParams({ client_id: id, redirect_uri: redirect, response_type: 'token', scope: DRIVE_SCOPE, state, include_granted_scopes: 'true', prompt: 'select_account' });
  return `${AUTH}?${q}`;
}

/** Off to Google's sign-in page; the app comes back with the token in the address (#access_token=…). */
export function signIn(after?: AfterSignIn): void {
  const state = crypto.getRandomValues(new Uint32Array(4)).join('-');
  ss()?.setItem(KEY_STATE, state);
  if (after) ss()?.setItem(KEY_AFTER, after);
  else ss()?.removeItem(KEY_AFTER);
  location.assign(authUrl(clientId(), redirectUri(), state));
}

/**
 * On start: if Google just sent the user back, keep the token (only when the state matches the one we
 * sent, so no other site can plant a token) and clean the address. Returns what to do next, if anything.
 */
export function takeRedirect(hash = location.hash, now = Date.now()): { ok: boolean; after?: AfterSignIn; error?: string } | null {
  if (!/access_token=|error=/.test(hash)) return null;
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const expected = ss()?.getItem(KEY_STATE);
  const after = (ss()?.getItem(KEY_AFTER) as AfterSignIn | null) ?? undefined;
  ss()?.removeItem(KEY_STATE);
  ss()?.removeItem(KEY_AFTER);
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* not in a browser */ }
  if (p.get('error')) return { ok: false, error: p.get('error')! };
  if (!expected || p.get('state') !== expected) return { ok: false, error: 'state' };
  const access = p.get('access_token');
  if (!access) return { ok: false, error: 'token' };
  const t: Token = { access, expires: now + Number(p.get('expires_in') ?? 3600) * 1000 };
  ss()?.setItem(KEY_TOKEN, JSON.stringify(t));
  return { ok: true, after };
}

export class DriveError extends Error {
  constructor(public code: 'auth' | 'network' | 'quota' | 'other', message: string) { super(message); }
}

type Fetch = typeof fetch;
async function call<T>(url: string, init: RequestInit, token: string, f: Fetch = fetch, raw = false): Promise<T> {
  let r: Response;
  try {
    r = await f(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  } catch (e) {
    throw new DriveError('network', String(e));
  }
  if (r.status === 401 || r.status === 403 && /auth|scope|insufficient/i.test(await r.clone().text())) {
    ss()?.removeItem(KEY_TOKEN);
    throw new DriveError('auth', String(r.status));
  }
  if (r.status === 403 || r.status === 429) throw new DriveError('quota', String(r.status));
  if (!r.ok) throw new DriveError('other', `${r.status} ${(await r.text()).slice(0, 120)}`);
  if (raw) return r.text() as Promise<T>;
  const type = r.headers.get('content-type') ?? '';
  return (type.includes('json') ? r.json() : r.text()) as Promise<T>;
}

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** The "ProNotes Backups" folder (made the first time). */
export async function backupFolder(token: string, f: Fetch = fetch): Promise<string> {
  const query = `name='${q(DRIVE_FOLDER)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await call<{ files: { id: string }[] }>(`${API}/files?${new URLSearchParams({ q: query, fields: 'files(id)', spaces: 'drive' })}`, { method: 'GET' }, token, f);
  if (found.files?.[0]) return found.files[0].id;
  const made = await call<{ id: string }>(`${API}/files?fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  }, token, f);
  return made.id;
}

/** One backup file into the folder. */
export async function uploadBackup(token: string, name: string, json: string, f: Fetch = fetch): Promise<{ id: string; name: string }> {
  const folder = await backupFolder(token, f);
  const boundary = 'pronotes' + Math.random().toString(36).slice(2);
  const body = [
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify({ name, parents: [folder], mimeType: 'application/json' }),
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', json, `--${boundary}--`, '',
  ].join('\r\n');
  return call(`${UPLOAD}?uploadType=multipart&fields=id,name`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }, token, f);
}

export interface DriveBackup { id: string; name: string; createdTime: string; size?: string }
/** The latest backups in the folder, newest first. */
export async function listBackups(token: string, f: Fetch = fetch, max = 15): Promise<DriveBackup[]> {
  const folder = await backupFolder(token, f);
  const r = await call<{ files: DriveBackup[] }>(`${API}/files?${new URLSearchParams({
    q: `'${q(folder)}' in parents and trashed=false`, orderBy: 'createdTime desc', pageSize: String(max), fields: 'files(id,name,createdTime,size)',
  })}`, { method: 'GET' }, token, f);
  return r.files ?? [];
}

export async function downloadBackup(token: string, id: string, f: Fetch = fetch): Promise<string> {
  return call<string>(`${API}/files/${encodeURIComponent(id)}?alt=media`, { method: 'GET' }, token, f, true); // the file's own text, as it was saved
}

/** Forget the token here and ask Google to cancel it. */
export async function signOut(f: Fetch = fetch): Promise<void> {
  const t = currentToken();
  ss()?.removeItem(KEY_TOKEN);
  if (t) await f(`${REVOKE}?token=${encodeURIComponent(t)}`, { method: 'POST' }).catch(() => undefined);
}
