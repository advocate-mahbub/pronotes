/** Finding a zipped web app's own icon (decisions.md 91). */
/** A path relative to a file inside the app, made a path from the app's root ('' when it leaves the app). */
function inApp(from: string, href: string): string {
  if (/^[a-z]+:|^\/\//i.test(href)) return '';
  const base = href.startsWith('/') ? [] : from.split('/').slice(0, -1);
  for (const part of href.replace(/^\//, '').split(/[?#]/)[0].split('/')) {
    if (part === '..') base.pop();
    else if (part && part !== '.') base.push(decodeURIComponent(part));
  }
  return base.join('/');
}

/**
 * The app's icon (decisions.md 91): the largest one its manifest names, else the page's apple-touch-icon or
 * icon link, else a favicon at its root; only a file that is really in the zip. '' = none (a letter is shown).
 */
export function iconOf(files: { path: string; data: Uint8Array }[], entry: string): string {
  const has = new Set(files.map((f) => f.path));
  const dec = new TextDecoder();
  const man = files.find((f) => /(^|\/)(manifest\.(webmanifest|json))$/.test(f.path) && f.path.split('/').length <= 2);
  if (man) {
    try {
      const j = JSON.parse(dec.decode(man.data)) as { icons?: { src?: string; sizes?: string; purpose?: string }[] };
      const size = (s?: string) => Math.max(0, ...String(s ?? '').split(/\s+/).map((x) => (x === 'any' ? 1024 : parseInt(x, 10) || 0)));
      const icons = (j.icons ?? []).filter((i) => i.src && !/monochrome/.test(i.purpose ?? '')).sort((x, y) => size(y.sizes) - size(x.sizes));
      for (const i of icons) { const p = inApp(man.path, i.src!); if (has.has(p)) return p; }
    } catch { /* not JSON */ }
  }
  const page = files.find((f) => f.path === entry);
  if (page) {
    const html = dec.decode(page.data);
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
    for (const rel of ['apple-touch-icon', 'icon', 'shortcut icon']) {
      for (const l of links) {
        if (!new RegExp('rel=["\']?' + rel + '["\'\\s>]', 'i').test(l)) continue;
        const href = l.match(/href=["']?([^"'\s>]+)/i)?.[1];
        const p = href ? inApp(entry, href) : '';
        if (p && has.has(p)) return p;
      }
    }
  }
  for (const p of ['favicon.svg', 'favicon.png', 'favicon.ico', 'icon.png', 'logo.png']) if (has.has(p)) return p;
  return '';
}
