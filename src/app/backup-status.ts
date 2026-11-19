/** When each kind of backup was last made on this device (a device-only setting, never in a backup). */
export interface BackupLast { drive?: number; device?: number }
/** A button inside a message ("ডিভাইসে নামান"…). */
export interface ToastAction { id: string; label: string; run: () => void }

/** How long ago, as a translatable key plus its number: agoKey → 'এইমাত্র' | '{n} মিনিট আগে' | '{n} ঘণ্টা আগে' | '{n} দিন আগে'. */
export function agoKey(t: number, now = Date.now()): string {
  const m = Math.round((now - t) / 60000);
  if (m < 2) return 'এইমাত্র';
  if (m < 60) return '{n} মিনিট আগে';
  return m < 60 * 24 ? '{n} ঘণ্টা আগে' : '{n} দিন আগে';
}
export function agoN(t: number, now = Date.now()): number {
  const m = Math.round((now - t) / 60000);
  return m < 60 ? m : m < 60 * 24 ? Math.round(m / 60) : Math.round(m / 60 / 24);
}
