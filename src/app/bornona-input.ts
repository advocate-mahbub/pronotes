/**
 * Bornona typing in plain <input>/<textarea> boxes (draft title, find and replace, …), with the same
 * engine as the editor. The on-screen keyboard types into the box that has focus.
 */
import { resolveKey, resolveTypedChar, planType, fixNukta } from '../bornona-engine';
import type { BornonaConfig } from '../editor';

type Box = HTMLInputElement | HTMLTextAreaElement;
let active: Box | null = null;
/** The box the on-screen keyboard should type into (null = the editor). */
export const activeBornonaBox = (): Box | null => (active && document.activeElement === active ? active : null);

function setValue(el: Box, value: string, caret: number) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Type `out` into the box at its caret (vowel forming and reph like the editor). */
export function typeIntoBox(el: Box, out: string, cfg: BornonaConfig) {
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? s;
  const edit = planType(el.value.slice(0, s), s === e, out, cfg);
  const start = s === e ? s - edit.deleteBefore : s;
  setValue(el, el.value.slice(0, start) + edit.text + el.value.slice(e), start + edit.text.length);
}

export function backspaceBox(el: Box) {
  const s = el.selectionStart ?? 0;
  const e = el.selectionEnd ?? s;
  if (s !== e) return setValue(el, el.value.slice(0, s) + el.value.slice(e), s);
  if (s === 0) return;
  const cp = el.value.codePointAt(s - 1) ?? 0;
  const n = cp >= 0xdc00 && cp <= 0xdfff ? 2 : 1;
  setValue(el, el.value.slice(0, s - n) + el.value.slice(s), s - n);
}

/** Attach the engine to a box. Returns a clean-up function. */
export function attachBornona(el: Box, getConfig: () => BornonaConfig, onToggleLanguage: () => void): () => void {
  const key = (ev: KeyboardEvent) => {
    const cfg = getConfig();
    const a = resolveKey(
      { code: ev.code, key: ev.key, shiftKey: ev.shiftKey, altKey: ev.altKey, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, altGraph: ev.getModifierState?.('AltGraph'), isComposing: ev.isComposing },
      { bangla: cfg.bangla, map: cfg.map, suspended: cfg.suspended, toggleKey: cfg.toggleKey },
    );
    if (!a) return;
    ev.preventDefault();
    if (a.kind === 'toggle-language') return onToggleLanguage();
    if (a.kind === 'type') typeIntoBox(el, a.text, cfg);
  };
  const before = (ev: InputEvent) => {
    if (ev.inputType !== 'insertText' || !ev.data) return;
    const cfg = getConfig();
    const r = resolveTypedChar(ev.data, { bangla: cfg.bangla, map: cfg.map, suspended: cfg.suspended });
    if (!r) return;
    ev.preventDefault();
    typeIntoBox(el, r, cfg);
  };
  const paste = (ev: ClipboardEvent) => {
    const t = ev.clipboardData?.getData('text/plain');
    if (!t || fixNukta(t) === t) return;
    ev.preventDefault();
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? s;
    const v = fixNukta(t);
    setValue(el, el.value.slice(0, s) + v + el.value.slice(e), s + v.length);
  };
  const focus = () => (active = el);
  const blur = () => {
    if (active === el) active = null;
  };
  const h = el as HTMLElement;
  h.addEventListener('keydown', key);
  h.addEventListener('beforeinput', before);
  h.addEventListener('paste', paste);
  h.addEventListener('focus', focus);
  h.addEventListener('blur', blur);
  return () => {
    h.removeEventListener('keydown', key);
    h.removeEventListener('beforeinput', before);
    h.removeEventListener('paste', paste);
    h.removeEventListener('focus', focus);
    h.removeEventListener('blur', blur);
    blur();
  };
}
