/** Suggestions occupy dock space only while the editor is active and has usable choices. */
export function shouldShowSuggestionBar(focused: boolean, selectionEmpty: boolean, words: readonly string[]): boolean {
  return focused && selectionEmpty && words.length > 0;
}
