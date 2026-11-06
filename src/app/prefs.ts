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
    localStorage.setItem(P + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}
