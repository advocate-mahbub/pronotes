/**
 * The service worker of apps.mahbuburrahman.bd (decisions.md 81). Installed apps live in IndexedDB; their
 * files are served from there at /a/<app id>/<path>, so they run offline. Every page of an app gets the
 * ProNotes bridge (/bridge.js) first, which brings the ProNotes keyboard layout into its text boxes.
 * The site's own page is network-first with a cached copy for offline.
 */
import { getFile, typeOf } from './store';
import { withBridge } from './inject';

/* eslint-disable @typescript-eslint/no-explicit-any */
const sw = self as any;
const SHELL = 'pn-apps-shell-v1';

sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', (e: any) => e.waitUntil(sw.clients.claim()));

async function serveApp(url: URL): Promise<Response> {
  const parts = url.pathname.split('/').slice(2); // ['', 'a', id, ...path]
  const id = decodeURIComponent(parts.shift() ?? '');
  let path = parts.map(decodeURIComponent).join('/');
  if (!path || path.endsWith('/')) path += 'index.html';
  let f = await getFile(id, path);
  if (!f && !/\.[a-z0-9]+$/i.test(path)) { path += '/index.html'; f = await getFile(id, path); }
  if (!f) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  const type = f.type || typeOf(path);
  const headers = { 'content-type': type, 'cache-control': 'no-cache' };
  if (type.startsWith('text/html')) return new Response(withBridge(await f.data.text()), { headers });
  return new Response(f.data, { headers });
}

async function shell(req: Request): Promise<Response> {
  const cache = await caches.open(SHELL);
  try {
    const r = await fetch(req);
    if (r.ok && req.method === 'GET') void cache.put(req, r.clone());
    return r;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) ?? (await cache.match('/index.html')) ?? Response.error();
  }
}

sw.addEventListener('fetch', (e: any) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/a/')) return e.respondWith(serveApp(url));
  if (e.request.method === 'GET') e.respondWith(shell(e.request));
});
