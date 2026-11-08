import { describe, it, expect, vi } from 'vitest';
import { findPrivate, mask, unmask, buildPrompt, cleanAnswer, geminiGenerate, geminiModels, AiError } from '../../src/ai';

const PLAINT = 'বাদী মোঃ আব্দুল করিম, পিতা: মৃত রহিম উদ্দিন, সাং: চরকান্দি, থানা: সাভার। ' +
  'নালিশী সম্পত্তি দাগ নং ১২৩৪ এবং খতিয়ান নং ৫৬৭, যা ২৩৪৫/২০১০ নং দলিল মূলে খরিদ করেন। দলিল নং ২৩৪৫/২০১০। ' +
  'মোবাইল ০১৭১১২২৩৩৪৪, NID: 1234567890, ইমেইল karim@example.com। মোঃ আব্দুল করিম গং বনাম আলী।';

describe('finding private details', () => {
  const f = findPrivate(PLAINT);
  const val = (k: string) => f.filter((x) => x.kind === k).map((x) => x.value);
  it('names after titles and relation words, stopping at the right word', () => {
    expect(val('person')).toContain('মোঃ আব্দুল করিম');
    expect(val('person')).toContain('রহিম উদ্দিন');
    expect(val('person').some((v) => v.includes('গং'))).toBe(false);
  });
  it('village, plot, khatian, deed, phone, NID, e-mail', () => {
    expect(val('place')).toEqual(['চরকান্দি']);
    expect(val('plot')).toEqual(['১২৩৪']);
    expect(val('khatian')).toEqual(['৫৬৭']);
    expect(val('deed')).toEqual(['২৩৪৫/২০১০']);
    expect(val('phone')).toEqual(['০১৭১১২২৩৩৪৪']);
    expect(val('id')).toEqual(['1234567890']);
    expect(val('email')).toEqual(['karim@example.com']);
  });
  it('number before the word: ১২৩৪ নং দাগ, ৫৬৭ নং খতিয়ান, ২৩৪৫/২০১০ নং দলিল', () => {
    const g = findPrivate('১২৩৪ নং দাগে ৫৬৭ নং খতিয়ানের জমি ২৩৪৫/২০১০ নং দলিল মূলে, ১২/২০২৪ নং দেওয়ানি মোকদ্দমা');
    const v = (k: string) => g.filter((x) => x.kind === k).map((x) => x.value);
    expect(v('plot')).toEqual(['১২৩৪']);
    expect(v('khatian')).toEqual(['৫৬৭']);
    expect(v('deed')).toEqual(['২৩৪৫/২০১০']);
    expect(v('case')).toEqual(['১২/২০২৪']);
  });
  it('"মৃত" stays outside the hidden name', () => {
    expect(mask('পিতা: মৃত রহিম উদ্দিন', findPrivate('পিতা: মৃত রহিম উদ্দিন')).text).toBe('পিতা: মৃত [ব্যক্তি-১]');
  });
  it('words the user adds are hidden too', () => {
    expect(findPrivate('আলী সাহেব এলেন', ['আলী'])[0]).toEqual({ kind: 'custom', value: 'আলী', on: true });
  });
});

describe('mask and unmask', () => {
  it('round trip: nothing private left, everything back', () => {
    const m = mask(PLAINT, findPrivate(PLAINT, ['আলী']));
    for (const v of ['করিম', 'রহিম', 'চরকান্দি', '১২৩৪', '০১৭১১২২৩৩৪৪', 'karim@', 'আলী']) expect(m.text).not.toContain(v);
    expect(m.text).toContain('[ব্যক্তি-১]');
    // the same name gets the same placeholder both times
    expect(m.text.match(/\[ব্যক্তি-১\]/g)!.length).toBe(2);
    expect(unmask(m.text, m.map)).toEqual({ text: PLAINT, missing: [] });
  });
  it('unticked findings stay as they are', () => {
    const f = findPrivate(PLAINT).map((x) => (x.kind === 'plot' ? { ...x, on: false } : x));
    expect(mask(PLAINT, f).text).toContain('দাগ নং ১২৩৪');
  });
  it('tolerates what models do to placeholders', () => {
    const map = { '[ব্যক্তি-১]': 'করিম', '[দাগ-২]': '১২৩৪' };
    expect(unmask('**[ব্যক্তি-1]** ও ( দাগ - ২ ) এবং [ব্যক্তি – ১]', map).text).toBe('করিম ও ১২৩৪ এবং করিম');
    expect(unmask('কিছু নেই', map).missing).toEqual(['[ব্যক্তি-১]', '[দাগ-২]']);
  });
});

