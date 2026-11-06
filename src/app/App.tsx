import { useState } from 'react';
import { BUILTIN_LAYOUTS, findLayout, resolveKey, planType } from '../bornona-engine';

/**
 * M0/M1 placeholder: a plain text box driven by the ported Bornona engine,
 * so the engine can be tried in a browser. The real editor (Tiptap) comes in M2.
 */
export function App() {
  const [layoutId, setLayoutId] = useState('bornona');
  const [bangla, setBangla] = useState(true);
  const map = findLayout(layoutId).map;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const a = resolveKey(
      { code: e.code, key: e.key, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altGraph: e.getModifierState('AltGraph'), isComposing: e.nativeEvent.isComposing },
      { bangla, map },
    );
    if (!a) return;
    e.preventDefault();
    if (a.kind === 'toggle-language') return setBangla((b) => !b);
    if (a.kind !== 'type') return;
    const s = ta.selectionStart;
    const edit = planType(ta.value.slice(0, s), s === ta.selectionEnd, a.text, { bangla, vowelForming: true, oldReph: false });
    ta.setRangeText(edit.text, s - edit.deleteBefore, ta.selectionEnd, 'end');
  };

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1>ProNotes</h1>
      <p>M1 engine preview. লেখার ঘরে টাইপ করুন (Ctrl+Space: বাংলা/English).</p>
      <p>
        <label>
          লেআউট{' '}
          <select data-testid="layout" value={layoutId} onChange={(e) => setLayoutId(e.target.value)}>
            {BUILTIN_LAYOUTS.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>{' '}
        <span data-testid="mode">{bangla ? 'বাংলা' : 'English'}</span>
      </p>
      <textarea data-testid="pad" onKeyDown={onKeyDown} rows={10} style={{ width: '100%', fontSize: 22 }} spellCheck={false} />
    </main>
  );
}
