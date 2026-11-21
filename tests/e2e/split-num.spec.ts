import { test, expect, devices, type Page } from '@playwright/test';

// decisions.md 89: split keyboard — digit pad English | Bangla with ⇄, halves at the edges; a phone on its side
// shows the whole split keyboard
const openPad = async (page: Page) => {
  const sym = page.locator('[data-testid=osk] [data-code="#Sym"]').first();
  const b = (await sym.boundingBox())!;
  const at = { clientX: b.x + 5, clientY: b.y + 5, pointerId: 1, isPrimary: true };
  await sym.dispatchEvent('pointerdown', at);
  await page.waitForTimeout(800);
  await page.getByTestId('osk').dispatchEvent('pointerup', at);
  await expect(page.getByTestId('osk')).toHaveClass(/split-num/);
};
const tap = async (page: Page, code: string) => {
  const k = page.locator(`[data-testid=osk] [data-code="${code}"]`).first();
  await k.dispatchEvent('pointerdown');
  await page.getByTestId('osk').dispatchEvent('pointerup');
};

test.describe('iPad', () => {
  const ipad = devices['iPad Pro 11 landscape'];
  test.use({ viewport: ipad.viewport, hasTouch: true });
  test('digit pad: English in one half, Bangla in the other; ⇄ trades them and is kept', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pronotes.kb.mode', '"splitPhone"'));
    await page.goto('./');
    await page.getByTestId('editor').click();
    if (!(await page.getByTestId('osk').isVisible())) await page.getByTestId('kb-toggle').click();
    await openPad(page);
    const halves = page.locator('[data-testid=osk] .kb-row.split').first().locator('.half');
    await expect(halves.nth(0).locator('.k').first()).toHaveAttribute('data-code', 'Txt:1');
    await expect(halves.nth(1).locator('.k').first()).toHaveAttribute('data-code', 'Txt:১');
    // the halves sit at the screen's edges
    const l = (await halves.nth(0).boundingBox())!, r = (await halves.nth(1).boundingBox())!;
    expect(l.x).toBeLessThan(40);
    expect(r.x + r.width).toBeGreaterThan(devices['iPad Pro 11 landscape'].viewport.width - 40);
    await tap(page, 'Txt:5');
    await tap(page, 'Txt:৫');
    await expect(page.getByTestId('editor')).toContainText('5৫');
    await page.getByTestId('kb-num-swap').click();
    await expect(halves.nth(0).locator('.k').first()).toHaveAttribute('data-code', 'Txt:১');
    expect(await page.evaluate(() => localStorage.getItem('pronotes.kb.numSwap'))).toBe('true');
  });
});

test.describe('phone on its side', () => {
  const d = devices['iPhone 13 landscape'];
  test.use({ viewport: d.viewport, userAgent: d.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('the split keyboard is not cut off at the bottom', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pronotes.kb.splitLand', 'true'));
    await page.goto('./');
    await page.getByTestId('editor').click();
    if (!(await page.getByTestId('osk').isVisible())) await page.getByTestId('kb-toggle').tap();
    await expect(page.getByTestId('osk')).toHaveClass(/split/);
    const k = (await page.getByTestId('osk').boundingBox())!;
    expect(k.y + k.height).toBeLessThanOrEqual(d.viewport.height + 0.5);
    await expect(page.getByTestId('kb-strip')).toBeInViewport({ ratio: 1 });
  });
});
