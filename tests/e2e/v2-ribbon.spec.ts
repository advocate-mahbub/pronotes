import { test, expect, type Page } from '@playwright/test';

const editor = (p: Page) => p.getByTestId('editor');
const typeKeys = async (p: Page, keys: string[]) => { for (const k of keys) await p.keyboard.press(k); };
async function start(page: Page) {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
}
/** Click a Home tool; when the ribbon is narrow it sits in the ⋯ menu. */
async function tool(page: Page, id: string) {
  const direct = page.locator('.ribbon-row').getByTestId(id).first();
  if (await direct.isVisible()) return direct.click();
  if (!(await page.getByTestId('more-menu').isVisible())) await page.getByTestId('more').click();
  await page.getByTestId('more-menu').getByTestId(id).click();
}
/** Select the whole first paragraph. */
async function selectFirstPara(page: Page) {
  await editor(page).locator('p').first().click({ clickCount: 3 });
}

test('home tab: bold, italic, strike, superscript, colour, size, font, alignment, line spacing, indent', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK', 'KeyM', 'KeyR']); // কমর
  await selectFirstPara(page);
  await page.getByTestId('bold').click();
  await page.getByTestId('italic').click();
  await expect(editor(page).locator('strong em, em strong')).toHaveText('কমর');
  await expect(page.getByTestId('bold')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('size').fill('20');
  await page.getByTestId('size').press('Enter');
  await expect(editor(page).locator('span[style*="font-size: 20pt"]')).toHaveText('কমর');
  await page.getByTestId('grow').click();
  await expect(editor(page).locator('span[style*="font-size: 22pt"]')).toHaveText('কমর');
  await page.getByTestId('font').selectOption('Kalpurush');
  await expect(editor(page).locator('span[style*="Kalpurush"]')).toHaveText('কমর');
  await page.getByTestId('align').selectOption('center');
  await page.getByTestId('line').selectOption('2');
  await page.getByTestId('indent').click();
  const p = editor(page).locator('p').first();
  await expect(p).toHaveCSS('text-align', 'center');
  await expect(p).toHaveAttribute('data-lineval', '2');
  await expect(p).toHaveAttribute('data-indl', '720');
  await page.getByTestId('outdent').click();
  await expect(p).not.toHaveAttribute('data-indl', /.*/);
  // secondary tools: wide screen shows them in the row
  await tool(page, 'strike');
  await expect(editor(page).locator('s')).toHaveText('কমর');
  await tool(page, 'sup');
  await expect(editor(page).locator('sup')).toHaveText('কমর');
  await tool(page, 'color');
  await page.getByTestId('color-menu').locator('.sw').nth(2).click();
  await expect(editor(page).locator('span[style*="color"]').first()).toBeVisible();
  await tool(page, 'clear-format');
  await expect(editor(page).locator('p').first().locator('strong, em, s, sup, span[style]')).toHaveCount(0);
  await expect(p).not.toHaveAttribute('style', /text-align/);
});

test('narrow ribbon (iPad portrait) moves less-used tools into ⋯', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  const page = await ctx.newPage();
  await start(page);
  await expect(page.getByTestId('strike')).toBeHidden();
  await page.getByTestId('more').click();
  await expect(page.getByTestId('more-menu').getByTestId('strike')).toBeVisible();
  // the tab bar and the tool row fit without the page scrolling sideways
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await ctx.close();
});

test('font panel: character scale, spacing, position, underline style', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK', 'KeyM', 'KeyR']);
  await selectFirstPara(page);
  await tool(page, 'font-panel');
  await page.getByTestId('f-scale').fill('150');
  await page.getByTestId('f-sptype').selectOption('expanded');
  await page.getByTestId('f-spby').fill('2');
  await page.getByTestId('f-postype').selectOption('raised');
  await page.getByTestId('f-posby').fill('3');
  await page.getByTestId('f-ustyle').selectOption('double');
  await page.getByTestId('font-apply').click();
  const span = editor(page).locator('span[data-scale]');
  await expect(span).toHaveAttribute('data-scale', '150');
  await expect(span).toHaveAttribute('data-spacing', '2');
  await expect(span).toHaveAttribute('data-position', '3');
  await expect(span).toHaveCSS('letter-spacing', '2.66667px');
  await expect(editor(page).locator('u[data-ustyle="double"]')).toHaveCount(1);
  // reopening shows the current values
  await tool(page, 'font-panel');
  await expect(page.getByTestId('f-scale')).toHaveValue('150');
  await expect(page.getByTestId('f-sptype')).toHaveValue('expanded');
});

