import { test, expect, devices, type Page } from '@playwright/test';

// The keypads (decisions.md 74): long-press #+= (phone) or #Pad (iPad) → 123 | ১২৩ | ৴৵৶; the ½ key;
// the 1–16 anna pad; the iPad split at half width; the suggestion row that no longer makes the keyboard jump.
const iphone = devices['iPhone 13'];
const ipad = devices['iPad Pro 11 landscape'];
const key = (p: Page, code: string) => p.locator(`[data-testid=osk] [data-code="${code}"]`);
const html = (p: Page) => p.getByTestId('editor').locator('p').first().innerHTML();
const text = async (p: Page) => (await p.getByTestId('editor').locator('p').first().innerText()).replace(/\n$/, '');
const center = async (p: Page, code: string) => { const b = (await key(p, code).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const tap = async (p: Page, code: string) => { const c = await center(p, code); await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.up(); };
/** Hold a key until the keypad menu shows, slide to a keypad, lift. */
const choosePad = async (p: Page, holdCode: string, pad: '123' | '১২৩' | '৴৵৶') => {
  const c = await center(p, holdCode);
  await p.mouse.move(c.x, c.y);
  await p.mouse.down();
  const menu = p.getByTestId('kb-pad-menu');
  await expect(menu).toBeVisible();
  const b = (await menu.getByText(pad, { exact: true }).boundingBox())!;
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await p.mouse.up();
  await expect(menu).toHaveCount(0);
};
const open = async (p: Page) => {
  await p.goto('./');
  await p.getByTestId('editor').click();
  await p.getByTestId('kb-toggle').tap();
  await expect(p.getByTestId('osk')).toBeVisible();
  await p.getByTestId('editor').click();
};

test.describe('phone', () => {
  test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('hold the left ↵: ১২৩ numpad with all signs; ½ makes a Bangla fraction; অআ back', async ({ page }) => {
    await open(page);
    await choosePad(page, '#Sym', '১২৩');
    for (const c of ['Np2', '#Space', 'Np1', 'Txt:/', 'Np2', '#Frac']) await tap(page, c);
    // ২ ½ with Bangla digits: numerator raised, denominator lowered around ⁄
    const h = await html(page);
    expect(h).toContain('<sup>১</sup>⁄<sub>২</sub>');
    expect(await text(page)).toBe('২১⁄২');
    for (const c of ['#Space', 'Txt:≤', 'Txt:≥', 'Txt:≠', 'Txt:±', 'Txt:৳', 'Np5']) await tap(page, c);
    expect(await text(page)).toBe('২১⁄২ ≤≥≠±৳৫');
    await tap(page, '#Pad'); // অআ
    await expect(key(page, 'KeyK')).toBeVisible();
    // a tap on ১২৩ still opens the marks
    await tap(page, '#Sym');
    await expect(key(page, 'Alt+Digit5')).toBeVisible();
  });

  test('123 types English digits and ready-made fractions; ৴৵৶ types 1–16 annas', async ({ page }) => {
    await open(page);
    await choosePad(page, '#Sym', '123');
    for (const c of ['Np3', 'Txt:/', 'Np4', '#Frac', '#Space']) await tap(page, c);
    expect(await text(page)).toBe('¾ ');
    await tap(page, '#Pad');
    await choosePad(page, '#Sym', '৴৵৶');
    await expect(key(page, 'Anna:16')).toBeVisible();
    for (const c of ['Anna:4', 'Anna:8', 'Anna:12', 'Anna:15', 'Txt:৻', 'Anna:16']) await tap(page, c);
    expect(await text(page)).toBe('¾ ৷৹৷৷৹৸৸৶৻১৲');
  });

  test('the keyboard keeps its place while typing (the suggestion row no longer comes and goes)', async ({ page }) => {
    await open(page);
    const top = async () => (await page.getByTestId('osk').boundingBox())!.y;
    const t0 = await top();
    for (const c of ['KeyK', 'KeyM', '#Space', 'KeyR', '#Space']) {
      await tap(page, c);
      expect(Math.abs((await top()) - t0)).toBeLessThan(1);
    }
  });
});

test.describe('iPad', () => {
  test.use({ viewport: ipad.viewport, userAgent: ipad.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('#Pad key: a tap opens the last keypad, a long-press offers all three', async ({ page }) => {
    await open(page);
    await expect(key(page, '#Pad')).toHaveText('১২৩');
    await choosePad(page, '#Pad', '৴৵৶');
    await tap(page, 'Anna:5');
    await tap(page, '#Pad');
    await expect(key(page, '#Pad')).toHaveText('৴৵৶'); // remembered
    await tap(page, '#Pad');
    await expect(key(page, 'Anna:1')).toBeVisible();
    expect(await text(page)).toBe('৷৴');
  });

  test('split: each half half as wide, at the edges', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pronotes.kb.mode', '"split"'));
    await open(page);
    const row = page.getByTestId('osk').locator('.kb-row.split').nth(1);
    const halves = await row.locator('.half').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, w: r.width })));
    const vw = ipad.viewport.width;
    // at the screen's edges, where the thumbs are (even with the drafts list open beside the page)
    expect(halves[0].x).toBeLessThan(12);
    expect(halves[1].x + halves[1].w).toBeGreaterThan(vw - 12);
    expect(halves[0].w).toBeLessThan(vw * 0.22);
    expect(halves[0].w).toBeGreaterThan(vw * 0.15);
  });
});
