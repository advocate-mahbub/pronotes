import { test, expect, devices, type Page } from '@playwright/test';

const iphone = devices['iPhone 13'];
test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const key = (p: Page, code: string) => p.locator(`[data-testid=osk] [data-code="${code}"]`);
const press = async (p: Page, code: string) => { await key(p, code).dispatchEvent('pointerdown'); await p.locator('[data-testid=osk]').dispatchEvent('pointerup'); };

test('phone keyboard: iOS-style — numbers and \\ stay, punctuation behind #+=, edge to edge', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('editor').click();
  await page.getByTestId('kb-toggle').tap();
  const osk = page.getByTestId('osk');
  await expect(osk).toBeVisible();

  // the letters' rows no longer carry the punctuation keys; the number row and \ stay
  for (const c of ['Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash']) await expect(key(page, c)).toHaveCount(0);
  for (const c of ['Digit1', 'Digit0', 'Backquote', 'Backslash', '#Sym']) await expect(key(page, c)).toHaveCount(1);
  // #+= sits bottom-left, right after the language key
  const order = await osk.locator('.kb-row').last().locator('[data-code]').evaluateAll((els) => els.map((e) => e.getAttribute('data-code')));
  expect(order.slice(0, 2)).toEqual(['#Mode', '#Sym']);

  // the layer: punctuation keys, the toggle reads অআ (Bangla) and is on
  await press(page, '#Sym');
  for (const c of ['Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash']) await expect(key(page, c)).toHaveCount(1);
  await expect(key(page, '#Sym')).toHaveText('অআ');
  // several marks in a row, then space brings the letters back (as on iOS)
  await press(page, 'Slash');
  await press(page, 'Minus');
  await expect(key(page, 'Slash')).toHaveCount(1);
  await press(page, '#Space');
  await expect(key(page, 'Slash')).toHaveCount(0);
  await expect(page.getByTestId('editor')).toContainText('/-');

  // edge to edge: the page and the keyboard touch both sides of the screen
  const vw = iphone.viewport.width;
  const kb = (await osk.boundingBox())!;
  const pg = (await page.getByTestId('page').boundingBox())!;
  expect(Math.round(kb.x)).toBe(0);
  expect(Math.round(kb.x + kb.width)).toBe(vw);
  expect(Math.round(pg.x)).toBe(0);
  expect(Math.round(pg.x + pg.width)).toBe(vw);
  // the letter keys are wider than before (10 to a row instead of 13)
  const q = (await key(page, 'KeyQ').boundingBox())!;
  expect(q.width).toBeGreaterThan(vw / 12);
});
