import { test, expect, type Page } from '@playwright/test';
import { section } from './settings-tab';

const editor = (p: Page) => p.getByTestId('editor');
const para = (p: Page, i: number) => editor(p).locator('> p').nth(i);

test('MS Word shortcuts while typing Bangla: align, double underline, size, move paragraph, special characters', async ({ page }) => {
  await page.goto('./');
  await editor(page).click();
  for (const k of ['KeyK', 'KeyM', 'KeyR']) await page.keyboard.press(k); // কমর
  await page.keyboard.press('Enter');
  for (const k of ['KeyD', 'KeyL']) await page.keyboard.press(k);
  await expect(para(page, 1)).toHaveText(/\S/);
  const second = (await para(page, 1).textContent())!;

  await page.keyboard.press('Control+e');
  await expect(para(page, 1)).toHaveCSS('text-align', 'center');
  await page.keyboard.press('Control+j');
  await expect(para(page, 1)).toHaveCSS('text-align', 'justify');

  // Alt+Shift+↑: the paragraph moves up
  await page.keyboard.press('Alt+Shift+ArrowUp');
  await expect(para(page, 0)).toHaveText(second);
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect(para(page, 1)).toHaveText(second);

  // Ctrl+Alt+C ©, Ctrl+Alt+- em dash (Bangla is on and the layout has no AltGr letters on these keys)
  await page.keyboard.press('End');
  await page.keyboard.press('Control+Alt+KeyC');
  await page.keyboard.press('Control+Alt+Minus');
  await expect(para(page, 1)).toHaveText(second + '©—');

  // select the paragraph: double underline, then a bigger size
  await page.keyboard.press('Shift+Home');
  await expect.poll(() => page.evaluate(() => String(getSelection()))).toBe(second + '©—');
  await page.waitForTimeout(50); // the editor reads a keyboard selection change on the next tick
  await page.keyboard.press('Control+Shift+KeyD');
  await expect(para(page, 1).locator('u[data-ustyle="double"]')).toHaveCount(1);
  const before = Number(await page.getByTestId('size').inputValue());
  await page.keyboard.press('Control+BracketRight');
  await expect(page.getByTestId('size')).toHaveValue(String(before + 1));
});

test('the shortcuts are listed in Settings', async ({ page }) => {
  await page.goto('./');
  await section(page, 'type');
  const box = page.getByTestId('settings-shortcuts');
  await box.locator('summary').click();
  await expect(box).toContainText('Ctrl+Shift+D');
  await expect(box).toContainText('নিচে দুই দাগ');
});
