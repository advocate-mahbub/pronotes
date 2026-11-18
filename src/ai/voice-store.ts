/**
 * An AI voice recording kept on this device while it is being made, piece by piece (16 kHz, 16-bit),
 * so a phone call, a lost connection or a closed app does not lose what was said. It is deleted as soon
 * as the text is in the document or the user throws it away. It never leaves the device except to be
 * written (to Google, with the user's own key), and is not part of backups.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface VoiceDB extends DBSchema {
  pieces: { key: number; value: { n: number; pcm: Int16Array } };
  meta: { key: string; value: { started: number } };
}

let db: Promise<IDBPDatabase<VoiceDB>> | null = null;
const open = () => (db ??= openDB<VoiceDB>('pronotes-voice', 1, {
  upgrade(d) {
    d.createObjectStore('pieces', { keyPath: 'n' });
    d.createObjectStore('meta');
  },
}));

const RATE = 16000;
const toInt16 = (f: Float32Array) => {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
  return out;
};

/** A new recording begins: anything left from before is dropped. */
export async function beginHeld(): Promise<void> {
  try {
    const d = await open();
    const tx = d.transaction(['pieces', 'meta'], 'readwrite');
    await tx.objectStore('pieces').clear();
    await tx.objectStore('meta').put({ started: Date.now() }, 'rec');
    await tx.done;
  } catch { /* private browsing: works without keeping */ }
}

/** One more piece of the recording. */
export async function addHeld(samples: Float32Array): Promise<void> {
  if (!samples.length) return;
  try {
    const d = await open();
    const n = await d.count('pieces');
    await d.put('pieces', { n, pcm: toInt16(samples) });
  } catch { /* keeping is best effort */ }
}

/** The kept recording, if there is one: its samples and length in seconds. */
export async function loadHeld(): Promise<{ samples: Float32Array; seconds: number; started: number } | null> {
  try {
    const d = await open();
    const meta = await d.get('meta', 'rec');
    const pieces = await d.getAll('pieces');
    if (!meta || !pieces.length) return null;
    pieces.sort((a, b) => a.n - b.n);
    const len = pieces.reduce((s, p) => s + p.pcm.length, 0);
    const samples = new Float32Array(len);
    let o = 0;
    for (const p of pieces) { for (let i = 0; i < p.pcm.length; i++) samples[o + i] = p.pcm[i] / 32767; o += p.pcm.length; }
    return { samples, seconds: len / RATE, started: meta.started };
  } catch {
    return null;
  }
}

/** Written or thrown away: nothing is kept. */
export async function clearHeld(): Promise<void> {
  try {
    const d = await open();
    const tx = d.transaction(['pieces', 'meta'], 'readwrite');
    await tx.objectStore('pieces').clear();
    await tx.objectStore('meta').delete('rec');
    await tx.done;
  } catch { /* nothing to clear */ }
}
