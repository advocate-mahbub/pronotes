import { describe, expect, it } from 'vitest';
import { shouldShowSuggestionBar } from '../../src/app/suggestion-visibility';

describe('mobile suggestion bar visibility', () => {
  it('stays collapsed while the editor is idle', () => {
    expect(shouldShowSuggestionBar(false, true, ['দলিল'])).toBe(false);
  });

  it('stays collapsed when there are no real suggestions', () => {
    expect(shouldShowSuggestionBar(true, true, [])).toBe(false);
  });

  it('stays collapsed when a text range is selected', () => {
    expect(shouldShowSuggestionBar(true, false, ['দলিল'])).toBe(false);
  });

  it('shows only when focused, caret is collapsed and suggestions exist', () => {
    expect(shouldShowSuggestionBar(true, true, ['দলিল'])).toBe(true);
  });
});
