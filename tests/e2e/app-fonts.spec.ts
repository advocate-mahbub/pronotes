import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { section } from './settings-tab';

// decisions.md 80: Kalpurush ships with the app; the app's Bangla and English fonts are chosen apart; any font file
const editor = (p: Page) => p.getByTestId('editor');
const dejavu = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
const dejavuB = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf';
const pnUi = (p: Page) => p.evaluate(async () => (await document.fonts.load('20px "PN UI"', 'অ')).length);

/** A real .ttc made from two .ttf files (tables at absolute offsets, as in real collections). */
function makeTtc(files: Buffer[]): Buffer {
  const head = 12 + 4 * files.length;
  const parts: Buffer[] = [];
  let at = head;
  const offs: number[] = [];
  for (const f of files) {
    const c = Buffer.from(f);
    const n = c.readUInt16BE(4);
    for (let k = 0; k < n; k++) c.writeUInt32BE(c.readUInt32BE(12 + k * 16 + 8) + at, 12 + k * 16 + 8);
    offs.push(at); parts.push(c); at += c.length;
  }
  const h = Buffer.alloc(head);
  h.writeUInt32BE(0x74746366, 0); h.writeUInt32BE(0x00010000, 4); h.writeUInt32BE(files.length, 8);
  offs.forEach((o, i) => h.writeUInt32BE(o, 12 + i * 4));
  return Buffer.concat([h, ...parts]);
}

test('the app’s Bangla font is Kalpurush out of the box, also on the keyboard keys', async ({ page }) => {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  expect(await pnUi(page)).toBeGreaterThan(0); // "PN UI" has a Bangla face, loaded from the app itself
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"PN UI"/);
  expect(await page.locator('html').getAttribute('data-app-font-bn')).toBe('Kalpurush');
  await page.getByTestId('kb-toggle').click();
  const k = page.locator('[data-code="KeyK"]').first();
  await expect(k).toBeVisible();
  expect(await k.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"PN KB", "PN UI"/); // the keys' own font (decisions.md 82), else the app's
  // the document's own font is untouched
  expect(await editor(page).evaluate((el) => getComputedStyle(el).fontFamily)).not.toMatch(/PN UI/);
});

test('Settings → App: Bangla and English chosen apart; kept after reload; never a Bijoy font', async ({ page }) => {
  await page.goto('./');
  await section(page, 'app');
  const bn = page.getByTestId('app-font-bn');
  await expect(bn).toHaveValue('Kalpurush');
  await expect(bn.locator('option', { hasText: 'SutonnyMJ' })).toHaveCount(0);
  await bn.selectOption('Noto Serif Bengali');
  await page.getByTestId('app-font-en').selectOption('Georgia');
  const css = () => page.locator('#pn-app-font').textContent();
  await expect.poll(css).toContain('local("Noto Serif Bengali")');
  expect(await css()).toContain('local("Georgia")');
  await page.reload();
  await expect.poll(() => page.locator('html').getAttribute('data-app-font-bn')).toBe('Noto Serif Bengali');
  expect(await page.locator('html').getAttribute('data-app-font-en')).toBe('Georgia');
  // the link between the two places
  await section(page, 'app');
  await page.getByTestId('app-font-add').click();
  await expect(page.getByTestId('font-add-uni-btn')).toBeVisible();
  await page.getByTestId('font-to-app').click();
  await expect(page.getByTestId('app-font-bn')).toBeVisible();
});

test('font files: several at once, a .ttc split into its fonts, an own font chosen as the app font, a .fon refused', async ({ page }) => {
  test.skip(!fs.existsSync(dejavu) || !fs.existsSync(dejavuB), 'needs local TTF files');
  await page.goto('./');
  await section(page, 'font');
  await page.getByTestId('font-add-uni-file').setInputFiles([
    { name: 'pair.TTC', mimeType: 'application/octet-stream', buffer: makeTtc([fs.readFileSync(dejavu), fs.readFileSync(dejavuB)]) },
  ]);
  await expect(page.getByTestId('font-list').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('font-list')).toContainText('DejaVu Serif');
  const fon = Buffer.alloc(128); fon.write('MZ', 0, 'latin1');
  await page.getByTestId('font-add-uni-file').setInputFiles([{ name: 'old.fon', mimeType: 'application/octet-stream', buffer: fon }]);
  await expect(page.getByText(/bitmap/)).toBeVisible();
  await expect(page.getByTestId('font-list').locator('li')).toHaveCount(2);
  // the own font is offered for the app; its own file is used (blob:), not a device font
  await section(page, 'app');
  await page.getByTestId('app-font-bn').selectOption('DejaVu Serif');
  await expect.poll(() => page.locator('#pn-app-font').textContent()).toContain('url("blob:');
});

test('sizes for the app’s Bangla and English, and the keys’ own font and size (decisions.md 82)', async ({ page }) => {
  await page.goto('./');
  await section(page, 'app');
  const css = () => page.locator('#pn-app-font').textContent();
  await page.getByTestId('app-font-bn-size').fill('120');
  await page.getByTestId('app-font-bn-size').press('Tab');
  await page.getByTestId('app-font-en-size').fill('90');
  await page.getByTestId('app-font-en-size').press('Tab');
  await expect.poll(css).toMatch(/"PN UI"[^}]*U\+0980[^}]*size-adjust: 120%/);
  expect(await css()).toMatch(/"PN UI"[^}]*U\+0000[^}]*size-adjust: 90%/);
  await section(page, 'type');
  await page.getByTestId('kb-font').selectOption('Noto Serif Bengali');
  await page.getByTestId('kb-font-size').fill('130');
  await page.getByTestId('kb-font-size').press('Tab');
  await expect.poll(css).toMatch(/"PN KB"[^}]*Noto Serif Bengali[^}]*size-adjust: 130%/);
  // the menus keep their own font
  expect(await css()).toMatch(/"PN UI"[^}]*kalpurush/);
  await page.reload();
  await expect.poll(css).toMatch(/"PN KB"[^}]*size-adjust: 130%/);
});
