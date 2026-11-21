import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { section } from './settings-tab';

const sequences = JSON.parse(fs.readFileSync(new URL('../golden/sequences.json', import.meta.url), 'utf8'));
const editor = (p: Page) => p.getByTestId('editor');
const text = (p: Page) => editor(p).evaluate((el) => el.textContent ?? '');

async function open(page: Page, opts: { layout?: string; vf?: boolean; oldReph?: boolean } = {}) {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  // the layout box is in Settings → কিবোর্ড (decisions.md 98)
  if (opts.layout) { await section(page, 'type'); await page.getByTestId('layout').selectOption(opts.layout); await page.getByTestId('settings').click(); }
  if (opts.vf !== undefined || opts.oldReph !== undefined) {
    await page.getByTestId('settings').click();
    await page.getByTestId('vf').setChecked(opts.vf ?? true);
    await page.getByTestId('oldreph').setChecked(opts.oldReph ?? false);
    await page.getByTestId('settings').click();
  }
  await editor(page).click();
}

test.describe('Tiptap editor types exactly like v8 (golden sequences)', () => {
  // Only the four approved layouts are offered; "bornona" stays selectable (hidden) for these checks.
  // The other v8 layouts in sequences.json are no longer part of the app.
  const OFFERED = new Set(['bornona', 'pronotes', 'pronotes-phonetic', 'bijoy-classic', 'unibijoy']);
  for (const s of sequences) {
    test(`${s.layout} vf=${s.vf} oldReph=${s.oldReph} → ${s.output}`, async ({ page }) => {
      test.skip(!OFFERED.has(s.layout), `${s.layout} is not one of the approved layouts`);
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
  await expect(page.getByTestId('lang-toggle')).toHaveAttribute('data-lang', 'en');
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
    // touch devices start with their own keyboard; ⌨ turns on the Bornona on-screen keyboard
    await expect(page.getByTestId('osk')).toHaveCount(0);
    await page.getByTestId('kb-toggle').tap();
    await expect(page.getByTestId('osk')).toBeVisible();
    await expect(editor(page)).toHaveAttribute('inputmode', 'none');
    await editor(page).tap();
    const key = async (c: string) => { await page.locator(`[data-testid=osk] [data-code="${c}"]`).dispatchEvent('pointerdown'); await page.locator('[data-testid=osk]').dispatchEvent('pointerup'); };
    for (const c of ['KeyK', '#Shift', 'KeyF', 'KeyM', '#Space', 'KeyI']) await key(c);
    expect(await text(page)).toBe('কর্ম ই');
    await key('#Back');
    await page.locator('[data-testid=osk]').dispatchEvent('pointerup');
    expect(await text(page)).toBe('কর্ম ');
  });
});