test('paragraph panel: indents, hanging, exact line spacing, keep with next', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK', 'KeyM', 'KeyR']);
  await tool(page, 'para-panel');
  await page.getByTestId('p-indl').fill('2');
  await page.getByTestId('p-special').selectOption('hanging');
  await page.getByTestId('p-by').fill('1');
  await page.getByTestId('p-line').selectOption('exact');
  await page.getByTestId('p-lineat').fill('18');
  await page.getByTestId('p-before').fill('6');
  await page.getByTestId('p-keepnext').check();
  await page.getByTestId('para-apply').click();
  const p = editor(page).locator('p').first();
  await expect(p).toHaveAttribute('data-indl', '1134');
  await expect(p).toHaveAttribute('data-first', '-567');
  await expect(p).toHaveAttribute('data-linerule', 'exact');
  await expect(p).toHaveAttribute('data-keepnext', 'true');
  await expect(p).toHaveCSS('line-height', '24px');
  await expect(p).toHaveCSS('margin-top', '8px');
  await expect(p).toHaveCSS('margin-left', '75.6px');
  await expect(p).toHaveCSS('text-indent', '-37.8px');
});

test('find and replace (Ctrl+F / Ctrl+H); the boxes type Bangla through Bornona', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK', 'KeyM', 'KeyR', 'Space', 'KeyK', 'KeyL', 'Space', 'KeyK', 'KeyM', 'KeyR']); // কমর কল কমর
  await page.keyboard.press('Control+f');
  await expect(page.getByTestId('findbar')).toBeVisible();
  await typeKeys(page, ['KeyK', 'KeyM', 'KeyR']);
  await expect(page.getByTestId('find-q')).toHaveValue('কমর');
  await expect(page.getByTestId('find-count')).toHaveText('১/২টা');
  await expect(editor(page).locator('.find-hit')).toHaveCount(2);
  await page.getByTestId('find-next').click();
  await expect(page.getByTestId('find-count')).toHaveText('২/২টা');
  await page.getByTestId('show-replace').click();
  await page.getByTestId('replace-q').click();
  await typeKeys(page, ['KeyD', 'KeyL', 'KeyI', 'KeyL']); // দলিল
  await page.getByTestId('replace-all').click();
  await expect(editor(page).locator('p').first()).toHaveText('দলিল কল দলিল');
  await page.getByTestId('find-close').click();
  await expect(editor(page).locator('.find-hit')).toHaveCount(0);
  await page.keyboard.press('Control+h');
  await expect(page.getByTestId('replace-q')).toBeVisible();
});

test('note documents: lists, checklist, headings; kind can be changed', async ({ page }) => {
  await start(page);
  await page.getByTestId('new-doc').click();
  await page.getByTestId('new-note').click();
  await expect(page.locator('.page.note')).toBeVisible();
  await expect(page.getByTestId('sidebar').getByTestId('doc-row').first()).toHaveAttribute('data-kind', 'note');
  await expect(page.getByTestId('numbered')).toHaveCount(0);
  await editor(page).click();
  await page.getByTestId('pstyle').selectOption('h1');
  await typeKeys(page, ['KeyK', 'Enter']);
  await expect(editor(page).locator('h1')).toHaveText('ক');
  await page.getByTestId('bullets').click();
  await typeKeys(page, ['KeyM', 'Enter', 'KeyR']);
  await expect(editor(page).locator('ul li')).toHaveCount(2);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // leaves the list
  await page.getByTestId('tasks').click();
  await typeKeys(page, ['KeyL']);
  await expect(editor(page).locator('ul[data-type="taskList"] li')).toHaveCount(1);
  // typing "- " or "1. " never makes a list by itself
  await page.getByTestId('lang-toggle').click();
  await expect(page.getByTestId('lang-toggle')).toHaveText('e');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- 1. ');
  await expect(editor(page).locator('ul:not([data-type]) li')).toHaveCount(2);
  // the type changes from the draft's ⋯ menu in the ☰ list
  await page.getByTestId('sidebar').getByTestId('doc-row').first().getByTestId('doc-menu').click();
  await page.getByTestId('m-kind-legal').click();
  await expect(page.locator('.page.legal')).toBeVisible();
  await expect(page.getByTestId('numbered')).toBeVisible();
  await expect(page.getByTestId('sidebar').getByTestId('doc-row').first()).toHaveAttribute('data-kind', 'legal');
});

