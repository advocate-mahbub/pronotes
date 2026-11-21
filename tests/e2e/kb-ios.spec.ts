import { test, expect, devices, type Page } from '@playwright/test';

// decisions.md 97: 🌐 held = the iPhone's menu (English / বাংলা, left · full · right · floating); a floating phone
// keyboard that sizes; new signs on ১২৩; anna-ganda in the split gap; a selection that shows; small ↶ ↷
const holdGlobe = async (page: Page) => {
  const g = page.locator('[data-testid=osk] [data-code="#Globe"]').first();
  const b = (await g.boundingBox())!;
  await g.dispatchEvent('pointerdown', { clientX: b.x + 5, clientY: b.y + 5, pointerId: 1, isPrimary: true });
  await page.waitForTimeout(900);
  await page.getByTestId('osk').dispatchEvent('pointerup', { clientX: 1, clientY: 1, pointerId: 1, isPrimary: true });
  await expect(page.getByTestId('kb-menu')).toBeVisible();
};
const tap = async (page: Page, code: string) => {
  await page.locator(`[data-testid=osk] [data-code="${code}"]`).first().dispatchEvent('pointerdown');
  await page.getByTestId('osk').dispatchEvent('pointerup');
};

test.describe('iPhone', () => {
  const iphone = devices['iPhone 13'];
  test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const open = async (page: Page) => {
    await page.goto('./');
    await page.getByTestId('side-toggle').tap();
    await page.getByTestId('new-doc').tap();
    await page.getByTestId('new-note').tap();
    await page.getByTestId('kb-toggle').tap();
    await expect(page.getByTestId('osk')).toBeVisible();
  };

  test('🌐 held: English / বাংলা, then left · full · right · floating as icons', async ({ page }) => {
    await open(page);
    await holdGlobe(page);
    const menu = page.getByTestId('kb-menu');
    for (const id of ['kb-lang-en', 'kb-lang-bn', 'kb-hand-left', 'kb-hand-full', 'kb-hand-right', 'kb-float']) await expect(menu.getByTestId(id)).toBeVisible();
    await expect(menu.getByTestId('kb-hand-full').locator('svg')).toHaveCount(1);
    // decisions.md 98: three rows — English ⇄ BN; full · floating; left · right
    const rows = menu.locator('.kb-menu-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).locator('button')).toHaveText(['English', 'BN']);
    await expect(rows.nth(1).locator('button')).toHaveCount(2);
    await expect(rows.nth(1).getByTestId('kb-hand-full')).toBeVisible();
    await expect(rows.nth(1).getByTestId('kb-float')).toBeVisible();
    await expect(rows.nth(2).getByTestId('kb-hand-left')).toBeVisible();
    await expect(rows.nth(2).getByTestId('kb-hand-right')).toBeVisible();
    await expect(menu.getByTestId('kb-lang-bn')).toHaveAttribute('aria-checked', 'true');
    await menu.getByTestId('kb-lang-en').tap();
    await expect(menu).toHaveCount(0);
    await expect(page.locator('[data-testid=osk] [data-code="#Space"] .lang')).toHaveText('a');
    await holdGlobe(page);
    await expect(page.getByTestId('kb-lang-en')).toHaveAttribute('aria-checked', 'true');
  });

  test('floating on a phone: it floats, its corner sizes it within limits, ⤓ docks it again', async ({ page }) => {
    await open(page);
    await holdGlobe(page);
    await page.getByTestId('kb-float').tap();
    const fl = page.getByTestId('kb-floating');
    await expect(fl).toBeVisible();
    const w0 = (await fl.boundingBox())!.width;
    const h = page.getByTestId('kb-float-size');
    const hb = (await h.boundingBox())!;
    const at = (x: number) => ({ clientX: x, clientY: hb.y + 10, pointerId: 3, isPrimary: true });
    await h.dispatchEvent('pointerdown', at(hb.x + 10));
    await h.dispatchEvent('pointermove', at(hb.x - 400));
    await h.dispatchEvent('pointerup', at(hb.x - 400));
    const w1 = (await fl.boundingBox())!.width;
    expect(w1).toBeLessThan(w0);
    expect(w1).toBeGreaterThanOrEqual(239); // never smaller than the limit
    // the keys shrink with it
    await expect.poll(async () => (await page.locator('[data-testid=osk] [data-code="KeyQ"]').boundingBox())!.height).toBeLessThan(40);
    await page.getByTestId('kb-dock').tap();
    await expect(fl).toHaveCount(0);
    await expect(page.getByTestId('osk')).toBeVisible();
  });

  test('১২৩: ✓ ✗ × ÷ ± → ৳ … ☐ ☑︎ ☒ are on the marks layer', async ({ page }) => {
    await open(page);
    await tap(page, '#Sym');
    for (const c of ['✓', '✗', '×', '÷', '±', '→', '৳', '…', '☐', '☑︎', '☒']) await expect(page.locator(`[data-testid=osk] [data-code="Txt:${c}"]`)).toHaveCount(1);
    await tap(page, 'Txt:☑︎');
    await expect(page.getByTestId('editor')).toContainText('☑︎');
  });

  test('a selection shows in its own colours; ↶ ↷ are small round buttons', async ({ page }) => {
    await open(page);
    await page.getByTestId('editor').tap();
    await page.keyboard.insertText('নির্বাচিত লেখা');
    await page.evaluate(() => { const ed = (document.querySelector('.ProseMirror') as unknown as { editor: { commands: { selectAll: () => void } } }).editor; ed.commands.selectAll(); });
    await expect(page.locator('.page-body .pn-sel')).toHaveCount(1);
    const u = (await page.getByTestId('kb-undo').boundingBox())!;
    expect(u.width).toBeLessThanOrEqual(34);
    expect(Math.abs(u.width - u.height)).toBeLessThan(2);
    await expect(page.getByTestId('kb-undo').locator('svg')).toHaveCount(1);
  });

  test('one-handed on the right: the keypad\'s digits move to the right', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('pronotes.kb.hand', '"right"'); localStorage.setItem('pronotes.kb.lastPad', '"num"'); });
    await open(page);
    const sym = page.locator('[data-testid=osk] [data-code="#Sym"]').first();
    const b = (await sym.boundingBox())!;
    const at = { clientX: b.x + 5, clientY: b.y + 5, pointerId: 1, isPrimary: true };
    await sym.dispatchEvent('pointerdown', at);
    await page.waitForTimeout(800);
    await page.getByTestId('osk').dispatchEvent('pointerup', at);
    const first = page.locator('[data-testid=osk] .kb-row').first().locator('.k');
    await expect(first.first()).toHaveAttribute('data-code', 'Txt:÷');
    await expect(first.last()).toHaveAttribute('data-code', 'Np3');
  });
});

