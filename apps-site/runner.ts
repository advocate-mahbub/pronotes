/**
 * apps.mahbuburrahman.bd (decisions.md 81): the user's own web apps, added as .zip files, kept in this
 * site's IndexedDB and run from here — a different address from ProNotes, so an app can never read
 * ProNotes' drafts, settings or keys. ProNotes shows this page inside ▦ → আমার অ্যাপ.
 */
import { readZip, tidyPaths, findEntry } from './zip';
import { iconOf } from './icon';
import { listApps, putApp, removeApp, getApp, typeOf, type AppInfo } from './store';
import { allowedHost } from './host';

const params = new URLSearchParams(location.search);
const host = allowedHost(params.get('host'));
try { if (host) sessionStorage.setItem('pn-host', host); } catch { /* storage off */ }
const en = params.get('lang') === 'en';
const T = (bn: string, eng: string) => (en ? eng : bn);
document.documentElement.lang = en ? 'en' : 'bn';

const root = document.getElementById('root')!;
const swReady: Promise<unknown> = 'serviceWorker' in navigator
  ? navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready)
  : Promise.reject(new Error('no-sw'));
swReady.catch(() => undefined);

const size = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
};

const ERR: Record<string, [string, string]> = {
  'not-zip': ['এটা .zip ফাইল নয়', 'This is not a .zip file'],
  zip64: ['ফাইলটা অনেক বড় (ZIP64) — খোলা যায় না', 'The file is too big (ZIP64)'],
  'too-many': ['zip-এ ৫০০০-এর বেশি ফাইল', 'More than 5000 files in the zip'],
  'too-big': ['খোলার পর ৩০০ MB-এর বেশি — রাখা যাবে না', 'Over 300 MB unpacked — too big'],
  encrypted: ['পাসওয়ার্ড দেওয়া zip খোলা যায় না', 'Password-protected zips cannot be opened'],
  method: ['এই zip-এর সংকোচন পদ্ধতি চেনা নেই', 'Unknown compression in this zip'],
  'bad-zip': ['zip ফাইলটা ভাঙা', 'The zip file is damaged'],
  'no-entry': ['zip-এ কোনো .html পাতা নেই — এটা ওয়েব অ্যাপ নয়', 'No .html page in the zip — not a web app'],
};
const errText = (e: unknown) => { const k = e instanceof Error ? e.message : ''; return ERR[k] ? T(...ERR[k]) : T('zip থেকে অ্যাপ যোগ করা গেল না', 'Could not add the app'); };

/** The app's name: its manifest, else its page title, else the file name. */
async function nameOf(files: { path: string; data: Uint8Array }[], entry: string, fileName: string): Promise<string> {
  const dec = new TextDecoder();
  const man = files.find((f) => /(^|\/)(manifest\.(webmanifest|json))$/.test(f.path) && f.path.split('/').length <= 2);
  if (man) { try { const j = JSON.parse(dec.decode(man.data)); if (j.name || j.short_name) return String(j.name || j.short_name).slice(0, 60); } catch { /* not JSON */ } }
  const page = files.find((f) => f.path === entry);
  const title = page ? dec.decode(page.data).match(/<title[^>]*>([^<]{1,80})<\/title>/i)?.[1]?.trim() : '';
  return title || fileName.replace(/\.zip$/i, '');
}

export async function install(file: File): Promise<AppInfo> {
  const files = tidyPaths(await readZip(await file.arrayBuffer()));
  const entry = findEntry(files.map((f) => f.path));
  if (!entry) throw new Error('no-entry');
  const name = await nameOf(files, entry, file.name);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'app';
  const info: AppInfo = { id: slug + '-' + Math.random().toString(36).slice(2, 6), name, entry, size: files.reduce((s, f) => s + f.data.length, 0), files: files.length, addedAt: Date.now(), source: file.name, icon: iconOf(files, entry) };
  await putApp(info, files.map((f) => ({ path: f.path, type: typeOf(f.path), data: new Blob([f.data as BlobPart], { type: typeOf(f.path) }) })));
  return info;
}

