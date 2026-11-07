import { test, expect, type Page } from '@playwright/test';

const editor = (p: Page) => p.getByTestId('editor');
const typeKeys = async (p: Page, keys: string[]) => { for (const k of keys) await p.keyboard.press(k); };

/** Record downloads made through <a download> (headless Chromium renames non-ASCII names) with their bytes. */
async function captureDownloads(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __files: { name: string; url: string }[] };
    w.__files = [];
    HTMLAnchorElement.prototype.click = function () { w.__files.push({ name: this.download, url: this.href }); };
  });
}
async function lastFile(page: Page): Promise<{ name: string; bytes: number[]; text: string }> {
  await expect.poll(() => page.evaluate(() => (window as unknown as { __files: unknown[] }).__files.length)).toBeGreaterThan(0);
  return page.evaluate(async () => {
    const files = (window as unknown as { __files: { name: string; url: string }[] }).__files;
    const f = files[files.length - 1];
    const buf = new Uint8Array(await (await fetch(f.url)).arrayBuffer());
    files.length = 0;
    return { name: f.name, bytes: [...buf.slice(0, 8)], text: new TextDecoder().decode(buf) };
  });
}
async function start(page: Page) {
  await captureDownloads(page);
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
  await page.getByTestId('pstyle').selectOption('numbered');
  await typeKeys(page, ['KeyK', 'KeyM', 'KeyR']); // কমর
  await page.keyboard.press('Control+Space');
  await page.keyboard.type(' Plaintiff');
  await page.keyboard.press('Control+Space');
  await page.getByTestId('title').fill('পরীক্ষা');
  await page.getByTestId('title').press('Enter');
}
const save = async (page: Page, id: string) => {
  await page.getByTestId('share').click();
  await page.getByTestId('save-' + id).click();
};

test('every format: .docx, .docx (Bijoy), .doc, .doc (Bijoy), .txt, .md, .html, .png', async ({ page }) => {
  await start(page);
  await save(page, 'docx');
  let f = await lastFile(page);
  expect(f.name).toBe('পরীক্ষা.docx');
  expect(f.bytes.slice(0, 2)).toEqual([0x50, 0x4b]); // zip
  await save(page, 'docx-ansi');
  f = await lastFile(page);
  expect(f.name).toBe('পরীক্ষা (বিজয়).docx');
  await save(page, 'doc');
  f = await lastFile(page);
  expect(f.name).toBe('পরীক্ষা.doc');
  expect(f.text.startsWith('{\\rtf1\\ansi')).toBe(true);
  expect(f.text).toContain('\\u2453?'); // ক
  await save(page, 'doc-ansi');
  f = await lastFile(page);
  expect(f.name).toBe('পরীক্ষা (বিজয়).doc');
  expect(f.text).toContain('SutonnyMJ');
  expect(f.text.slice(f.text.indexOf('\\sectd'))).not.toContain('\\u2453?'); // the title in the file info stays Unicode
  await save(page, 'txt');
  f = await lastFile(page);
  expect(f.name).toBe('পরীক্ষা.txt');
  expect(f.bytes.slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
  expect(f.text).toContain('১।\tকমর Plaintiff');
  await save(page, 'md');
  f = await lastFile(page);
  expect(f.text).toContain('# পরীক্ষা');
  expect(f.text).toContain('১। কমর Plaintiff');
  await save(page, 'html');
  f = await lastFile(page);
  expect(f.name).toBe('পরীক্ষা.html');
  expect(f.text).toContain('<title>পরীক্ষা</title>');
  expect(f.text).toContain('data-pstyle="numbered"');
  await save(page, 'png');
  f = await lastFile(page);
  expect(f.name).toBe('পরীক্ষা.png');
  expect(f.bytes.slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
});

test('a picture per page: a long draft gives a .zip of page pictures of the right size', async ({ page }) => {
  await start(page);
  const para = 'বাদী পক্ষ এই মর্মে আরজি করিতেছে যে, নালিশী সম্পত্তি বাদীর পৈতৃক সম্পত্তি এবং বাদী উক্ত সম্পত্তিতে দীর্ঘদিন যাবৎ শান্তিপূর্ণভাবে ভোগদখলে আছে। ';
  await editor(page).evaluate((el, t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, Array.from({ length: 12 }, (_, i) => para.repeat(1 + (i % 4))).join('\n'));
  await page.getByTestId('tab-view').click();
  await expect(page.getByTestId('page-count')).toHaveText(/^[২-৯] পাতা$/);
  await save(page, 'png');
  const info = await page.evaluate(async () => {
    const w = window as unknown as { __files: { name: string; url: string }[] };
    for (let i = 0; i < 100 && !w.__files.length; i++) await new Promise((r) => setTimeout(r, 100));
    const f = w.__files[0];
    const blob = await (await fetch(f.url)).blob();
    return { name: f.name, size: blob.size, type: blob.type };
  });
  expect(info.name).toBe('পরীক্ষা.zip');
  expect(info.size).toBeGreaterThan(10000);
});

test('copy as Bijoy (ANSI): badge on the page, Bijoy text and SutonnyMJ on the clipboard; back to Unicode', async ({ page }) => {
  await start(page);
  await page.getByTestId('share').click();
  await page.getByTestId('out-ansi').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ansi-badge')).toBeVisible();
  await editor(page).click();
  await page.keyboard.press('Control+a');
  const copied = await editor(page).evaluate((el) => {
    const dt = new DataTransfer();
    el.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
    return { text: dt.getData('text/plain'), html: dt.getData('text/html') };
  });
  expect(copied.text).toContain('Plaintiff');
  expect(copied.text).not.toContain('কমর');
  expect(copied.html).toContain("font-family:'SutonnyMJ'");
  expect(copied.html).toContain("font-family:'Times New Roman'");
  await page.getByTestId('ansi-badge').click();
  await expect(page.getByTestId('ansi-badge')).toHaveCount(0);
  const unicode = await editor(page).evaluate((el) => {
    const dt = new DataTransfer();
    el.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
    return dt.getData('text/plain');
  });
  expect(unicode).toContain('কমর');
});

test('share sends the file to the device share sheet when it can', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: string[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async (d: { files: File[] }) => { w.__shared.push(d.files[0].name); }, configurable: true });
  });
  await start(page);
  await page.getByTestId('share').click();
  await page.getByTestId('share-docx').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: string[] }).__shared)).toEqual(['পরীক্ষা.docx']);
  await expect(page.getByTestId('toast')).toContainText('শেয়ার করা হয়েছে');
});
