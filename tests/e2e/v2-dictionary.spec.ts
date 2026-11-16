import { test, expect } from '@playwright/test';
import { section } from './settings-tab';

test('Bangla dictionary: its words appear after two letters, can be turned off in Settings', async ({ page }) => {
  await page.goto('./');
  const ed = page.getByTestId('editor');
  await ed.click();
  await section(page, 'words');
  await expect(page.getByTestId('dict-status')).toContainText('অভিধান: ', { timeout: 15000 });
  await expect(page.getByTestId('dict-status')).toContainText('শব্দ');
  await page.getByTestId('settings').click();
  await ed.click();
  await page.keyboard.insertText('উসক');
  await expect(page.locator('.sug')).toContainText('উসকানি');
  // off: only own and legal words
  await section(page, 'words');
  await page.getByTestId('dict-on').uncheck();
  await expect(page.getByTestId('dict-status')).toContainText('অভিধান বন্ধ');
  await page.getByTestId('settings').click();
  await ed.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('া');
  await page.keyboard.press('Backspace');
  // with nothing to suggest the bar is not shown at all
  await expect(page.locator('.sug', { hasText: 'উসকানি' })).toHaveCount(0);
});
