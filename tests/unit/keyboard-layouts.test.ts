import { describe, expect, it } from 'vitest';
import { availableLayouts, PRO_NOTES_LAYOUT, PRO_NOTES_PHONETIC_LAYOUT, PRONOTES_LAYOUT_ID } from '../../src/bornona-engine/layouts';

describe('ProNotes keyboard integration', () => {
  it('uses Bornona as the base and changes only the approved keys', () => {
    const bornona = { ...PRO_NOTES_LAYOUT, map: Object.fromEntries(Object.entries(PRO_NOTES_LAYOUT.map).map(([k, v]) => [k, [...v]])) };
    bornona.map.Backquote = ['্‌', '~'];
    bornona.map.Backslash = ['র‍্য', '/-'];
    expect(PRO_NOTES_LAYOUT.id).toBe(PRONOTES_LAYOUT_ID);
    expect(PRO_NOTES_LAYOUT.map.Backquote).toEqual(['ৱ', 'ৰ']);
    expect(PRO_NOTES_LAYOUT.map.Backslash).toEqual(['\u200c', '~']);
    for (const [code, chars] of Object.entries(bornona.map)) {
      if (code !== 'Backquote' && code !== 'Backslash') expect(PRO_NOTES_LAYOUT.map[code]).toEqual(chars);
    }
  });

  it('never exposes legacy Bornona in the public layout list', () => {
    expect(availableLayouts().some((l) => l.id === 'bornona')).toBe(false);
    expect(availableLayouts().filter((l) => l.id === PRONOTES_LAYOUT_ID)).toHaveLength(1);
    expect(availableLayouts().some((l) => l.id === PRO_NOTES_PHONETIC_LAYOUT.id)).toBe(true);
  });
});
