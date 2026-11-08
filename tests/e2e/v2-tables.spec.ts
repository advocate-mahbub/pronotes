import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs';

const editor = (p: Page) => p.getByTestId('editor');

async function start(page: Page) {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
}
const paste = (page: Page, html: string) =>
  page.evaluate((h) => {
    const el = document.querySelector('[data-testid="editor"] [contenteditable]') ?? document.querySelector('[contenteditable]')!;
    const dt = new DataTransfer();
    dt.setData('text/html', h);
    dt.setData('text/plain', h.replace(/<[^>]+>/g, '\n'));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, html);
const cellTexts = (page: Page) => editor(page).locator('table tr').evaluateAll((rows) => rows.map((r) => Array.from(r.children).map((c) => c.textContent)));

test('insert grid: tap 3×4, design and layout tabs appear only inside the table', async ({ page }) => {
  await start(page);
  await page.getByTestId('tab-insert').click();
  await page.getByTestId('table-grid').click();
  await page.getByTestId('tg-3-4').click();
  await expect(editor(page).locator('table tr')).toHaveCount(3);
  await expect(editor(page).locator('table tr').first().locator('td')).toHaveCount(4);
  await expect(page.getByTestId('tab-tdesign')).toBeVisible();
  await page.getByTestId('tab-table').click();
  await page.getByTestId('row-add-above').click();
  await page.getByTestId('col-add-left').click();
  await expect(editor(page).locator('table tr')).toHaveCount(4);
  await expect(editor(page).locator('table tr').first().locator('td')).toHaveCount(5);
  await page.getByTestId('tdel').click();
  await page.getByTestId('table-del').click();
  await expect(editor(page).locator('table')).toHaveCount(0);
  await expect(page.getByTestId('tab-tdesign')).toHaveCount(0);
});

test('text to table, sort Bangla numbers, Σ sum into a total row, table back to text', async ({ page }) => {
  await start(page);
  await paste(page, '<p>ক | ১০</p><p>খ | ২</p><p>গ | ৩৩</p>');
  await page.keyboard.press('ControlOrMeta+A');
  await page.getByTestId('tab-insert').click();
  await page.getByTestId('table-grid').click();
  await page.getByTestId('text-to-table').click();
  await page.getByTestId('tt-header').uncheck();
  await page.getByTestId('tt-ok').click();
  await expect.poll(() => cellTexts(page)).toEqual([['ক', '১০'], ['খ', '২'], ['গ', '৩৩']]);

  await editor(page).locator('table td').nth(1).click();
  await page.getByTestId('tab-table').click();
  await page.getByTestId('tsort').click();
  await page.getByTestId('sort-col').selectOption('1');
  await page.getByTestId('sort-dir').selectOption('desc');
  await page.getByTestId('sort-ok').click();
  await expect.poll(() => cellTexts(page)).toEqual([['গ', '৩৩'], ['ক', '১০'], ['খ', '২']]);

  await editor(page).locator('table td').nth(1).click();
  await page.getByTestId('tsum').click();
  await expect.poll(() => cellTexts(page)).toEqual([['গ', '৩৩'], ['ক', '১০'], ['খ', '২'], ['মোট', '৪৫']]);
  await expect(editor(page).locator('table')).toHaveAttribute('data-total', 'true');

  await page.getByTestId('table-to-text').click();
  await expect(editor(page).locator('table')).toHaveCount(0);
  await expect(editor(page).locator('p').first()).toHaveText('গ\t৩৩');
  // one undo (the ribbon's ↶, as on iPad) brings the table back
  await page.getByTestId('tab-home').click();
  await page.getByTestId('undo').click();
  await expect(editor(page).locator('table')).toHaveCount(1);
});

test('quick table + design/layout options reach the .docx file', async ({ page }) => {
  await start(page);
  await page.getByTestId('tab-insert').click();
  await page.getByTestId('table-grid').click();
  await page.getByTestId('qt-costs').click();
  const tbl = editor(page).locator('table');
  await expect(tbl.locator('tr')).toHaveCount(6); // header + 4 + total
  await expect(tbl.locator('tr').first()).toHaveAttribute('data-repeat', 'true');
  await expect(tbl.locator('tr').last().locator('td').first()).toHaveText('মোট');

  // design: style, borders, shading
  await tbl.locator('td').nth(1).click();
  await page.getByTestId('tab-tdesign').click();
  await page.getByTestId('tstyle').click();
  await page.getByTestId('tstyle-shade').click();
  await expect(tbl).toHaveAttribute('data-tstyle', 'shade');
  await page.getByTestId('borders').click();
  await page.getByTestId('tb-outer').click();
  await page.getByTestId('tl-double').click();
  await page.keyboard.press('Escape');
  await expect(tbl).toHaveAttribute('data-borders', 'outer');
  await expect(tbl).toHaveAttribute('data-line', 'double');
  await tbl.locator('td').nth(1).click();
  await page.getByTestId('shading').click();
  await page.getByTestId('shade-fff2cc').click();
  await expect(tbl.locator('td').nth(1)).toHaveAttribute('data-bg', '#fff2cc');

  // layout: alignment, row keep, column width, table position
  await page.getByTestId('tab-table').click();
  await page.getByTestId('talign').click();
  await page.getByTestId('al-middle-center').click();
  await expect(tbl.locator('td').nth(1)).toHaveAttribute('data-valign', 'middle');
  await expect(tbl.locator('td').nth(1).locator('p')).toHaveCSS('text-align', 'center');
  await page.getByTestId('row-keep').click();
  await page.getByTestId('tsize').click();
  await page.getByTestId('ts-col').fill('5');
  await page.getByTestId('ts-col-ok').click();
  await page.keyboard.press('Escape');
  await expect(tbl).toHaveAttribute('data-fit', 'fixed');
  await page.getByTestId('talign').click();
  await page.getByTestId('tpos-center').click();
  await page.keyboard.press('Escape');
  await expect(tbl).toHaveAttribute('data-talign', 'center');

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('share').click().then(() => page.getByTestId('save-docx').click())]);
  const zip = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  const x = await zip.file('word/document.xml')!.async('string');
  expect(x).toContain('<w:tblHeader/>');
  expect(x).toContain('<w:cantSplit/>');
  expect(x).toContain('w:fill="FFF2CC"');
  expect(x).toContain('w:fill="D9D9D9"');
  expect(x).toContain('<w:vAlign w:val="center"/>');
  expect(x).toMatch(/<w:tblBorders><w:top w:val="double"/);
  expect(x).toMatch(/<w:insideH w:val="none"/);
  expect(x).toContain('<w:gridCol w:w="2835"/>'); // 5 cm
  expect(x).toMatch(/<w:tblPr>[\s\S]*?<w:jc w:val="center"\/>/);
});

