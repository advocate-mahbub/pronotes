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
  ['#Mode', '#Alt', '#Pad', '#Space', '#Dari', '#Live'],
];

/**
 * Phones (iOS-style): the number row and \ stay; the punctuation keys - = [ ] ; ' , . / move to a second
 * layer behind #Sym (they type punctuation in every built-in layout, Bangla included), so the letters get
 * wider keys. #Sym sits bottom-left next to the language key, where iOS keeps "123".
 */
const NUMBERS = ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
/**
 * The phone keyboard, exactly the iPhone's (decisions.md 79): the bottom row is ১২৩ · space · return
 * (১২৩ opens the marks; held, it offers 123 | ১২৩ | ৴৵৶; return held offers line break · Tab · new
 * page); 🌐 and 🎙 sit in the strip under the keys. Only the number row is extra: Bornona needs it.
 */
const BOTTOM = ['#Sym', '#Space', '#Enter'];
/** Phone letters: ten keys in the number and Q rows, nine in the A row (set in like iOS), ⇧ … ⌫ under them. */
export const PHONE_ROWS: string[][] = [
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'],
  ['#Shift', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', '#Back'],
  BOTTOM,
];
/**
 * The marks (১২৩): same height as the letters, so nothing jumps when it opens. Its number row types the
 * AltGr character of each key (the anna-ganda signs in the ProNotes layout), and ৸ and ১৲ (AltGr of - and =)
 * sit next to - = [ ]. "Alt+" codes = that key's AltGr character; ~ \ | are here too.
 */
export const PHONE_SYMBOL_ROWS: string[][] = [
  NUMBERS.map((c) => 'Alt+' + c),
  ['Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Alt+Minus', 'Alt+Equal'],
  ['Semicolon', 'Quote', 'Txt:~', 'Txt:\\', 'Txt:|'],
  ['#Shift', 'Comma', 'Period', 'Slash', '#Back'],
  BOTTOM,
];
/** The keypads, chosen from a long-press of #+= (or the iPad's #Pad key). */
export type Pad = 'numEn' | 'num' | 'anna';
export const PADS: Pad[] = ['numEn', 'num', 'anna'];
/**
 * The numpad (123 and ১২৩: the same keys, English or Bangla digits), laid out like a phone's keypad with
 * one kind of sign per column: arithmetic, comparison, writing marks; ½ (makes the fraction typed just
 * before), ± and ৳ under the digits. "Np" keys type a digit; "Txt:" keys type the text after the colon.
 */
export const NUMPAD_ROWS: string[][] = [
  ['Np1', 'Np2', 'Np3', 'Txt:÷', 'Txt:<', 'Txt:('],
  ['Np4', 'Np5', 'Np6', 'Txt:×', 'Txt:>', 'Txt:)'],
  ['Np7', 'Np8', 'Np9', 'Txt:-', 'Txt:≤', 'Txt:/'],
  ['Txt:,', 'Np0', 'Txt:.', 'Txt:+', 'Txt:≥', 'Txt:%'],
  ['#Frac', 'Txt:±', 'Txt:৳', 'Txt:=', 'Txt:≠', 'Txt::'],
  ['#Pad', '#Space', '#Back', '#Enter'],
];
/** ৴৵৶: 1–16 annas in a 4×4 grid ("Anna:n"), then the ganda mark, ৹ and the controls. */
export const ANNA_PAD_ROWS: string[][] = [
  ['Anna:1', 'Anna:2', 'Anna:3', 'Anna:4'],
  ['Anna:5', 'Anna:6', 'Anna:7', 'Anna:8'],
  ['Anna:9', 'Anna:10', 'Anna:11', 'Anna:12'],
  ['Anna:13', 'Anna:14', 'Anna:15', 'Anna:16'],
  ['#Pad', 'Txt:\u09FB', 'Txt:\u09F9', '#Space', '#Back', '#Enter'],
];
/** Where the right hand's half starts in a split keyboard (iOS splits after T, G and V). */
const RIGHT_HALF = new Set(['Digit7', 'KeyY', 'KeyH', 'KeyB', 'Alt+Digit6']);
const RIGHT_HALF_PHONE = new Set(['Digit6', 'KeyY', 'KeyG', 'KeyV', 'Alt+Digit6', 'Period']);
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
