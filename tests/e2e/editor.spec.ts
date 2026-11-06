import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const sequences = JSON.parse(fs.readFileSync(new URL('../golden/sequences.json', import.meta.url), 'utf8'));
const editor = (p: Page) => p.getByTestId('editor');
const text = (p: Page) => editor(p).evaluate((el) => el.textContent ?? '');

async function open(page: Page, opts: { layout?: string; vf?: boolean; oldReph?: boolean } = {}) {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  if (opts.layout) await page.getByTestId('layout').selectOption(opts.layout);
  if (opts.vf !== undefined || opts.oldReph !== undefined) {
    await page.getByTestId('settings').click();
    await page.getByTestId('vf').setChecked(opts.vf ?? true);
    await page.getByTestId('oldreph').setChecked(opts.oldReph ?? false);
    await page.getByTestId('settings').click();
  }
  await editor(page).click();
}

test.describe('Tiptap editor types exactly like v8 (golden sequences)', () => {
  for (const s of sequences) {
    test(`${s.layout} vf=${s.vf} oldReph=${s.oldReph} → ${s.output}`, async ({ page }) => {
      await open(page, { layout: s.layout, vf: s.vf, oldReph: s.oldReph });
      for (const k of s.keys) await page.keyboard.press(k);
      expect(await text(page)).toBe(s.output);
    });
  }
});

test('Ctrl+Space switches language; English types Latin', async ({ page }) => {
  await open(page);
  await page.keyboard.press('KeyK');
  await page.keyboard.press('Control+Space');
  await expect(page.getByTestId('mode-en')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('KeyK');
  expect(await text(page)).toBe('কk');
});

test('Bold shortcut and undo still work with the Bornona engine', async ({ page }) => {
  await open(page);
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+b`);
  await page.keyboard.press('KeyK');
  await expect(editor(page).locator('strong')).toHaveText('ক');
  await page.keyboard.press(`${mod}+z`);
  expect(await text(page)).toBe('');
});

test('suggestions: built-in legal words, next word, and learning', async ({ page }) => {
  await open(page);
  for (const k of ['KeyD', 'KeyL']) await page.keyboard.press(k); // দল
  const chips = page.getByTestId('suggestions').locator('.chip');
  await expect(chips.first()).toHaveText('দলিল');
  await chips.first().dispatchEvent('pointerdown');
  expect(await text(page)).toBe('দলিল ');
  await expect(page.getByTestId('suggestions')).toContainText('মূলে');
  // a new word is learned after a space and suggested later
  for (const k of ['KeyM', 'KeyX', 'KeyK', 'Space', 'KeyM', 'KeyX']) await page.keyboard.press(k); // মষক  মষ
  await expect(chips.first()).toHaveText('মষক');
});

test.describe('touch screen (iPad-like)', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
  test('on-screen keyboard types and keeps the system keyboard closed', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByTestId('osk')).toBeVisible();
    await expect(editor(page)).toHaveAttribute('inputmode', 'none');
    await editor(page).tap();
    const key = (c: string) => page.locator(`[data-testid=osk] [data-code="${c}"]`).dispatchEvent('pointerdown');
    for (const c of ['KeyK', '#Shift', 'KeyF', 'KeyM', '#Space', 'KeyI']) await key(c);
    expect(await text(page)).toBe('কর্ম ই');
    await key('#Back');
    await page.locator('[data-testid=osk]').dispatchEvent('pointerup');
    expect(await text(page)).toBe('কর্ম ');
  });
});
