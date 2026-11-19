import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { ANNA_ALT, ANNA_PAD_ROWS, ANNA_SIGNS, NUMPAD_ROWS, PADS, PHONE_ROWS, PHONE_SYMBOL_ROWS, ROWS, US, charFor, hasAltBeyondAnna, hasAltLayer, splitRow, type LayoutMap, type Pad } from '../bornona-engine';
import { typeText, deleteBackward, textBeforeCaret, typeRulesKey, findFraction, plainFraction, FRACTION_SLASH, type BornonaConfig } from '../editor';
import { load, save } from './prefs';
import { num, useT } from '../i18n';
import { activeBornonaBox, backspaceBox, typeIntoBox, typeKeyIntoBox } from './bornona-input';
import { DOUBLE_SPACE, FLICK, LONG, MOVE, STEP_X, STEP_Y, doubleSpaceDari, keyAlternatives, wordDeleteCount, type Hand } from './kb-gestures';

const ZW: Record<string, string> = { [String.fromCharCode(0x200c)]: 'ZWNJ', [String.fromCharCode(0x200d)]: 'ZWJ' };
const MARKS = 'ািীুূৃেৈোৌ্ঁংঃৗৄৢৣ';
const show = (c: string) => ZW[c] ?? (c && MARKS.includes(c[0]) ? '◌' + c : c);

interface Props {
  editor: Editor;
  map: LayoutMap;
  bangla: boolean;
  getConfig: () => BornonaConfig;
  onToggleLanguage: () => void;
  onWordDone: (before: string) => void;
  flash: string | null;
  /** Puts the keyboard down (it comes back when the page is tapped). */
  onHide?: () => void;
  /** Phone layout: punctuation on a second layer (#Sym), wider letter keys. */
  compact?: boolean;
  /** Phones: one-handed keyboard (from the language key's menu). */
  hand?: Hand;
  setHand?: (h: Hand) => void;
  /** The keyboard in two halves, one for each thumb. */
  split?: boolean;
  /** What a long-press of the language key offers on this device (one-handed, floating, split…). */
  menuItems?: KbMenuItem[];
  /** The live-voice mic key at the end of the bottom row: shown when given. */
  live?: { on: boolean; toggle: () => void };
}

/** Fired on window with detail true/false while the space bar moves the caret. */
export const KB_TRACK_EVENT = 'pronotes:kb-track';

export interface KbMenuItem { id: string; label: string; on?: boolean; act: () => void }

/** The key back to the letters shows letters of the language being typed (like iOS's "ABC"). */
const LETTERS_KEY = { bn: 'অআ', en: 'ABC' } as const;
/** The keypads' names on the #Pad key and in the long-press menu. */
const PAD_LABEL: Record<Pad, string> = { numEn: '123', num: '\u09e7\u09e8\u09e9', anna: '\u09f4\u09f5\u09f6' };
/** Line icons for the strip under the phone keys (iOS draws 🌐 and 🎙 as plain lines, not emoji). */
export const GLOBE_ICON = (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9S9.4 5.8 12 3z" />
  </svg>
);
export const LINE_MIC = (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
  </svg>
);
/** Held right ↵: what the phone has no key for (decisions.md 76). */
export const ENTER_ITEMS = ['br', 'tab', 'page'] as const;
const ENTER_LABEL: Record<(typeof ENTER_ITEMS)[number], string> = { br: '⤶', tab: '⇥', page: '▭' };
const ENTER_NAME: Record<(typeof ENTER_ITEMS)[number], string> = { br: 'লাইন ভাঙা', tab: 'Tab', page: 'নতুন পাতা' };
/** "Alt+Digit5" = the AltGr character of Digit5 (the phone's symbol layer). */
const baseOf = (code: string) => (code.startsWith('Alt+') ? code.slice(4) : code);

/** A finger on the keyboard, from the moment it touches to the moment it lifts. */
interface Touch {
  code: string;
  el: HTMLElement;
  x0: number; y0: number;
  timer?: number;
  /** press = a plain tap so far; flick = pulled down (Shift character); popup = long-press choices; track = space trackpad. */
  mode: 'press' | 'flick' | 'popup' | 'track' | 'menu';
  /** #Sym: the layer was closed when this finger opened it (sliding to a mark then closes it again). */
  opened?: boolean;
  /** #Back: swiped left already (a word went). */
  swiped?: boolean;
  /** Space trackpad: movement not yet turned into caret steps, and whether it selects. */
  ax?: number; ay?: number; lx?: number; ly?: number;
  select?: boolean;
  anchor?: number;
}

