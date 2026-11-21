import { test, expect, devices } from '@playwright/test';

const iphone = devices['iPhone 13'];
test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

test('iPhone: ⌨ is in view without swiping the tab row, and turns the ProNotes keyboard on', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('side-toggle').tap();
  await page.getByTestId('new-doc').tap();
  await page.getByTestId('new-note').tap();
  const kb = page.getByTestId('kb-toggle');
  await expect(kb).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('ribbon-collapse')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('tab-home')).toBeInViewport({ ratio: 1 });
  // still there after the tab row is scrolled to its end
  await page.locator('.ribbon-tabs').evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await expect(kb).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('osk')).toHaveCount(0);
  await kb.tap();
  await expect(page.getByTestId('osk')).toBeVisible();
});

for (const [w, h] of [[375, 548], [375, 635], [390, 664]]) {
  test(`iPhone ${w}×${h}: the whole ProNotes keyboard is on screen and the note keeps room to write`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('./');
    await page.getByTestId('side-toggle').tap();
    await page.getByTestId('new-doc').tap();
    await page.getByTestId('new-note').tap();
    await page.getByTestId('kb-toggle').tap();
    const osk = page.getByTestId('osk');
    await expect(osk).toBeVisible();
    await expect.poll(async () => Math.round((await osk.boundingBox())!.y + (await osk.boundingBox())!.height)).toBeLessThanOrEqual(h);
    expect((await page.locator('.desk').boundingBox())!.height).toBeGreaterThanOrEqual(120);
    // a long note scrolls inside the page
    await page.getByTestId('editor').tap();
    await page.keyboard.insertText(Array.from({ length: 40 }, (_, i) => 'লাইন ' + i).join('\n'));
    const desk = page.locator('.desk');
    expect(await desk.evaluate((e) => e.scrollHeight > e.clientHeight && getComputedStyle(e).overflowY === 'auto')).toBe(true);
    await desk.evaluate((e) => { e.scrollTop = 0; });
    await expect.poll(() => desk.evaluate((e) => e.scrollTop)).toBe(0);
  });
}
