import { describe, it, expect } from 'vitest';
import { encodeWav, cleanTranscript, transcribe, toBase64, TRANSCRIBE_PROMPT, VOICE_RATE } from '../../src/ai';

describe('AI voice typing', () => {
  it('writes a 16 kHz mono 16-bit WAV header', () => {
    const w = encodeWav(new Float32Array([0, 1, -1, 0.5]));
    const v = new DataView(w.buffer);
    expect(String.fromCharCode(...w.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...w.subarray(8, 12))).toBe('WAVE');
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(VOICE_RATE);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
  });
  it('base64 of large buffers', () => {
    const b = new Uint8Array(100000).map((_, i) => i % 256);
    expect(Buffer.from(toBase64(b), 'base64').equals(Buffer.from(b))).toBe(true);
  });
  it('cleans the answer: fences, wrapping quotes, canonical য়', () => {
    expect(cleanTranscript('```\nআমার জমি\n```')).toBe('আমার জমি');
    expect(cleanTranscript('“বাদী পক্ষ”')).toBe('বাদী পক্ষ');
    expect(cleanTranscript('\u09A8\u09AF\u09BC')).toBe('\u09A8\u09DF');
  });
  it('sends the audio as WAV with the transcription prompt, and skips silence', async () => {
    const sent: { url: string; body: { contents: { parts: Record<string, unknown>[] }[]; generationConfig: { temperature: number } }; headers: Record<string, string> }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'নালিশী জমি দলিল মূলে খরিদ।' }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const tone = Float32Array.from({ length: VOICE_RATE }, (_, i) => 0.3 * Math.sin(i / 5));
    expect(await transcribe(tone, { key: 'K', model: 'gemini-flash-latest', fetchImpl })).toBe('নালিশী জমি দলিল মূলে খরিদ।');
    const parts = sent[0].body.contents[0].parts;
    expect(parts[0]).toEqual({ text: TRANSCRIBE_PROMPT });
    expect((parts[1].inline_data as { mime_type: string }).mime_type).toBe('audio/wav');
    expect(sent[0].body.generationConfig.temperature).toBe(0);
    expect(sent[0].headers['x-goog-api-key']).toBe('K');
    expect(sent[0].url).not.toContain('K&'); // key not in the URL
    expect(await transcribe(new Float32Array(VOICE_RATE), { key: 'K', fetchImpl })).toBe('');
    expect(sent.length).toBe(1);
  });
});
