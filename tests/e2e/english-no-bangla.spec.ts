import { test, expect, type Page } from '@playwright/test';
import { section } from './settings-tab';

const BN = /[ঀ-৿]+/g;

/** Every Bangla letter or digit on screen, outside the user's own text (the page, the title, the on-screen keyboard). */
async function banglaOnScreen(page: Page): Promise<string[]> {
  return page.evaluate((src) => {
    const re = new RegExp(src, 'g');
    const skip = (el: Element | null) => !!el?.closest('.page-body, .osk, [data-testid="osk"], [data-testid="title"], .kb, .chart-preview, .font-sample, .quote-list');
    const found: string[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (!el || skip(el) || !(el as HTMLElement).offsetParent && getComputedStyle(el).position !== 'fixed') continue;
      const m = n.textContent?.match(re);
      if (m) found.push(...m.map((x) => x + '  ← ' + (n!.textContent ?? '').trim().slice(0, 60)));
    }
    // labels a screen reader or a tooltip shows
    for (const el of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
      if (skip(el)) continue;
      for (const a of ['aria-label', 'title', 'placeholder']) {
        const v = el.getAttribute(a);
        if (v && re.test(v)) found.push(a + ': ' + v.slice(0, 60));
        re.lastIndex = 0;
      }
    }
    // options of the boxes in view
    for (const o of document.querySelectorAll('select option')) {
      if (skip(o)) continue;
      const v = o.textContent ?? '';
      if (re.test(v)) found.push('option: ' + v.slice(0, 60));
      re.lastIndex = 0;
    }
    return [...new Set(found)];
  }, BN.source);
}

test('English menu: not one Bangla letter or digit in Settings (every tab, every ⓘ) or around the page', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({ json: { models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] }] } }));
  await page.goto('./');
  await expect(page.getByTestId('editor')).toBeVisible();
  await section(page, 'app');
  await page.getByTestId('ui-en').click();
  await expect(page.getByTestId('tab-home')).toHaveText('Home');

  const leaks: string[] = [];
  const look = async (where: string) => { for (const x of await banglaOnScreen(page)) leaks.push(where + ' · ' + x); };
  await page.getByTestId('settings-close').click();
  await look('page');
  // every ribbon tab of a legal draft, and the share menu
  await page.getByTestId('pstyle').selectOption('numbered').catch(() => {});
  for (const id of ['home', 'insert', 'page', 'view', 'tools']) {
    const tabBtn = page.getByTestId('tab-' + id);
    if (!(await tabBtn.count())) continue;
    await tabBtn.click();
    await look('ribbon/' + id);
  }
  await page.getByTestId('tab-home').click();
  await page.getByTestId('share').click();
  await look('share menu');
  await page.keyboard.press('Escape');
  await page.getByTestId('share').click({ trial: true }).catch(() => {});
  // the law dictionary and the Apps list
  await page.getByTestId('craft-toggle').click();
  await look('apps');
  await page.getByTestId('craft-dictionary').click();
  await look('law dictionary');
  await page.getByTestId('dict-menu').click();
  await look('dictionary menu');
  await page.getByTestId('dict-menu').click();
  await page.getByTestId('dict-close').click();
  // a title chart with one step of each kind (the chart itself is the user's Bangla text)
  await page.getByTestId('new-doc').click();
  await page.getByTestId('new-chart').click();
  for (const k of ['record', 'inheritance', 'deed', 'merge', 'note']) await page.getByTestId('add-' + k).click();
  await look('title chart');

  for (const tab of ['type', 'voice', 'font', 'words', 'app'] as const) {
    await section(page, tab);
    // open every ⓘ and fold-out
    const closed = page.locator('.settings details:not([open]) > summary:visible');
    while (await closed.count()) await closed.first().click();
    for (const b of await page.locator('.settings [data-testid="info"]:visible').all()) await b.click();
    await look('settings/' + tab);
    if (tab === 'voice') {
      await page.getByTestId('ai-key-in').fill('AIzaTEST1234');
      await page.getByTestId('ai-key-save').click();
      await expect(page.getByTestId('ai-key-status')).toContainText('2 models');
      for (const b of await page.locator('.settings [data-testid="info"]:not(.on):visible').all()) await b.click();
      await look('settings/voice with key');
    }
  }
  expect(leaks).toEqual([]);
});
