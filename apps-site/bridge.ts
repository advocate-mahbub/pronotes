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

// ---------- ProNotes' own on-screen keyboard typing here (decisions.md 82) ----------
/** The text box the on-screen keyboard types into: the one that had focus last. */
let last: Element | null = null;
let oskOn = false;
const editable = (el: Element | null) => isBox(el) || isCE(el);
const current = (): Element | null => (editable(document.activeElement) ? document.activeElement : last && last.isConnected ? last : null);

function textBefore(el: Element | null): string {
  if (isBox(el)) return el.value.slice(0, el.selectionStart ?? el.value.length).slice(-60);
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return '';
  const r = sel.getRangeAt(0);
  return r.startContainer.nodeType === Node.TEXT_NODE ? (r.startContainer.textContent ?? '').slice(0, r.startOffset).slice(-60) : '';
}
/** Tell ProNotes where the caret is (for its keyboard: double-space dari, word delete, whether to show). */
function report() { const el = current(); toHost({ pn: 'ctx', editable: editable(document.activeElement), before: textBefore(el) }); }

export function backIn(el: Element | null) {
  if (isBox(el)) {
    const s = el.selectionStart ?? 0, e = el.selectionEnd ?? s;
    if (s !== e) return setValue(el, el.value.slice(0, s) + el.value.slice(e), s);
    if (!s) return;
    // ্ + ZWNJ (a fixed hasanta) goes in one ⌫, and a surrogate pair too
    const two = el.value.slice(s - 2, s);
    const n = two === '\u09CD\u200C' || /[\uDC00-\uDFFF]/.test(el.value[s - 1]) ? 2 : 1;
    setValue(el, el.value.slice(0, s - n) + el.value.slice(s), s - n);
  } else if (isCE(el)) document.execCommand('delete');
}
function enterIn(el: Element | null) {
  if (el instanceof HTMLTextAreaElement) return insertRaw(el, '\n');
  if (isBox(el)) {
    // a one-line box: the app decides (search, send…)
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    return;
  }
  if (isCE(el)) document.execCommand('insertParagraph');
}
function insertRaw(el: Element | null, text: string) {
  if (isBox(el)) {
    const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
    setValue(el, el.value.slice(0, s) + text + el.value.slice(e), s + text.length);
  } else if (isCE(el)) document.execCommand('insertText', false, text);
}
function moveIn(el: Element | null, dx: number, dy: number, select: boolean) {
  if (isBox(el)) {
    const v = el.value;
    let head = el.selectionDirection === 'backward' ? el.selectionStart ?? 0 : el.selectionEnd ?? 0;
    const anchor = el.selectionDirection === 'backward' ? el.selectionEnd ?? 0 : el.selectionStart ?? 0;
    head = Math.max(0, Math.min(v.length, head + dx));
    if (dy && el instanceof HTMLTextAreaElement) {
      const ls = v.lastIndexOf('\n', head - 1) + 1, col = head - ls;
      if (dy < 0 && ls > 0) { const ps = v.lastIndexOf('\n', ls - 2) + 1; head = Math.min(ps + col, ls - 1); }
      if (dy > 0) { const ne = v.indexOf('\n', head); if (ne >= 0) { const ee = v.indexOf('\n', ne + 1); head = Math.min(ne + 1 + col, ee < 0 ? v.length : ee); } }
    }
    const a = select ? anchor : head;
    el.setSelectionRange(Math.min(a, head), Math.max(a, head), head < a ? 'backward' : 'forward');
  } else if (isCE(el)) {
    const sel = getSelection() as Selection & { modify?: (a: string, d: string, g: string) => void };
    if (!sel?.modify) return;
    const how = select ? 'extend' : 'move';
    for (let i = 0; i < Math.abs(dx); i++) sel.modify(how, dx < 0 ? 'backward' : 'forward', 'character');
    for (let i = 0; i < Math.abs(dy); i++) sel.modify(how, dy < 0 ? 'backward' : 'forward', 'line');
  }
}
/** While ProNotes' keyboard is up, the device's own keyboard stays down (as in the ProNotes editor). */
function quietDeviceKeyboard(el: Element | null) {
  if (!(el instanceof HTMLElement)) return;
  if (oskOn) { if (!el.hasAttribute('data-pn-im')) el.setAttribute('data-pn-im', el.getAttribute('inputmode') ?? ''); el.setAttribute('inputmode', 'none'); }
  else if (el.hasAttribute('data-pn-im')) { const was = el.getAttribute('data-pn-im'); if (was) el.setAttribute('inputmode', was); else el.removeAttribute('inputmode'); el.removeAttribute('data-pn-im'); }
}

type FromHost = { pn: 'cfg'; cfg: BridgeConfig } | { pn: 'type'; text: string } | { pn: 'back' } | { pn: 'enter' } | { pn: 'tab' }
  | { pn: 'move'; dx: number; dy: number; select: boolean } | { pn: 'osk'; on: boolean };
export function fromHost(d: FromHost) {
  const el = current();
  if (d.pn === 'cfg') { cfg = d.cfg; return; }
  if (d.pn === 'osk') { oskOn = d.on; quietDeviceKeyboard(el); return; }
  if (!el) return;
  if (el instanceof HTMLElement && document.activeElement !== el) el.focus({ preventScroll: true });
  if (d.pn === 'type' && cfg) typeOut(el, d.text);
  else if (d.pn === 'back') backIn(el);
  else if (d.pn === 'enter') enterIn(el);
  else if (d.pn === 'tab') insertRaw(el, '\t');
  else if (d.pn === 'move') moveIn(el, d.dx, d.dy, d.select);
  report();
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
    const d = e.data as FromHost | null;
    if (d && typeof d.pn === 'string') fromHost(d);
  });
  document.addEventListener('focusin', (e) => { if (editable(e.target as Element)) { last = e.target as Element; quietDeviceKeyboard(last); } report(); }, true);
  document.addEventListener('focusout', () => setTimeout(report, 0), true);
  document.addEventListener('selectionchange', () => report());
  document.addEventListener('input', () => report(), true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('beforeinput', onBeforeInput as EventListener, true);
  toHost({ pn: 'hello' });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !(globalThis as { __PN_TEST__?: boolean }).__PN_TEST__) startBridge();
