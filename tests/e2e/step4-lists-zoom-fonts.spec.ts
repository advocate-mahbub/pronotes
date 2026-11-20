import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import JSZip from 'jszip';
import { section } from './settings-tab';

// decisions.md 79: English fonts of one's own, numbered-list styles, the zoom bar
const editor = (p: Page) => p.getByTestId('editor');
const sans = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

async function start(page: Page) {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
}
async function docXml(page: Page) {
  await page.getByTestId('share').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-docx').click()]);
  const zip = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  return zip.file('word/document.xml')!.async('string');
}

test('an English font of one’s own: added in Settings, found under English in the font box', async ({ page }) => {
  test.skip(!fs.existsSync(sans), 'needs a local TTF file');
  await start(page);
  await section(page, 'ফন্ট');
  await page.getByTestId('font-add-en-file').setInputFiles({ name: 'sans.ttf', mimeType: 'font/ttf', buffer: fs.readFileSync(sans) });
  await expect(page.getByTestId('font-list')).toContainText('DejaVu Sans');
  await expect(page.getByTestId('font-list')).toContainText('English');
  await page.getByTestId('settings').click();
  await editor(page).click();
  await page.getByTestId('font').click();
  // three compact tabs: Unicode | ANSI | English
  for (const k of ['uni', 'ansi', 'en']) await expect(page.getByTestId('fp-tab-' + k)).toBeVisible();
  await page.getByTestId('fp-tab-en').click();
  await expect(page.getByTestId('fp-DejaVu Sans')).toBeVisible();
  await expect(page.getByTestId('fp-Times New Roman')).toBeVisible();
  // not in the Unicode list
  await page.getByTestId('fp-tab-uni').click();
  await expect(page.getByTestId('fp-DejaVu Sans')).toHaveCount(0);
});

test('numbered list styles: (ক), the start number, and the same labels in Word', async ({ page }) => {
  await start(page);
  await page.keyboard.insertText('প্রথম');
  await page.getByTestId('ol-style').click();
  await page.getByTestId('ol-style-bn-alpha-paren').click();
  await expect(editor(page).locator('ol')).toHaveAttribute('data-list-style', 'bn-alpha-paren');
  expect(await editor(page).locator('ol').evaluate((el) => getComputedStyle(el).listStyleType)).toBe('pn-bn-alpha-paren');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('দ্বিতীয়');
  // start at 3: (গ), (ঘ)
  await page.getByTestId('ol-style').click();
  await page.getByTestId('ol-start').fill('3');
  await page.getByTestId('ol-start').press('Tab');
  await expect(editor(page).locator('ol')).toHaveAttribute('start', '3');
  const xml = await docXml(page);
  expect(xml).toContain('(গ)');
  expect(xml).toContain('(ঘ)');
});

test('the zoom bar: − % + at the foot of the page, steps, and 100%', async ({ page }) => {
  await start(page);
  await page.getByTestId('pstyle').selectOption('numbered'); // paper view
  await editor(page).click(); // a touch of the page brings the bar (it fades when left alone)
  const bar = page.getByTestId('zoom-bar');
  await expect(bar).toBeVisible();
  await page.getByTestId('zb-pct').click();
  await page.getByTestId('zb-100').click();
  await expect(page.getByTestId('zb-pct')).toHaveText(/১০০%|100%/);
  await page.getByTestId('zb-in').click();
  await expect(page.getByTestId('zb-pct')).toHaveText(/১২৫%|125%/);
  await page.getByTestId('zb-out').click();
  await page.getByTestId('zb-out').click();
  await expect(page.getByTestId('zb-pct')).toHaveText(/৯০%|90%/);
  // page width from the menu
  await page.getByTestId('zb-pct').click();
  await expect(page.getByTestId('zb-width')).toBeVisible();
  await page.getByTestId('zb-width').click();
  await expect(page.getByTestId('zb-menu')).toHaveCount(0);
  // typing keeps its place: tapping the bar does not take the caret from the page
  await editor(page).click();
  await page.getByTestId('zb-in').click();
  await expect(editor(page)).toBeFocused();
});

test('in a legal draft, (ক) on a numbered paragraph takes the place of ১। (one number, not two)', async ({ page }) => {
  await start(page);
  await page.getByTestId('pstyle').selectOption('numbered');
  await page.keyboard.insertText('দাবি');
  await page.getByTestId('ol-style').click();
  await page.getByTestId('ol-style-bn-alpha-paren').click();
  await expect(editor(page).locator('ol li')).toHaveCount(1);
  await expect(page.getByTestId('pstyle')).not.toHaveValue('numbered');
});

test('the zoom bar fades out when left alone and comes back with a touch or a zoom (decisions.md 82)', async ({ page }) => {
  await start(page);
  const bar = page.getByTestId('zoom-bar');
  await expect(bar).not.toHaveAttribute('data-idle', 'yes');
  await expect(bar).toHaveAttribute('data-idle', 'yes', { timeout: 6000 });
  expect(await bar.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none'); // a faded bar never takes a tap
  await editor(page).click();
  await expect(bar).not.toHaveAttribute('data-idle', 'yes');
  await page.getByTestId('zb-in').click();
  await expect(bar).not.toHaveAttribute('data-idle', 'yes');
});
