import { test, expect, type Page } from '@playwright/test';

const field = (p: Page, id: string) => p.getByTestId(id);
/** Types like a person (through the Bangla layout when it is on); here plain text is inserted. */
const fill = async (p: Page, id: string, text: string) => { await field(p, id).click(); await p.keyboard.insertText(text); };

test('a title chart: written step by step, drawn as it is typed, kept after reload', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('new-doc').click();
  await page.getByTestId('new-chart').click();
  await expect(page.getByTestId('chart-ws')).toBeVisible();
  await expect(page.getByTestId('editor')).toHaveCount(0);

  await fill(page, 'chart-heading', 'বিজ্ঞ সিনিয়র সহকারী জজ আদালত');
  // CS owners
  await page.getByTestId('add-record').click();
  await fill(page, 'st0-o0-name', 'করিম');
  await page.getByTestId('st0-add').click();
  await fill(page, 'st0-o1-name', 'রহিম');
  // করিম dies: wife and son
  await page.getByTestId('add-inheritance').click();
  await fill(page, 'st1-deceased', 'করিম');
  await fill(page, 'st1-h0-rel', 'স্ত্রী');
  await fill(page, 'st1-h0-name', 'জমিলা');
  await fill(page, 'st1-h0-share', '১/৪');
  await page.getByTestId('st1-add').click();
  await fill(page, 'st1-h1-rel', 'পুত্র');
  await fill(page, 'st1-h1-name', 'আলম');
  await fill(page, 'st1-h1-share', '১/২');
  // shares do not add up: flagged under the step
  await expect(page.getByTestId('step-1')).toContainText('১ নয়');
  await field(page, 'st1-h1-share').fill('৩/৪');
  await expect(page.getByTestId('step-1')).not.toContainText('১ নয়');
  // a deed from আলম
  await page.getByTestId('add-deed').click();
  await fill(page, 'st2-no', '১২৩৪');
  await fill(page, 'st2-date', '০১/০২/১৯৯০');
  await fill(page, 'st2-area', '১০');
  await fill(page, 'st2-from0', 'আলম');
  await fill(page, 'st2-t0-name', 'হাসান');

  const preview = page.getByTestId('chart-preview');
  await expect(preview).toContainText('বিজ্ঞ সিনিয়র সহকারী জজ আদালত');
  await expect(preview).toContainText('সিএস রেকর্ডিয় মালিক');
  await expect(preview).toContainText('দলিল নং ১২৩৪');
  await expect(preview).toContainText('হাসান');
  expect(await preview.locator('svg path').count()).toBeGreaterThan(2); // lines and arrowheads

  // the ring, then reload: everything is still there
  await page.getByTestId('chart-ring').selectOption({ label: 'হাসান (দলিল)' });
  await expect(preview.locator('ellipse')).toHaveCount(1);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByTestId('chart-ws')).toBeVisible();
  await expect(page.getByTestId('chart-preview')).toContainText('দলিল নং ১২৩৪');
  await expect(page.getByTestId('chart-preview').locator('ellipse')).toHaveCount(1);
  await expect(page.getByTestId('st1-h0-name')).toHaveValue('জমিলা');
});

test('the chart prints only the chart, on Legal paper', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('new-doc').click();
  await page.getByTestId('new-chart').click();
  await page.getByTestId('add-record').click();
  await fill(page, 'st0-o0-name', 'করিম');
  await page.evaluate(() => { (window as unknown as { __printed: string }).__printed = ''; window.print = () => { (window as unknown as { __printed: string }).__printed = document.querySelector('.chart-print')?.innerHTML ?? ''; }; });
  await page.getByTestId('chart-print').click();
  const printed = await page.evaluate(() => (window as unknown as { __printed: string }).__printed);
  expect(printed).toContain('viewBox="0 0 612 1008"');
  expect(printed).toContain('করিম');
});
