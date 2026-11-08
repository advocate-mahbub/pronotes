import { test, expect, devices } from '@playwright/test';

const ipad = devices['iPad Pro 11 landscape'];
test.use({ viewport: ipad.viewport, userAgent: ipad.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

test('iPad works like the phone: device keyboard types Bornona, ⌨ for the on-screen keyboard, one language key', async ({ page }) => {
  await page.goto('./');
  const ed = page.getByTestId('editor');
  await ed.tap();
  await expect(page.getByTestId('osk')).toHaveCount(0);
  await expect(ed).toHaveAttribute('inputmode', 'text');
  await page.keyboard.insertText('ami');
  await expect(ed).toHaveText(/^\S+$/);
  expect(await ed.textContent()).not.toContain('a');
  await expect(page.getByTestId('lang-toggle')).toHaveText('বা');
  await expect(page.locator('header [data-testid="kind"]')).toHaveCount(0);
  await page.getByTestId('kb-toggle').tap();
  await expect(page.getByTestId('osk')).toBeVisible();
  await expect(ed).toHaveAttribute('inputmode', 'none');
});
