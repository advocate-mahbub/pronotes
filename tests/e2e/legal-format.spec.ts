import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import JSZip from 'jszip';

const editor = (p: Page) => p.getByTestId('editor');
const typeKeys = async (p: Page, keys: string[]) => { for (const k of keys) await p.keyboard.press(k); };

async function start(page: Page) {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
}

test('paragraph styles, Bangla numbering, schedule table, .docx export', async ({ page }) => {
  await start(page);
  await page.getByTestId('pstyle').selectOption('heading');
  await typeKeys(page, ['KeyD', 'KeyL', 'KeyI', 'KeyL', 'Enter']); // দলিল
  await page.getByTestId('pstyle').selectOption('numbered');
  await typeKeys(page, ['KeyK', 'Enter', 'KeyM', 'Enter', 'KeyN']);
  const ps = editor(page).locator('p');
  await expect(ps.nth(0)).toHaveAttribute('data-pstyle', 'heading');
  await expect(ps.nth(2)).toHaveAttribute('data-pstyle', 'numbered'); // style continues after Enter
  // numbers come from a CSS counter in Bangla digits (the .docx export writes real numbers, checked below)
  const nums = await ps.evaluateAll((els) => els.map((e) => getComputedStyle(e, '::before').content));
  expect(nums.slice(1).every((c) => c.includes('counter(pn, bengali)'))).toBe(true);
  expect(await page.evaluate(() => CSS.supports('list-style-type', 'bengali'))).toBe(true);
  await expect(ps.nth(1)).toHaveCSS('text-align', 'justify');

  await page.keyboard.press('Enter');
  await page.getByTestId('pstyle').selectOption('normal');
  await page.getByTestId('table-add').click();
  await expect(editor(page).locator('table tr')).toHaveCount(3);
  await typeKeys(page, ['KeyK']); // first header cell
  await page.getByTestId('row-add').click();
  await expect(editor(page).locator('table tr')).toHaveCount(4);
  await expect(editor(page).locator('table th').first()).toHaveText('ক');

  await page.getByTestId('title').fill('পরীক্ষা আরজি');
  await page.getByTestId('title').press('Enter');
  // headless Chromium reports non-ASCII download names as "download", so read the name the app asked for
  await page.evaluate(() => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { (window as unknown as { __dl: string }).__dl = this.download; return orig.call(this); };
  });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-docx').click()]);
  expect(await page.evaluate(() => (window as unknown as { __dl: string }).__dl)).toBe('পরীক্ষা আরজি.docx');
  const zip = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  const doc = await zip.file('word/document.xml')!.async('string');
  expect(doc).toContain('<w:pgSz w:w="12240" w:h="20160"');
  expect([...doc.matchAll(/([০-৯]+।)<\/w:t><w:tab\/>/g)].map((m) => m[1])).toEqual(['১।', '২।', '৩।']);
  expect(doc).toContain('<w:gridCol w:w="700"/><w:gridCol w:w="1700"/><w:gridCol w:w="1900"/><w:gridCol w:w="4300"/>');
  expect(doc).toContain('w:val="PNHeading"');
});

test('format settings change the page and the Word file', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK']);
  await page.getByTestId('settings').click();
  await page.getByTestId('fmt-size').fill('16');
  await page.getByTestId('fmt-line').selectOption('2');
  await page.getByTestId('settings').click();
  await expect(editor(page)).toHaveCSS('font-size', '21.3333px');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-docx').click()]);
  const styles = await (await JSZip.loadAsync(fs.readFileSync(await dl.path()))).file('word/styles.xml')!.async('string');
  expect(styles).toContain('<w:sz w:val="32"/>');
  expect(styles).toContain('w:line="480"');
});

test('print shows only the page, on Legal paper', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK', 'Shift+KeyF', 'KeyM']);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.toolbar')).toBeHidden();
  await expect(page.locator('.dock')).toBeHidden();
  await expect(editor(page)).toHaveText('কর্ম');
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  const box = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)!;
  expect([Math.round(Number(box[1])), Math.round(Number(box[2]))]).toEqual([612, 1008]); // 8.5 x 14 in
});
