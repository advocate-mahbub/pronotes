import { test, expect, devices, type Page } from '@playwright/test';

// decisions.md 76: the hasanta rules typed on the keyboard, the caret's drop and loupe, the strip when
// the keyboard is put down, and the one (phone-style) split on the iPad.
const iphone = devices['iPhone 13'];
const ipad = devices['iPad Pro 11 landscape'];
const key = (p: Page, code: string) => p.locator(`[data-testid=osk] [data-code="${code}"]`);
const text = async (p: Page) => (await p.getByTestId('editor').locator('p').first().innerText()).replace(/\n$/, '');
const center = async (p: Page, code: string) => { const b = (await key(p, code).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const tap = async (p: Page, code: string) => { const c = await center(p, code); await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.up(); };
const open = async (p: Page) => {
  await p.goto('./');
  await p.getByTestId('editor').click();
  await p.getByTestId('kb-toggle').tap();
  await expect(p.getByTestId('osk')).toBeVisible();
  await p.getByTestId('editor').click();
};

test.describe('phone', () => {
  test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('্ + kar = the vowel; ্্ = a fixed hasanta that one ⌫ removes', async ({ page }) => {
    await open(page);
    for (const c of ['KeyK', 'KeyH', 'KeyI']) await tap(page, c); // ক ্ ি
    expect(await text(page)).toBe('কই');
    for (const c of ['#Space', 'KeyB', 'KeyL', 'KeyH', 'KeyH', 'KeyB', 'KeyO']) await tap(page, c); // ব ল ্ ্ ব ো
    expect(await text(page)).toBe('কই বল্‌বো');
    await tap(page, '#Back'); await tap(page, '#Back');
    expect(await text(page)).toBe('কই বল্‌');
    await tap(page, '#Back'); // ্ and ZWNJ go together
    expect(await text(page)).toBe('কই বল');
    // the same on a physical keyboard's Backspace
    for (const c of ['KeyH', 'KeyH']) await tap(page, c);
    await page.keyboard.press('Backspace');
    expect(await text(page)).toBe('কই বল');
  });

  test('the caret: drawn by ProNotes, a drop under it after a tap, the loupe while dragging the drop', async ({ page }) => {
    await open(page);
    for (const c of ['KeyK', 'KeyH', 'KeyI', '#Space', 'KeyB', 'KeyL', 'KeyO', '#Space', 'KeyK', 'KeyL']) await tap(page, c);
    await expect(page.getByTestId('pn-caret')).toBeVisible();
    const p0 = await page.getByTestId('editor').locator('p').first().boundingBox();
    await page.mouse.click(p0!.x + p0!.width - 4, p0!.y + p0!.height / 2);
    const drop = page.getByTestId('pn-drop');
    await expect(drop).toBeVisible();
    const head0 = await page.evaluate(() => window.getSelection()?.focusOffset);
    const d = (await drop.boundingBox())!;
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
    await page.mouse.down();
    await page.mouse.move(d.x - 50, d.y + d.height / 2, { steps: 8 });
    await expect(page.getByTestId('pn-loupe')).toBeVisible();
    await page.mouse.up();
    await expect(page.getByTestId('pn-loupe')).toHaveCount(0);
    expect(await page.evaluate(() => window.getSelection()?.focusOffset)).not.toBe(head0);
    // the space bar moving the caret shows the loupe too
    const s = await center(page, '#Space');
    await page.mouse.move(s.x, s.y); await page.mouse.down();
    await page.mouse.move(s.x + 60, s.y, { steps: 8 });
    await expect(page.getByTestId('pn-loupe')).toBeVisible();
    await page.mouse.up();
    // the setting turns the loupe off
    await page.evaluate(() => localStorage.setItem('pronotes.kb.loupe', 'false'));
    await page.mouse.move(s.x, s.y); await page.mouse.down();
    await page.mouse.move(s.x - 60, s.y, { steps: 8 });
    await expect(page.getByTestId('pn-loupe')).toHaveCount(0);
    await page.mouse.up();
  });

  test('put down, the strip stays: 🌐, ⌨ and the undo row while the keyboard is up', async ({ page }) => {
    await open(page);
    await tap(page, 'KeyK');
    await page.getByTestId('kb-undo').dispatchEvent('pointerdown');
    expect(await text(page)).toBe('');
    await page.getByTestId('kb-redo').dispatchEvent('pointerdown');
    expect(await text(page)).toBe('ক');
    await page.getByTestId('kb-hide').click();
    await expect(page.getByTestId('osk')).toHaveCount(0);
    const strip = page.getByTestId('kb-strip-down');
    await expect(strip).toBeVisible();
    await strip.getByTestId('strip-globe').click();
    await strip.getByTestId('kb-show').click();
    await expect(key(page, '#Space')).toHaveText('English');
  });
});

test.describe('iPad', () => {
  test.use({ viewport: ipad.viewport, userAgent: ipad.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('one split only, the phone-style one; the full keyboard keeps its own rows', async ({ page }) => {
    await open(page);
    await expect(key(page, '#Mode')).toHaveCount(1); // the full keyboard as it was
    await expect(key(page, 'Backslash')).toHaveCount(1);
    const c = await center(page, '#Mode');
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
    await expect(page.getByTestId('kb-split')).toHaveCount(0);
    await page.getByTestId('kb-split-phone').click();
    const osk = page.getByTestId('osk');
    await expect(osk).toHaveClass(/split/);
    await expect(osk).toHaveClass(/compact/);
    // two ⌫, two ⇧ and two ↵ — one of each for each thumb
    const left = osk.locator('.kb-row.split').nth(2).locator('.half').first();
    await expect(left.locator('[data-code="#BackL"]')).toHaveCount(1);
    await expect(osk.locator('.kb-row.split').last().locator('.half').first().locator('[data-code="#EnterL"]')).toHaveCount(1);
    await expect(osk.locator('.kb-row.split').last().locator('.half').last().locator('[data-code="#Shift2"]')).toHaveCount(1);
  });
});
