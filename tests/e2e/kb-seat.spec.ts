import { test, expect, devices } from '@playwright/test';

// decisions.md 84: on the phone the keyboard (and the put-down strip) sit on the screen's bottom edge — the
// home-bar room is taken once, by them, not again by the app around them
const iphone = devices['iPhone 13'];
test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

test('keyboard up and put down: nothing between it and the bottom edge', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('editor').click();
  if (!(await page.getByTestId('osk').isVisible())) await page.getByTestId('kb-toggle').tap();
  const osk = page.getByTestId('osk');
  await expect(osk).toBeVisible();
  const h = page.viewportSize()!.height;
  expect(await page.locator('.app').evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('0px');
  await expect.poll(async () => Math.round((await osk.boundingBox())!.y + (await osk.boundingBox())!.height)).toBe(h);
  // put down: the strip at the bottom edge, the page right above it
  await page.getByTestId('kb-hide').tap();
  const strip = page.getByTestId('kb-strip-down');
  await expect(strip).toBeVisible();
  const s = (await strip.boundingBox())!;
  expect(Math.round(s.y + s.height)).toBe(h);
  expect(await page.locator('.app').evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('0px');
  const desk = (await page.locator('.desk').first().boundingBox())!;
  expect(Math.round(desk.y + desk.height)).toBeGreaterThanOrEqual(Math.round(s.y)); // no band between page and strip
});
