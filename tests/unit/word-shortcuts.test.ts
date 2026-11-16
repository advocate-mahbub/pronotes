// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { editorExtensions, IS_APPLE, keyIs, showKeys, WORD_SHORTCUTS } from '../../src/editor';

let ed: Editor | null = null;
afterEach(() => { ed?.destroy(); ed = null; });

function make(html: string, cfg: Record<string, unknown> = {}) {
  ed = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions({ getConfig: () => ({ bangla: true, map: {}, vowelForming: true, oldReph: false, suspended: false, ...cfg }) as never }),
    content: html,
  });
  return ed;
}
/** Press a key by position, with Ctrl (⌘ on Apple) when mod is set. */
function press(e: Editor, code: string, k: { mod?: boolean; shift?: boolean; alt?: boolean } = {}) {
  const ev = new KeyboardEvent('keydown', {
    code, key: ((x) => (k.shift ? x.toUpperCase() : x.toLowerCase()))(code.replace(/^Key|^Digit/, '')), bubbles: true, cancelable: true,
    ctrlKey: !!k.mod && !IS_APPLE, metaKey: !!k.mod && IS_APPLE, shiftKey: !!k.shift, altKey: !!k.alt,
  });
  e.view.dom.dispatchEvent(ev);
  return ev.defaultPrevented;
}
const select = (e: Editor, from: number, to: number) => e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, from, to)));
const M = { mod: true }, MS = { mod: true, shift: true };

describe('Word shortcuts: matching keys', () => {
  it('exact modifiers, by key position; ⌘ on Apple', () => {
    const e = { code: 'KeyD', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false };
    expect(keyIs(e, 'KeyD', MS, false)).toBe(true);
    expect(keyIs(e, 'KeyD', M, false)).toBe(false);
    expect(keyIs(e, 'KeyD', MS, true)).toBe(false);
    expect(keyIs({ ...e, ctrlKey: false, metaKey: true }, 'KeyD', MS, true)).toBe(true);
    expect(showKeys('Ctrl+Alt+Shift+K', true)).toBe('⌘⌥⇧K');
    expect(WORD_SHORTCUTS.length).toBeGreaterThan(30);
  });
});

