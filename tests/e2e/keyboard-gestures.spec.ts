import { test, expect, devices, type Page } from '@playwright/test';

// The on-screen keyboard's gestures, done with a real pointer path (down → move → up), on a phone and an iPad.
const iphone = devices['iPhone 13'];
const ipad = devices['iPad Pro 11 landscape'];

const key = (p: Page, code: string) => p.locator(`[data-testid=osk] [data-code="${code}"]`);
const text = async (p: Page) => (await p.getByTestId('editor').locator('p').first().innerText()).replace(/\n$/, '');
const center = async (p: Page, code: string) => { const b = (await key(p, code).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const tap = async (p: Page, code: string) => { const c = await center(p, code); await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.up(); };
/** Finger down on a key, moved by (dx, dy) in steps, then (after `hold` ms) lifted. */
const drag = async (p: Page, code: string, dx: number, dy: number, hold = 0, wait = 0) => {
  const c = await center(p, code);
  await p.mouse.move(c.x, c.y);
  await p.mouse.down();
  if (wait) await p.waitForTimeout(wait);
  await p.mouse.move(c.x + dx, c.y + dy, { steps: 8 });
  if (hold) await p.waitForTimeout(hold);
  await p.mouse.up();
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

  test('flick down = Shift character; long-press = choices; two spaces = "। "', async ({ page }) => {
    await open(page);
    // one character per key now (decisions.md 76): K's Shift character is খ
    const shiftK = 'খ';
    await drag(page, 'KeyK', 0, 30);
    expect(await text(page)).toBe(shiftK);
    // long-press ৫: its choices pop up; slide to ৷৴ and lift
    const c = await center(page, 'Digit5');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await expect(page.getByTestId('kb-pop')).toBeVisible();
    const opts = await page.getByTestId('kb-pop').locator('span').allInnerTexts();
    const i = opts.indexOf('৷৴');
    expect(i).toBeGreaterThan(0);
    const w = (await page.getByTestId('kb-pop').locator('span').first().boundingBox())!;
    const target = (await page.getByTestId('kb-pop').locator('span').nth(i).boundingBox())!;
    await page.mouse.move(target.x + target.width / 2, c.y, { steps: 5 });
    await page.mouse.up();
    expect(w.width).toBeGreaterThan(20);
    expect(await text(page)).toBe(shiftK + '৷৴');
    // a word, then two spaces
    await tap(page, 'KeyK');
    await tap(page, '#Space');
    await tap(page, '#Space');
    expect(await text(page)).toMatch(/। ?$/);
  });

  test('space drag moves the caret; ⌫ swiped left deletes the word', async ({ page }) => {
    await open(page);
    for (const k of ['KeyK', 'KeyM', 'KeyR']) await tap(page, k);
    const word = await text(page);
    await tap(page, '#Space');
    for (const k of ['KeyK', 'KeyM']) await tap(page, k);
    // ⌫ swiped left: "কম" goes, the space stays… then the next swipe takes the space and the word before
    await drag(page, '#Back', -60, 0);
    expect(await text(page)).toBe(word + ' ');
    await drag(page, '#Back', -60, 0);
    expect(await text(page)).toBe('');
    // the trackpad: type three letters, drag the space left by two steps, type one more → it lands inside
    for (const k of ['KeyK', 'KeyM', 'KeyR']) await tap(page, k);
    await drag(page, '#Space', -20, 0, 50);
    await tap(page, 'KeyL');
    const t = await text(page);
    expect(t.length).toBe(4);
    expect(t.endsWith(word.slice(-1))).toBe(true); // the last letter is still last: the new one went inside
    // ⇧ then space drag = select: two characters back are selected, the next key replaces them
    await page.getByTestId('editor').press('End');
    await tap(page, '#Shift');
    await drag(page, '#Space', -20, 0, 50);
    expect(await page.evaluate(() => window.getSelection()?.toString().length)).toBe(2);
    await tap(page, 'KeyK');
    expect((await text(page)).length).toBe(3);
  });

  test('flick the left ↵ up to #+=, slide to a sign and lift: the sign, then back to the letters', async ({ page }) => {
    await open(page);
    const s = await center(page, '#EnterL');
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.mouse.move(s.x, s.y - 40, { steps: 4 });
    await expect(key(page, 'Alt+Digit5')).toBeVisible();
    const d = await center(page, 'Alt+Digit5');
    await page.mouse.move(d.x, d.y, { steps: 6 });
    await page.mouse.up();
    expect(await text(page)).toBe('৷৴');
    await expect(key(page, 'KeyK')).toBeVisible(); // letters again
    // flicked up and lifted on ↵ itself: the layer stays open; 16 annas and ৸ beside - = [ ]
    await drag(page, '#EnterL', 0, -40);
    await tap(page, 'Alt+Equal');
    await tap(page, 'Alt+Minus');
    expect(await text(page)).toBe('৷৴১৲৸');
    // a plain tap on either ↵ is Enter
    await drag(page, '#EnterL', 0, -40); // back to the letters
    await tap(page, '#EnterL');
    await tap(page, '#Enter');
    expect(await page.getByTestId('editor').locator('p').count()).toBe(3);
  });

  test('hold the right ↵: line break, Tab or a new page', async ({ page }) => {
    await open(page);
    await tap(page, 'KeyK');
    const e = await center(page, '#Enter');
    await page.mouse.move(e.x, e.y);
    await page.mouse.down();
    await expect(page.getByTestId('kb-enter-menu')).toBeVisible({ timeout: 2000 });
    await page.mouse.up(); // lifted on the first one: line break
    await expect(page.getByTestId('editor').locator('p').first().locator('br:not(.ProseMirror-trailingBreak)')).toHaveCount(1);
    expect(await page.getByTestId('editor').locator('p').count()).toBe(1);
  });

  test('long-press the language key: one-handed keyboard, and back', async ({ page }) => {
    await open(page);
    const osk = page.getByTestId('osk');
    const vw = iphone.viewport.width;
    await drag(page, '#Globe', 0, 0, 0, 650);
    await page.getByTestId('kb-hand-left').click();
    await expect(osk).toHaveClass(/hand-left/);
    const q = (await key(page, 'KeyQ').boundingBox())!;
    expect(q.x).toBeLessThan(10);
    expect((await key(page, 'KeyP').boundingBox())!.x + 40).toBeLessThan(vw * 0.9);
    expect(await page.evaluate(() => localStorage.getItem('pronotes.kb.hand'))).toBe('"left"');
    await page.getByTestId('kb-hand-strip').getByRole('button').first().click();
    await expect(osk).not.toHaveClass(/hand-/);
    // a short tap on 🌐 switches the language; the space bar names it, as on iOS
    await expect(key(page, '#Space')).toHaveText('বাংলা');
    await tap(page, '#Globe');
    await expect(key(page, '#Space')).toHaveText('English');
  });
});

test.describe('iPad', () => {
  test.use({ viewport: ipad.viewport, userAgent: ipad.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('anna-ganda signs: corner hints, Alt + number row', async ({ page }) => {
    await open(page);
    await expect(key(page, 'Digit5').locator('.a')).toHaveText('৷৴');
    await expect(key(page, 'Equal').locator('.a')).toHaveText('১৲');
    await tap(page, '#Alt');
    await tap(page, 'Digit9');
    await tap(page, '#Alt');
    await tap(page, 'Digit0');
    expect(await text(page)).toBe('৷৷৴৹');
  });

  test('floating keyboard: long-press the language key, drag it, put it back', async ({ page }) => {
    await open(page);
    await drag(page, '#Mode', 0, 0, 0, 650);
    await page.getByTestId('kb-float').click();
    const fl = page.getByTestId('kb-floating');
    await expect(fl).toBeVisible();
    const b0 = (await fl.boundingBox())!;
    expect(b0.width).toBeLessThan(380); // phone-sized
    const bar = (await page.getByTestId('kb-float-bar').boundingBox())!;
    await page.mouse.move(bar.x + 20, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x - 300, bar.y - 200, { steps: 8 });
    await page.mouse.up();
    const b1 = (await fl.boundingBox())!;
    expect(b1.x).toBeLessThan(b0.x - 200);
    // it still types
    await tap(page, 'KeyK');
    expect((await text(page)).length).toBe(1);
    await page.getByTestId('kb-dock').click();
    await expect(fl).toHaveCount(0);
    await expect(page.getByTestId('osk')).toBeVisible();
  });
});
