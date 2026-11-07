import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ROWS, US, charFor, hasAltLayer, type LayoutMap } from '../bornona-engine';
import { typeText, deleteBackward, textBeforeCaret, type BornonaConfig } from '../editor';
import { useT } from '../i18n';
import { activeBornonaBox, backspaceBox, typeIntoBox } from './bornona-input';

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
}

/** Bornona on-screen keyboard. Keys never take focus, so the iPad's own keyboard stays closed. */
export function OnScreenKeyboard({ editor, map, bangla, getConfig, onToggleLanguage, onWordDone, flash }: Props) {
  const { t } = useT();
  const [shift, setShift] = useState(0); // 0 off, 1 next key, 2 locked
  const [alt, setAlt] = useState(false);
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
    const back = box ? () => backspaceBox(box) : () => deleteBackward(view, () => editor.commands.joinBackward());
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
      case '#Back':
        back();
        repeat.current.t = window.setTimeout(() => (repeat.current.i = window.setInterval(back, 70)), 450);
        return;
      case '#Enter':
        if (box) {
          box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return;
        }
        onWordDone(textBeforeCaret(view));
        editor.commands.enter();
        return;
      case '#Space':
        return type(' ');
      case '#Dari':
        return type(bangla ? '।' : '.');
    }
    const out = charFor(map, code, sh, al, bangla);
    if (out) type(out);
    if (shift === 1) setShift(0);
    if (alt) setAlt(false);
  };

  const label = (code: string) =>
    ({ '#Enter': '↵', '#Shift': shift === 2 ? '⇪' : '⇧', '#Back': '⌫', '#Space': t('স্পেস'), '#Dari': bangla ? '।' : '.', '#Mode': bangla ? 'EN' : 'বাং', '#Alt': 'AltGr' })[code];

  return (
    <div className={'kb' + (sh ? ' shift' : '')} role="group" aria-label={t('বর্ণনা অন-স্ক্রিন কিবোর্ড')} data-testid="osk"
      onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onPointerLeave={stopRepeat}>
      {ROWS.map((row, ri) => (
        <div className="kb-row" key={ri}>
          {row.filter((c) => c !== '#Alt' || altKeys).map((code) => {
            const fn = code.startsWith('#');
            const main = fn ? '' : show(charFor(map, code, sh, al, bangla));
            const cls = ['k', fn && code !== '#Dari' ? 'fn' : '', code === '#Space' ? 'w6' : '', ['#Enter', '#Shift', '#Back', '#Mode'].includes(code) ? 'w15' : '',
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
        </div>
      ))}
    </div>
  );
}
