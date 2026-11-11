import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const editor = (p: Page) => p.getByTestId('editor');
const text = (p: Page) => editor(p).locator('p').first().textContent();
const kmx = (f: string) => fs.readFileSync(new URL('../fixtures/kmx/' + f, import.meta.url));

async function section(page: Page, name: string) {
  if (!(await page.getByTestId('settings-panel').isVisible())) await page.getByTestId('settings').click();
  const d = page.locator('details', { has: page.locator('summary', { hasText: name }) });
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator('summary').click();
}
async function addLayout(page: Page, name: string, buffer: Buffer) {
  await section(page, 'কিবোর্ড ও টাইপিং');
  await page.getByTestId('layout-add-file').setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
}

test('Keyman .kmx with rules: deadkey, context and Backspace rule in the editor; kept after reload', async ({ page }) => {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await addLayout(page, 'pn_test.kmx', kmx('pn_test.kmx'));
  await expect(page.getByTestId('toast')).toContainText('PN Test');
  await expect(page.getByTestId('layout-list')).toContainText('Keyman');
  await page.getByTestId('settings').click();
  await editor(page).click();
  // f is a deadkey (nothing shows), then k gives কি; g x → গ্গ (context rule)
  for (const k of ['KeyF']) await page.keyboard.press(k);
  expect(await text(page)).toBe('');
  for (const k of ['KeyK', 'Space', 'KeyG', 'KeyX']) await page.keyboard.press(k);
  expect(await text(page)).toBe('কি গ্গ');
  // the rule 'কি' + Backspace > 'ক'
  await page.keyboard.press('Space');
  for (const k of ['KeyF', 'KeyK', 'Backspace']) await page.keyboard.press(k);
  expect(await text(page)).toBe('কি গ্গ ক');
  // Undo and Redo work on what the rules wrote (quick typing is one Undo step, as with Bornona)
  const before = await text(page);
  await page.keyboard.press('Control+z');
  expect(await text(page)).not.toBe(before);
  await page.keyboard.press('Control+Shift+z');
  expect(await text(page)).toBe(before);
  // the title box types with the same keyboard
  const title = page.getByTestId('title');
  await title.click();
  await title.fill('');
  for (const k of ['KeyF', 'KeyK']) await page.keyboard.press(k);
  await expect(title).toHaveValue('কি');
  await page.reload();
  await expect(page.getByTestId('layout')).toHaveValue(/^custom-/);
  await editor(page).click();
  await editor(page).evaluate((el) => (el as unknown as { editor: { commands: { focus: (p: string) => void } } }).editor.commands.focus('end'));
  await page.keyboard.press('KeyM');
  await expect(editor(page)).toContainText('মা');
});

test('OpenBangla .json and a "one key, one letter" .kmx become ordinary layouts', async ({ page }) => {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  const layout: Record<string, string> = {};
  // a few keys are enough for a test file... the importer wants a real layout, so fill a–z
  'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c, i) => {
    layout[`Key_${c}_Normal`] = String.fromCharCode(0x0995 + (i % 20));
    layout[`Key_${c.toUpperCase()}_Normal`] = String.fromCharCode(0x0985 + (i % 10));
  });
  layout.Key_k_Normal = 'ক';
  const file = JSON.stringify({ info: { layout: { name: 'ওবি পরীক্ষা', developer: { name: 'Test' } }, type: 'fixed', version: '2' }, layout });
  await addLayout(page, 'test.json', Buffer.from(file));
  await expect(page.getByTestId('toast')).toContainText('ওবি পরীক্ষা');
  await expect(page.getByTestId('layout-list')).toContainText('OpenBangla');
  await page.getByTestId('settings').click();
  await editor(page).click();
  await page.keyboard.press('KeyK');
  expect(await text(page)).toBe('ক');

  await addLayout(page, 'probhat.kmx', kmx('bangla_probhat.kmx'));
  await expect(page.getByTestId('toast')).toContainText('Bangla Probhat');
  await page.getByTestId('settings').click();
  await editor(page).click();
  await editor(page).evaluate((el) => (el as unknown as { editor: { commands: { focus: (p: string) => void } } }).editor.commands.focus('end'));
  await page.keyboard.press('Space');
  for (const k of ['KeyK', 'KeyZ']) await page.keyboard.press(k);
  expect(await text(page)).toBe('ক কয়');
});

test.describe('touch screen', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
  test('on-screen keyboard runs the Keyman rules too', async ({ page }) => {
    await page.goto('./');
    await expect(editor(page)).toBeVisible();
    await addLayout(page, 'pn_test.kmx', kmx('pn_test.kmx'));
    await expect(page.getByTestId('toast')).toContainText('PN Test');
    await page.getByTestId('settings').click();
    await page.getByTestId('kb-toggle').tap();
    await expect(page.getByTestId('osk')).toBeVisible();
    await editor(page).tap();
    const key = (c: string) => page.locator(`[data-testid=osk] [data-code="${c}"]`).dispatchEvent('pointerdown');
    for (const c of ['KeyF', 'KeyK', '#Space', 'KeyM']) await key(c);
    await page.locator('[data-testid=osk]').dispatchEvent('pointerup');
    expect(await text(page)).toBe('কি মা');
  });
});

test.describe('layout lists in Settings (touch screen)', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
  test('a tap unticks a layout on iPad; the last one cannot be unticked; added layouts still show', async ({ page }) => {
    await page.goto('./');
    await expect(editor(page)).toBeVisible();
    await section(page, 'কিবোর্ড ও টাইপিং');
    const box = page.getByTestId('layout');
    const ids = await box.locator('optgroup').first().locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    const probhat = page.getByTestId('layout-enabled-mobile-probhat');
    await probhat.tap();
    await expect(probhat).not.toBeChecked();
    await expect(box.locator('option[value="probhat"]')).toHaveCount(0);
    // the desktop list is separate
    await expect(page.getByTestId('layout-enabled-desktop-probhat')).toBeChecked();
    for (const id of ids.filter((x) => x !== 'probhat' && x !== 'pronotes')) await page.getByTestId('layout-enabled-mobile-' + id).tap();
    const last = page.getByTestId('layout-enabled-mobile-pronotes');
    await expect(last).toBeChecked();
    await expect(last).toBeDisabled();
    await addLayout(page, 'pn_test.kmx', kmx('pn_test.kmx'));
    await expect(page.getByTestId('toast')).toContainText('PN Test'); // shown once it is saved
    await expect(box).toHaveValue(/^custom-/);
    await page.reload();
    await expect(page.getByTestId('layout')).toHaveValue(/^custom-/);
    await expect(page.getByTestId('layout').locator('option[value="probhat"]')).toHaveCount(0);
  });
});
