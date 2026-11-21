import { test, expect } from '@playwright/test';
import { section } from './settings-tab';

// decisions.md 90: font samples are verses and hadith; editable; held = whole text and source
test('samples: the English draft font in English, Bangla app font in Bangla; held, the source', async ({ page }) => {
  await page.goto('./');
  await section(page, 'font');
  const en = page.getByTestId('fmt-font-en-sample');
  await expect(en).toBeVisible();
  expect(await en.textContent()).toMatch(/^[A-Za-z ,;'?]+/);
  const bn = page.getByTestId('fmt-font-sample');
  await expect(bn).toContainText(/[ঀ-৿]/);
  // held: the whole text and its source
  await bn.dispatchEvent('pointerdown');
  await page.waitForTimeout(650);
  await bn.dispatchEvent('pointerup');
  await expect(page.getByTestId('fmt-font-sample-full')).toBeVisible();
  await expect(page.getByTestId('fmt-font-sample-full').locator('.fs-src')).toContainText(/আল-কুরআন|সহীহ|জামে/);
});

test('one quote for all fonts, an edited quote shows at once, and back to the list', async ({ page }) => {
  await page.goto('./');
  await section(page, 'font');
  await page.getByTestId('font-quotes-fold').click();
  await page.getByTestId('quote-mode-one').click();
  await expect(page.getByTestId('fmt-font-sample')).toContainText('আল্লাহ ছাড়া কোন মাবুদ নাই'.normalize('NFC').replace(/ড়/g, 'ড়'));
  await page.getByTestId('quote-bn-0').fill('পরীক্ষার লেখা');
  await page.getByTestId('quote-en-0').fill('');
  await expect(page.getByTestId('fmt-font-sample')).toContainText('পরীক্ষার লেখা');
  await expect(page.getByTestId('fmt-font-en-sample')).toContainText('Aa Bb 123');
  await page.reload();
  await section(page, 'font');
  await expect(page.getByTestId('fmt-font-sample')).toContainText('পরীক্ষার লেখা');
  if ((await page.getByTestId('font-quotes-fold').getAttribute('aria-expanded')) === 'false') await page.getByTestId('font-quotes-fold').click();
  await page.getByTestId('quote-reset').click();
  await page.getByTestId('quote-reset').click();
  await expect(page.getByTestId('fmt-font-en-sample')).toContainText('There is no god but Allah');
});

test('English menu: samples stay Bangla, the source is English', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pronotes.uiLang', '"en"'));
  await page.goto('./');
  await section(page, 'font');
  const bn = page.getByTestId('fmt-font-sample');
  await expect(bn).toContainText(/[ঀ-৿]/);
  await bn.dispatchEvent('pointerdown');
  await page.waitForTimeout(650);
  await bn.dispatchEvent('pointerup');
  await expect(page.getByTestId('fmt-font-sample-full').locator('.fs-src')).toContainText(/Quran|Bukhari|Muslim|Tirmidhi/);
});
