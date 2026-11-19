import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { suggest, contextOf, type WordBank } from '../suggest';
import { textBeforeCaret } from '../editor';
import { useT } from '../i18n';

/** Chips with word suggestions for the text before the caret. */
export function SuggestionBar({ editor, bank, version }: { editor: Editor; bank: WordBank; version: number }) {
  const { t } = useT();
  const [words, setWords] = useState<string[]>([]);
  useEffect(() => {
    const update = () => setWords(editor.state.selection.empty ? suggest(bank, textBeforeCaret(editor.view)) : []);
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
  if (words.length === 0) return <div className="sug empty" data-testid="sug-empty" aria-hidden="true" />;

  return (
    <div className="sug" aria-label={t('শব্দের পরামর্শ')} data-testid="suggestions">
      {words.map((w) => (
          <button key={w} type="button" className="chip" tabIndex={-1} onPointerDown={(e) => { e.preventDefault(); pick(w); }}>
            {w}
          </button>
        ))}
    </div>
  );
}