describe('Word shortcuts in the editor', () => {
  it('Ctrl+E / Ctrl+J align, Ctrl+Q clears paragraph format', () => {
    const e = make('<p>কমর</p>');
    expect(press(e, 'KeyE', M)).toBe(true);
    expect(e.state.doc.firstChild!.attrs.textAlign).toBe('center');
    press(e, 'KeyJ', M);
    expect(e.state.doc.firstChild!.attrs.textAlign).toBe('justify');
    press(e, 'Digit2', M);
    expect(e.state.doc.firstChild!.attrs.lineVal).toBe(2);
    press(e, 'KeyQ', M);
    expect(e.state.doc.firstChild!.attrs.textAlign).toBeNull();
    expect(e.state.doc.firstChild!.attrs.lineVal).toBeNull();
  });

  it('Ctrl+T hanging indent keeps the first line where it was; Ctrl+Shift+T takes it back', () => {
    const e = make('<p>দলিল</p>');
    press(e, 'KeyT', M);
    expect(e.state.doc.firstChild!.attrs.indL).toBe(720);
    expect(e.state.doc.firstChild!.attrs.first).toBe(-720);
    press(e, 'KeyT', MS);
    expect(e.state.doc.firstChild!.attrs.indL).toBeNull();
    expect(e.state.doc.firstChild!.attrs.first).toBeNull();
  });

  it('Ctrl+0 space before on/off; Ctrl+5 1.5 lines', () => {
    const e = make('<p>ক</p>');
    press(e, 'Digit0', M);
    expect(e.state.doc.firstChild!.attrs.spBefore).toBe(12);
    press(e, 'Digit0', M);
    expect(e.state.doc.firstChild!.attrs.spBefore).toBeNull();
    press(e, 'Digit5', M);
    expect(e.state.doc.firstChild!.attrs.lineVal).toBe(1.5);
  });

  it('Ctrl+Shift+D double underline, Ctrl+= subscript, Ctrl+Shift+= superscript, Ctrl+] size', () => {
    const e = make('<p>abc</p>');
    select(e, 1, 4);
    press(e, 'KeyD', MS);
    expect(e.isActive('underline', { ustyle: 'double' })).toBe(true);
    press(e, 'KeyD', MS);
    expect(e.isActive('underline')).toBe(false);
    press(e, 'Equal', M);
    expect(e.isActive('subscript')).toBe(true);
    press(e, 'Equal', MS);
    expect(e.isActive('superscript')).toBe(true);
    expect(e.isActive('subscript')).toBe(false);
    press(e, 'BracketRight', M);
    expect(e.getAttributes('textStyle').fontSize).toBe('13pt');
    press(e, 'Period', MS);
    expect(e.getAttributes('textStyle').fontSize).toBe('14pt');
  });

  it('Shift+F3 cycles the case of English; Ctrl+Shift+A capitals', () => {
    const e = make('<p>deed of sale</p>');
    select(e, 1, 13);
    press(e, 'F3', { shift: true });
    expect(e.getText()).toBe('DEED OF SALE');
    press(e, 'F3', { shift: true });
    expect(e.getText()).toBe('Deed Of Sale');
    press(e, 'F3', { shift: true });
    expect(e.getText()).toBe('deed of sale');
    press(e, 'KeyA', MS);
    expect(e.getText()).toBe('DEED OF SALE');
  });

  it('Ctrl+Shift+C / V copies and pastes formatting', () => {
    const e = make('<p><strong>মোটা</strong> সাধারণ</p>');
    select(e, 2, 2);
    press(e, 'KeyC', MS);
    select(e, 6, 11);
    press(e, 'KeyV', MS);
    expect(e.isActive('bold')).toBe(true);
  });

  it('special characters and Alt+Shift+↑ moves the paragraph', () => {
    const e = make('<p>এক</p><p>দুই</p>');
    select(e, 6, 6);
    press(e, 'KeyC', { mod: true, alt: true });
    press(e, 'Minus', { mod: true, alt: true });
    press(e, 'Space', MS);
    expect(e.state.doc.child(1).textContent).toBe('দ©— ুই');
    press(e, 'ArrowUp', { shift: true, alt: true });
    expect(e.state.doc.child(0).textContent).toBe('দ©— ুই');
    expect(e.state.doc.child(1).textContent).toBe('এক');
    press(e, 'ArrowDown', { shift: true, alt: true });
    expect(e.state.doc.child(1).textContent).toBe('দ©— ুই');
  });

  it('Ctrl+Shift+L bullets, Ctrl+Shift+N back to normal, Ctrl+Shift+8 shows ¶', () => {
    const e = make('<h2>শিরোনাম</h2><p>লেখা</p>');
    select(e, 2, 2);
    press(e, 'KeyN', MS);
    expect(e.state.doc.child(0).type.name).toBe('paragraph');
    press(e, 'KeyL', MS);
    expect(e.state.doc.child(0).type.name).toBe('bulletList');
    expect(press(e, 'Digit8', MS)).toBe(true);
  });

  it('Ctrl+Space clears formatting only when it is not the Bangla/English key; Bijoy text keeps its font', () => {
    let e = make('<p><strong>abc</strong></p>');
    select(e, 1, 4);
    press(e, 'Space', M); // the default switch key: left to the Bornona engine
    expect(e.isActive('bold')).toBe(true);
    e.destroy();
    e = make('<p><strong>abc</strong><span style="font-family: SutonnyMJ">Avwg</span></p>', { toggleKey: 'f12', ansi: { on: false, bijoyFont: 'SutonnyMJ', englishFont: 'Times New Roman' } });
    ed = e;
    select(e, 1, 8);
    press(e, 'Space', M);
    expect(e.isActive('bold')).toBe(false);
    expect(JSON.stringify(e.getJSON())).toContain('SutonnyMJ');
  });
});
