import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { suggest, contextOf, type WordBank } from '../suggest';
import { textBeforeCaret } from '../editor';
import { useT } from '../i18n';

/**
 * Chips with word suggestions for the text before the caret. With `tools` (the on-screen keyboard is up),
 * ↶ ↷ sit at its left end, like the iPad's own shortcut bar (decisions.md 76).
 */
export function SuggestionBar({ editor, bank, version, tools = false }: { editor: Editor; bank: WordBank; version: number; tools?: boolean }) {
  const { t } = useT();
  const [words, setWords] = useState<string[]>([]);
  const [can, setCan] = useState({ undo: false, redo: false });
  useEffect(() => {
    const update = () => {
      setWords(editor.state.selection.empty ? suggest(bank, textBeforeCaret(editor.view)) : []);
      setCan({ undo: editor.can().undo(), redo: editor.can().redo() });
    };
    update();
    editor.on('selectionUpdate', update);
    editor.on('update', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('update', update);
    };
  }, [editor, bank, version]);

  const pick = (w: string) => {
    const { view } = editor;
    const from = view.state.selection.from;
    const prefix = contextOf(textBeforeCaret(view)).prefix;
    view.dispatch(view.state.tr.insertText(w + ' ', from - prefix.length, from).scrollIntoView());
  };

  // Empty: no strip of space is kept for nothing (CSS hides it), except while the on-screen keyboard is
  // up — there a row that came and went made the whole keyboard jump while typing.
  const toolEls = tools && (
    <span className="sug-tools">
      <button type="button" className="tool" tabIndex={-1} data-testid="kb-undo" disabled={!can.undo} aria-label={t('আগের অবস্থায় ফিরুন (Undo)')} title={t('আগের অবস্থায় ফিরুন (Undo)')}
        onPointerDown={(e) => { e.preventDefault(); editor.commands.undo(); }}>↶</button>
      <button type="button" className="tool" tabIndex={-1} data-testid="kb-redo" disabled={!can.redo} aria-label={t('আবার করুন (Redo)')} title={t('আবার করুন (Redo)')}
        onPointerDown={(e) => { e.preventDefault(); editor.commands.redo(); }}>↷</button>
    </span>
  );
  if (words.length === 0) return <div className="sug empty" data-testid="sug-empty" aria-hidden={!tools}>{toolEls}</div>;

  return (
    <div className="sug" aria-label={t('শব্দের পরামর্শ')} data-testid="suggestions">
      {toolEls}
      {words.map((w) => (
          <button key={w} type="button" className="chip" tabIndex={-1} onPointerDown={(e) => { e.preventDefault(); pick(w); }}>
            {w}
          </button>
        ))}
    </div>
  );
}
