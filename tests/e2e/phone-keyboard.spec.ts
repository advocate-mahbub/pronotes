import { test, expect, devices, type Page } from '@playwright/test';

const iphone = devices['iPhone 13'];
test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const key = (p: Page, code: string) => p.locator(`[data-testid=osk] [data-code="${code}"]`);
const press = async (p: Page, code: string) => { await key(p, code).dispatchEvent('pointerdown'); await p.locator('[data-testid=osk]').dispatchEvent('pointerup'); };

test('phone keyboard: laid out like the iPhone (decisions.md 76) — two ⌫, two ⇧, two ↵, 🌐 under the keys', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('editor').click();
  await page.getByTestId('kb-toggle').tap();
  const osk = page.getByTestId('osk');
  await expect(osk).toBeVisible();

  // the letters' rows no longer carry the punctuation keys, nor ZWNJ (্্ and ্ + kar do its work) or a দাঁড়ি key
  for (const c of ['Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Backslash', '#Dari', '#Mode', '#BackL', '#EnterL', '#Shift2'])
    await expect(key(page, c)).toHaveCount(0);
  const codes = async (i: number) => osk.locator('.kb-row').nth(i).locator('[data-code]').evaluateAll((els) => els.map((e) => e.getAttribute('data-code')));
  expect(await codes(0)).toEqual(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']);
  expect((await codes(1)).length).toBe(10);
  expect(await codes(2)).toEqual(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL']); // nine, as on iPhone
  expect((await codes(3))).toEqual(['#Shift', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', '#Back']); // ⌫ where iOS has it
  expect(await codes(4)).toEqual(['#Sym', '#Space', '#Enter']); // ১২৩ · space · ↵, exactly iPhone
  // 🌐 in the strip under the keys; ⌄ in its middle
  await expect(page.getByTestId('kb-strip').locator('[data-code="#Globe"]')).toHaveCount(1);
  await expect(page.getByTestId('kb-strip').getByTestId('kb-hide')).toHaveCount(1);
  // one character per key: no Shift character in the corner
  await expect(key(page, 'KeyK').locator('.s')).toHaveCount(0);
  // ১২৩: the marks
  await expect(key(page, '#Sym')).toHaveText('১২৩');
  await press(page, '#Sym');
  for (const k of ['Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Txt:~']) await expect(key(page, k)).toHaveCount(1);
  await expect(key(page, '#Sym')).toHaveText('অআ');
  // several marks in a row, then space brings the letters back (as on iOS)
  await press(page, 'Slash');
  await press(page, 'Minus');
  await expect(key(page, 'Slash')).toHaveCount(1);
  await press(page, '#Space');
  await expect(key(page, 'Slash')).toHaveCount(0);
  await expect(page.getByTestId('editor')).toContainText('/-');

  // edge to edge: the page and the keyboard touch both sides of the screen
  const vw = iphone.viewport.width;
  const kb = (await osk.boundingBox())!;
  const pg = (await page.getByTestId('page').boundingBox())!;
  expect(Math.round(kb.x)).toBe(0);
  expect(Math.round(kb.x + kb.width)).toBe(vw);
  expect(Math.round(pg.x)).toBe(0);
  expect(Math.round(pg.x + pg.width)).toBe(vw);
  // the letter keys are wider than before (10 to a row), and their touch areas meet:
  // no dead gap between keys (only the drawn key is inset, iOS-style)
  const q = (await key(page, 'KeyQ').boundingBox())!;
  const w = (await key(page, 'KeyW').boundingBox())!;
  expect(q.width).toBeGreaterThan(vw / 12);
  expect(Math.abs(w.x - (q.x + q.width))).toBeLessThan(1);
});
