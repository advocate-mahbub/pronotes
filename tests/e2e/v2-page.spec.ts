import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import JSZip from 'jszip';

const editor = (p: Page) => p.getByTestId('editor');
const typeKeys = async (p: Page, keys: string[]) => { for (const k of keys) await p.keyboard.press(k); };
const cssVar = (p: Page, name: string) => p.locator('.desk').evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);
async function start(page: Page) {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
}
/** Paste plain text (each line becomes a paragraph). */
async function pasteText(page: Page, text: string) {
  await editor(page).evaluate((el, t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}
const PARA = 'বাদী পক্ষ এই মর্মে আরজি করিতেছে যে, নালিশী সম্পত্তি বাদীর পৈতৃক সম্পত্তি এবং বাদী উক্ত সম্পত্তিতে দীর্ঘদিন যাবৎ শান্তিপূর্ণভাবে ভোগদখলে আছে। ';
const LONG = Array.from({ length: 14 }, (_, i) => PARA.repeat(1 + (i % 4))).join('\n');
async function exportXml(page: Page) {
  await page.getByTestId('share').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-docx').click()]);
  const zip = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  return { doc: await zip.file('word/document.xml')!.async('string'), footer: (await zip.file('word/footer1.xml')?.async('string')) ?? '' };
}

test('page tab: paper, orientation, margins, document language, page numbers reach the screen and the Word file', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK']);
  await page.getByTestId('pstyle').selectOption('numbered');
  await page.getByTestId('tab-page').click();
  await page.getByTestId('paper').selectOption('folio');
  expect(parseFloat(await cssVar(page, '--pw'))).toBeCloseTo(793.73, 1);
  await page.getByTestId('landscape').click();
  expect(parseFloat(await cssVar(page, '--pw'))).toBeCloseTo(1247.27, 1);
  await page.getByTestId('portrait').click();
  await page.getByTestId('margins').click();
  await page.getByTestId('margin-narrow').click();
  await expect.poll(() => cssVar(page, '--mt')).toBe('48px');
  await page.getByTestId('doc-lang').selectOption('en');
  const num = await editor(page).locator('p').first().evaluate((e) => getComputedStyle(e, '::before').content);
  expect(num).toContain('counter(pn)');
  expect(num).not.toContain('bengali');
  await page.getByTestId('page-numbers').click();
  await page.getByTestId('pn-center').click();
  const x = await exportXml(page);
  expect(x.doc).toMatch(/<w:pgSz w:w="11906" w:h="18709"/);
  expect(x.doc).toContain('w:top="720"');
  expect(x.doc).toContain('>1.</w:t><w:tab/>');
  expect(x.footer).toContain('Page ');
  expect(x.footer).toContain('<w:jc w:val="center"/>');
  // the page setup is saved with the document
  await page.reload();
  await page.getByTestId('tab-page').click();
  await expect(page.getByTestId('paper')).toHaveValue('folio');
  await expect(page.getByTestId('doc-lang')).toHaveValue('en');
});

test('page setup sheet: custom size in inches; default for new drafts', async ({ page }) => {
  await start(page);
  await page.getByTestId('tab-page').click();
  await page.getByTestId('page-setup').click();
  await page.getByTestId('unit-in').click();
  await page.getByTestId('ps-paper').selectOption('custom');
  await page.getByTestId('ps-w').fill('8');
  await page.getByTestId('ps-h').fill('12');
  await page.getByTestId('ps-m-top').fill('2');
  await page.getByTestId('page-default').click();
  await expect.poll(() => cssVar(page, '--pw')).toBe('768px');
  await expect.poll(() => cssVar(page, '--ph')).toBe('1152px');
  await expect.poll(() => cssVar(page, '--mt')).toBe('192px');
  await page.getByTestId('new-doc').click();
  await page.getByTestId('new-legal').click();
  await expect.poll(() => cssVar(page, '--pw')).toBe('768px');
});

test('Print Layout shows separate pages with page numbers; Web Layout is one sheet; a page break starts a new page', async ({ page }) => {
  await start(page);
  await pasteText(page, LONG);
  await page.getByTestId('tab-view').click();
  await expect(page.getByTestId('page-count')).toHaveText(/^[২-৯] পাতা$/);
  const pages = await page.locator('.pg-gap').count();
  expect(pages).toBeGreaterThan(1);
  await expect(page.locator('.pg-foot').first()).toHaveAttribute('data-label', new RegExp('^পাতা – ১/[২-৯]$'));
  // every page holds at most one page of text: gaps sit inside the page height
  const ph = parseFloat(await cssVar(page, '--ph'));
  const tops = await page.locator('.pg-band').evaluateAll((els) => els.map((e) => (e as HTMLElement).getBoundingClientRect().top));
  const z = parseFloat(await cssVar(page, '--z'));
  for (let i = 1; i < tops.length; i++) expect(Math.abs(tops[i] - tops[i - 1] - (ph + 24) * z)).toBeLessThan(2);
  await page.getByTestId('layout-web').click();
  await expect(page.locator('.pg-gap')).toHaveCount(0);
  await page.getByTestId('layout-print').click();
  await expect(page.locator('.pg-gap')).toHaveCount(pages);
  // a manual page break adds a page
  await editor(page).locator('p').first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.pg-gap')).toHaveCount(pages + 1);
});

test('ruler: shows indents and dragging the left marker indents the paragraph', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK', 'KeyM', 'KeyR']);
  await page.getByTestId('tab-view').click();
  await page.getByTestId('ruler-toggle').click();
  await expect(page.getByTestId('ruler')).toBeVisible();
  await editor(page).locator('p').first().click();
  const left = page.getByTestId('ruler-left');
  const box = (await left.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const indl = Number(await editor(page).locator('p').first().getAttribute('data-indl'));
  expect(indl).toBeGreaterThan(500);
  await page.getByTestId('ruler-unit').click();
  await expect(page.getByTestId('ruler-unit')).toHaveText('ইঞ্চি');
});

test('gridlines: on/off, size, direction, line grid; never printed', async ({ page }) => {
  await start(page);
  await page.getByTestId('tab-view').click();
  await page.getByTestId('grid-toggle').click();
  await expect(page.getByTestId('grid')).toBeVisible();
  await page.getByTestId('grid-opts').click();
  await page.getByTestId('grid-dir-dots').click();
  await expect(page.getByTestId('grid')).toHaveAttribute('data-dir', 'dots');
  await page.getByTestId('grid-lg').click();
  await page.getByTestId('grid-linegrid').check();
  await page.getByTestId('grid-center').check();
  await expect(page.locator('.grid-center')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('grid')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.reload();
  await expect(page.getByTestId('grid')).toBeVisible(); // remembered
});

test('zoom: 100%, whole page, page width', async ({ page }) => {
  await start(page);
  await page.getByTestId('tab-view').click();
  await page.getByTestId('zoom-100').click();
  await expect.poll(() => cssVar(page, '--z')).toBe('1');
  await page.getByTestId('zoom').selectOption('page');
  expect(parseFloat(await cssVar(page, '--z'))).toBeLessThan(0.6);
  await page.getByTestId('zoom-in').click();
  expect(await page.getByTestId('zoom').inputValue()).toMatch(/^\d+$/);
});

test('print uses the document paper size (Folio)', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK']);
  await page.getByTestId('tab-page').click();
  await page.getByTestId('paper').selectOption('folio');
  await expect.poll(() => page.evaluate(() => document.getElementById('pn-page-style')?.textContent ?? '')).toContain('8.268in 12.992in');
  await page.emulateMedia({ media: 'print' });
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  const box = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)!;
  expect([Math.round(Number(box[1])), Math.round(Number(box[2]))]).toEqual([595, 935]); // 210 x 330 mm
});

test('settings: switch key (F12) and the Chandrabindu fix', async ({ page }) => {
  await start(page);
  await page.getByTestId('settings').click();
  await page.getByTestId('toggle-key').selectOption('f12');
  await expect(page.getByTestId('fix-chandra')).toBeChecked();
  await page.getByTestId('settings').click();
  await editor(page).click();
  await typeKeys(page, ['KeyK', 'Shift+Digit2', 'KeyA']);
  await expect(editor(page).locator('p').first()).toHaveText('কাঁ');
  await page.keyboard.press('F12');
  await expect(page.getByTestId('lang-toggle')).toHaveAttribute('data-lang', 'en');
  await page.keyboard.press('Control+Space'); // no longer the switch key
  await expect(page.getByTestId('lang-toggle')).toHaveAttribute('data-lang', 'en');
  await page.keyboard.press('F12');
  await expect(page.getByTestId('lang-toggle')).toHaveAttribute('data-lang', 'bn');
});
