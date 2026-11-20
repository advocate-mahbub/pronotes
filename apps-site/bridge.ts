/**
 * The ProNotes bridge (decisions.md 81), put into every page of an installed app by the service worker.
 * ProNotes (the page around the apps) sends its keyboard layout and typing rules; this script then types
 * Bangla in the app's own text boxes the way ProNotes does: with a hardware keyboard, and with the
 * device's own on-screen keyboard (each Latin letter becomes the layout's Bangla letter). Ctrl+Space
 * (or the key set in ProNotes) switches the language in ProNotes too. Works in <input>, <textarea> and
 * contenteditable editors. Keyman rules keyboards and Phonetic are not carried into apps.
 */
import { resolveKey, resolveTypedChar, planType, isToggleKey, type KeyInput } from '../src/bornona-engine/engine';
import type { BridgeConfig } from './protocol';
export type { BridgeConfig };

const HOST_KEY = 'pn-host';
const host = (): string | null => { try { return sessionStorage.getItem(HOST_KEY) || localStorage.getItem(HOST_KEY); } catch { return null; } };
let cfg: BridgeConfig | null = null;

type Box = HTMLInputElement | HTMLTextAreaElement;
const TEXT_INPUTS = new Set(['text', 'search', 'url', 'email', 'tel', '']);
const isBox = (el: Element | null): el is Box =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_INPUTS.has(el.type));
const isCE = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && el.isContentEditable;

function setValue(el: Box, value: string, caret: number) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); // React-style apps see the change
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function typeInBox(el: Box, out: string, c: BridgeConfig) {
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? s;
  const edit = planType(el.value.slice(0, s), s === e, out, c);
  const start = s === e ? s - edit.deleteBefore : s;
  setValue(el, el.value.slice(0, start) + edit.text + el.value.slice(e), start + edit.text.length);
}

export function typeInEditable(out: string, c: BridgeConfig) {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  const node = r.startContainer;
  const before = r.collapsed && node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '').slice(0, r.startOffset) : '';
  const edit = planType(before, r.collapsed, out, c);
  if (edit.deleteBefore && r.collapsed && node.nodeType === Node.TEXT_NODE && r.startOffset >= edit.deleteBefore) {
    const d = document.createRange();
    d.setStart(node, r.startOffset - edit.deleteBefore);
    d.setEnd(node, r.startOffset);
    sel.removeAllRanges();
    sel.addRange(d);
  }
  // the editor's own undo and change events keep working
  if (!document.execCommand('insertText', false, edit.text)) {
    const x = sel.getRangeAt(0);
    x.deleteContents();
    x.insertNode(document.createTextNode(edit.text));
    x.collapse(false);
  }
}

function typeOut(target: Element | null, out: string) {
  if (!cfg) return;
  if (isBox(target)) typeInBox(target, out, cfg);
  else if (isCE(target)) typeInEditable(out, cfg);
}

const toHost = (msg: unknown) => { const h = host(); if (h && window.top && window.top !== window) window.top.postMessage(msg, h); };

function onKey(ev: KeyboardEvent) {
  const t = ev.target as Element | null;
  if (!cfg || !(isBox(t) || isCE(t))) return;
  const ki: KeyInput = { code: ev.code, key: ev.key, shiftKey: ev.shiftKey, altKey: ev.altKey, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, altGraph: ev.getModifierState?.('AltGraph'), isComposing: ev.isComposing };
  if (isToggleKey(ki, cfg.toggleKey)) {
    ev.preventDefault();
    cfg = { ...cfg, bangla: !cfg.bangla }; // at once here; ProNotes switches too and sends the settings back
    toHost({ pn: 'toggle' });
    return;
  }
  const a = resolveKey(ki, { bangla: cfg.bangla, map: cfg.map, toggleKey: cfg.toggleKey });
  if (!a) return;
  ev.preventDefault();
  if (a.kind === 'type') typeOut(t, a.text);
}

function onBeforeInput(ev: InputEvent) {
  const t = ev.target as Element | null;
  if (!cfg || ev.inputType !== 'insertText' || !ev.data || !(isBox(t) || isCE(t))) return;
  const r = resolveTypedChar(ev.data, { bangla: cfg.bangla, map: cfg.map });
  if (!r) return;
  ev.preventDefault();
  typeOut(t, r);
}

export function startBridge() {
  if ((window as unknown as { __pnBridge?: boolean }).__pnBridge) return;
  (window as unknown as { __pnBridge?: boolean }).__pnBridge = true;
  window.addEventListener('message', (e) => {
    if (!host() || e.origin !== host()) return;
    const d = e.data as { pn?: string; cfg?: BridgeConfig };
    if (d?.pn === 'cfg' && d.cfg) cfg = d.cfg;
  });
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('beforeinput', onBeforeInput as EventListener, true);
  toHost({ pn: 'hello' });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !(globalThis as { __PN_TEST__?: boolean }).__PN_TEST__) startBridge();