test('insert tab: page break, symbol, date; tools: word count', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK', 'KeyM', 'KeyR', 'Space', 'KeyK', 'KeyL']);
  await page.getByTestId('tab-insert').click();
  await page.getByTestId('symbols').click();
  await page.getByTestId('symbols-menu').getByText('৳').click();
  await page.getByTestId('page-break').click();
  await expect(editor(page).locator('.pb')).toHaveCount(1);
  await page.getByTestId('date').click();
  await page.getByTestId('date-menu').locator('button').first().click();
  await expect(editor(page).locator('p').last()).toHaveText(/^[০-৯]{2}\/[০-৯]{2}\/[০-৯]{4}$/);
  await expect(editor(page).locator('p').first()).toHaveText('কমর কল৳');
  await page.getByTestId('tab-tools').click();
  await page.getByTestId('word-count').click();
  await expect(page.getByTestId('wc-table')).toContainText('৩');
});

test('format painter, formatting marks, ribbon collapse', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK', 'KeyM', 'KeyR', 'Enter', 'KeyK', 'KeyL']);
  await selectFirstPara(page);
  await page.getByTestId('bold').click();
  await tool(page, 'painter');
  await editor(page).locator('p').nth(1).click({ clickCount: 3 });
  await expect(editor(page).locator('p').nth(1).locator('strong')).toHaveText('কল');
  await expect(page.getByTestId('painter')).toHaveAttribute('aria-pressed', 'false');
  await tool(page, 'marks');
  await expect(editor(page).locator('.fm-para')).toHaveCount(2);
  await tool(page, 'marks');
  await expect(editor(page).locator('.fm-para')).toHaveCount(0);
  await page.getByTestId('ribbon-collapse').click();
  await expect(page.getByTestId('bold')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('bold')).toHaveCount(0);
  await page.getByTestId('tab-home').click();
  await expect(page.getByTestId('bold')).toBeVisible();
});

test('title box types Bangla through Bornona (physical and on-screen keys)', async ({ page }) => {
  await start(page);
  await page.getByTestId('title').fill('');
  await page.getByTestId('title').click();
  await typeKeys(page, ['KeyK', 'KeyM', 'KeyR']);
  await expect(page.getByTestId('title')).toHaveValue('কমর');
  await page.getByTestId('kb-toggle').click();
  await page.getByTestId('title').click();
  await page.locator('.kb [data-code="KeyL"]').dispatchEvent('pointerdown');
  await expect(page.getByTestId('title')).toHaveValue('কমরল');
  await expect(editor(page).locator('p').first()).toHaveText('');
});

test('app language English ⇄ Bangla; document text and typing are not affected', async ({ page }) => {
  await start(page);
  await typeKeys(page, ['KeyK']);
  await page.getByTestId('settings').click();
  // menu language lives in the App section of Settings
  await page.locator('details', { has: page.locator(':scope > summary', { hasText: 'অ্যাপ: মেনুর ভাষা' }) }).locator(':scope > summary').click();
  await page.getByTestId('ui-en').click();
  await expect(page.getByTestId('tab-home')).toHaveText('Home');
  await expect(page.getByTestId('settings-panel')).toContainText('Keyboard and typing');
  await expect(page.getByTestId('save-status')).toHaveText(/Saved on this device|Saving…/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByTestId('settings').click();
  await editor(page).click();
  await expect(editor(page).locator('p').first()).toHaveText('ক');
  // caret after the text, wherever the click landed
  await editor(page).evaluate((el) => (el as unknown as { editor: { commands: { focus: (p: string) => void } } }).editor.commands.focus('end'));
  await typeKeys(page, ['KeyM']);
  await expect(editor(page).locator('p').first()).toHaveText('কম');
  await page.reload();
  await expect(page.getByTestId('tab-insert')).toHaveText('Insert');
  await page.getByTestId('settings').click();
  await page.locator('details', { has: page.locator(':scope > summary', { hasText: 'App: menu language' }) }).locator(':scope > summary').click();
  await page.getByTestId('ui-bn').click();
  await expect(page.getByTestId('tab-home')).toHaveText('হোম');
});

test('light/dark toggle cycles auto → light → dark and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await start(page);
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await bg();
  await page.getByTestId('theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await bg()).not.toBe(light);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('theme').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  expect(await bg()).toBe(light);
});
