import { test, expect, devices } from '@playwright/test';
import { section } from './settings-tab';

// Live voice: a stand-in for Google's Live API checks what ProNotes sends (setup, then 16 kHz PCM audio)
// and answers with transcription pieces; the words show in the strip and go into the document.
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

test('🎙 Live with a Gemini key: setup, audio, words into the page; pause and stop', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  const seen = { setup: null as null | Record<string, unknown>, audio: 0, mime: '', ends: 0, urls: [] as string[] };
  await page.routeWebSocket(/generativelanguage\.googleapis\.com\/ws\//, (ws) => {
    seen.urls.push(ws.url());
    ws.onMessage((m) => {
      const msg = JSON.parse(String(m));
      if (msg.setup) {
        seen.setup = msg.setup;
        ws.send(JSON.stringify({ setupComplete: {} }));
        // words come back while the user speaks
        setTimeout(() => ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'বাদী পক্ষের ' } } })), 300);
        setTimeout(() => ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'জবানবন্দি।' } } })), 600);
        setTimeout(() => ws.send(JSON.stringify({ serverContent: { turnComplete: true } })), 900);
      }
      if (msg.realtimeInput?.audio) { seen.audio++; seen.mime = msg.realtimeInput.audio.mimeType; }
      if (msg.realtimeInput?.audioStreamEnd) seen.ends++;
    });
  });
  await page.route('https://generativelanguage.googleapis.com/**', (r) => r.fulfill({ json: { models: [] } }));
  await page.goto('./');
  await section(page, 'voice');
  await page.getByTestId('ai-key-in').fill('AIzaTEST1234');
  await page.getByTestId('ai-key-save').click();
  await page.getByTestId('settings').click();
  await page.getByTestId('editor').click();

  await page.getByTestId('live-mic').click();
  await expect(page.getByTestId('live-consent')).toBeVisible();
  await page.getByTestId('live-ok').click();
  await expect(page.getByTestId('live-strip')).toHaveClass(/live/);
  await expect(page.getByTestId('editor')).toContainText('বাদী পক্ষের জবানবন্দি।');
  expect(seen.urls[0]).toContain('key=AIzaTEST1234');
  expect(seen.setup).toMatchObject({ model: 'models/gemini-3.1-flash-live-preview', inputAudioTranscription: { languageCodes: ['bn-BD'] } });
  await expect.poll(() => seen.audio).toBeGreaterThan(2);
  expect(seen.mime).toBe('audio/pcm;rate=16000');

  // pause: the stream is ended (last words flushed), the strip says paused; ▶ opens a new session
  await page.getByTestId('live-pause').click();
  await expect(page.getByTestId('live-strip')).toHaveClass(/paused/);
  expect(seen.ends).toBe(1);
  await page.getByTestId('live-resume').click();
  await expect(page.getByTestId('live-strip')).toHaveClass(/live/);
  await expect.poll(() => seen.urls.length).toBe(2);
  await page.getByTestId('live-stop').click();
  await expect(page.getByTestId('live-strip')).toHaveCount(0);
});

test('a dropped connection pauses Live; what was written stays', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await page.routeWebSocket(/generativelanguage\.googleapis\.com\/ws\//, (ws) => {
    ws.onMessage((m) => {
      if (JSON.parse(String(m)).setup) {
        ws.send(JSON.stringify({ setupComplete: {} }));
        setTimeout(() => ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'প্রথম অংশ' } } })), 200);
        setTimeout(() => ws.close({ code: 1006, reason: 'network' }), 500);
      }
    });
  });
  await page.route('https://generativelanguage.googleapis.com/**', (r) => r.fulfill({ json: { models: [] } }));
  await page.goto('./');
  await page.evaluate(() => { localStorage.setItem('pronotes.liveConsent', 'true'); });
  await section(page, 'voice');
  await page.getByTestId('ai-key-in').fill('AIzaTEST1234');
  await page.getByTestId('ai-key-save').click();
  await page.getByTestId('settings').click();
  await page.getByTestId('editor').click();
  await page.getByTestId('live-mic').click();
  await expect(page.getByTestId('live-strip')).toHaveClass(/cut/);
  await expect(page.getByTestId('editor')).toContainText('প্রথম অংশ');
  await expect(page.getByTestId('live-resume')).toBeVisible();
});

test.describe('phone', () => {
  const iphone = devices['iPhone 13'];
  test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('the 🎙 key sits in the strip under the keys when Live can work', async ({ page }) => {
    await page.route('https://generativelanguage.googleapis.com/**', (r) => r.fulfill({ json: { models: [] } }));
    await page.goto('./');
    await page.getByTestId('editor').click();
    await page.getByTestId('kb-toggle').tap();
    const last = page.getByTestId('kb-strip'); // 🎙 lives in the strip under the keys, where iOS has it
    // an iPhone without a key: Safari's own recognition has no Bangla, so no Live key
    await expect(last.locator('[data-code="#Live"]')).toHaveCount(0);
    await section(page, 'voice');
    await page.getByTestId('ai-key-in').fill('AIzaTEST1234');
    await page.getByTestId('ai-key-save').click();
    await page.getByTestId('settings').click();
    await expect(last.locator('[data-code="#Live"]')).toHaveCount(1);
  });
});
