import { test, expect, devices, type Page } from '@playwright/test';
import { section } from './settings-tab';

// decisions.md 85: the small fixes — ☰ without a box, a visible lit ⇧, text zoom that zooms the letters,
// own fonts folded with their count
const editor = (p: Page) => p.getByTestId('editor');

test('☰ is just the three lines: no box behind it, outside the scrolling tabs', async ({ page }) => {
  await page.goto('./');
  const start = page.getByTestId('tab-start');
  await expect(start).toBeVisible();
  const bg = await start.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el.querySelector('button')!).backgroundColor, getComputedStyle(el).boxShadow]);
  expect(bg[0]).toBe('rgba(0, 0, 0, 0)');
  expect(bg[1]).toBe('rgba(0, 0, 0, 0)');
  expect(bg[2]).toBe('none');
  // not inside the row that scrolls sideways
  expect(await start.evaluate((el) => Boolean(el.closest('.ribbon-tabs')))).toBe(false);
});

test('own font files: folded at first, the count in the title, remembered', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('settings').click();
  await page.getByTestId('stab-font').click();
  const fold = page.getByTestId('own-fonts-fold');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(fold).toContainText('(০)');
  await expect(page.getByTestId('font-add-uni-btn')).toHaveCount(0);
  await fold.click();
  await expect(page.getByTestId('font-add-uni-btn')).toBeVisible();
  await page.reload();
  await section(page, 'font');
  await expect(page.getByTestId('font-add-uni-btn')).toBeVisible();
});

test.describe('phone', () => {
  const iphone = devices['iPhone 13'];
  test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const key = (p: Page, code: string) => p.locator(`[data-testid=osk] [data-code="${code}"]`);
  const press = async (p: Page, code: string) => { await key(p, code).dispatchEvent('pointerdown'); await p.locator('[data-testid=osk]').dispatchEvent('pointerup'); };

  test('the lit ⇧ keeps its arrow readable (not gold on gold)', async ({ page }) => {
    await page.goto('./');
    await editor(page).click();
    await page.getByTestId('kb-toggle').tap();
    await expect(page.getByTestId('osk')).toBeVisible();
    await press(page, '#Shift');
    const shift = key(page, '#Shift').first();
    await expect(shift).toHaveClass(/\bon\b/);
    const [fg, other] = await shift.evaluate((el) => {
      const m = el.querySelector('.m')!;
      const kb = el.closest('.kb')!;
      const letter = kb.querySelector('[data-code="KeyA"] .m')!;
      return [getComputedStyle(m).color, getComputedStyle(letter).color];
    });
    // the letters turn to the accent while ⇧ is on; the ⇧ itself does not
    expect(fg).not.toBe(other);
  });

  test('zooming the text makes the letters bigger, not just the line gaps', async ({ page }) => {
    await page.goto('./');
    await editor(page).click();
    await page.keyboard.insertText('আমার লেখা বড় হবে');
    const measure = () => editor(page).evaluate((el) => {
      const r = document.createRange(); r.selectNodeContents(el.querySelector('p') ?? el);
      const box = r.getBoundingClientRect();
      return { w: box.width, h: box.height };
    });
    const before = await measure();
    await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('pronotes.view') || '{}'); localStorage.setItem('pronotes.view', JSON.stringify({ ...v, textZoom: 150 })); });
    await page.reload();
    // the same words again if the draft had not been saved before the reload
    if (!((await editor(page).textContent()) ?? '').includes('আমার')) { await editor(page).click(); await page.keyboard.insertText('আমার লেখা বড় হবে'); }
    await expect.poll(async () => (await measure()).w).toBeGreaterThan(before.w * 1.35);
    const after = await measure();
    expect(after.h).toBeGreaterThan(before.h * 1.35);
  });
});

test('the same font file added twice is kept once', async ({ page }) => {
  const fs = await import('node:fs');
  const serif = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
  test.skip(!fs.existsSync(serif), 'needs a local TTF file');
  await page.goto('./');
  await section(page, 'font');
  const file = { name: 'serif.ttf', mimeType: 'font/ttf', buffer: fs.readFileSync(serif) };
  await page.getByTestId('font-add-uni-file').setInputFiles(file);
  await expect(page.getByTestId('font-list').locator('li')).toHaveCount(1);
  await page.getByTestId('font-add-uni-file').setInputFiles({ ...file, name: 'serif-copy.ttf' });
  await expect(page.getByText('DejaVu Serif আগে থেকেই আছে')).toBeVisible();
  await expect(page.getByTestId('font-list').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('own-fonts-fold')).toContainText('(১)');
});
