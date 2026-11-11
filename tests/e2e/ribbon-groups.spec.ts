/**
 * docs/ribbon-plan.md: the ribbon is regrouped, but no tool may be lost. Every control listed in
 * the plan must be reachable in its tab, on a wide ribbon (iPad landscape) and a narrow one
 * (iPad portrait), either in the row or inside "⋯".
 */
import { test, expect, type Page } from '@playwright/test';

const editor = (p: Page) => p.getByTestId('editor');

const HOME_FRONT = ['pstyle', 'font', 'size', 'grow', 'shrink', 'bold', 'italic', 'underline', 'color', 'highlight', 'align', 'line', 'outdent', 'indent', 'more'];
const HOME_MORE_OR_FRONT = ['strike', 'sup', 'sub', 'case', 'clear-format', 'font-panel', 'sp-before', 'sp-after', 'marks', 'para-panel', 'painter', 'select-all'];
const HOME_IN_MORE = ['find-open', 'replace-open'];
const LEGAL_TABS: Record<string, string[]> = {
  insert: ['table-add', 'page-break', 'symbols', 'date'],
  page: ['paper', 'portrait', 'landscape', 'text-dir', 'margins', 'doc-lang', 'page-numbers', 'page-setup'],
  view: ['layout-print', 'layout-web', 'ruler-toggle', 'grid-toggle', 'grid-opts', 'zoom-out', 'zoom', 'zoom-in', 'zoom-100'],
  tools: ['tools-find', 'word-count', 'bijoy-toggle', 'ai', 'tools-dictionary'],
};

async function openLegal(page: Page) {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await page.getByTestId('new-doc').click();
  await page.getByTestId('new-legal').click();
  await expect(page.locator('.page.note')).toHaveCount(0);
  await editor(page).click();
}

/** The tool as a button of the row itself (not a button inside an open drop-down). */
const inRow = (page: Page, id: string) => page.locator(`.rgroup-items > [data-testid="${id}"]`);

async function reachable(page: Page, id: string) {
  const row = inRow(page, id).first();
  if (await row.isVisible()) return 'row';
  if (!(await page.getByTestId('more-menu').isVisible())) await page.getByTestId('more').click();
  await expect(page.getByTestId('more-menu').getByTestId(id), id).toBeVisible();
  return 'more';
}

for (const [name, size] of [['iPad landscape', { width: 1366, height: 1024 }], ['iPad portrait', { width: 820, height: 1180 }]] as const) {
  test(`no tool is lost after regrouping (${name})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 1024 } });
    const page = await ctx.newPage();
    await openLegal(page);
    await page.setViewportSize(size);
    // on a narrow screen the document list becomes a drawer: close it by tapping beside it
    const drawer = page.locator('.drawer');
    if (await drawer.isVisible()) await drawer.click({ position: { x: size.width - 20, y: size.height / 2 } });
    await expect(drawer).toHaveCount(0);

    await page.getByTestId('tab-home').click();
    for (const id of HOME_FRONT) await expect(inRow(page, id).first(), id).toBeVisible();
    for (const id of HOME_MORE_OR_FRONT) await reachable(page, id);
    // find / replace: one front place only (Tools); on Home they live in "⋯"
    for (const id of HOME_IN_MORE) {
      await expect(inRow(page, id)).toHaveCount(0);
      expect(await reachable(page, id)).toBe('more');
    }
    await page.keyboard.press('Escape');

    for (const [tab, ids] of Object.entries(LEGAL_TABS)) {
      await page.getByTestId('tab-' + tab).click();
      for (const id of ids) await expect(inRow(page, id).first(), `${tab}: ${id}`).toBeVisible();
    }
    // the groups carry names for screen readers
    await page.getByTestId('tab-home').click();
    expect(await page.locator('.ribbon-row [role="group"]').evaluateAll((g) => g.map((x) => x.getAttribute('aria-label')))).toEqual(['স্টাইল', 'ফন্ট', 'অনুচ্ছেদ', 'সম্পাদনা']);
    // nothing makes the page scroll sideways
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await ctx.close();
  });
}

test('Tools: the law dictionary button opens the dictionary', async ({ page }) => {
  await openLegal(page);
  await page.getByTestId('tab-tools').click();
  await page.getByTestId('tools-dictionary').click();
  await expect(page.getByTestId('law-dictionary-toggle')).toHaveClass(/\bon\b/);
});

test('the ribbon is translucent glass, the page stays solid', async ({ page }) => {
  await openLegal(page);
  const bg = await page.locator('.ribbon').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toMatch(/rgba\(.+, 0\.\d+\)/);
  const blur = await page.locator('.ribbon').evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(blur).toContain('blur');
  const pageBg = await page.locator('.page').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(pageBg).not.toMatch(/rgba\(.+, 0\.\d+\)/);
});
