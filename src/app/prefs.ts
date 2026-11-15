/**
 * Temporary per-device storage for M2 previews (localStorage). M3 replaces this with IndexedDB
 * documents; preferences may stay here. Every access is wrapped: storage can be unavailable.
 */
const P = 'pronotes.';
export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(P + key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown): void {
  try {
    const v = JSON.stringify(value);
    if (localStorage.getItem(P + key) === v) return;
    localStorage.setItem(P + key, v);
    window.dispatchEvent(new CustomEvent('pronotes-saved', { detail: key }));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

/** Every setting kept on this device (for the backup file). */
export function allPrefs(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(P)) continue;
      try {
        out[k.slice(P.length)] = JSON.parse(localStorage.getItem(k) as string);
      } catch {
        /* not JSON: skip */
      }
    }
  } catch {
    /* storage blocked */
  }
  return out;
}

/** Writes settings from a backup back; returns how many were written. */
export function restorePrefs(store: Record<string, unknown>): number {
  let n = 0;
  for (const [k, v] of Object.entries(store)) {
    // Consent is a user decision, never an importable preference. Backup files are untrusted.
    if (/consent$/i.test(k)) continue;
    if (!/^[\w.-]{1,64}$/.test(k) || v === undefined) continue;
    try {
      localStorage.setItem(P + k, JSON.stringify(v));
      n++;
    } catch {
      /* full or blocked */
    }
  }
  return n;
}