describe('prompt', () => {
  it('carries the drafting rules and the text', () => {
    const p = buildPrompt('polish', 'লেখা [ব্যক্তি-১]');
    expect(p).toContain('দলিল মূলে');
    expect(p).toContain('দলিল দ্বারা');
    expect(p).toContain('হুবহু রাখবেন');
    expect(p).toContain('লেখা [ব্যক্তি-১]');
    expect(buildPrompt('custom', 'x', 'তারিখগুলো এক রকম করুন')).toContain('তারিখগুলো এক রকম করুন');
  });
  it('answer cleaned of fences and bold', () => {
    expect(cleanAnswer('```\n**১।** লেখা\n```')).toBe('১। লেখা');
  });
});

describe('Gemini', () => {
  const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  it('sends the key in a header (not the URL) and returns the text', async () => {
    const f = ok({ candidates: [{ content: { parts: [{ text: 'উত্তর' }] } }] });
    expect(await geminiGenerate('প্রশ্ন', { key: 'K', model: 'm-1', fetchImpl: f as never })).toBe('উত্তর');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/m-1:generateContent');
    expect(url).not.toContain('K');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('K');
    expect(JSON.parse(init.body as string).contents[0].parts[0].text).toBe('প্রশ্ন');
  });
  it('errors: bad key, quota, blocked, network', async () => {
    await expect(geminiGenerate('x', { key: 'K', fetchImpl: ok({ error: { message: 'API key not valid' } }, 400) as never })).rejects.toMatchObject({ code: 'key' });
    await expect(geminiGenerate('x', { key: 'K', fetchImpl: ok({}, 429) as never })).rejects.toMatchObject({ code: 'quota' });
    await expect(geminiGenerate('x', { key: 'K', fetchImpl: ok({ promptFeedback: { blockReason: 'SAFETY' } }) as never })).rejects.toBeInstanceOf(AiError);
    await expect(geminiGenerate('x', { key: 'K', fetchImpl: (async () => { throw new TypeError('offline'); }) as never })).rejects.toMatchObject({ code: 'network' });
  });
  it('model list keeps text models only', async () => {
    const f = ok({ models: [
      { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-x-image', supportedGenerationMethods: ['generateContent'] },
    ] });
    expect(await geminiModels('K', f as never)).toEqual(['gemini-flash-latest']);
  });
});

describe('Gemini: model not available', () => {
  it('ranks flash first, stable before preview, newest first', async () => {
    const { rankModels } = await import('../../src/ai/gemini');
    expect(rankModels(['gemini-2.5-pro', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3.8-flash', 'gemini-flash-latest'])).toEqual([
      'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-pro',
    ]);
  });
  it('falls back to a model the key can use, tells the app, and shows Google’s reason when nothing works', async () => {
    const { geminiGenerate, aiErrorMessage, AiError } = await import('../../src/ai/gemini');
    const calls: string[] = [];
    const ok = (async (url: string) => {
      calls.push(url);
      if (url.includes('/models?')) return new Response(JSON.stringify({ models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] }), { status: 200 });
      if (url.includes('gemini-old')) return new Response(JSON.stringify({ error: { message: 'models/gemini-old is not found for API version v1beta' } }), { status: 404 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'উত্তর' }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    let changed = '';
    expect(await geminiGenerate('প্রশ্ন', { key: 'K', model: 'gemini-old', fetchImpl: ok, onModelChange: (m) => { changed = m; } })).toBe('উত্তর');
    expect(changed).toBe('gemini-3.8-flash');
    const bad = (async () => new Response(JSON.stringify({ error: { message: 'Request contains an invalid argument.' } }), { status: 400 })) as unknown as typeof fetch;
    const e = await geminiGenerate('প্রশ্ন', { key: 'K', fetchImpl: bad }).catch((x) => x);
    expect(e).toBeInstanceOf(AiError);
    expect(aiErrorMessage(e).detail).toContain('400: Request contains an invalid argument.');
  });
});

describe('Gemini: overloaded', () => {
  it('retries once after a 503', async () => {
    const { geminiGenerate } = await import('../../src/ai/gemini');
    let n = 0;
    const f = (async () => (++n === 1
      ? new Response(JSON.stringify({ error: { message: 'The model is overloaded. Please try again later.' } }), { status: 503 })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ঠিক আছে' }] } }] }), { status: 200 }))) as unknown as typeof fetch;
    expect(await geminiGenerate('প্রশ্ন', { key: 'K', fetchImpl: f, retryDelayMs: 0 })).toBe('ঠিক আছে');
    expect(n).toBe(2);
  });
});
