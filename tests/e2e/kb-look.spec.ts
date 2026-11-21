import { test, expect, type Page } from '@playwright/test';
import { section } from './settings-tab';

// decisions.md 88: the Keyboard tab, keys' English font, keyboard height (no grip), keyboard colours, app colours
const openKb = async (page: Page) => {
  if (await page.getByTestId('stab-type').isVisible()) await page.getByTestId('settings').click();
  if (await page.getByTestId('osk').isVisible()) return;
  await page.getByTestId('editor').click({ position: { x: 10, y: 10 } });
  if (!(await page.getByTestId('osk').isVisible())) await page.getByTestId('kb-toggle').click();
  await expect(page.getByTestId('osk')).toBeVisible();
};
const keyA = (page: Page) => page.locator('[data-testid=osk] [data-code="KeyA"]').first();

test('the tab is "কিবোর্ড"; the keyboard has no grip; its height comes from Settings', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('settings').click();
  await expect(page.getByTestId('stab-type')).toHaveText('কিবোর্ড');
  await page.getByTestId('settings').click();
  await openKb(page);
  await expect(page.getByTestId('kb-grip')).toHaveCount(0);
  const h0 = (await keyA(page).boundingBox())!.height;
  await section(page, 'type');
  await page.getByTestId('kb-height').fill('130');
  await page.getByTestId('kb-height').blur();
  await openKb(page);
  const h1 = (await keyA(page).boundingBox())!.height;
  expect(h1 / h0).toBeGreaterThan(1.25);
});

test('keyboard colours: a preset, and own colours with a warning when letters are hard to read', async ({ page }) => {
  await page.goto('./');
  await section(page, 'type');
  await page.getByTestId('kb-theme').selectOption('black');
  await expect(page.getByTestId('kb-preview')).toBeVisible();
  await openKb(page);
  expect(await keyA(page).evaluate((el) => getComputedStyle(el).getPropertyValue('--key').trim())).toBe('#1c1c1e');
  await section(page, 'type');
  await page.getByTestId('kb-theme').selectOption('custom');
  await expect(page.getByTestId('kb-contrast-warn')).toHaveCount(0);
  await page.getByTestId('kb-c-fg').fill('#14213a');
  await expect(page.getByTestId('kb-contrast-warn')).toBeVisible();
  // kept, and in what a backup carries
  await page.reload();
  await section(page, 'type');
  await expect(page.getByTestId('kb-theme')).toHaveValue('custom');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pronotes.kbLook') || '{}').custom.fg)).toBe('#14213a');
});

test('the keys\' English font and size get a face of their own', async ({ page }) => {
  await page.goto('./');
  await section(page, 'type');
  await expect(page.getByTestId('kb-font-en')).toBeVisible();
  await page.getByTestId('kb-font-en-size').fill('120');
  await page.getByTestId('kb-font-en-size').blur();
  await expect.poll(() => page.evaluate(() => document.getElementById('pn-app-font')?.textContent ?? '')).toMatch(/"PN KB"[^}]*U\+0000-024F[^}]*size-adjust: 120%/);
});

test('app colours: the chosen set, light and dark by ◐', async ({ page }) => {
  await page.goto('./');
  await section(page, 'app');
  await page.getByTestId('app-palette').selectOption('blue');
  const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  await page.getByTestId('settings').click();
  // ◐ to light, then dark
  while ((await page.getByTestId('theme').getAttribute('data-theme-mode')) !== 'light') await page.getByTestId('theme').click();
  await expect.poll(bg).toBe('#eef4fb');
  await page.getByTestId('theme').click();
  await expect(page.getByTestId('theme')).toHaveAttribute('data-theme-mode', 'dark');
  await expect.poll(bg).toBe('#07162b');
  await page.reload();
  await expect.poll(bg).toBe('#07162b');
});
