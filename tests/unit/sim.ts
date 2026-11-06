/** Simulates Playwright key presses (as used in tools/gen-golden.mjs) through the engine. */
import { US, resolveKey, planType, applyEdit, type KeyInput, type LayoutMap, type TypeOptions } from '../../src/bornona-engine';

// Playwright's US keyboard: numpad digits without NumLock report navigation keys.
const NUMPAD_KEY: Record<string, string> = {
  Numpad0: 'Insert', Numpad1: 'End', Numpad5: 'Clear', Numpad9: 'PageUp',
  NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/', NumpadDecimal: '.',
};

export function keyInput(combo: string): KeyInput {
  const parts = combo.split('+');
  const code = parts.pop()!;
  const shiftKey = parts.includes('Shift');
  const altKey = parts.includes('Alt');
  let key: string;
  if (code === 'Space') key = ' ';
  else if (NUMPAD_KEY[code]) key = NUMPAD_KEY[code];
  else key = US[code][shiftKey ? 1 : 0];
  return { code, key, shiftKey, altKey, ctrlKey: false, metaKey: false };
}

/** Type a key sequence into an empty text box, the way the v8 page would. */
export function typeSequence(keys: string[], map: LayoutMap, opts: TypeOptions): string {
  let value = '';
  let caret = 0;
  for (const combo of keys) {
    const ev = keyInput(combo);
    const a = resolveKey(ev, { bangla: opts.bangla, map });
    if (a?.kind === 'type') {
      ({ value, caret } = applyEdit(value, caret, planType(value.slice(0, caret), true, a.text, opts)));
    } else if (a === null && !ev.altKey && !ev.ctrlKey && !ev.metaKey && ev.key.length === 1) {
      // browser default insertion
      ({ value, caret } = applyEdit(value, caret, { deleteBefore: 0, text: ev.key }));
    }
  }
  return value;
}
