import { test, expect, type Page } from '@playwright/test';

const editor = (p: Page) => p.getByTestId('editor');
const TEXT = 'বাদী মোঃ আব্দুল করিম, সাং: চরকান্দি, দাগ নং ১২৩৪।';

async function start(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
  await page.keyboard.insertText(TEXT);
  await page.getByTestId('tab-tools').click();
  await page.getByTestId('ai').click();
  await expect(page.getByTestId('ai-panel')).toBeVisible();
}

test('Claude by copy and paste: private details hidden, put back in the answer', async ({ page }) => {
  let outbound = 0;
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost')) outbound++; });
  await start(page);
  const f = page.getByTestId('ai-findings');
  await expect(f).toContainText('মোঃ আব্দুল করিম');
  await expect(f).toContainText('চরকান্দি');
  await expect(f).toContainText('১২৩৪');
  const sent = page.getByTestId('ai-prompt');
  await expect(sent).toHaveText('বাদী [ব্যক্তি-১], সাং: [ঠিকানা-১], দাগ নং [দাগ-১]।');
  // a word the rules do not catch
  await page.getByTestId('ai-word').fill('সাং');
  await page.getByTestId('ai-word-add').click();
  await expect(sent).toContainText('[গোপন-১]');
  // untick it again
  await f.locator('label', { hasText: 'সাং' }).locator('input').uncheck();
  await expect(sent).not.toContainText('[গোপন-১]');

  await page.getByTestId('ai-copy-claude').click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('দলিল মূলে');
  expect(clip).toContain('[ব্যক্তি-১]');
  expect(clip).not.toContain('করিম');
  expect(clip).not.toContain('চরকান্দি');

  // the answer pasted back (as models often return it: bold, English digits)
  await expect(page.getByTestId('ai-answer')).toBeVisible();
  await page.getByTestId('ai-answer').fill('১। বাদী **[ব্যক্তি-1]**, সাকিন [ঠিকানা-১], নালিশী দাগ নং [দাগ-১]।');
  await expect(page.getByTestId('ai-result')).toHaveText('১। বাদী মোঃ আব্দুল করিম, সাকিন চরকান্দি, নালিশী দাগ নং ১২৩৪।');
  await page.getByTestId('ai-insert-after').click();
  await expect(editor(page)).toContainText('১। বাদী মোঃ আব্দুল করিম, সাকিন চরকান্দি');
  await editor(page).focus();
  await page.keyboard.press('Control+z');
  await expect(editor(page)).toHaveText(TEXT);
  expect(outbound).toBe(0); // nothing left the device
});

test('Gemini: needs a key, asks every time, sends masked text only', async ({ page }) => {
  const bodies: string[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      bodies.push(req.postData() ?? '');
      expect(req.headers()['x-goog-api-key']).toBe('AIzaTEST1234');
      return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: 'বাদী [ব্যক্তি-১] [দাগ-১] দাগের মালিক।' }] } }] } });
    }
    return route.fulfill({ json: { models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] } });
  });
  await start(page);
  await page.getByTestId('ai-gemini-setup').click();
  const d = page.locator('details', { has: page.locator('summary', { hasText: 'AI সহকারী' }) });
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator('summary').click();
  await page.getByTestId('ai-key-in').fill('AIzaTEST1234');
  await page.getByTestId('ai-key-save').click();
  await expect(page.getByTestId('ai-key-set')).toContainText('1234');
  await page.getByTestId('ai-key-test').click();
  await expect(page.getByTestId('ai-key-status')).toContainText('১');
  await page.getByTestId('settings').click();

  await page.getByTestId('ai-gemini').click();
  await expect(page.getByTestId('ai-confirm')).toBeVisible();
  await page.getByTestId('ai-confirm-cancel').click();
  expect(bodies.length).toBe(0); // cancel sends nothing
  await page.getByTestId('ai-gemini').click();
  await page.getByTestId('ai-confirm-ok').click();
  await expect(page.getByTestId('ai-result')).toHaveText('বাদী মোঃ আব্দুল করিম ১২৩৪ দাগের মালিক।');
  expect(bodies.length).toBe(1);
  expect(bodies[0]).not.toContain('করিম');
  expect(bodies[0]).not.toContain('চরকান্দি');
  expect(bodies[0]).toContain('[ব্যক্তি-১]');
  await page.reload();
  await page.getByTestId('settings').click();
  const d2 = page.locator('details', { has: page.locator('summary', { hasText: 'AI সহকারী' }) });
  await d2.locator('summary').click();
  await expect(page.getByTestId('ai-key-set')).toBeVisible(); // remembered on this device
});
