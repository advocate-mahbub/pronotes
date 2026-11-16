/**
 * The Craft apps' "?host=parent" bridge (craft-web-host contract, the same for every Craft app).
 * The app runs in a same-origin iframe and talks to ProNotes with postMessage:
 *   app → ProNotes: <id>:ready, <id>:save {name, bytes, saveAs?}, <id>:dirty {dirty}, <id>:failed {error}
 *   ProNotes → app: <id>:open {name, bytes}
 * Unknown fields are ignored, so newer app versions that add fields keep working.
 */
import manifest from './apps.json';

export type BridgeKind = 'parent' | 'none' | 'unknown';
export interface CraftApp {
  id: string;
  name: string;
  /** Bangla description shown in the launcher. */
  label: string;
  repo: string;
  version: string;
  sha256: string;
  /** 'parent' = open/save go through ProNotes; 'none' = the app downloads files itself. */
  bridge: BridgeKind;
  /** File types for the Open box. */
  accept: string;
  enabled: boolean;
  /** Packaging fixes applied when the zip is unpacked (tools/fetch-craft-apps.mjs). */
  copy?: [string, string][];
  /** Bangla fonts from craft-fonts/ go into the app folder; apps with the bridge get them through font.add, the rest read fonts/manifest.txt. */
  fonts?: boolean;
  note?: string;
}

export const CRAFT_APPS = manifest.apps as CraftApp[];
export const enabledCraftApps = () => CRAFT_APPS.filter((a) => a.enabled);
export const craftApp = (id: string | null | undefined) => CRAFT_APPS.find((a) => a.id === id && a.enabled);

/** Address of the app page, relative to ProNotes (works from a sub-folder too). */
export function craftAppUrl(app: CraftApp, base: string, author?: string): string {
  const u = new URL(`apps/${app.id}/${app.version}/index.html`, base);
  if (app.bridge === 'parent') u.searchParams.set('host', 'parent');
  if (author) u.searchParams.set('author', author);
  return u.toString();
}

export type BridgeEvent =
  | { kind: 'ready'; appVersion?: string }
  | { kind: 'save'; name: string; bytes: ArrayBuffer; saveAs: boolean }
  | { kind: 'dirty'; dirty: boolean }
  | { kind: 'failed'; error: string };

/** Read one message from the app; null for anything that is not this app's bridge message. */
export function readBridgeMessage(appId: string, data: unknown): BridgeEvent | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (typeof m.type !== 'string' || !m.type.startsWith(appId + ':')) return null;
  switch (m.type.slice(appId.length + 1)) {
    case 'ready':
      return { kind: 'ready', appVersion: typeof m.appVersion === 'string' ? m.appVersion : undefined };
    case 'save': {
      const bytes = m.bytes instanceof ArrayBuffer ? m.bytes : ArrayBuffer.isView(m.bytes) ? copyView(m.bytes) : null;
      if (!bytes) return null;
      return { kind: 'save', name: safeName(typeof m.name === 'string' ? m.name : '', appId), bytes, saveAs: m.saveAs === true };
    }
    case 'dirty':
      return { kind: 'dirty', dirty: m.dirty === true };
    case 'failed':
      return { kind: 'failed', error: typeof m.error === 'string' ? m.error : '' };
    default:
      return null;
  }
}

/** The message that opens a file in the app. */
export const openMessage = (appId: string, name: string, bytes: ArrayBuffer) => ({ type: `${appId}:open`, name, bytes });

const copyView = (v: ArrayBufferView): ArrayBuffer => {
  const out = new ArrayBuffer(v.byteLength);
  new Uint8Array(out).set(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
  return out;
};

/** A bare file name: no folders, no control characters, never empty. */
export function safeName(name: string, appId: string): string {
  // eslint-disable-next-line no-control-regex
  const n = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
  return n || `${appId}-file`;
}

/**
 * Typing from ProNotes' own keyboard into the app (keyboard phase): the finished Unicode text
 * goes in through the app's control API, never as raw key events, so যুক্তাক্ষর stay whole.
 * Resolves false when the app has no such API yet.
 */
export const insertText = (frame: HTMLIFrameElement, appId: string, text: string) => runCommand(frame, appId, 'text.insert', { text });

/**
 * Run one of the app's own commands through its control API (window.<id>, craft-web-api), e.g.
 * 'file.new'. Resolves false when the app has no control API.
 */
export async function callCommand(frame: HTMLIFrameElement | null, appId: string, command: string, params: unknown = {}): Promise<unknown> {
  const api = (frame?.contentWindow as unknown as Record<string, { execute?: (c: string, p: unknown) => Promise<unknown> }> | null)?.[appId];
  if (!api?.execute) return undefined;
  return api.execute(command, params);
}

/** Families in a craft-fonts manifest.txt (family | style | file | …), with their files. */
export function manifestFonts(text: string): { family: string; file: string }[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('|').map((x) => x.trim())).filter((f) => f.length >= 3 && f[0] && f[2].startsWith('fonts/') && !f[2].includes('..'))
    .map((f) => ({ family: f[0], file: f[2] }));
}

/** Family names in the app's answer to font.list. */
export function listedFamilies(answer: unknown): Set<string> {
  const out = new Set<string>();
  const fonts = (answer as { fonts?: { faces?: { family?: unknown }[] }[] } | null)?.fonts ?? [];
  for (const f of fonts) for (const face of f.faces ?? []) if (typeof face.family === 'string') out.add(face.family);
  return out;
}

export async function runCommand(frame: HTMLIFrameElement | null, appId: string, command: string, params: unknown = {}): Promise<boolean> {
  const api = (frame?.contentWindow as unknown as Record<string, { execute?: (c: string, p: unknown) => Promise<unknown> }> | null)?.[appId];
  if (!api?.execute) return false;
  await api.execute(command, params);
  return true;
}
