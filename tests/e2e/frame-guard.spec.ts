import { test, expect } from '@playwright/test';

// decisions.md 93: ProNotes stays blank inside another page's frame (GitHub Pages cannot send X-Frame-Options)
test('inside a frame the app does not start', async ({ page, baseURL }) => {
  await page.goto('./');
  await expect(page.getByTestId('editor')).toBeVisible();
  await page.setContent(`<iframe src="${baseURL}" style="width:800px;height:600px"></iframe>`);
  const f = page.frameLocator('iframe');
  await page.waitForTimeout(1500);
  await expect(f.locator('#root')).toBeEmpty();
});
