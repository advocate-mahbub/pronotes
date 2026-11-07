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

  return (
    <div className="sug" aria-label={t('শব্দের পরামর্শ')} data-testid="suggestions">
      {words.length === 0 ? (
        <span className="hint">{t('লিখতে শুরু করুন, শব্দের পরামর্শ এখানে আসবে')}</span>
      ) : (
        words.map((w) => (
          <button key={w} type="button" className="chip" tabIndex={-1} onPointerDown={(e) => { e.preventDefault(); pick(w); }}>
            {w}
          </button>
        ))
      )}
    </div>
  );
}
