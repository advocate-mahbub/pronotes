import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { ANNA_ALT, PHONE_ROWS, PHONE_SYMBOL_ROWS, ROWS, US, charFor, hasAltBeyondAnna, hasAltLayer, type LayoutMap } from '../bornona-engine';
import { typeText, deleteBackward, textBeforeCaret, typeRulesKey, type BornonaConfig } from '../editor';
import { useT } from '../i18n';
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
  /** Phones: one-handed keyboard (long-press the language key). */
  hand?: Hand;
  setHand?: (h: Hand) => void;
  /** iPad and computers: the keyboard floats, small and movable (long-press the language key). */
  floating?: boolean;
  setFloating?: (f: boolean) => void;
}

/** The key back to the letters shows letters of the language being typed (like iOS's "ABC"). */
const LETTERS_KEY = { bn: 'অআ', en: 'ABC' } as const;
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
export function OnScreenKeyboard({ editor, map, bangla, getConfig, onToggleLanguage, onWordDone, flash, onHide, compact, hand, setHand, floating, setFloating }: Props) {
  const { t } = useT();
  const [shift, setShift] = useState(0); // 0 off, 1 next key, 2 locked
  const [alt, setAlt] = useState(false);
  // phones: the punctuation layer is open (stays open for several marks, closes on space or enter, like iOS)
  const [sym, setSym] = useState(false);
  const [popup, setPopup] = useState<{ opts: string[]; idx: number; left: number; top: number; w: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const [tracking, setTracking] = useState(false);
  const rows = compact ? (sym ? PHONE_SYMBOL_ROWS : PHONE_ROWS) : ROWS;
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
    const c = baseOf(code);
    const a = code.startsWith('Alt+') || al;
    return charFor(map, c, shiftOn, a, bangla) || (a ? charFor(map, c, shiftOn, false, bangla) : '');
  };
  const typeKey = (code: string, shiftOn = sh) => {
    if (rulesOn()) rulesKey({ code: baseOf(code), shift: shiftOn, alt: code.startsWith('Alt+') || al });
    else {
      const out = charOf(code, shiftOn);
      if (out) type(out);
    }
    if (shift === 1) setShift(0);
    if (alt) setAlt(false);
  };
  const space = () => {
    setSym(false);
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
    if (g.mode === 'menu') return;
    if (code === '#Space') return space();
    if (code === '#Enter') return enter();
    if (code === '#Dari') return type(bangla ? '।' : '.');
    if (code === '#Mode') return onToggleLanguage();
    if (code === '#Back') return;
    if (code === '#Sym') {
      // slid from #+= to a mark and lifted there: that mark, then back to the letters (iOS)
      const over = x !== undefined && y !== undefined ? keyAt(x, y) : null;
      if (over && over !== '#Sym' && !over.startsWith('#')) {
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
      case '#Shift': {
        const now = Date.now();
        setShift((s) => (s === 0 ? (now - lastShift.current < 350 ? 2 : 1) : s === 1 && now - lastShift.current < 350 ? 2 : 0));
        lastShift.current = now;
        return;
      }
      case '#Alt':
        return setAlt((a) => !a);
      case '#Back': {
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
        g.opened = !sym;
        setSym((v) => !v);
        break;
      case '#Mode':
        if (setHand || setFloating) g.timer = window.setTimeout(() => { g.mode = 'menu'; setMenu(true); }, LONG + 80);
        break;
      case '#Space':
        g.timer = window.setTimeout(() => startTrack(g), LONG);
        break;
      default:
        if (!code.startsWith('#')) {
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
    if (g.code === '#Space') {
      if (g.mode !== 'track' && Math.abs(dx) > MOVE) startTrack(g);
      if (g.mode !== 'track') return;
      g.ax = (g.ax ?? 0) + (e.clientX - (g.lx ?? g.x0));
      g.ay = (g.ay ?? 0) + (e.clientY - (g.ly ?? g.y0));
      g.lx = e.clientX; g.ly = e.clientY;
      while (Math.abs(g.ax) >= STEP_X) { const s = Math.sign(g.ax); g.ax -= s * STEP_X; caretStep(s, 0, Boolean(g.select), g.anchor); }
      while (Math.abs(g.ay) >= STEP_Y) { const s = Math.sign(g.ay); g.ay -= s * STEP_Y; caretStep(0, s, Boolean(g.select), g.anchor); }
      return;
    }
    if (g.code === '#Back') {
      if (!g.swiped && dx < -30 && Math.abs(dx) > Math.abs(dy)) { g.swiped = true; stopRepeat(); backWord(); }
      return;
    }
    if (g.code.startsWith('#')) return;
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
    setTracking(false);
  };

  const label = (code: string) =>
    ({ '#Enter': '↵', '#Shift': shift === 2 ? '⇪' : '⇧', '#Back': '⌫', '#Space': t('স্পেস'), '#Dari': bangla ? '।' : '.', '#Mode': bangla ? 'EN' : 'বাং', '#Alt': 'Alt', '#Sym': sym ? LETTERS_KEY[bangla ? 'bn' : 'en'] : '#+=' })[code];

  const rowsEl = rows.map((row, ri) => (
    <div className="kb-row" key={ri}>
      {row.filter((c) => (c !== '#Alt' || altKey) && (!c.startsWith('Alt+') || ri === 0 || (bangla && charFor(map, baseOf(c), false, true, true)))).map((code) => {
        const fn = code.startsWith('#');
        const main = fn ? '' : show(charOf(code));
        const base = baseOf(code);
        // the anna-ganda sign a number key gives with Alt, shown small in its corner (Bangla, full keyboard)
        const hint = !fn && !compact && bangla && !al && base in ANNA_ALT && code === base ? charFor(map, base, false, true, true) : '';
        const cls = ['k', fn && code !== '#Dari' ? 'fn' : '', code === '#Space' ? 'w6' : '', ['#Enter', '#Shift', '#Back', '#Mode', '#Sym'].includes(code) ? 'w15' : '', code === '#Sym' && sym ? 'on' : '',
          (code === '#Shift' && shift > 0) || (code === '#Alt' && alt) ? 'on' : '', flash === code ? 'hit' : '', code.startsWith('Alt+') ? 'sign' : ''].filter(Boolean).join(' ');
        return (
          <button key={code} type="button" tabIndex={-1} className={cls} data-code={code}
            aria-label={fn ? label(code) : main}
            onPointerDown={(e) => down(e, code)}>
            {fn ? (
              <span className="m">{label(code)}</span>
            ) : (
              <>
                <span className={'m' + (/^ZW/.test(main) ? ' tiny' : '')}>{main}</span>
                {code.startsWith('Alt+') ? <span className="s">{show(charFor(map, base, false, false, bangla))}</span> : <span className="s">{show(charFor(map, base, !sh, al, bangla))}</span>}
                {hint ? <span className="a">{hint}</span> : <span className="l">{US[base]?.[1]}</span>}
              </>
            )}
          </button>
        );
      })}
      {onHide && ri === rows.length - 1 && (
        <button type="button" tabIndex={-1} className="k fn hide" data-testid="kb-hide" aria-label={t('কিবোর্ড নামান')} title={t('কিবোর্ড নামান')}
          onPointerDown={(e) => e.preventDefault()} onClick={onHide}>
          <span className="m">⌄</span>
        </button>
      )}
    </div>
  ));

  return (
    <div ref={root} className={'kb' + (sh ? ' shift' : '') + (compact ? ' compact' : '') + (sym ? ' sym' : '') + (tracking ? ' track' : '') + (hand ? ' hand-' + hand : '')}
      role="group" aria-label={t('বর্ণনা অন-স্ক্রিন কিবোর্ড')} data-testid="osk"
      onPointerMove={moveTo} onPointerUp={up} onPointerCancel={cancel}>
      {hand === 'right' && <HandStrip t={t} onFull={() => setHand?.(null)} onSwap={() => setHand?.('left')} side="left" />}
      <div className="kb-main">{rowsEl}</div>
      {hand === 'left' && <HandStrip t={t} onFull={() => setHand?.(null)} onSwap={() => setHand?.('right')} side="right" />}
      {popup && (
        <div className="kb-pop" data-testid="kb-pop" style={{ left: popup.left, top: popup.top }}>
          {popup.opts.map((c, i) => <span key={c} className={i === popup.idx ? 'on' : ''} style={{ width: popup.w }}>{show(c)}</span>)}
        </div>
      )}
      {menu && (
        <div className="kb-menu" data-testid="kb-menu" onPointerDown={(e) => e.preventDefault()}>
          {setHand && compact && !floating ? (
            <>
              <button type="button" tabIndex={-1} data-testid="kb-hand-left" className={hand === 'left' ? 'on' : ''} aria-label={t('বাঁ হাতে লেখা')} onClick={() => { setHand('left'); setMenu(false); }}>◧</button>
              <button type="button" tabIndex={-1} data-testid="kb-hand-full" className={!hand ? 'on' : ''} aria-label={t('পুরো চওড়া কিবোর্ড')} onClick={() => { setHand(null); setMenu(false); }}>▭</button>
              <button type="button" tabIndex={-1} data-testid="kb-hand-right" className={hand === 'right' ? 'on' : ''} aria-label={t('ডান হাতে লেখা')} onClick={() => { setHand('right'); setMenu(false); }}>◨</button>
            </>
          ) : setFloating ? (
            <button type="button" tabIndex={-1} data-testid="kb-float" className="wide" onClick={() => { setFloating(!floating); setMenu(false); }}>
              {floating ? t('কিবোর্ড নিচে বসান') : t('ভাসমান কিবোর্ড')}
            </button>
          ) : null}
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