let message = '';
let editing = false;
const hue = (s: string) => [...s].reduce((n, c) => (n * 31 + c.codePointAt(0)!) % 360, 7);
async function showList() {
  const apps = await listApps().catch(() => [] as AppInfo[]);
  const input = h('input', { type: 'file', accept: '.zip,application/zip,application/x-zip-compressed', hidden: '', 'data-testid': 'apps-add-file' }) as HTMLInputElement;
  input.multiple = true;
  input.onchange = async () => {
    const list = [...(input.files ?? [])];
    input.value = '';
    for (const f of list) {
      message = T('যোগ হচ্ছে: ', 'Adding: ') + f.name;
      void showList();
      try { const a = await install(f); message = T('যোগ হলো: ', 'Added: ') + a.name; } catch (e) { message = '⚠ ' + f.name + ': ' + errText(e); }
    }
    void showList();
  };
  const add = h('button', { class: 'primary', 'data-testid': 'apps-add' }, T('+ zip থেকে অ্যাপ যোগ করুন', '+ Add an app from a zip'));
  add.onclick = () => input.click();
  // icons like a phone's home screen (decisions.md 91); "সাজান" shows × on each to delete
  const edit = h('button', { 'data-testid': 'apps-edit' }, editing ? T('শেষ', 'Done') : T('সাজান', 'Edit'));
  edit.onclick = () => { editing = !editing; void showList(); };
  const list = h('ul', { class: 'icons' + (editing ? ' editing' : ''), 'data-testid': 'apps-list' });
  for (const a of apps) {
    const img = a.icon
      ? h('img', { src: `/a/${encodeURIComponent(a.id)}/${a.icon.split('/').map(encodeURIComponent).join('/')}`, alt: '', draggable: 'false' })
      : h('span', { class: 'letter', style: `background:hsl(${hue(a.name)} 45% 42%)` }, [...a.name][0]?.toUpperCase() ?? '?');
    if (img instanceof HTMLImageElement) img.onerror = () => img.replaceWith(h('span', { class: 'letter', style: `background:hsl(${hue(a.name)} 45% 42%)` }, [...a.name][0]?.toUpperCase() ?? '?'));
    const open = h('button', { class: 'tile', 'data-testid': 'apps-open-' + a.id, title: `${a.name} · ${size(a.size)} · ${a.files} ${T('ফাইল', 'files')}` }, h('span', { class: 'img' }, img), h('span', { class: 'name' }, a.name));
    open.onclick = () => { if (!editing) void showApp(a.id); };
    const del = h('button', { class: 'del', 'data-testid': 'apps-del-' + a.id, 'aria-label': T('মুছুন', 'Delete') + ' ' + a.name }, '×');
    del.onclick = async () => { if (confirm(T(`"${a.name}" এই ডিভাইস থেকে মুছে ফেলবেন?`, `Delete "${a.name}" from this device?`))) { await removeApp(a.id); void showList(); } };
    list.append(h('li', { class: 'icon', 'data-testid': 'apps-card' }, open, ...(editing ? [del] : [])));
  }
  root.replaceChildren(
    h('div', { class: 'bar' }, h('strong', {}, T('আমার অ্যাপ', 'My apps')), h('span', { class: 'sp' }), ...(apps.length ? [edit] : []), add, input),
    ...(message ? [h('p', { class: message.startsWith('⚠') ? 'err' : 'note', role: 'status', 'data-testid': 'apps-msg' }, message)] : []),
    apps.length ? list : h('p', { class: 'empty', 'data-testid': 'apps-empty' }, T('এখনো কোনো অ্যাপ নেই। ওয়েব অ্যাপের .zip যোগ করুন (ভেতরে index.html থাকতে হবে)।', 'No apps yet. Add a web app as a .zip (with an index.html inside).')),
    h('p', { class: 'note' }, T(
      'অ্যাপ এই ডিভাইসেই থাকে, ইন্টারনেট ছাড়াও চলে। অ্যাপের লেখার ঘরে ProNotes-এর কিবোর্ড লেআউটে বাংলা লেখা যায় (কিবোর্ড বা ডিভাইসের নিজের কিবোর্ড দিয়ে)। অ্যাপগুলো ProNotes-এর ড্রাফট বা সেটিং দেখতে পারে না।',
      'Apps stay on this device and work offline. Their text boxes type Bangla with the ProNotes keyboard layout (hardware or the device keyboard). Apps cannot see ProNotes drafts or settings.')),
  );
}

async function showApp(id: string) {
  const a = await getApp(id);
  if (!a) return showList();
  root.replaceChildren(h('p', { class: 'busy' }, T('অ্যাপ খুলছে…', 'Opening…')));
  try { await swReady; } catch { message = '⚠ ' + T('এই ব্রাউজারে অ্যাপ চালানো যায় না (service worker নেই)', 'This browser cannot run apps (no service worker)'); return showList(); }
  const back = h('button', { 'data-testid': 'apps-back' }, '← ' + T('অ্যাপগুলো', 'Apps'));
  back.onclick = () => { message = ''; void showList(); };
  const frame = h('iframe', { src: `/a/${encodeURIComponent(a.id)}/${a.entry.split('/').map(encodeURIComponent).join('/')}`, title: a.name, 'data-testid': 'apps-frame', allow: 'clipboard-read; clipboard-write; fullscreen; microphone; camera' });
  root.replaceChildren(h('div', { class: 'slim' }, back, h('strong', {}, a.name)), h('div', { class: 'stage' }, frame));
}

if (!(globalThis as { __PN_TEST__?: boolean }).__PN_TEST__) void showList();
