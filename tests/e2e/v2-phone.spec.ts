import { test, expect, devices } from '@playwright/test';

const iphone = devices['iPhone 13'];
test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

test('phone: reflowing page, short language toggle, keyboard down and up, layout in the ☰ list', async ({ page }) => {
  await page.goto('./');
  const ed = page.getByTestId('editor');
  await ed.click();
  // the page follows the screen, text at real size (no tiny paper view), no sideways scroll
  const [pageW, vw, font] = await page.evaluate(() => [document.querySelector('[data-testid="page"]')!.getBoundingClientRect().width, innerWidth, parseFloat(getComputedStyle(document.querySelector('.page-body')!).fontSize)]);
  expect(pageW).toBeLessThanOrEqual(vw);
  expect(font).toBeGreaterThanOrEqual(18);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw);
  await expect(page.getByTestId('page')).toHaveClass(/phone/);

  // one language key, same on every screen: "বা" or "e"
  await expect(page.getByTestId('lang-toggle')).toHaveText('বা');
  await page.getByTestId('lang-toggle').tap();
  await expect(page.getByTestId('lang-toggle')).toHaveText('e');
  await page.getByTestId('lang-toggle').tap();
  await expect(page.getByTestId('lang-toggle')).toHaveAttribute('data-lang', 'bn');

  // phones start with their own keyboard; ⌨ switches to the Bornona on-screen keyboard
  await expect(page.getByTestId('osk')).toHaveCount(0);
  await page.getByTestId('kb-toggle').tap();
  await expect(page.getByTestId('osk')).toBeVisible();
  await page.getByTestId('kb-hide').tap();
  await expect(page.getByTestId('osk')).toHaveCount(0);
  await expect(page.getByTestId('voice-bar')).toHaveCount(0); // the tap did not fall through to the mic
  await page.getByTestId('kb-show').tap();
  await expect(page.getByTestId('osk')).toBeVisible();
  // tapping the page also brings it back
  await page.getByTestId('kb-hide').tap();
  await ed.tap();
  await expect(page.getByTestId('osk')).toBeVisible();

  await expect(page.locator('header [data-testid="layout"]')).toHaveCount(0);
  await page.getByTestId('side-toggle').tap();
  await expect(page.getByTestId('sidebar').getByTestId('layout')).toBeVisible();
});
