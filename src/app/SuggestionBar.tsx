import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { suggest, contextOf, type WordBank } from '../suggest';
import { textBeforeCaret } from '../editor';
import { useT } from '../i18n';
import { shouldShowSuggestionBar } from './suggestion-visibility';

/** Chips with word suggestions for the text before the caret. */
export function SuggestionBar({ editor, bank, version }: { editor: Editor; bank: WordBank; version: number }) {
  const { t } = useT();
  const [words, setWords] = useState<string[]>([]);
  const [focused, setFocused] = useState(Boolean(editor.isFocused));

  useEffect(() => {
    const update = () => {
      const isFocused = Boolean(editor.isFocused);
      setFocused(isFocused);
      if (!isFocused || !editor.state.selection.empty) {
        setWords([]);
        return;
      }
      const before = textBeforeCaret(editor.view);
      // Suggestions are useful only while a word is being composed or immediately
      // after a completed word. Never render an empty placeholder/reserved strip.
      const next = suggest(bank, before);
      setWords(next);
    };
    update();
    editor.on('selectionUpdate', update);
    editor.on('update', update);
    editor.on('focus', update);
    editor.on('blur', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('update', update);
      editor.off('focus', update);
      editor.off('blur', update);
    };
  }, [editor, bank, version]);

  const pick = (w: string) => {
    const { view } = editor;
    const from = view.state.selection.from;
    const prefix = contextOf(textBeforeCaret(view)).prefix;
    view.dispatch(view.state.tr.insertText(w + ' ', from - prefix.length, from).scrollIntoView());
  };

  if (!shouldShowSuggestionBar(focused, editor.state.selection.empty, words)) return null;

  return (
    <div className="sug" aria-label={t('শব্দের পরামর্শ')} data-testid="suggestions" aria-live="polite">
      {words.map((w) => (
        <button key={w} type="button" className="chip" tabIndex={-1} onPointerDown={(e) => { e.preventDefault(); pick(w); }}>
          {w}
        </button>
      ))}
    </div>
  );
}
