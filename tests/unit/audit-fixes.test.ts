import { describe, it, expect, beforeEach } from 'vitest';
import { mergeBankMax } from '../../src/storage/backup';
import { restorePrefs } from '../../src/app/prefs';

describe('backup restore is safe against hand-edited files', () => {
  it('does not reach Object.prototype through __proto__ keys', () => {
    const into = { w: {}, b: {} } as never;
    const from = JSON.parse('{"w":{"__proto__":5,"constructor":3,"দলিল":2},"b":{"__proto__":{"polluted":7},"দলিল":{"__proto__":1,"মূলে":4}}}');
    expect(mergeBankMax(into, from)).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(into).toEqual({ w: { দলিল: 2 }, b: { দলিল: { মূলে: 4 } } });
  });

  it('keeps the larger count when the same backup is restored twice', () => {
    const into = { w: { দলিল: 5 }, b: {} } as never;
    expect(mergeBankMax(into, { w: { দলিল: 2 }, b: {} } as never)).toBe(0);
    expect((into as { w: Record<string, number> }).w['দলিল']).toBe(5);
  });

  it('ignores malformed nested bank values instead of assigning properties to primitives', () => {
    const into = { w: {}, b: { existing: 7 } } as never;
    const from = JSON.parse('{"w":{"valid":3,"__proto__":9},"b":{"existing":{"polluted":4},"bad":7}}');
    expect(() => mergeBankMax(into, from)).not.toThrow();
    expect((into as { w: Record<string, number> }).w.valid).toBe(3);
    expect((into as { b: Record<string, unknown> }).b.existing).toEqual({ polluted: 4 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('restorePrefs', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() { return mem.size; },
    };
  });

  it('does not switch on voice / AI consent from a backup file', () => {
    const n = restorePrefs({ theme: 'dark', voiceConsent: true, aiVoiceConsent: true });
    expect(n).toBe(1);
    expect([...mem.keys()].some((k) => /Consent$/.test(k))).toBe(false);
  });
});
