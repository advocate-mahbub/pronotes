import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { toBijoy } from '../../src/bijoy';

const editor = (p: Page) => p.getByTestId('editor');
const typeKeys = async (p: Page, keys: string[]) => { for (const k of keys) await p.keyboard.press(k); };
const fontOfText = (p: Page, text: string) =>
  p.evaluate((t) => {
    const ed = document.querySelector('[data-testid="editor"]')!;
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent!.includes(t)) return (n.parentElement as HTMLElement).style.fontFamily;
    return null;
  }, text);

async function start(page: Page) {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
}
const openConverter = async (page: Page) => {
  await page.getByTestId('tab-tools').click();
  await page.getByTestId('bijoy-toggle').click();
};

test('ANSI typing: Bornona keys typed straight into Bijoy, ⌫ removes one letter, English in its own font', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Control+Shift+KeyA');
  await expect(page.getByTestId('ansi-typing-badge')).toBeVisible();
  await expect(page.getByTestId('mic')).toBeDisabled();
  await typeKeys(page, ['KeyD', 'KeyL', 'KeyI', 'KeyL']); // দলিল, ি goes before ল in Bijoy
  await expect(editor(page)).toHaveText(toBijoy('দলিল'));
  expect(await fontOfText(page, toBijoy('দলিল'))).toContain('SutonnyMJ');
  await page.keyboard.press('Backspace'); // one Unicode letter: দলি
  await expect(editor(page)).toHaveText(toBijoy('দলি'));
  await page.keyboard.press('Control+Space');
  await page.keyboard.type(' Plaintiff');
  expect(await fontOfText(page, 'Plaintiff')).toContain('Times New Roman');
  // back to Unicode typing, then turn the whole draft back
  await page.keyboard.press('Control+Space');
  await page.keyboard.press('Control+Shift+KeyA');
  await expect(page.getByTestId('ansi-typing-badge')).toHaveCount(0);
  await openConverter(page);
  await page.getByTestId('doc-to-unicode').click();
  await expect(editor(page)).toHaveText('দলি Plaintiff');
  expect(await fontOfText(page, 'দলি')).toBe('');
  // and Unicode → Bijoy for the whole draft
  await page.getByTestId('doc-to-bijoy').click();
  await expect(editor(page)).toContainText(toBijoy('দলি'));
  await expect(editor(page)).toContainText('Plaintiff');
});

test('ANSI typing setting and switch key live in Settings', async ({ page }) => {
  await start(page);
  await page.getByTestId('settings').click();
  const d = page.locator('details', { has: page.locator('summary', { hasText: 'কিবোর্ড ও টাইপিং' }) });
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator('summary').click();
  await page.getByTestId('ansi-key').selectOption('ctrl+period');
  await page.getByTestId('ansi-typing').check();
  await page.getByTestId('settings').click();
  await expect(page.getByTestId('ansi-typing-badge')).toBeVisible();
  await page.getByTestId('ansi-typing-badge').click();
  await expect(page.getByTestId('ansi-typing-badge')).toHaveCount(0);
  await editor(page).click();
  await page.keyboard.press('Control+Period');
  await expect(page.getByTestId('ansi-typing-badge')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('ansi-typing-badge')).toBeVisible(); // remembered
});

