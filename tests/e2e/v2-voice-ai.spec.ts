import { test, expect, devices } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

test('✦ AI voice: consent once, records, sends WAV to Gemini, types the Bangla text', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  const bodies: string[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    if (route.request().method() === 'POST') {
      bodies.push(route.request().postData() ?? '');
      return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: 'বাদী নালিশী জমি দলিল মূলে খরিদ করেন।' }] } }] } });
    }
    return route.fulfill({ json: { models: [] } });
  });
  await page.goto('./');
  await page.getByTestId('editor').click();
  // one microphone key: without a Gemini key it is the device's voice
  await expect(page.getByTestId('mic')).toBeVisible();
  await expect(page.getByTestId('ai-voice')).toHaveCount(0);
  await page.getByTestId('settings').click();
  const d = page.locator('details', { has: page.locator('summary', { hasText: 'AI সহকারী' }) });
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator(':scope > summary').click();
  await page.getByTestId('ai-key-in').fill('AIzaTEST1234');
  await page.getByTestId('ai-key-save').click();
  await page.getByTestId('settings').click();
  await page.getByTestId('editor').click();
  // with a key, the same place holds the AI voice key
  await expect(page.getByTestId('mic')).toHaveCount(0);

  await page.getByTestId('ai-voice').click();
  await expect(page.getByTestId('ai-voice-consent')).toBeVisible();
  await page.getByTestId('ai-voice-ok').click();
  await expect(page.getByTestId('ai-voice-bar')).toBeVisible();
  await page.waitForTimeout(1600);
  await page.getByTestId('ai-voice').click();
  await expect(page.getByTestId('editor')).toContainText('বাদী নালিশী জমি দলিল মূলে খরিদ করেন।');
  expect(bodies.length).toBe(1);
  const body = JSON.parse(bodies[0]);
  expect(body.contents[0].parts[1].inline_data.mime_type).toBe('audio/wav');
  expect(body.contents[0].parts[1].inline_data.data.length).toBeGreaterThan(20000);
  // second time: no consent question
  await page.getByTestId('ai-voice').click();
  await expect(page.getByTestId('ai-voice-consent')).toHaveCount(0);
  await page.getByTestId('ai-voice').click();
});

test.describe('phone: the phone’s own keyboard types through the Bornona layout', () => {
  const iphone = devices['iPhone 13'];
  test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('tap opens the device keyboard (no on-screen keyboard); letters and composed words become Bangla', async ({ page }) => {
    await page.goto('./');
    const ed = page.getByTestId('editor');
    await ed.tap();
    await expect(page.getByTestId('osk')).toHaveCount(0);
    await expect(ed).toHaveAttribute('inputmode', 'text');
    // a touch keyboard that sends text without key codes
    await page.keyboard.insertText('k');
    await expect(ed).toHaveText('ক');
    // Android-style composition (Gboard with suggestions): the composed Latin word is converted when it ends
    const cdp = await page.context().newCDPSession(page);
    await page.keyboard.insertText(' ');
    await cdp.send('Input.imeSetComposition', { text: 'kl', selectionStart: 2, selectionEnd: 2 });
    await cdp.send('Input.insertText', { text: 'kl' });
    await expect(ed).toHaveText('ক কল');
    // a whole word at once (iPhone QuickType suggestion / autocorrect)
    await page.keyboard.insertText(' kl');
    await expect(ed).toHaveText('ক কল কল');
  });
});
