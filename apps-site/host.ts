/** Only ProNotes' own addresses may drive this page (the bridge talks to it). */
export function allowedHost(h: string | null): string | null {
  if (!h) return null;
  try {
    const u = new URL(h);
    if (u.origin !== h) return null;
    if (u.protocol === 'https:' && (u.hostname === 'mahbuburrahman.bd' || u.hostname.endsWith('.mahbuburrahman.bd') || u.hostname === 'advocate-mahbub.github.io')) return h;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return h;
  } catch { /* not an address */ }
  return null;
}