/**
 * Bornona on-screen keyboard. Keys never take focus, so the iPad's own keyboard stays closed.
 * Like iOS, a key types when the finger lifts, which is what makes the gestures possible:
 * space drag = move the caret (with ⇧, or a second finger, = select); flick a key down = its Shift
 * character; long-press a key = its other characters; ⌫ held = faster, then whole words; ⌫ swiped
 * left = the word; two spaces = "। "; slide from #+= to a mark and lift = that mark, back to letters;
 * ⇧ twice = Shift lock; long-press the language key = one-handed (phones) or floating (iPad).
 */
export function OnScreenKeyboard({ editor, map, bangla, getConfig, onToggleLanguage, onWordDone, flash, onHide, compact, hand, setHand, split, menuItems, live }: Props) {
  const { t } = useT();
  const [shift, setShift] = useState(0); // 0 off, 1 next key, 2 locked
  const [alt, setAlt] = useState(false);
  // phones: the punctuation layer is open (stays open for several marks, closes on space or enter, like iOS)
  const [sym, setSym] = useState(false);
  // a keypad (123, ১২৩, ৴৵৶): stays open for several numbers and signs, until অআ
  const [pad, setPad] = useState<Pad | null>(null);
  // the keypad the iPad's #Pad key opens with a tap: the one used last
  const [lastPad, setLastPad0] = useState<Pad>(() => load('kb.lastPad', 'num'));
  const openPad = (p: Pad) => { setPad(p); setLastPad0(p); save('kb.lastPad', p); setSym(false); };
  // long-press #+= (or #Pad): which keypad to open
  const [padMenu, setPadMenu] = useState<{ idx: number; left: number; top: number; w: number } | null>(null);
  const [popup, setPopup] = useState<{ opts: string[]; idx: number; left: number; top: number; w: number } | null>(null);
  // held right ↵: line break · Tab · new page
  const [enterMenu, setEnterMenu] = useState<{ idx: number; left: number; top: number; w: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const [tracking, setTracking0] = useState(false);
  // the caret overlay shows the loupe while the space bar moves the caret (decisions.md 76)
  const setTracking = (v: boolean) => { setTracking0(v); window.dispatchEvent(new CustomEvent(KB_TRACK_EVENT, { detail: v })); };
  const rows = pad === 'anna' ? ANNA_PAD_ROWS : pad ? NUMPAD_ROWS : compact ? (sym ? PHONE_SYMBOL_ROWS : PHONE_ROWS) : ROWS;
  const [phys, setPhys] = useState({ shift: false, alt: false });
  const lastShift = useRef(0);
  const lastSpace = useRef(0);
  const repeat = useRef<{ t?: number; i?: number; n: number }>({ n: 0 });
  const touch = useRef<Touch | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const altKeys = hasAltLayer(map);
  // phones reach the anna-ganda signs through #+=; an Alt key only when the layout has more on AltGr
  const altKey = altKeys && (!compact || hasAltBeyondAnna(map));

  useEffect(() => {
    const on = (e: KeyboardEvent) => setPhys({ shift: e.shiftKey, alt: (e.getModifierState?.('AltGraph') || (e.altKey && !e.ctrlKey)) && altKeys });
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    const off = () => setPhys({ shift: false, alt: false });
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', on);
      window.removeEventListener('keyup', on);
      window.removeEventListener('blur', off);
    };
  }, [altKeys]);

  const sh = shift > 0 || phys.shift;
  const al = alt || phys.alt;
  const stopRepeat = () => {
    clearTimeout(repeat.current.t);
    clearInterval(repeat.current.i);
    repeat.current.n = 0;
  };

  // ---------- typing (the box with focus, else the editor) ----------
  const view = editor.view;
  const cfgNow = () => getConfig();
  const rulesOn = () => {
    const cfg = cfgNow();
    return cfg.rules && cfg.bangla && !cfg.suspended ? cfg.rules : null;
  };
  const rulesKey = (k: { code: string; shift: boolean; alt: boolean }) => {
    const kb = rulesOn();
    if (!kb) return false;
    const box = activeBornonaBox();
    return box ? typeKeyIntoBox(box, k, cfgNow()) : typeRulesKey(view, kb, k, cfgNow().ansi);
  };
  const back = () => {
    const box = activeBornonaBox();
    if (box) return rulesKey({ code: 'Backspace', shift: false, alt: false }) || backspaceBox(box);
    deleteBackward(view, () => editor.commands.joinBackward(), cfgNow());
  };
  const type = (s: string) => {
    const box = activeBornonaBox();
    return box ? typeIntoBox(box, s, cfgNow()) : typeText(view, s, cfgNow());
  };
  const before = () => {
    const box = activeBornonaBox();
    return box ? box.value.slice(0, box.selectionStart ?? box.value.length) : textBeforeCaret(view);
  };
  /** ⌫ for a whole word (the spaces before it too); at the start of a line, one ⌫ (joins lines). */
  const backWord = () => {
    const b = before();
    const n = wordDeleteCount(b);
    if (!n) return back();
    const target = b.length - n;
    for (let i = 0; i < n && before().length > target; i++) back();
  };
  /** The character a key gives now (Alt+ codes: its AltGr character, the plain one if there is none). */
  const charOf = (code: string, shiftOn = sh) => {
    if (code.startsWith('Np')) return pad === 'numEn' ? code[2] : String.fromCharCode(0x09e6 + Number(code[2]));
    if (code.startsWith('Anna:')) return ANNA_SIGNS[Number(code.slice(5))];
    if (code.startsWith('Txt:')) return code.slice(4);
    const c = baseOf(code);
    const a = code.startsWith('Alt+') || al;
    return charFor(map, c, shiftOn, a, bangla) || (a ? charFor(map, c, shiftOn, false, bangla) : '');
  };
  const typeKey = (code: string, shiftOn = sh) => {
    if (code.startsWith('Np') || code.startsWith('Txt:') || code.startsWith('Anna:')) { type(charOf(code)); return; }
    if (rulesOn()) rulesKey({ code: baseOf(code), shift: shiftOn, alt: code.startsWith('Alt+') || al });
    else {
      const out = charOf(code, shiftOn);
      if (out) type(out);
    }
    if (shift === 1) setShift(0);
    if (alt) setAlt(false);
  };
  const space = () => {
    setSym(false); // the numpad stays open (numbers and signs come in runs)
    const now = Date.now();
    if (!rulesOn() && now - lastSpace.current < DOUBLE_SPACE && doubleSpaceDari(before())) {
      back();
      type(bangla ? '। ' : '. ');
      lastSpace.current = 0;
      return;
    }
    lastSpace.current = now;
    if (rulesKey({ code: 'Space', shift: false, alt: false })) return;
    type(' ');
  };
  const enter = () => {
    setSym(false);
    const box = activeBornonaBox();
    if (box) {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return;
    }
    onWordDone(textBeforeCaret(view));
    editor.commands.enter();
  };

  const enterItem = (id: (typeof ENTER_ITEMS)[number]) => {
    setSym(false);
    if (activeBornonaBox()) return id === 'tab' ? type('\t') : enter();
    if (id === 'br') return editor.chain().setHardBreak().scrollIntoView().run();
    if (id === 'page') return editor.chain().setPageBreak().scrollIntoView().run();
    // Tab: a list item goes one step in; elsewhere a tab character (a Word tab in .docx)
    if (editor.can().sinkListItem('listItem')) return editor.chain().sinkListItem('listItem').run();
    type('\t');
  };

  /** ½: the "a/b" just typed becomes a fraction (Bangla: raised/lowered Bangla digits; English: ½ ⁵⁄₁₆). */
  const fraction = () => {
    const f = findFraction(before());
    if (!f) return;
    const box = activeBornonaBox();
    const english = pad === 'numEn' || !bangla;
    if (box || english) {
      for (let i = 0; i < f.length; i++) back();
      return type(plainFraction(f));
    }
    const { state } = view;
    const to = state.selection.from, from = to - f.length;
    const { superscript, subscript } = state.schema.marks;
    if (!superscript || !subscript) { for (let i = 0; i < f.length; i++) back(); return type(plainFraction(f)); }
    const marks = state.storedMarks ?? state.selection.$from.marks();
    const txt = (s: string, extra?: ReturnType<typeof superscript.create>) => state.schema.text(s, extra ? [...marks, extra] : marks);
    const nodes = [...(f.whole ? [txt(f.whole)] : []), txt(f.num, superscript.create()), txt(FRACTION_SLASH), txt(f.den, subscript.create())];
    const tr = state.tr.replaceWith(from, to, nodes);
    view.dispatch(tr.setStoredMarks(marks).scrollIntoView());
  };

  // ---------- space trackpad: move the caret (or the end of a selection) ----------
  const caretStep = (dx: number, dy: number, select: boolean, anchor: number | undefined) => {
    const box = activeBornonaBox();
    if (box) {
      const v = box.value;
      let head = box.selectionDirection === 'backward' ? box.selectionStart ?? 0 : box.selectionEnd ?? 0;
      if (dx) head = Math.max(0, Math.min(v.length, head + dx));
      if (dy && box instanceof HTMLTextAreaElement) {
        const ls = v.lastIndexOf('\n', head - 1) + 1, col = head - ls;
        if (dy < 0 && ls > 0) { const ps = v.lastIndexOf('\n', ls - 2) + 1; head = Math.min(ps + col, ls - 1); }
        if (dy > 0) { const ne = v.indexOf('\n', head); if (ne >= 0) { const ee = v.indexOf('\n', ne + 1); head = Math.min(ne + 1 + col, ee < 0 ? v.length : ee); } }
      }
      const a = select && anchor !== undefined ? anchor : head;
      box.setSelectionRange(Math.min(a, head), Math.max(a, head), head < a ? 'backward' : 'forward');
      return;
    }
    const { state } = view;
    let head = state.selection.head;
    if (dx) {
      const p = Math.max(0, Math.min(state.doc.content.size, head + dx));
      head = TextSelection.near(state.doc.resolve(p), dx).head;
    }
    if (dy) {
      try {
        const c = view.coordsAtPos(head);
        const h = Math.max(8, c.bottom - c.top);
        const hit = view.posAtCoords({ left: c.left, top: dy < 0 ? c.top - h / 2 : c.bottom + h / 2 });
        if (hit) head = TextSelection.near(state.doc.resolve(hit.pos)).head;
      } catch { /* outside the page */ }
    }
    const sel = select && anchor !== undefined ? TextSelection.create(state.doc, anchor, head) : TextSelection.create(state.doc, head);
    view.dispatch(state.tr.setSelection(sel).scrollIntoView());
  };
  const startTrack = (g: Touch) => {
    clearTimeout(g.timer);
    g.mode = 'track';
    g.ax = 0; g.ay = 0;
    const box = activeBornonaBox();
    g.select = sh;
    g.anchor = box ? (box.selectionDirection === 'backward' ? box.selectionEnd ?? 0 : box.selectionStart ?? 0) : view.state.selection.anchor;
    setTracking(true);
  };

  // ---------- the finger ----------
  const keyAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-code]')?.dataset.code ?? null;
  /** Lift: what the press does now that the finger is off. */
  const finish = (g: Touch, x?: number, y?: number) => {
    clearTimeout(g.timer);
    stopRepeat();
    touch.current = null;
    const code = g.code;
    if (g.mode === 'track') { setTracking(false); return; }
    if (code === '#Enter') {
      if (g.mode === 'menu') { const m = enterMenu; setEnterMenu(null); if (m) enterItem(ENTER_ITEMS[m.idx]); return; }
      return enter();
    }
    if (code === '#EnterL') {
      // held: the keypad menu; flicked up: #+= (slide on to a mark and lift = that mark, then letters again)
      if (g.mode === 'menu') { if (padMenu) { setPadMenu(null); openPad(PADS[padMenu.idx]); } return; }
      if (g.mode === 'flick') {
        const over = x !== undefined && y !== undefined ? keyAt(x, y) : null;
        if (over && over !== code && !over.startsWith('#')) { typeKey(over); if (g.opened) setSym(false); }
        return;
      }
      return enter();
    }
    if (g.mode === 'menu' && !padMenu) return;
    if (code === '#Space' || code === '#Space2') return space();
    if (code === '#Dari') return type(bangla ? '।' : '.');
    if (code === '#Mode' || code === '#Globe') return onToggleLanguage();
    if (code === '#Back' || code === '#BackL') return;
    if (code === '#Live') return live?.toggle();
    if (g.mode === 'menu' && padMenu) {
      // long-pressed #+= or #Pad: the keypad the finger was over when it lifted
      setPadMenu(null);
      return openPad(PADS[padMenu.idx]);
    }
    if (code === '#Frac') return fraction();
    if (code === '#Pad') {
      if (pad) return setPad(null); // অআ: back to the letters
      return openPad(lastPad);
    }
    if (code === '#Sym') {
      // slid from #+= to a mark and lifted there: that mark, then back to the letters (iOS)
      const over = x !== undefined && y !== undefined ? keyAt(x, y) : null;
      if (over && over !== code && !over.startsWith('#')) {
        typeKey(over);
        if (g.opened) setSym(false);
      }
      return;
    }
    if (g.mode === 'popup' && popup) {
      const c = popup.opts[popup.idx];
      setPopup(null);
      if (c) type(c);
      if (shift === 1) setShift(0);
      return;
    }
    setPopup(null);
    if (g.mode === 'flick') return typeKey(code, !sh);
    typeKey(code);
  };

  const down = (e: React.PointerEvent<HTMLElement>, code: string) => {
    e.preventDefault();
    if (menu) setMenu(false);
    const g0 = touch.current;
    if (g0) {
      // a second finger while the space trackpad runs: start (or stop) selecting, as on iOS
      if (g0.mode === 'track') {
        g0.select = !g0.select;
        const box = activeBornonaBox();
        g0.anchor = box ? (box.selectionDirection === 'backward' ? box.selectionStart ?? 0 : box.selectionEnd ?? 0) : view.state.selection.head;
        return;
      }
      finish(g0); // fast typing: the next key lands before the last one lifted
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a synthetic press */ }
    const g: Touch = { code, el: e.currentTarget, x0: e.clientX, y0: e.clientY, mode: 'press' };
    switch (code) {
      case '#Shift':
      case '#Shift2': {
        const now = Date.now();
        setShift((s) => (s === 0 ? (now - lastShift.current < 350 ? 2 : 1) : s === 1 && now - lastShift.current < 350 ? 2 : 0));
        lastShift.current = now;
        return;
      }
      case '#Alt':
        return setAlt((a) => !a);
      case '#Back':
      case '#BackL': {
        back();
        // held: one by one, faster after a moment, then whole words (iOS)
        repeat.current.t = window.setTimeout(() => {
          repeat.current.i = window.setInterval(() => {
            repeat.current.n++;
            if (repeat.current.n > 18) {
              clearInterval(repeat.current.i);
              backWord();
              repeat.current.i = window.setInterval(backWord, 260);
            } else back();
          }, 70);
        }, 450);
        break;
      }
      case '#Sym':
      case '#Pad':
      case '#EnterL': {
        if (code === '#Sym') { g.opened = !sym; setSym((v) => !v); }
        // held: the keypad menu (123 | ১২৩ | ৴৵৶) above the key; the finger slides to one and lifts
        const wasSym = sym;
        g.timer = window.setTimeout(() => {
          if (g.mode !== 'press' || !root.current) return;
          if (code === '#Sym') setSym(wasSym);
          const r = g.el.getBoundingClientRect(), k = root.current.getBoundingClientRect();
          const w = Math.max(56, r.width);
          const left = Math.max(0, Math.min(k.width - w * PADS.length, r.left - k.left));
          g.mode = 'menu';
          setPadMenu({ idx: Math.max(0, PADS.indexOf(lastPad)), left, top: r.top - k.top - r.height - 10, w });
        }, LONG);
        break;
      }
      case '#Enter':
        g.timer = window.setTimeout(() => {
          if (g.mode !== 'press' || !root.current) return;
          const r = g.el.getBoundingClientRect(), k = root.current.getBoundingClientRect();
          const w = Math.max(52, r.width);
          const left = Math.max(0, Math.min(k.width - w * ENTER_ITEMS.length, r.right - k.left - w * ENTER_ITEMS.length));
          g.mode = 'menu';
          setEnterMenu({ idx: 0, left, top: r.top - k.top - r.height - 10, w });
        }, LONG);
        break;
      case '#Mode':
      case '#Globe':
        if (menuItems?.length) g.timer = window.setTimeout(() => { g.mode = 'menu'; setMenu(true); }, LONG + 80);
        break;
      case '#Space':
      case '#Space2':
        g.timer = window.setTimeout(() => startTrack(g), LONG);
        break;
      default:
        if (!code.startsWith('#') && !code.startsWith('Np') && !code.startsWith('Txt:') && !code.startsWith('Anna:')) {
          g.timer = window.setTimeout(() => {
            if (g.mode !== 'press') return;
            const opts = keyAlternatives(map, baseOf(code), bangla, sh);
            if (code.startsWith('Alt+')) opts.unshift(charOf(code));
            const uniq = opts.filter((c, i) => c && opts.indexOf(c) === i);
            if (uniq.length < 2 || !root.current) return;
            const r = g.el.getBoundingClientRect(), k = root.current.getBoundingClientRect();
            const w = Math.max(r.width, 40);
            const left = Math.max(0, Math.min(k.width - w * uniq.length, r.left - k.left + r.width / 2 - w / 2));
            g.mode = 'popup';
            setPopup({ opts: uniq, idx: 0, left, top: r.top - k.top - r.height - 8, w });
          }, LONG);
        }
    }
    touch.current = g;
  };

  const moveTo = (e: React.PointerEvent) => {
    const g = touch.current;
    if (!g) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (g.code === '#Space' || g.code === '#Space2') {
      if (g.mode !== 'track' && Math.abs(dx) > MOVE) startTrack(g);
      if (g.mode !== 'track') return;
      g.ax = (g.ax ?? 0) + (e.clientX - (g.lx ?? g.x0));
      g.ay = (g.ay ?? 0) + (e.clientY - (g.ly ?? g.y0));
      g.lx = e.clientX; g.ly = e.clientY;
      while (Math.abs(g.ax) >= STEP_X) { const s = Math.sign(g.ax); g.ax -= s * STEP_X; caretStep(s, 0, Boolean(g.select), g.anchor); }
      while (Math.abs(g.ay) >= STEP_Y) { const s = Math.sign(g.ay); g.ay -= s * STEP_Y; caretStep(0, s, Boolean(g.select), g.anchor); }
      return;
    }
    if (g.code === '#Back' || g.code === '#BackL') {
      if (!g.swiped && dx < -30 && Math.abs(dx) > Math.abs(dy)) { g.swiped = true; stopRepeat(); backWord(); }
      return;
    }
    if (g.mode === 'menu' && padMenu && root.current) {
      const k = root.current.getBoundingClientRect();
      const idx = Math.max(0, Math.min(PADS.length - 1, Math.floor((e.clientX - k.left - padMenu.left) / padMenu.w)));
      if (idx !== padMenu.idx) setPadMenu({ ...padMenu, idx });
      return;
    }
    if (g.mode === 'menu' && enterMenu && root.current && g.code === '#Enter') {
      const k = root.current.getBoundingClientRect();
      const idx = Math.max(0, Math.min(ENTER_ITEMS.length - 1, Math.floor((e.clientX - k.left - enterMenu.left) / enterMenu.w)));
      if (idx !== enterMenu.idx) setEnterMenu({ ...enterMenu, idx });
      return;
    }
    // the left ↵ flicked up: the #+= layer opens under the finger
    if (g.code === '#EnterL' && g.mode === 'press' && -dy > FLICK && -dy > Math.abs(dx) * 1.2) {
      clearTimeout(g.timer);
      g.mode = 'flick';
      g.opened = !sym;
      setSym((v) => !v);
      return;
    }
    if (g.mode === 'press' && (g.code === '#Sym' || g.code === '#Pad') && Math.hypot(dx, dy) > MOVE) clearTimeout(g.timer); // sliding to a mark, not holding
    if (g.code.startsWith('#') || g.code.startsWith('Np') || g.code.startsWith('Txt:') || g.code.startsWith('Anna:')) return;
    if (g.mode === 'popup' && popup && root.current) {
      const k = root.current.getBoundingClientRect();
      const idx = Math.max(0, Math.min(popup.opts.length - 1, Math.floor((e.clientX - k.left - popup.left) / popup.w)));
      if (idx !== popup.idx) setPopup({ ...popup, idx });
      return;
    }
    if (g.mode === 'press' && dy > FLICK && dy > Math.abs(dx) * 1.2) {
      g.mode = 'flick';
      clearTimeout(g.timer);
    }
  };
  const up = (e: React.PointerEvent) => {
    const g = touch.current;
    if (g) finish(g, e.clientX, e.clientY);
  };
  const cancel = () => {
    const g = touch.current;
    if (g) { clearTimeout(g.timer); touch.current = null; }
    stopRepeat();
    setPopup(null);
    setPadMenu(null);
    setEnterMenu(null);
    setTracking(false);
  };

  const label = (code: string) =>
    ({ '#Enter': '↵', '#EnterL': '↵', '#Shift': shift === 2 ? '⇪' : '⇧', '#Shift2': shift === 2 ? '⇪' : '⇧', '#Globe': t('লেখার ভাষা বদলান'), '#Back': '⌫', '#BackL': '⌫', '#Space': compact ? (bangla ? 'বাংলা' : 'English') : t('স্পেস'), '#Space2': compact ? (bangla ? 'বাংলা' : 'English') : t('স্পেস'),
      '#Pad': pad ? LETTERS_KEY[bangla ? 'bn' : 'en'] : PAD_LABEL[lastPad], '#Frac': '½', '#Live': live?.on ? '●' : '🎙', '#Dari': bangla ? '।' : '.', '#Mode': bangla ? 'EN' : 'বাং', '#Alt': 'Alt', '#Sym': sym ? LETTERS_KEY[bangla ? 'bn' : 'en'] : '#+=' })[code];

  const keyEl = (code: string) => {
    const fn = code.startsWith('#');
    const main = fn ? '' : show(charOf(code));
    const base = baseOf(code);
    // the anna-ganda sign a number key gives with Alt, shown small in its corner (Bangla, full keyboard)
    const hint = !fn && !compact && bangla && !al && base in ANNA_ALT && code === base ? charFor(map, base, false, true, true) : '';
    const plain = code.startsWith('Np') || code.startsWith('Txt:') || code.startsWith('Anna:');
    const cls = ['k', fn && code !== '#Dari' ? 'fn' : '', code === '#Space' && !split ? 'w6' : '', code.startsWith('#Space') && split ? 'w3' : '',
      ['#Enter', '#EnterL', '#Shift', '#Shift2', '#Back', '#Mode', '#Sym', '#Pad'].includes(code) ? 'w15' : '', (code === '#Sym' && sym) || (code === '#Pad' && pad) ? 'on' : '',
      ((code === '#Shift' || code === '#Shift2') && shift > 0) || (code === '#Alt' && alt) || (code === '#Live' && live?.on) ? 'on' : '', flash === code ? 'hit' : '',
      code.startsWith('Alt+') ? 'sign' : '', plain ? 'pad' : '', code === '#Live' ? 'live' : ''].filter(Boolean).join(' ');
    return (
      <button key={code} type="button" tabIndex={-1} className={cls} data-code={code}
        aria-label={fn ? label(code) : main}
        onPointerDown={(e) => down(e, code)}>
        {code === '#Globe' ? GLOBE_ICON : code === '#Live' && compact && !live?.on ? LINE_MIC : fn ? (
          <>
            <span className="m">{label(code)}</span>
            {code === '#EnterL' && <span className="c">{sym ? LETTERS_KEY[bangla ? 'bn' : 'en'] : '#+='}</span>}
          </>
        ) : plain ? (
          <>
            <span className="m">{main}</span>
            {code.startsWith('Anna:') && <span className="v">{bangla ? num(code.slice(5), 'bn') : code.slice(5)}</span>}
          </>
        ) : (
          <>
            <span className={'m' + (/^ZW/.test(main) ? ' tiny' : '')}>{main}</span>
            {compact ? null : code.startsWith('Alt+') ? <span className="s">{show(charFor(map, base, false, false, bangla))}</span> : <span className="s">{show(charFor(map, base, !sh, al, bangla))}</span>}
            {compact ? null : hint ? <span className="a">{hint}</span> : <span className="l">{US[base]?.[1]}</span>}
          </>
        )}
      </button>
    );
  };
  const hideEl = onHide && (
    <button type="button" tabIndex={-1} className="k fn hide" data-testid="kb-hide" aria-label={t('কিবোর্ড নামান')} title={t('কিবোর্ড নামান')}
      onPointerDown={(e) => e.preventDefault()} onClick={onHide}>
      <span className="m">⌄</span>
    </button>
  );
  const shown = (c: string, ri: number) => (c !== '#Alt' || altKey) && (c !== '#Live' || Boolean(live))
    && (!c.startsWith('Alt+') || ri === 0 || (bangla && Boolean(charFor(map, baseOf(c), false, true, true))));
  const rowsEl = rows.map((row0, ri) => {
    const row = row0.filter((c) => shown(c, ri));
    const last = ri === rows.length - 1;
    if (!split) return <div className="kb-row" key={ri}>{row.map(keyEl)}{last && !compact && hideEl}</div>;
    const [l, r] = splitRow(row, Boolean(compact));
    return (
      <div className="kb-row split" key={ri}>
        <div className="half">{l.map(keyEl)}</div>
        <div className="gap" aria-hidden="true" />
        <div className="half">{r.map(keyEl)}{last && !compact && hideEl}</div>
      </div>
    );
  });

  return (
    <div ref={root} className={'kb' + (sh ? ' shift' : '') + (compact ? ' compact' : '') + (sym ? ' sym' : '') + (pad ? ' num pad-' + pad : '') + (split ? ' split' : '') + (tracking ? ' track' : '') + (hand ? ' hand-' + hand : '')}
      role="group" aria-label={t('বর্ণনা অন-স্ক্রিন কিবোর্ড')} data-testid="osk"
      onPointerMove={moveTo} onPointerUp={up} onPointerCancel={cancel}>
      {hand === 'right' && <HandStrip t={t} onFull={() => setHand?.(null)} onSwap={() => setHand?.('left')} side="left" />}
      <div className="kb-main">
        {rowsEl}
        {compact && (
          // the strip under the keys, where iOS keeps 🌐 and 🎙 (and the space the home bar leaves)
          <div className="kb-strip" data-testid="kb-strip">
            <span className="strip-side">{keyEl('#Globe')}{altKey && keyEl('#Alt')}</span>
            {hideEl}
            <span className="strip-side">{live && keyEl('#Live')}</span>
          </div>
        )}
      </div>
      {hand === 'left' && <HandStrip t={t} onFull={() => setHand?.(null)} onSwap={() => setHand?.('right')} side="right" />}
      {popup && (
        <div className="kb-pop" data-testid="kb-pop" style={{ left: popup.left, top: popup.top }}>
          {popup.opts.map((c, i) => <span key={c} className={i === popup.idx ? 'on' : ''} style={{ width: popup.w }}>{show(c)}</span>)}
        </div>
      )}
      {enterMenu && (
        <div className="kb-pop pad-menu enter-menu" data-testid="kb-enter-menu" style={{ left: enterMenu.left, top: enterMenu.top }}>
          {ENTER_ITEMS.map((id, i) => <span key={id} data-item={id} title={t(ENTER_NAME[id])} className={i === enterMenu.idx ? 'on' : ''} style={{ width: enterMenu.w }}>{ENTER_LABEL[id]}<small>{t(ENTER_NAME[id])}</small></span>)}
        </div>
      )}
      {padMenu && (
        <div className="kb-pop pad-menu" data-testid="kb-pad-menu" style={{ left: padMenu.left, top: padMenu.top }}>
          {PADS.map((p, i) => <span key={p} data-pad={p} className={i === padMenu.idx ? 'on' : ''} style={{ width: padMenu.w }}>{PAD_LABEL[p]}</span>)}
        </div>
      )}
      {menu && menuItems && (
        <div className="kb-menu" data-testid="kb-menu" onPointerDown={(e) => e.preventDefault()}>
          {menuItems.map((m) => (
            <button key={m.id} type="button" tabIndex={-1} data-testid={'kb-' + m.id} className={(m.on ? 'on ' : '') + (m.label.length > 2 ? 'wide' : '')}
              aria-label={m.label} onClick={() => { m.act(); setMenu(false); }}>{m.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The empty side of a one-handed keyboard: back to full width, or to the other hand. */
function HandStrip({ t, onFull, onSwap, side }: { t: (s: string) => string; onFull: () => void; onSwap: () => void; side: 'left' | 'right' }) {
  return (
    <div className="kb-hand" data-testid="kb-hand-strip">
      <button type="button" tabIndex={-1} aria-label={t('পুরো চওড়া কিবোর্ড')} onPointerDown={(e) => e.preventDefault()} onClick={onFull}>⤢</button>
      <button type="button" tabIndex={-1} aria-label={t('অন্য হাতে নিন')} onPointerDown={(e) => e.preventDefault()} onClick={onSwap}>{side === 'left' ? '‹' : '›'}</button>
    </div>
  );
}
