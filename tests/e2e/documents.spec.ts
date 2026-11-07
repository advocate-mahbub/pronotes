import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const editor = (p: Page) => p.getByTestId('editor');
const status = (p: Page) => p.getByTestId('save-status');
const rows = (p: Page) => p.getByTestId('sidebar').getByTestId('doc-row');
const typeKeys = async (p: Page, keys: string[]) => { for (const k of keys) await p.keyboard.press(k); };

async function start(page: Page) {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
}

test('typing is saved on this device and survives a reload', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK', 'Shift+KeyF', 'KeyM']);
  await expect(status(page)).toHaveText('এই ডিভাইসে সেভ হয়েছে');
  await page.reload();
  await expect(editor(page)).toHaveText('কর্ম');
});

test('Ctrl/⌘+S saves at once', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK']);
  await expect(status(page)).toHaveClass(/saving/);
  await page.keyboard.press('Control+s');
  await expect(status(page)).toHaveText('এই ডিভাইসে সেভ হয়েছে');
});

test('new draft, rename, switch between drafts; undo stays per draft', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK']);
  await page.getByTestId('title').fill('আরজি');
  await page.getByTestId('title').press('Enter');
  await page.getByTestId('new-doc').click();
  await page.getByTestId('new-legal').click();
  await editor(page).click();
  await typeKeys(page, ['KeyM']);
  await page.getByTestId('title').fill('জবাব');
  await page.getByTestId('title').press('Enter');
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText('জবাব');
  await rows(page).filter({ hasText: 'আরজি' }).locator('.doc').click();
  await expect(editor(page)).toHaveText('ক');
  await editor(page).click();
  await page.keyboard.press('Control+z');
  await expect(editor(page)).toHaveText('ক'); // fresh history: nothing from the other draft to undo
});

test('duplicate, trash, restore, delete forever (with confirmation)', async ({ page }) => {
  const cur = () => page.locator('.docs li.cur');
  await start(page);
  await typeKeys(page, ['KeyD', 'KeyL']);
  await page.keyboard.press('Control+s');
  await expect(status(page)).toHaveClass(/saved/);
  await cur().getByTestId('dup').click();
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId('title')).toHaveValue(/\(কপি\)$/);
  await expect(editor(page)).toHaveText('দল');
  await cur().getByTestId('trash').click();
  await expect(rows(page)).toHaveCount(1);
  await page.getByTestId('view-trash').click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('আর ৩০ দিন');
  await rows(page).first().getByTestId('restore').click();
  await expect(rows(page)).toHaveCount(0);
  await page.getByTestId('view-docs').click();
  await expect(rows(page)).toHaveCount(2);
  await cur().getByTestId('trash').click();
  await page.getByTestId('view-trash').click();
  await rows(page).first().getByTestId('delete').click();
  await expect(rows(page)).toHaveCount(1); // not deleted until confirmed
  await rows(page).first().getByTestId('delete-confirm').click();
  await expect(rows(page)).toHaveCount(0);
});

test('backup on one device, restore on another', async ({ page, browser }) => {
  await start(page);
  await typeKeys(page, ['KeyD', 'KeyL', 'KeyI', 'KeyL']);
  await page.getByTestId('title').fill('তফসিল খসড়া');
  await page.getByTestId('title').press('Enter');
  await page.keyboard.press('Control+s');
  await page.getByTestId('settings').click();
  await page.locator('summary', { hasText: 'ব্যাকআপ' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').click()]);
  expect(dl.suggestedFilename()).toMatch(/^pronotes-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await dl.path();
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(json.app).toBe('pronotes');
  expect(json.docs.find((d: { title: string }) => d.title === 'তফসিল খসড়া').text).toBe('দলিল');
  expect(json.docs.some((d: { title: string }) => d.title === 'তফসিল খসড়া')).toBe(true);

  const other = await (await browser.newContext()).newPage();
  await start(other);
  await other.getByTestId('settings').click();
  await other.getByTestId('restore-file').setInputFiles(file);
  await expect(other.getByTestId('toast')).toContainText('নতুন ১টা');
  await rows(other).filter({ hasText: 'তফসিল খসড়া' }).locator('.doc').click();
  await expect(editor(other)).toHaveText('দলিল');
  // restoring again adds nothing
  await other.getByTestId('restore-file').setInputFiles(file);
  await expect(other.getByTestId('toast')).toContainText('আগে থেকেই ছিল');
  await expect(rows(other)).toHaveCount(2);
});

test('M2 preview draft is moved into the document list', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('pronotes.migratedM3'))
      localStorage.setItem('pronotes.draft', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'পুরোনো লেখা' }] }] }));
  });
  await page.goto('./');
  await expect(rows(page).filter({ hasText: 'আগের ড্রাফট' })).toHaveCount(1);
  await page.reload();
  await expect(rows(page).filter({ hasText: 'আগের ড্রাফট' })).toHaveCount(1); // only once
});
