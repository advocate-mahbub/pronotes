import { test, expect } from '@playwright/test';

// The law dictionary and the Apps workspace take the editor's place for a while: what was just typed
// must still be there when the editor comes back (it used to start again from an older copy).
for (const via of ['dictionary', 'craft-toggle'])
  test(`${via}: text typed just before is still there afterwards`, async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('editor').click();
    await page.keyboard.insertText('দলিল মূলে খরিদ');
    await page.getByTestId('craft-toggle').click();
    if (via === 'dictionary') {
      // ▦ → ডিকশনারি (decisions.md 92), then back to the drafts
      await page.getByTestId('craft-dictionary').click();
      await page.getByTestId('dict-close').click();
    } else await page.getByTestId('craft-toggle').click();
    await expect(page.getByTestId('editor')).toContainText('দলিল মূলে খরিদ');
  });
