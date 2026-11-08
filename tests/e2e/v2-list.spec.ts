import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';

const editor = (p: Page) => p.getByTestId('editor');
const rows = (p: Page) => p.getByTestId('sidebar').getByTestId('doc-row');
const row = (p: Page, name: string) => rows(p).filter({ has: p.getByTestId('doc-title').getByText(name, { exact: true }) });
const typeKeys = async (p: Page, keys: string[]) => { for (const k of keys) await p.keyboard.press(k); };

/** Three drafts: আরজি (legal, "দলিল"), নোট (note, "কলম"), খাম. */
async function start(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __files: { name: string; url: string }[] };
    w.__files = [];
    HTMLAnchorElement.prototype.click = function () { w.__files.push({ name: this.download, url: this.href }); };
  });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
  await typeKeys(page, ['KeyD', 'KeyL', 'KeyI', 'KeyL']); // দলিল
  await page.getByTestId('title').fill('আরজি');
  await page.getByTestId('title').press('Enter');
  await page.getByTestId('new-doc').click();
  await page.getByTestId('new-note').click();
  await editor(page).click();
  await typeKeys(page, ['KeyK', 'KeyL', 'KeyM']); // কলম
  await page.getByTestId('title').fill('নোট');
  await page.getByTestId('title').press('Enter');
  // an envelope is a legal draft on খাম #10 paper (পাতা tab)
  await page.getByTestId('new-doc').click();
  await page.getByTestId('new-legal').click();
  await expect(page.getByTestId('title')).toHaveValue('নতুন ড্রাফট'); // the new draft is open
  await page.getByTestId('title').fill('খাম');
  await page.getByTestId('title').press('Enter');
  await page.getByTestId('tab-page').click();
  await page.getByTestId('paper').selectOption('env-10');
  await expect(rows(page)).toHaveCount(3);
}

test('rename in the list (double tap and ⋯), the open draft follows', async ({ page }) => {
  await start(page);
  await row(page, 'আরজি').getByTestId('doc-open').dblclick();
  await page.getByTestId('rename-in').fill('আরজি (সংশোধিত)');
  await page.getByTestId('rename-in').press('Enter');
  await expect(row(page, 'আরজি (সংশোধিত)')).toHaveCount(1);
  await expect(page.getByTestId('title')).toHaveValue('আরজি (সংশোধিত)'); // the open draft follows
  // from ⋯ (opens nothing; the open draft stays)
  await row(page, 'খাম').getByTestId('doc-menu').click();
  await page.getByTestId('m-rename').click();
  await page.getByTestId('rename-in').fill('খাম: আদালত');
  await page.getByTestId('rename-in').press('Enter');
  await expect(row(page, 'খাম: আদালত')).toHaveCount(1);
  await expect(page.getByTestId('title')).toHaveValue('আরজি (সংশোধিত)');
  await page.reload();
  await expect(row(page, 'খাম: আদালত')).toHaveCount(1);
  await expect(row(page, 'আরজি (সংশোধিত)')).toHaveCount(1);
});

test('search in names and text, preview line, filter by kind, sort by name, pin', async ({ page }) => {
  await start(page);
  await expect(row(page, 'আরজি').getByTestId('doc-preview')).toHaveText('দলিল');
  await page.getByTestId('doc-search').fill('কলম');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('নোট');
  await page.getByTestId('doc-search').fill('খাম');
  await expect(rows(page)).toHaveCount(1);
  await page.getByTestId('doc-search').fill('কিছুই না');
  await expect(page.getByTestId('sidebar')).toContainText('কিছু পাওয়া যায়নি');
  await page.getByTestId('doc-search').fill('');
  await page.getByTestId('doc-kind').selectOption('note');
  await expect(rows(page)).toHaveCount(1);
  await page.getByTestId('doc-kind').selectOption('envelope');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('খাম');
  await page.getByTestId('doc-kind').selectOption('legal');
  await expect(rows(page)).toHaveCount(1);
  await page.getByTestId('doc-kind').selectOption('all');
  await page.getByTestId('doc-sort').selectOption('title');
  await expect(rows(page).getByTestId('doc-title')).toHaveText(['আরজি', 'খাম', 'নোট']);
  await row(page, 'নোট').getByTestId('doc-menu').click();
  await page.getByTestId('m-pin').click();
  await expect(rows(page).first()).toHaveAttribute('data-pinned', 'true');
  await expect(rows(page).getByTestId('doc-title')).toHaveText(['নোট', 'আরজি', 'খাম']);
  await page.reload(); // sort, filter and pin are remembered
  await expect(rows(page).getByTestId('doc-title')).toHaveText(['নোট', 'আরজি', 'খাম']);
});

