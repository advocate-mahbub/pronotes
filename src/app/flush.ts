/** Save hooks that must run before the app reloads itself (e.g. to apply an update). */
const flushers = new Set<() => Promise<void>>();

export function registerFlush(fn: () => Promise<void>): () => void {
  flushers.add(fn);
  return () => flushers.delete(fn);
}

export async function flushAll(): Promise<void> {
  await Promise.all([...flushers].map((f) => f().catch(() => undefined)));
}