test('merge, split and split table; header repeat toggle', async ({ page }) => {
  await start(page);
  await page.getByTestId('tab-insert').click();
  await page.getByTestId('table-grid').click();
  await page.getByTestId('table-insert-dialog').click();
  await page.getByTestId('ti-rows').fill('4');
  await page.getByTestId('ti-cols').fill('2');
  await page.getByTestId('ti-ok').click();
  const tbl = editor(page).locator('table');
  await expect(tbl.locator('tr')).toHaveCount(4);
  await expect(tbl.locator('tr').first().locator('th')).toHaveCount(2);

  await tbl.locator('th').first().click();
  await page.getByTestId('tab-table').click();
  await expect(page.getByTestId('row-repeat')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('row-repeat').click();
  await expect(tbl.locator('tr').first()).toHaveAttribute('data-repeat', 'false');
  await expect(page.getByTestId('row-repeat')).toHaveAttribute('aria-pressed', 'false');

  // select the row, merge, then split back
  await tbl.locator('tr').nth(1).locator('td').first().click();
  await page.getByTestId('tsel').click();
  await page.getByTestId('sel-row').click();
  await page.getByTestId('merge').click();
  await expect(tbl.locator('tr').nth(1).locator('td')).toHaveCount(1);
  await expect(tbl.locator('tr').nth(1).locator('td')).toHaveAttribute('colspan', '2');
  await page.getByTestId('split').click();
  await expect(tbl.locator('tr').nth(1).locator('td')).toHaveCount(2);

  await tbl.locator('tr').nth(2).locator('td').first().click();
  await page.getByTestId('split-table').click();
  await expect(editor(page).locator('table')).toHaveCount(2);
  await expect(editor(page).locator('table').first().locator('tr')).toHaveCount(2);
});
