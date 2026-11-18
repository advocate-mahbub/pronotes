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
// #Live: the live-voice mic (shown only when it can work); #BackL: a second ⌫ for the left thumb
const BOTTOM = ['#Mode', '#Sym', '#Alt', '#Space', '#Dari', '#Live'];
/**
 * Phone letters (the owner's arrangement, decisions.md 73): ⌫ in the top-left corner for the left thumb
 * (where ৱ was), ⌫ at the end of the A row with the numpad key (#Num) before it, ↵ at the end of the Z row.
 */
export const PHONE_ROWS: string[][] = [
  ['#BackL', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'Backslash'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', '#Num', '#Back'],
  ['#Shift', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', '#Enter'],
  BOTTOM,
];
/**
 * The second layer: same height as the letters, so nothing jumps when it opens. Its number row types the
 * AltGr character of each key (the anna-ganda signs in the ProNotes layout; the digits stay on the letters
 * layer), and ৸ and ১৲ (AltGr of - and =) sit next to - = [ ]. "Alt+" codes = that key's AltGr character.
 */
export const PHONE_SYMBOL_ROWS: string[][] = [
  NUMBERS.map((c) => 'Alt+' + c),
  ['Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Alt+Minus', 'Alt+Equal'],
  ['Semicolon', 'Quote', '#Num', '#Back'],
  ['#Shift', 'Comma', 'Period', 'Slash', '#Enter'],
  BOTTOM,
];
/**
 * The numpad (#Num), laid out like a phone's keypad with the arithmetic signs beside it. "Np" keys type
 * the digit of the language being typed (১ or 1); "Txt:" keys type the text after the colon.
 */
export const NUMPAD_ROWS: string[][] = [
  ['Np1', 'Np2', 'Np3', 'Txt:÷'],
  ['Np4', 'Np5', 'Np6', 'Txt:×'],
  ['Np7', 'Np8', 'Np9', 'Txt:-'],
  ['Txt:,', 'Np0', 'Txt:.', 'Txt:+'],
  ['#Num', 'Txt:%', '#Space', '#Back', '#Enter'],
];
/** Where the right hand's half starts in a split keyboard (iOS splits after T, G and V). */
const RIGHT_HALF = new Set(['Digit7', 'KeyY', 'KeyH', 'KeyB', 'Alt+Digit6']);
const RIGHT_HALF_PHONE = new Set(['Digit6', 'KeyY', 'KeyH', 'KeyB', 'Alt+Digit6']);
/**
 * A row cut in two for the split keyboard. The bottom row gets a space bar in each half (#Space2 types a
 * space too), so both thumbs reach one.
 */
export function splitRow(row: string[], phone: boolean): [string[], string[]] {
  const at = row.findIndex((c) => (phone ? RIGHT_HALF_PHONE : RIGHT_HALF).has(c));
  if (row.includes('#Space')) {
    const i = row.indexOf('#Space');
    return [row.slice(0, i + 1), ['#Space2', ...row.slice(i + 1)]];
  }
  const cut = at > 0 ? at : Math.ceil(row.length / 2);
  return [row.slice(0, cut), row.slice(cut)];
}
