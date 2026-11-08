import { test, expect } from '@playwright/test';

test('Bangla dictionary: its words appear after two letters, can be turned off in Settings', async ({ page }) => {
  await page.goto('./');
  const ed = page.getByTestId('editor');
  await ed.click();
  await page.getByTestId('settings').click();
  const d = page.locator('details', { has: page.locator(':scope > summary', { hasText: 'শব্দভান্ডার' }) });
  await d.locator(':scope > summary').click();
  await expect(page.getByTestId('dict-status')).toContainText('শব্দ (উৎস: bangla-spellcheck-dict)', { timeout: 15000 });
  await page.getByTestId('settings').click();
  await ed.click();
  await page.keyboard.insertText('উসক');
  await expect(page.locator('.sug')).toContainText('উসকানি');
  // off: only own and legal words
  await page.getByTestId('settings').click();
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator(':scope > summary').click();
  await page.getByTestId('dict-on').uncheck();
  await expect(page.getByTestId('dict-status')).toContainText('অভিধান বন্ধ');
  await page.getByTestId('settings').click();
  await ed.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('া');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.sug')).not.toContainText('উসকানি');
});