test('folders: create, move, view one folder, new draft goes in it, rename, delete keeps the drafts', async ({ page }) => {
  await start(page);
  await page.getByTestId('folders').click();
  await page.getByTestId('folder-new').fill('দেওয়ানি ১২/২০২৪');
  await page.getByTestId('folder-add').click();
  await page.keyboard.press('Escape');
  await row(page, 'আরজি').getByTestId('doc-menu').click();
  await page.getByTestId('doc-menu-items').getByText('📁 দেওয়ানি ১২/২০২৪').click();
  await expect(row(page, 'আরজি')).toContainText('📁 দেওয়ানি ১২/২০২৪');
  const fid = await page.getByTestId('doc-folder').locator('option', { hasText: 'দেওয়ানি' }).getAttribute('value');
  await page.getByTestId('doc-folder').selectOption(fid!);
  await expect(rows(page)).toHaveCount(1);
  await page.getByTestId('new-doc').click();
  await page.getByTestId('new-legal').click();
  await expect(rows(page)).toHaveCount(2);
  await page.getByTestId('doc-folder').selectOption('');
  await expect(rows(page)).toHaveCount(2); // নোট and খাম
  await page.getByTestId('folders').click();
  await page.getByTestId('folder-rename-' + fid).click();
  await page.getByTestId('folder-rename-in').fill('জবাব');
  await page.getByTestId('folder-rename-ok').click();
  await page.getByTestId('folder-del-' + fid).click();
  await page.getByTestId('folder-del-ok-' + fid).click();
  await page.getByTestId('doc-folder').selectOption('all');
  await expect(rows(page)).toHaveCount(4); // nothing deleted
  await expect(page.getByTestId('doc-folder').locator('option')).toHaveCount(2);
});

test('choose several: move, export as .zip, trash', async ({ page }) => {
  await start(page);
  await page.getByTestId('folders').click();
  await page.getByTestId('folder-new').fill('ক্লায়েন্ট');
  await page.getByTestId('folder-add').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('pick').click();
  await row(page, 'আরজি').getByTestId('pick-box').check();
  await row(page, 'নোট').getByTestId('pick-box').check();
  await expect(page.getByTestId('pick-bar')).toContainText('২টা');
  await page.getByTestId('pick-export').click();
  await page.getByTestId('pick-export-docx').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __files: unknown[] }).__files.length)).toBe(1);
  const bytes = await page.evaluate(async () => {
    const f = (window as unknown as { __files: { url: string }[] }).__files[0];
    return [...new Uint8Array(await (await fetch(f.url)).arrayBuffer())];
  });
  const zip = await JSZip.loadAsync(Buffer.from(bytes));
  expect(Object.keys(zip.files).sort()).toEqual(['আরজি.docx', 'নোট.docx']);
  await page.getByTestId('pick-all').click();
  await expect(page.getByTestId('pick-bar')).toContainText('৩টা');
  await page.getByTestId('pick-move').click();
  await page.getByTestId('pick-move-menu').getByText('📁 ক্লায়েন্ট').click();
  await expect(page.getByTestId('pick-bar')).toHaveCount(0);
  await expect(rows(page).filter({ hasText: '📁 ক্লায়েন্ট' })).toHaveCount(3);
  await page.getByTestId('pick').click();
  await row(page, 'নোট').getByTestId('pick-box').check();
  await row(page, 'খাম').getByTestId('pick-box').check();
  await page.getByTestId('pick-trash').click();
  await expect(rows(page)).toHaveCount(1);
  await page.getByTestId('view-trash').click();
  await expect(rows(page)).toHaveCount(2);
});

test('⋯ menu: copy text, duplicate, change kind, info, export one', async ({ page }) => {
  await start(page);
  await row(page, 'আরজি').getByTestId('doc-menu').click();
  await page.getByTestId('m-copy').click();
  await expect(page.getByTestId('toast')).toContainText('লেখা কপি হয়েছে');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('দলিল');
  await row(page, 'আরজি').getByTestId('doc-menu').click();
  await page.getByTestId('dup').click();
  await expect(rows(page)).toHaveCount(4);
  await expect(page.getByTestId('title')).toHaveValue('আরজি (কপি)');
  await row(page, 'আরজি').getByTestId('doc-menu').click();
  await page.getByTestId('m-kind-note').click();
  await expect(row(page, 'আরজি')).toHaveAttribute('data-kind', 'note');
  await row(page, 'আরজি').getByTestId('doc-menu').click();
  await page.getByTestId('m-info').click();
  await expect(page.getByTestId('info-words')).toHaveText('১');
  await page.keyboard.press('Escape');
  await row(page, 'আরজি').getByTestId('doc-menu').click();
  await page.getByTestId('m-save-txt').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __files: { name: string }[] }).__files.map((f) => f.name))).toEqual(['আরজি.txt']);
});

test('earlier versions: keep one now, change, bring it back (the current state is kept too)', async ({ page }) => {
  await start(page);
  await row(page, 'আরজি').locator('.doc').click();
  await expect(editor(page)).toHaveText('দলিল');
  await row(page, 'আরজি').getByTestId('doc-menu').click();
  await page.getByTestId('m-versions').click();
  await page.getByTestId('ver-snapshot').click();
  await expect(page.getByTestId('ver-item')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await editor(page).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await typeKeys(page, ['KeyK', 'KeyM']); // কম
  await page.keyboard.press('Control+s');
  await expect(editor(page)).toContainText('কম');
  await row(page, 'আরজি').getByTestId('doc-menu').click();
  await page.getByTestId('m-versions').click();
  await expect(page.getByTestId('ver-preview')).toHaveText('দলিল');
  await page.getByTestId('ver-restore').click();
  await page.getByTestId('ver-restore-ok').click();
  await expect(editor(page)).toHaveText('দলিল');
  await row(page, 'আরজি').getByTestId('doc-menu').click();
  await page.getByTestId('m-versions').click();
  await expect(page.getByTestId('ver-item')).toHaveCount(2);
  await expect(page.getByTestId('ver-preview')).toContainText('কম'); // the state before restoring
});
