import { test, expect } from '@playwright/test';

// The law dictionary and the Apps workspace take the editor's place for a while: what was just typed
// must still be there when the editor comes back (it used to start again from an older copy).
for (const btn of ['law-dictionary-toggle', 'craft-toggle'])
  test(`${btn}: text typed just before is still there afterwards`, async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('editor').click();
    await page.keyboard.insertText('দলিল মূলে খরিদ');
    await page.getByTestId(btn).click();
    await page.getByTestId(btn).click();
    await expect(page.getByTestId('editor')).toContainText('দলিল মূলে খরিদ');
  });
