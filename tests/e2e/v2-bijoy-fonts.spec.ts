import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { toBijoy } from '../../src/bijoy';

// any real font file will do as a stand-in "Bijoy" font: the app treats it as ANSI because it was added as ANSI
const stand = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
const editor = (p: Page) => p.getByTestId('editor');
const typeKeys = async (p: Page, keys: string[]) => { for (const k of keys) await p.keyboard.press(k); };
const section = async (page: Page, name: string) => {
  if (!(await page.getByTestId('settings-panel').isVisible())) await page.getByTestId('settings').click();
  const d = page.locator('details', { has: page.locator(':scope > summary', { hasText: name }) });
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator(':scope > summary').click();
};

test('Bijoy fonts: own ANSI list with search, converting a selection, keeping the font on clear formatting, finding Bijoy text', async ({ page }) => {
  test.skip(!fs.existsSync(stand), 'needs a local TTF file');
  await page.goto('./');
  await editor(page).click();
  await section(page, 'ফন্ট');
  await page.getByTestId('font-add-ansi-file').setInputFiles({ name: 'stand.ttf', mimeType: 'font/ttf', buffer: fs.readFileSync(stand) });
  await expect(page.getByTestId('font-list')).toContainText('DejaVu Serif');
  await page.getByTestId('settings').click();

  await editor(page).click();
  await typeKeys(page, ['KeyD', 'KeyL', 'KeyI', 'KeyL']); // দলিল
  await expect(editor(page).locator('p').first()).toHaveText('দলিল');
  await page.keyboard.press('ControlOrMeta+A');

  // the font box: Unicode list first for Unicode text; the Bijoy list has its own fonts and search
  await page.getByTestId('font').click();
  await expect(page.getByTestId('fp-tab-uni')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('fp-tab-ansi').click();
  await expect(page.getByTestId('fp-SutonnyMJ')).toContainText('এই ডিভাইসে নেই');
  await page.getByTestId('font-search').fill('সুতন্নী');
  await expect(page.getByTestId('fp-SutonnyMJ')).toBeVisible();
  await expect(page.getByTestId('fp-JamunaMJ')).toHaveCount(0);
  await page.getByTestId('font-search').fill('deja');
  // the sample of a Bijoy font is Bijoy-encoded, so it reads as Bangla in that font
  await expect(page.getByTestId('fp-DejaVu Serif').locator('.fp-sample')).toHaveText(toBijoy('আমার সোনার বাংলা'));
  await page.getByTestId('fp-DejaVu Serif').click();

  // the selected Unicode text became Bijoy in that font, one undo step
  await expect(editor(page).locator('p').first()).toHaveText(toBijoy('দলিল'));
  await expect(page.getByTestId('font')).toContainText('DejaVu Serif');

  // clear formatting keeps the Bijoy font (otherwise the text would turn into Latin gibberish)
  await page.keyboard.press('ControlOrMeta+A');
  await page.getByTestId('tab-home').click();
  const direct = page.locator('.ribbon-row').getByTestId('clear-format').first();
  if (await direct.isVisible()) await direct.click();
  else { await page.getByTestId('more').click(); await page.getByTestId('more-menu').getByTestId('clear-format').click(); }
  await expect(editor(page).locator('p').first().locator('span')).toHaveAttribute('style', /DejaVu Serif/);

  // a Unicode search finds the Bijoy text
  await page.keyboard.press('ControlOrMeta+F');
  await page.getByTestId('find-q').click();
  await typeKeys(page, ['KeyD', 'KeyL', 'KeyI', 'KeyL']);
  await expect(page.getByTestId('find-q')).toHaveValue('দলিল');
  await expect(page.getByTestId('find-count')).toContainText('১');
  await page.keyboard.press('Escape');

  // back to Unicode with the document's font
  await editor(page).evaluate((el) => {
    const c = (el as unknown as { editor: { commands: { focus: () => void; selectAll: () => void } } }).editor.commands;
    c.focus();
    c.selectAll();
  });
  await expect.poll(() => editor(page).evaluate((el) => !(el as unknown as { editor: { state: { selection: { empty: boolean } } } }).editor.state.selection.empty)).toBe(true);
  await page.getByTestId('font').click();
  await expect(page.getByTestId('fp-tab-ansi')).toHaveAttribute('aria-pressed', 'true'); // the caret is in Bijoy text
  await page.getByTestId('fp-tab-uni').click();
  await page.getByTestId('fp-default').click();
  await expect(editor(page).locator('p').first()).toHaveText('দলিল');
  // one undo brings the Bijoy text back
  await page.getByTestId('undo').click();
  await expect(editor(page).locator('p').first()).toHaveText(toBijoy('দলিল'));
});

test('font files keep their own style: an Italic file of the family does not make normal text italic', async ({ page }) => {
  const italic = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf';
  test.skip(!fs.existsSync(stand) || !fs.existsSync(italic), 'needs local TTF files');
  await page.goto('./');
  await editor(page).click();
  await section(page, 'ফন্ট');
  // italic first, regular second: before the fix the order decided what normal text looked like
  await page.getByTestId('font-add-ansi-file').setInputFiles({ name: 'i.ttf', mimeType: 'font/ttf', buffer: fs.readFileSync(italic) });
  await expect(page.getByTestId('font-no-regular')).toContainText('DejaVu Serif');
  await page.getByTestId('font-add-ansi-file').setInputFiles({ name: 'r.ttf', mimeType: 'font/ttf', buffer: fs.readFileSync(stand) });
  await expect(page.getByTestId('font-no-regular')).toHaveCount(0);
  await expect(page.getByTestId('font-list')).toContainText('Italic');
  await expect(page.getByTestId('font-list')).toContainText('Regular');
  const styles = await page.evaluate(() => [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'DejaVu Serif').map((f) => f.style).sort());
  expect(styles).toEqual(['italic', 'normal']);
});
