import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { PHONE_ROWS, PHONE_SYMBOL_ROWS, ROWS, US, charFor, hasAltLayer, type LayoutMap } from '../bornona-engine';
import { typeText, deleteBackward, textBeforeCaret, typeRulesKey, type BornonaConfig } from '../editor';
import { useT } from '../i18n';
import { activeBornonaBox, backspaceBox, typeIntoBox, typeKeyIntoBox } from './bornona-input';

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
}

/** Bornona on-screen keyboard. Keys never take focus, so the iPad's own keyboard stays closed. */
/** The key back to the letters shows letters of the language being typed (like iOS's "ABC"). */
const LETTERS_KEY = { bn: '\u0985\u0986', en: 'ABC' } as const;

export function OnScreenKeyboard({ editor, map, bangla, getConfig, onToggleLanguage, onWordDone, flash, onHide, compact }: Props) {
  const { t } = useT();
  const [shift, setShift] = useState(0); // 0 off, 1 next key, 2 locked
  const [alt, setAlt] = useState(false);
  // phones: the punctuation layer is open (stays open for several marks, closes on space or enter, like iOS)
  const [sym, setSym] = useState(false);
  const rows = compact ? (sym ? PHONE_SYMBOL_ROWS : PHONE_ROWS) : ROWS;
  const [phys, setPhys] = useState({ shift: false, alt: false });
  const lastShift = useRef(0);
  const repeat = useRef<{ t?: number; i?: number }>({});
  const altKeys = hasAltLayer(map);

  useEffect(() => {
    const on = (e: KeyboardEvent) => setPhys({ shift: e.shiftKey, alt: e.altKey && altKeys });
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
  };

  const press = (code: string) => {
    const view = editor.view;
    const box = activeBornonaBox();
    const cfg = getConfig();
    const kb = cfg.rules && cfg.bangla && !cfg.suspended ? cfg.rules : null;
    /** A key through the Keyman rules (when that keyboard is chosen). */
    const rulesKey = (k: { code: string; shift: boolean; alt: boolean }) =>
      Boolean(kb) && (box ? typeKeyIntoBox(box, k, getConfig()) : typeRulesKey(view, kb!, k, getConfig().ansi));
    const back = box
      ? () => rulesKey({ code: 'Backspace', shift: false, alt: false }) || backspaceBox(box)
      : () => deleteBackward(view, () => editor.commands.joinBackward(), getConfig());
    const type = (s: string) => (box ? typeIntoBox(box, s, getConfig()) : typeText(view, s, getConfig()));
    switch (code) {
      case '#Shift': {
        const now = Date.now();
        setShift((s) => (s === 0 ? (now - lastShift.current < 350 ? 2 : 1) : s === 1 && now - lastShift.current < 350 ? 2 : 0));
        lastShift.current = now;
        return;
      }
      case '#Alt':
        return setAlt((a) => !a);
      case '#Mode':
        return onToggleLanguage();
      case '#Sym':
        return setSym((v) => !v);
      case '#Back':
        back();
        repeat.current.t = window.setTimeout(() => (repeat.current.i = window.setInterval(back, 70)), 450);
        return;
      case '#Enter':
        setSym(false);
        if (box) {
          box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return;
        }
        onWordDone(textBeforeCaret(view));
        editor.commands.enter();
        return;
      case '#Space':
        setSym(false);
        if (rulesKey({ code: 'Space', shift: false, alt: false })) return;
        return type(' ');
      case '#Dari':
        return type(bangla ? '।' : '.');
    }
    if (kb) rulesKey({ code, shift: sh, alt: al });
    else {
      const out = charFor(map, code, sh, al, bangla);
      if (out) type(out);
    }
    if (shift === 1) setShift(0);
    if (alt) setAlt(false);
  };

  const label = (code: string) =>
    ({ '#Enter': '↵', '#Shift': shift === 2 ? '⇪' : '⇧', '#Back': '⌫', '#Space': t('স্পেস'), '#Dari': bangla ? '।' : '.', '#Mode': bangla ? 'EN' : 'বাং', '#Alt': 'AltGr', '#Sym': sym ? LETTERS_KEY[bangla ? 'bn' : 'en'] : '#+=' })[code];

  return (
    <div className={'kb' + (sh ? ' shift' : '') + (compact ? ' compact' : '') + (sym ? ' sym' : '')} role="group" aria-label={t('বর্ণনা অন-স্ক্রিন কিবোর্ড')} data-testid="osk"
      onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onPointerLeave={stopRepeat}>
      {rows.map((row, ri) => (
        <div className="kb-row" key={ri}>
          {row.filter((c) => c !== '#Alt' || altKeys).map((code) => {
            const fn = code.startsWith('#');
            const main = fn ? '' : show(charFor(map, code, sh, al, bangla));
            const cls = ['k', fn && code !== '#Dari' ? 'fn' : '', code === '#Space' ? 'w6' : '', ['#Enter', '#Shift', '#Back', '#Mode', '#Sym'].includes(code) ? 'w15' : '', code === '#Sym' && sym ? 'on' : '',
              (code === '#Shift' && shift > 0) || (code === '#Alt' && alt) ? 'on' : '', flash === code ? 'hit' : ''].filter(Boolean).join(' ');
            return (
              <button key={code} type="button" tabIndex={-1} className={cls} data-code={code}
                aria-label={fn ? label(code) : main}
                onPointerDown={(e) => { e.preventDefault(); press(code); }}>
                {fn ? (
                  <span className="m">{label(code)}</span>
                ) : (
                  <>
                    <span className={'m' + (/^ZW/.test(main) ? ' tiny' : '')}>{main}</span>
                    <span className="s">{show(charFor(map, code, !sh, al, bangla))}</span>
                    <span className="l">{US[code][1]}</span>
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
      ))}
    </div>
  );
}
