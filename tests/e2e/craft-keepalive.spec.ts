import { expect, test, type Page } from '@playwright/test';

// a stand-in WordCraft: same address, answers "ready" and counts how often it was started
async function fakeWordCraft(page: Page) {
  let starts = 0;
  await page.route('**/apps/wordcraft/**', async (route) => {
    if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, contentType: 'text/html', body: '' });
    if (!route.request().url().includes('index.html')) return route.fulfill({ status: 404, body: '' });
    starts++;
    await route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><body>fake
      <script>window.wordcraft = { execute: async (c) => (c === 'font.list' ? { fonts: [] } : { ok: true }) };
      parent.postMessage({ type: 'wordcraft:ready' }, location.origin);</script>` });
  });
  return () => starts;
}

test('▦ away and back keeps the running app (no reload), and the header steps aside', async ({ page }) => {
  const starts = await fakeWordCraft(page);
  await page.goto('./');
  await page.getByTestId('craft-toggle').click();
  await page.getByTestId('craft-app-wordcraft').click();
  await expect(page.getByTestId('craft-frame')).toBeVisible();
  await expect.poll(starts).toBe(1);
  await expect(page.locator('header.top')).toBeHidden(); // only the thin bar is left
  await expect(page.getByTestId('craft-drafts')).toBeVisible();

  // mark the running app, go back to the drafts, then return through ▦
  await page.frameLocator('[data-testid="craft-frame"]').locator('body').evaluate(() => { (window as unknown as { __mark: number }).__mark = 42; });
  await page.getByTestId('craft-drafts').click();
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.locator('header.top')).toBeVisible();
  await page.getByTestId('craft-toggle').click();
  await expect(page.getByTestId('craft-frame')).toBeVisible();
  expect(await page.frameLocator('[data-testid="craft-frame"]').locator('body').evaluate(() => (window as unknown as { __mark?: number }).__mark)).toBe(42);

  // ← অ্যাপস shows the list without closing it; "ফিরে যান" brings it back as it was
  await page.getByTestId('craft-back').click();
  await expect(page.getByTestId('craft-running')).toContainText('WordCraft');
  await page.getByTestId('craft-resume').click();
  expect(await page.frameLocator('[data-testid="craft-frame"]').locator('body').evaluate(() => (window as unknown as { __mark?: number }).__mark)).toBe(42);
  expect(starts()).toBe(1);

  // "বন্ধ করুন" really closes it
  await page.getByTestId('craft-back').click();
  await page.getByTestId('craft-stop').click();
  await expect(page.getByTestId('craft-running')).toHaveCount(0);
  await expect(page.getByTestId('craft-frame')).toHaveCount(0);
});