test.describe('iPad split', () => {
  const ipad = devices['iPad Pro 11 landscape'];
  test.use({ viewport: ipad.viewport, hasTouch: true });
  test('the anna-ganda signs in the gap when Settings says so', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('pronotes.kb.mode', '"splitPhone"'); localStorage.setItem('pronotes.kb.splitAnna', 'true'); });
    await page.goto('./');
    await page.getByTestId('editor').click();
    if (!(await page.getByTestId('osk').isVisible())) await page.getByTestId('kb-toggle').click();
    await expect(page.getByTestId('kb-anna-gap-0')).toBeVisible();
    await tap(page, 'Anna:5');
    await expect(page.getByTestId('editor')).toContainText('৷৴');
  });
});

test.describe('Settings, iPad', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  test('no layout box above the page; Settings → কিবোর্ড has it, in folded groups', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('header [data-testid="layout"]')).toHaveCount(0);
    await page.getByTestId('settings').click();
    await page.getByTestId('stab-type').click();
    for (const id of ['kb-layouts', 'kb-osk', 'kb-shortcuts', 'kb-typing']) await expect(page.getByTestId(id + '-fold')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('layout')).toHaveCount(0);
    await page.getByTestId('kb-layouts-fold').click();
    await expect(page.getByTestId('layout')).toBeVisible();
    // an iPad (wide screen) keeps the switch keys
    await page.getByTestId('kb-shortcuts-fold').click();
    await expect(page.getByTestId('toggle-key')).toBeVisible();
  });
});

test.describe('Settings, iPhone', () => {
  const iphone = devices['iPhone 13'];
  test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, isMobile: true, hasTouch: true });
  test('a phone has no Bangla/English and Unicode/ANSI switch keys', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('settings').tap();
    await page.getByTestId('stab-type').tap();
    await page.getByTestId('kb-shortcuts-fold').tap();
    await expect(page.getByTestId('toggle-key')).toHaveCount(0);
    await expect(page.getByTestId('ansi-key')).toHaveCount(0);
  });
});
