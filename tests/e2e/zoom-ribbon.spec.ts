import { test, expect, type Page } from '@playwright/test';

const editor = (p: Page) => p.getByTestId('editor');

test('a pinch (Ctrl + wheel) zooms the page only; the buttons keep their size', async ({ page }) => {
  await page.goto('./');
  await editor(page).click();
  await page.getByTestId('pstyle').selectOption('numbered'); // a legal draft: paper view
  await page.getByTestId('tab-view').click();
  await page.getByTestId('zoom').selectOption('100');
  const ribbonBefore = await page.locator('.ribbon').boundingBox();
  const pageBefore = await page.locator('.page').first().boundingBox();
  const box = (await page.locator('.desk').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -60);
  await page.keyboard.up('Control');
  await expect.poll(async () => Number(await page.getByTestId('zoom').inputValue())).toBeGreaterThan(100);
  const pageAfter = await page.locator('.page').first().boundingBox();
  expect(pageAfter!.width).toBeGreaterThan(pageBefore!.width * 1.2);
  const ribbonAfter = await page.locator('.ribbon').boundingBox();
  expect(Math.round(ribbonAfter!.height)).toBe(Math.round(ribbonBefore!.height));
  expect(await page.evaluate(() => (window.visualViewport?.scale ?? 1))).toBe(1);
});

test('a pinch on a note makes its text bigger, and it is kept', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('new-doc').click();
  await page.getByTestId('new-note').click();
  await expect(page.locator('.page.note')).toBeVisible();
  await editor(page).click();
  await page.keyboard.insertText('নোট');
  const size = () => editor(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = await size();
  const box = (await page.locator('.desk').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -60);
  await page.keyboard.up('Control');
  await expect.poll(size).toBeGreaterThan(before * 1.2);
  // kept once the fingers lift (a moment after the last wheel step)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pronotes.view') || '{}').textZoom ?? 100)).toBeGreaterThan(120);
  await page.reload();
  await expect.poll(size).toBeGreaterThan(before * 1.2);
});

test('a long draft scrolls inside the page; the header and the ribbon never scroll away', async ({ page }) => {
  await page.goto('./');
  await editor(page).click();
  for (let i = 0; i < 60; i++) await page.keyboard.press('Enter');
  await page.keyboard.insertText('শেষ');
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.mouse.wheel(0, 2000);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const top = await page.locator('header.top').boundingBox();
  const ribbon = await page.locator('.ribbon').boundingBox();
  expect(top!.y).toBeGreaterThanOrEqual(0);
  expect(top!.y).toBeLessThan(40);
  expect(ribbon!.y).toBeLessThan(160);
  await expect(page.getByTestId('tab-home')).toBeInViewport();
});
