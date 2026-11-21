import { test, expect, devices, type Page } from '@playwright/test';
import { section } from './settings-tab';

// decisions.md 86: Live follows Settings → voice (language, spoken punctuation, Bangla digits); the floating
// recorder's pill and red button sit on one line; "ভাসমান রেকর্ডার" moves the controls out of the strip.
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

const fakeLive = async (page: Page, words: string[]) => {
  const seen = { lang: [] as string[] };
  await page.routeWebSocket(/generativelanguage\.googleapis\.com\/ws\//, (ws) => {
    ws.onMessage((m) => {
      const msg = JSON.parse(String(m));
      if (!msg.setup) return;
      seen.lang.push(msg.setup.inputAudioTranscription?.languageCodes?.[0]);
      ws.send(JSON.stringify({ setupComplete: {} }));
      words.forEach((w, i) => setTimeout(() => ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: w } } })), 300 + i * 200));
      setTimeout(() => ws.send(JSON.stringify({ serverContent: { turnComplete: true } })), 400 + words.length * 200);
    });
  });
  await page.route('https://generativelanguage.googleapis.com/**', (r) => r.fulfill({ json: { models: [] } }));
  return seen;
};
const keyIn = async (page: Page) => {
  await section(page, 'voice');
  await page.getByTestId('ai-key-in').fill('AIzaTEST1234');
  await page.getByTestId('ai-key-save').click();
  await page.evaluate(() => localStorage.setItem('pronotes.liveConsent', 'true'));
};

test('Live: spoken punctuation, one mark where Live adds its own, Bangla digits', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await fakeLive(page, ['দাগ নম্বর 500 ', 'আমি বলছি দাঁড়ি। ', 'আবার কমা লিখি দাঁড়ি']);
  await page.goto('./');
  await keyIn(page);
  await page.getByTestId('settings').click();
  await page.getByTestId('editor').click();
  await page.getByTestId('live-mic').click();
  await expect(page.getByTestId('editor')).toContainText('দাগ নম্বর ৫০০ আমি বলছি। আবার, লিখি।');
  await expect(page.getByTestId('editor')).not.toContainText('।।');
  await page.getByTestId('live-stop').click();
});

test('Live listens in the language chosen in Settings, whatever the keyboard is in', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  const seen = await fakeLive(page, ['hello there ']);
  await page.goto('./');
  await keyIn(page);
  await page.getByTestId('vlang').selectOption('en-US');
  await page.getByTestId('settings').click();
  await page.getByTestId('editor').click();
  await page.getByTestId('live-mic').click();
  await expect(page.getByTestId('editor')).toContainText('hello there');
  expect(seen.lang[0]).toBe('en-US');
  await page.getByTestId('live-stop').click();
});

test('the floating controls and the red button share one line, and leave the text free', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await fakeLive(page, ['বাদী ']);
  await page.goto('./');
  await keyIn(page);
  await page.getByTestId('settings').click();
  await page.getByTestId('editor').click();
  await page.getByTestId('live-mic').click();
  const float = page.getByTestId('voice-float');
  await expect(float).toBeVisible();
  const pill = (await float.locator('.voice-pill-wrap').boundingBox())!;
  const dot = (await page.getByTestId('live-mic').boundingBox())!;
  expect(Math.abs(pill.y + pill.height / 2 - (dot.y + dot.height / 2))).toBeLessThan(2);
  expect(pill.x + pill.width).toBeLessThanOrEqual(dot.x);
  // room below the last line, so the controls never sit on the text
  expect(await page.locator('.desk').evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom))).toBeGreaterThanOrEqual(90);
  // plain drawn signs, not emoji
  await expect(float.getByTestId('live-pause').locator('svg')).toHaveCount(1);
  await expect(float.getByTestId('live-stop').locator('svg')).toHaveCount(1);
  await page.getByTestId('live-stop').click();
  await expect(float).toHaveCount(0);
});

test.describe('phone', () => {
  const iphone = devices['iPhone 13'];
  test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('ভাসমান রেকর্ডার: the controls float above the keyboard; the strip keeps a red dot', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await fakeLive(page, ['বাদী ']);
    await page.goto('./');
    await keyIn(page);
    await page.getByTestId('vfloat').check();
    await page.getByTestId('settings').click();
    await page.getByTestId('editor').click();
    if (!(await page.getByTestId('osk').isVisible())) await page.getByTestId('kb-toggle').tap();
    const strip = page.getByTestId('kb-strip');
    await strip.getByTestId('strip-mic').tap();
    await expect(page.getByTestId('voice-float')).toBeVisible();
    await expect(strip.getByTestId('strip-rec-dot')).toBeVisible();
    await expect(strip.getByTestId('live-strip')).toHaveCount(0);
    // above the keyboard, not on it
    const f = (await page.getByTestId('voice-float').boundingBox())!;
    const k = (await page.getByTestId('osk').boundingBox())!;
    expect(f.y + f.height).toBeLessThanOrEqual(k.y + 1);
    await page.getByTestId('voice-float').getByTestId('live-stop').click();
    await expect(page.getByTestId('voice-float')).toHaveCount(0);
    await expect(strip.getByTestId('strip-mic')).toBeVisible();
  });
});
