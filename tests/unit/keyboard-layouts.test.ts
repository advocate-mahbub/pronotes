import { describe, expect, it } from 'vitest';
import { ANNA_ALT, availableLayouts, findLayout, PRO_NOTES_LAYOUT, PRO_NOTES_PHONETIC_LAYOUT, PRONOTES_LAYOUT_ID } from '../../src/bornona-engine/layouts';

describe('ProNotes keyboard integration', () => {
  it('uses Bornona as the base and changes only the approved keys', () => {
    const bornona = findLayout('bornona'); // the historical Bornona map
    expect(PRO_NOTES_LAYOUT.id).toBe(PRONOTES_LAYOUT_ID);
    expect(PRO_NOTES_LAYOUT.map.Backquote.slice(0, 2)).toEqual(['ৱ', 'ৰ']);
    expect(PRO_NOTES_LAYOUT.map.Backslash).toEqual(['\u200c', '~']);
    for (const [code, chars] of Object.entries(bornona.map)) {
      const mine = PRO_NOTES_LAYOUT.map[code];
      if (code !== 'Backquote' && code !== 'Backslash') expect(mine.slice(0, 2)).toEqual(chars.slice(0, 2));
      // the only AltGr characters are the anna-ganda signs of the number row (decisions.md 72)
      expect(mine[2] ?? '').toBe(ANNA_ALT[code] ?? '');
    }
  });

  it('never exposes legacy Bornona in the public layout list', () => {
    expect(availableLayouts().some((l) => l.id === 'bornona')).toBe(false);
    expect(availableLayouts().filter((l) => l.id === PRONOTES_LAYOUT_ID)).toHaveLength(1);
    expect(availableLayouts().some((l) => l.id === PRO_NOTES_PHONETIC_LAYOUT.id)).toBe(true);
  });
});
