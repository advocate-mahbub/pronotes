import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { section } from './settings-tab';

// decisions.md 78: number boxes that can be written freely (and in Bangla digits), the backup group that
// folds to one line, and a restore that updates the same draft instead of making a copy.

test('the title size box: the last digit can be deleted; Bangla digits work; − + step it', async ({ page }) => {
  await page.goto('./');
  await section(page, 'font');
  const box = page.getByTestId('fmt-title');
  await box.click();
  await box.press('End');
  await box.press('Backspace');
  await box.press('Backspace');
  await expect(box).toHaveValue(''); // empty stays empty while writing (it used to jump back to ২৩)
  await box.pressSequentially('১৮');
  await box.press('Enter');
  await expect(box).toHaveValue(/^(১৮|18)$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pronotes.format') || '{}').titleSize)).toBe(18);
  await page.getByTestId('fmt-title-plus').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pronotes.format') || '{}').titleSize)).toBe(18.5);
  // a value outside the limits goes back to the last good one when the box is left
  await box.fill('3');
  await box.press('Enter');
  await expect(box).toHaveValue(/^(১৮\.৫|18\.5)$/);
});

test('the backup group folds to one line with the last backup; it remembers being open', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('settings').click();
  await page.getByTestId('stab-app').click();
  const fold = page.getByTestId('backup-fold');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('backup')).toHaveCount(0);
  await expect(fold).toContainText(/এখনো কোনো ব্যাকআপ|No backup/);
  await fold.click();
  await expect(page.getByTestId('backup')).toBeVisible();
  await page.reload();
  await page.getByTestId('settings').click();
  await page.getByTestId('stab-app').click();
  await expect(page.getByTestId('backup')).toBeVisible();
});

test('restoring a backup updates the same draft — no "(ব্যাকআপ থেকে)" copy', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('editor').click();
  await page.keyboard.type('kkk');
  await page.waitForTimeout(800);
  await section(page, 'app');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').click()]);
  const file = await dl.path();
  // the backup made "elsewhere, later": the same draft with newer text
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const d = json.docs[0];
  d.updatedAt = Date.now() + 60_000;
  d.text = 'অন্য ডিভাইসের লেখা';
  d.content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'অন্য ডিভাইসের লেখা' }] }] };
  const newer = file + '.newer.json';
  fs.writeFileSync(newer, JSON.stringify(json));
  await page.getByTestId('restore-file').setInputFiles(newer);
  await expect(page.getByTestId('toast')).toContainText(/হালনাগাদ ১টা|1 updated/);
  await page.getByTestId('settings').click();
  await expect(page.getByTestId('editor')).toHaveText('অন্য ডিভাইসের লেখা'); // the open draft shows it
  await expect(page.getByTestId('sidebar').getByTestId('doc-row')).toHaveCount(1);
});
