import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const section = async (page: import('@playwright/test').Page, name: string) => {
  const d = page.locator('details', { has: page.locator(':scope > summary', { hasText: name }) });
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator(':scope > summary').click();
};

test('settings: saved at once with a visible ✓, kept after reload, and come back from a backup', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('editor').click();
  // Undo/Redo sit next to the tabs, so they work from every tab
  await page.getByTestId('tab-insert').click();
  await expect(page.getByTestId('undo')).toBeVisible();
  await expect(page.getByTestId('redo')).toBeVisible();
  // the language key has no shortcut text in its tooltip
  expect(await page.getByTestId('lang-toggle').getAttribute('title')).not.toContain('Ctrl');

  await page.getByTestId('settings').click();
  await section(page, 'কিবোর্ড ও টাইপিং');
  const keySel = page.locator('select').filter({ has: page.locator('option[value="f12"]') }).first();
  await keySel.selectOption('f12');
  await expect(page.getByTestId('settings-saved')).toHaveText('✓ সংরক্ষিত');
  await page.reload();
  await page.getByTestId('settings').click();
  await section(page, 'কিবোর্ড ও টাইপিং');
  await expect(keySel).toHaveValue('f12');
  // menu language now lives in the App section, written once
  await section(page, 'অ্যাপ: মেনুর ভাষা');
  await expect(page.getByTestId('ui-bn')).toBeVisible();
  await expect(page.getByTestId('settings-panel')).not.toContainText('App language');

  // backup → a fresh device → restore brings the setting back
  await section(page, 'ব্যাকআপ');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').click()]);
  const file = await dl.path();
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(json.prefs.store.toggleKey).toBe('f12');
  expect(json.aiKey).toBeUndefined();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('settings').click();
  await section(page, 'কিবোর্ড ও টাইপিং');
  await expect(keySel).toHaveValue('ctrl+space');
  await section(page, 'ব্যাকআপ');
  await page.getByTestId('restore-file').setInputFiles(file);
  await page.waitForEvent('load');
  await page.getByTestId('settings').click();
  await section(page, 'কিবোর্ড ও টাইপিং');
  await expect(keySel).toHaveValue('f12');
});
