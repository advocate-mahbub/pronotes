import { test, expect } from '@playwright/test';

test('engine preview types Bornona in a real browser', async ({ page }) => {
  await page.goto('./');
  const pad = page.getByTestId('pad');
  await pad.click();
  for (const k of ['KeyK', 'Shift+KeyF', 'KeyM', 'Space', 'KeyI', 'KeyE']) await page.keyboard.press(k);
  await expect(pad).toHaveValue('কর্ম ইএ');
  await page.keyboard.press('Control+Space');
  await expect(page.getByTestId('mode')).toHaveText('English');
});