test('Converter: amount in words, digits, broken text, word count', async ({ page }) => {
  await start(page);
  await openConverter(page);
  await page.getByTestId('conv-amount').click();
  await page.getByTestId('amount-in').fill('500000');
  await expect(page.getByTestId('amount-row-0')).toHaveText('৫,০০,০০০/- (পাঁচ লক্ষ) টাকা');
  await expect(page.getByTestId('amount-row-1')).toHaveText('পাঁচ লক্ষ টাকা মাত্র');
  await page.getByTestId('amount-en').click();
  await expect(page.getByTestId('amount-row-0')).toHaveText('Tk. 5,00,000/- (Taka Five Lakh only)');
  await page.getByTestId('amount-bn').click();
  await page.getByTestId('amount-insert-1').click();
  await expect(editor(page)).toHaveText('পাঁচ লক্ষ টাকা মাত্র');
  await page.getByTestId('amount-in').fill('abc');
  await expect(page.getByTestId('amount-err')).toBeVisible();

  await editor(page).click();
  await page.keyboard.press('Control+Space');
  await page.keyboard.type(' 2026');
  await page.getByTestId('conv-digits').click();
  await page.getByTestId('digits-bn').click();
  await expect(editor(page)).toHaveText('পাঁচ লক্ষ টাকা মাত্র ২০২৬');
  await page.keyboard.press('Control+z');
  await expect(editor(page)).toHaveText('পাঁচ লক্ষ টাকা মাত্র 2026');

  // broken text from a PDF: vowel sign before its letter, অা, | as dari
  await editor(page).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('েকাট অাদালত |');
  await page.getByTestId('conv-fix').click();
  await page.getByTestId('fix-run').click();
  await expect(editor(page)).toContainText('কোট আদালত।');
  await expect(page.getByTestId('fix-changes')).toContainText('অা → আ');

  await page.getByTestId('conv-count').click();
  await expect(page.getByTestId('cc-words')).toHaveText('৭');
});

test('envelope: new from the menu, DL landscape, text direction, Word file turned', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __files: { name: string; url: string }[] };
    w.__files = [];
    HTMLAnchorElement.prototype.click = function () { w.__files.push({ name: this.download, url: this.href }); };
  });
  await start(page);
  await page.getByTestId('new-doc').click();
  await page.getByTestId('new-envelope').click();
  await expect(editor(page)).toContainText('প্রাপক:');
  await expect(page.getByTestId('title')).toHaveValue('খাম');
  await page.getByTestId('tab-page').click();
  await expect(page.getByTestId('paper')).toHaveValue('env-dl');
  await expect(page.getByTestId('landscape')).toHaveAttribute('aria-pressed', 'true');
  // the page on screen is wider than tall
  const box = await page.getByTestId('page').boundingBox();
  expect(box!.width).toBeGreaterThan(box!.height);
  await page.getByTestId('text-dir').click();
  await page.getByTestId('dir-tb').click();
  const css = await page.evaluate(() => document.getElementById('pn-page-style')!.textContent);
  expect(css).toContain('rotate(90deg)');
  expect(css).toMatch(/@page \{ size: 4\.33\d*in 8\.66\d*in; margin: 0; \}/);
  await page.getByTestId('share').click();
  await page.getByTestId('save-docx').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __files: unknown[] }).__files.length)).toBeGreaterThan(0);
  const bytes = await page.evaluate(async () => {
    const f = (window as unknown as { __files: { url: string }[] }).__files[0];
    return [...new Uint8Array(await (await fetch(f.url)).arrayBuffer())];
  });
  const xml = await (await JSZip.loadAsync(Buffer.from(bytes))).file('word/document.xml')!.async('string');
  expect(xml).toContain('w:textDirection w:val="tbRl"');
  // the setting stays with the document
  await page.reload();
  await page.getByTestId('tab-page').click();
  await page.getByTestId('text-dir').click();
  await expect(page.getByTestId('dir-tb')).toHaveAttribute('aria-pressed', 'true');
});

test('ANSI typing: conjuncts, রু, quotes and ে-কার come out as SutonnyMJ expects', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Control+Shift+KeyA');
  // মাস্তান is not on one key: স ্ ত typed one by one must still join (¯Í)
  await typeKeys(page, ['KeyS', 'KeyH', 'KeyT']); // স্ত
  await expect(editor(page)).toHaveText('¯Í');
  await page.keyboard.press('Space');
  await typeKeys(page, ['KeyN', 'KeyH', 'KeyT']); // ন্ত
  await page.keyboard.press('Space');
  await typeKeys(page, ['KeyR', 'KeyU']); // রু
  await page.keyboard.press('Space');
  await typeKeys(page, ['Shift+Quote', 'KeyD', 'KeyE', 'Shift+KeyS', 'KeyE', 'Shift+Quote']); // "দেশে"
  await expect(editor(page)).toHaveText('¯Í šÍ iæ Ò†`‡kÓ');
  await page.keyboard.press('Backspace'); // the closing quote only
  await expect(editor(page)).toHaveText('¯Í šÍ iæ Ò†`‡k');
});
