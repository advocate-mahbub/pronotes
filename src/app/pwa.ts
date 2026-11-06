/**
 * Service worker (offline + updates) and install support.
 * Not used in the claude.ai preview or on plain http (service workers need https or localhost).
 */
import { registerSW } from 'virtual:pwa-register';

export interface PwaEvents {
  onNeedRefresh: () => void;
  onOfflineReady: () => void;
}

let update: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let events: PwaEvents | null = null;

export function pwaSupported(): boolean {
  const w = window as unknown as { claude?: unknown };
  return 'serviceWorker' in navigator && window.isSecureContext && !w.claude;
}

export function startPwa(ev: PwaEvents): void {
  if (!pwaSupported()) return;
  events = ev;
  update = registerSW({
    immediate: true,
    onNeedRefresh: ev.onNeedRefresh,
    onOfflineReady: ev.onOfflineReady,
    onRegisteredSW: (_url, r) => {
      registration = r;
      // look for a new version every hour while the app stays open, and when it comes back to the front
      if (r) {
        setInterval(() => r.update().catch(() => undefined), 60 * 60 * 1000);
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && r.update().catch(() => undefined));
      }
    },
  });
}

/** Activate the waiting version and reload. Call only after the open draft is saved. */
export async function applyUpdate(): Promise<void> {
  await update?.(true);
}

/** Ask the server for a new version now. Resolves true when the check could run. */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false;
  try {
    await registration.update();
    // a version found earlier and postponed with "পরে" is still waiting: show the notice again
    if (registration.waiting) events?.onNeedRefresh();
    return true;
  } catch {
    return false;
  }
}

export const isStandalone = (): boolean =>
  (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
  Boolean((navigator as unknown as { standalone?: boolean }).standalone);

export const isAppleDevice = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Chromium's install prompt (not available on iPad/iPhone: there it is Share → Add to Home Screen). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}
export const canPromptInstall = () => deferred !== null;
export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const d = deferred;
  deferred = null;
  await d.prompt();
  const r = await d.userChoice;
  listeners.forEach((l) => l());
  return r.outcome === 'accepted';
}
