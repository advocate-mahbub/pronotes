// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { AUTO_MODEL, autoModels, geminiGenerate, measureFreeModels, readAuto } from '../../src/ai/gemini';

beforeEach(() => localStorage.clear());

/** A pretend Gemini: some models are slow, one is out of its daily limit, one is not free. */
function fakeGemini(delay: Record<string, number>, quota: Set<string> = new Set()) {
  let clock = Date.now();
  const now = () => clock;
  const calls: string[] = [];
  const f = (async (url: string) => {
    if (url.includes('/models?')) return new Response(JSON.stringify({ models: ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-4-hydrogen'].map((m) => ({ name: 'models/' + m, supportedGenerationMethods: ['generateContent'] })) }), { status: 200 });
    const m = decodeURIComponent(url.match(/models\/([^:]+):/)![1]);
    calls.push(m);
    clock += delay[m] ?? 500;
    if (quota.has(m)) return new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'উত্তর ' + m } ] } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, now, calls };
}

describe('Gemini "auto": the fastest free model', () => {
  it('measures only the free models, fastest first; a model of unknown price is never picked', async () => {
    const g = fakeGemini({ 'gemini-3.5-flash': 900, 'gemini-3.1-flash-lite': 300, 'gemini-2.5-flash': 600 });
    const a = await measureFreeModels('K', g.f, g.now);
    expect(a.order.map((x) => x.model)).toEqual(['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash']);
    expect(g.calls).not.toContain('gemini-4-hydrogen');
    expect(readAuto()?.order[0].ms).toBe(300);
  });
  it('uses the fastest; when its daily limit is out, the next one, and the tired one goes last for an hour', async () => {
    const g = fakeGemini({ 'gemini-3.1-flash-lite': 100, 'gemini-2.5-flash': 200, 'gemini-3.5-flash': 300 }, new Set(['gemini-3.1-flash-lite']));
    await measureFreeModels('K', g.f, g.now);
    // the measurement saw the quota error: that model went last already
    expect(await autoModels('K', g.f, g.now)).toEqual(['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']);
    const out = await geminiGenerate('হ্যালো', { key: 'K', model: AUTO_MODEL, fetchImpl: g.f });
    expect(out).toBe('উত্তর gemini-2.5-flash');
  });
  it('a model out of its limit at use time is skipped and set aside', async () => {
    const quota = new Set<string>();
    const g = fakeGemini({ 'gemini-3.1-flash-lite': 100, 'gemini-2.5-flash': 200, 'gemini-3.5-flash': 300 }, quota);
    await measureFreeModels('K', g.f, g.now);
    quota.add('gemini-3.1-flash-lite');
    expect(await geminiGenerate('হ্যালো', { key: 'K', model: AUTO_MODEL, fetchImpl: g.f })).toBe('উত্তর gemini-2.5-flash');
    expect((await autoModels('K', g.f)).at(-1)).toBe('gemini-3.1-flash-lite');
  });
  it('nothing is sent just to find out: untimed, the expected-fastest (lite) goes first; real requests time it', async () => {
    const g = fakeGemini({ 'gemini-3.1-flash-lite': 900, 'gemini-2.5-flash': 200, 'gemini-3.5-flash': 300 });
    expect(await autoModels('K', g.f)).toEqual(['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash']);
    expect(g.calls).toEqual([]); // no generate request so far
    expect(readAuto()?.order.every((x) => x.ms === 0)).toBe(true);
  });
});
