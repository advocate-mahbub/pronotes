/**
 * The caret ProNotes draws itself while its own keyboard is up (decisions.md 76). With the device's
 * keyboard kept closed, iOS draws its caret thin or not at all, so here it is 2px, blue and blinking;
 * under it an Android-like drop that can be held and dragged to move the caret; and, while the drop or
 * the space bar moves it, a loupe that shows the words around the caret larger (a setting can turn the
 * loupe off). Everything is position: fixed from the editor's own coordinates, so it follows scrolling.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { load } from './prefs';
import { KB_TRACK_EVENT } from './OnScreenKeyboard';

interface Box { x: number; top: number; h: number }
const MARKS = /^[ঁ-ঃ়া-্ৗৢৣ‌‍]+/;
const DROP_MS = 4000;

/** Up to `n` characters on each side of the caret, without a dangling kar or hasanta at the left edge. */
export function loupeText(before: string, after: string, n = 12): [string, string] {
  let b = before.slice(-n);
  if (b.length < before.length) {
    // cut at a word boundary when there is one, else at least not on a kar
    const sp = b.indexOf(' ');
    b = sp >= 0 && sp < b.length - 1 ? b.slice(sp + 1) : b.replace(MARKS, '');
  }
  let a = after.slice(0, n);
  // do not cut a conjunct or a kar off the last letter on the right
  while (a.length < after.length && MARKS.test(after.slice(a.length, a.length + 1))) a = after.slice(0, a.length + 1);
  return [b, a];
}

export function CaretOverlay({ editor, active }: { editor: Editor; active: boolean }) {
  const [box, setBox] = useState<Box | null>(null);
  const [drop, setDrop] = useState(false);
  const [loupe, setLoupe] = useState<{ x: number; y: number } | null>(null);
  const [words, setWords] = useState<[string, string]>(['', '']);
  const [font, setFont] = useState('');
  const dropTimer = useRef<number | undefined>(undefined);
  const dragging = useRef(false);
  const tracking = useRef(false);

  const measure = useCallback(() => {
    const { view, state } = editor;
    if (!active || !view.hasFocus() || !state.selection.empty) return setBox(null);
    try {
      const c = view.coordsAtPos(state.selection.head);
      const h = Math.max(12, c.bottom - c.top);
      setBox({ x: c.left, top: c.top, h });
      const $h = state.selection.$head;
      setWords(loupeText($h.parent.textBetween(0, $h.parentOffset, undefined, ' '), $h.parent.textBetween($h.parentOffset, $h.parent.content.size, undefined, ' ')));
      const dom = view.domAtPos(state.selection.head).node;
      const el = dom.nodeType === 1 ? (dom as HTMLElement) : dom.parentElement;
      if (el) setFont(getComputedStyle(el).fontFamily);
      if (tracking.current && load('kb.loupe', true)) setLoupe({ x: c.left, y: c.top - 12 });
    } catch { setBox(null); }
  }, [editor, active]);

  const showDrop = useCallback(() => {
    setDrop(true);
    clearTimeout(dropTimer.current);
    dropTimer.current = window.setTimeout(() => { if (!dragging.current) setDrop(false); }, DROP_MS);
  }, []);

  useEffect(() => {
    if (!active) { setBox(null); return; }
    measure();
    const onSel = () => measure();
    // typing puts the drop away (iOS and Android both do)
    const onUpdate = ({ transaction }: { transaction: { docChanged: boolean } }) => { if (transaction.docChanged && !dragging.current) setDrop(false); measure(); };
    editor.on('selectionUpdate', onSel);
    editor.on('update', onUpdate);
    editor.on('focus', onSel);
    editor.on('blur', onSel);
    const dom = editor.view.dom;
    // a tap in the text (not a drag that selects) shows the drop under the caret
    const onTap = () => window.setTimeout(() => { if (editor.state.selection.empty) { showDrop(); measure(); } }, 0);
    dom.addEventListener('pointerup', onTap);
    const onTrack = (e: Event) => {
      tracking.current = Boolean((e as CustomEvent<boolean>).detail);
      if (!tracking.current) setLoupe(null);
      measure();
    };
    window.addEventListener(KB_TRACK_EVENT, onTrack);
    window.addEventListener('scroll', onSel, true);
    window.addEventListener('resize', onSel);
    return () => {
      editor.off('selectionUpdate', onSel);
      editor.off('update', onUpdate);
      editor.off('focus', onSel);
      editor.off('blur', onSel);
      dom.removeEventListener('pointerup', onTap);
      window.removeEventListener(KB_TRACK_EVENT, onTrack);
      window.removeEventListener('scroll', onSel, true);
      window.removeEventListener('resize', onSel);
      clearTimeout(dropTimer.current);
    };
  }, [editor, active, measure, showDrop]);

  // the drop: hold and drag; the caret goes where the point just above the finger is
  const onDropDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    clearTimeout(dropTimer.current);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  };
  const onDropMove = (e: React.PointerEvent) => {
    if (!dragging.current || !box) return;
    const { view, state } = editor;
    // the drop hangs under the caret: aim at the middle of the line above it
    const hit = view.posAtCoords({ left: e.clientX, top: e.clientY - 22 - box.h / 2 });
    if (!hit) return;
    const sel = TextSelection.near(state.doc.resolve(hit.pos));
    if (!sel.eq(state.selection)) view.dispatch(state.tr.setSelection(sel).scrollIntoView());
    if (load('kb.loupe', true)) setLoupe({ x: e.clientX, y: e.clientY - 22 - box.h - 16 });
  };
  const onDropUp = () => {
    dragging.current = false;
    setLoupe(null);
    showDrop();
  };

  if (!active || !box) return null;
  const size = Math.min(40, Math.max(22, box.h * 1.25));
  return (
    <div className="caret-overlay" aria-hidden="true">
      <span className="pn-caret" data-testid="pn-caret" style={{ left: box.x - 1, top: box.top, height: box.h }} />
      {drop && (
        <span className="pn-drop" data-testid="pn-drop" style={{ left: box.x - 14, top: box.top + box.h + 2 }}
          onPointerDown={onDropDown} onPointerMove={onDropMove} onPointerUp={onDropUp} onPointerCancel={onDropUp} />
      )}
      {loupe && (
        <span className="pn-loupe" data-testid="pn-loupe" style={{ left: Math.max(120, Math.min(window.innerWidth - 120, loupe.x)), top: Math.max(8 + size * 1.6, loupe.y), fontFamily: font, fontSize: size }}>
          <span className="b">{words[0]}</span><span className="c" style={{ height: size * 1.1 }} /><span className="a">{words[1]}</span>
        </span>
      )}
    </div>
  );
}
