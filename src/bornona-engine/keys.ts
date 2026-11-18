/** US-QWERTY characters per physical key: [unshifted, shifted]. Ported from v8 (`US`). */
export const US: Record<string, string> = {
  Backquote: '`~', Digit1: '1!', Digit2: '2@', Digit3: '3#', Digit4: '4$', Digit5: '5%', Digit6: '6^', Digit7: '7&',
  Digit8: '8*', Digit9: '9(', Digit0: '0)', Minus: '-_', Equal: '=+',
  KeyQ: 'qQ', KeyW: 'wW', KeyE: 'eE', KeyR: 'rR', KeyT: 'tT', KeyY: 'yY', KeyU: 'uU', KeyI: 'iI', KeyO: 'oO', KeyP: 'pP',
  BracketLeft: '[{', BracketRight: ']}', Backslash: '\\|',
  KeyA: 'aA', KeyS: 'sS', KeyD: 'dD', KeyF: 'fF', KeyG: 'gG', KeyH: 'hH', KeyJ: 'jJ', KeyK: 'kK', KeyL: 'lL',
  Semicolon: ';:', Quote: '\'"',
  KeyZ: 'zZ', KeyX: 'xX', KeyC: 'cC', KeyV: 'vV', KeyB: 'bB', KeyN: 'nN', KeyM: 'mM', Comma: ',<', Period: '.>', Slash: '/?',
};

/** Reverse map: printed character → [code, shifted?]. Used when a device sends no `code` (some iPad keyboards). */
export const REV: Record<string, [string, boolean]> = (() => {
  const r: Record<string, [string, boolean]> = {};
  for (const c in US) {
    r[US[c][0]] = [c, false];
    r[US[c][1]] = [c, true];
  }
  return r;
})();

/** On-screen keyboard rows. Codes starting with '#' are function keys. */
export const ROWS: string[][] = [
  ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', '#Enter'],
  ['#Shift', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', '#Back'],
  ['#Mode', '#Alt', '#Space', '#Dari'],
];

/**
 * Phones (iOS-style): the number row and \ stay; the punctuation keys - = [ ] ; ' , . / move to a second
 * layer behind #Sym (they type punctuation in every built-in layout, Bangla included), so the letters get
 * wider keys. #Sym sits bottom-left next to the language key, where iOS keeps "123".
 */
const NUMBERS = ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
const BOTTOM = ['#Mode', '#Sym', '#Alt', '#Space', '#Dari'];
export const PHONE_ROWS: string[][] = [
  NUMBERS,
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'Backslash'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', '#Enter'],
  ['#Shift', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', '#Back'],
  BOTTOM,
];
/** The second layer: same height as the letters, so nothing jumps when it opens. */
export const PHONE_SYMBOL_ROWS: string[][] = [
  NUMBERS,
  ['Minus', 'Equal', 'BracketLeft', 'BracketRight'],
  ['Semicolon', 'Quote', '#Enter'],
  ['#Shift', 'Comma', 'Period', 'Slash', '#Back'],
  BOTTOM,
];
