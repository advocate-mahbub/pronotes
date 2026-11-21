import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { deflateRawSync } from 'node:zlib';

// decisions.md 81: ▦ → আমার অ্যাপ — the user's own web apps from a .zip, on a separate address, typing
// Bangla with the ProNotes layout in their text boxes
function zip(files: Record<string, string | Buffer>): Buffer {
  const parts: Buffer[] = [], cen: Buffer[] = [];
  let off = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = Buffer.from(path), raw = Buffer.from(text), data = deflateRawSync(raw);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(8, 8); loc.writeUInt32LE(data.length, 18); loc.writeUInt32LE(raw.length, 22); loc.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    parts.push(loc, name, data); cen.push(c, name); off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(cen), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(cen.length / 2, 8); end.writeUInt16LE(cen.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
const APP = zip({
  'khata/index.html': '<!doctype html><html><head><meta charset="utf-8"><title>Test Khata</title><link rel="stylesheet" href="css/s.css"></head><body><textarea id="t"></textarea><div id="ce" contenteditable="true"></div><p id="js"></p><script src="js/a.js"></script></body></html>',
  'khata/css/s.css': 'textarea,#ce{width:300px;height:60px;display:block;border:1px solid}',
  'khata/js/a.js': 'document.getElementById("js").textContent = "script ran";',
});

async function openMine(page: Page): Promise<FrameLocator> {
  await page.goto('./');
  await page.getByTestId('craft-toggle').click();
  await page.getByTestId('craft-mine').click();
  return page.frameLocator('[data-testid="user-apps-frame"]');
}

test('add a zip app, run it offline from this device, type Bangla in it with the ProNotes layout, delete it', async ({ page }) => {
  const runner = await openMine(page);
  await expect(runner.getByTestId('apps-empty')).toBeVisible();
  await runner.getByTestId('apps-add-file').setInputFiles({ name: 'khata.zip', mimeType: 'application/zip', buffer: APP });
  await expect(runner.getByTestId('apps-card')).toHaveCount(1);
  await expect(runner.getByTestId('apps-card')).toContainText('Test Khata');
  await runner.locator('[data-testid^="apps-open-"]').click();
  const app = runner.frameLocator('[data-testid="apps-frame"]');
  await expect(app.locator('#js')).toHaveText('script ran'); // its scripts and styles come from the zip
  // ProNotes' layout and rules in the app's text box: ক ল জ; ্ twice = the fixed hasanta
  await app.locator('#t').click();
  for (const k of ['KeyK', 'KeyL', 'KeyJ', 'Space', 'KeyK', 'KeyH', 'KeyH']) await page.keyboard.press(k);
  await expect(app.locator('#t')).toHaveValue('কলজ ক্‌');
  // Ctrl+Space there switches ProNotes too; the settings come back from ProNotes
  await page.keyboard.press('Control+Space');
  await page.keyboard.press('KeyA');
  await page.keyboard.press('Control+Space');
  await page.keyboard.press('KeyK');
  await expect(app.locator('#t')).toHaveValue('কলজ ক্‌aক');
  // a contenteditable editor too
  await app.locator('#ce').click();
  for (const k of ['KeyK', 'KeyL']) await page.keyboard.press(k);
  await expect(app.locator('#ce')).toHaveText('কল');
  // back to the list and delete
  await runner.getByTestId('apps-back').click();
  // delete: "সাজান" shows × on each icon (decisions.md 91)
  await runner.getByTestId('apps-edit').click();
  page.once('dialog', (d) => void d.accept());
  await runner.locator('[data-testid^="apps-del-"]').click();
  await expect(runner.getByTestId('apps-empty')).toBeVisible();
});

test('a zip without a web page is refused with a clear reason', async ({ page }) => {
  const runner = await openMine(page);
  await runner.getByTestId('apps-add-file').setInputFiles({ name: 'notes.zip', mimeType: 'application/zip', buffer: zip({ 'a.txt': 'x' }) });
  await expect(runner.getByTestId('apps-msg')).toContainText('.html');
  await runner.getByTestId('apps-add-file').setInputFiles({ name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') });
  await expect(runner.getByTestId('apps-msg')).toContainText('zip');
});

test('ProNotes’ own on-screen keyboard types into an app’s text box (decisions.md 82)', async ({ page }) => {
  const runner = await openMine(page);
  await runner.getByTestId('apps-add-file').setInputFiles({ name: 'khata.zip', mimeType: 'application/zip', buffer: APP });
  await runner.locator('[data-testid^="apps-open-"]').click();
  const app = runner.frameLocator('[data-testid="apps-frame"]');
  await expect(app.locator('#js')).toHaveText('script ran');
  // the keyboard is off: tapping a text box shows none
  await app.locator('#t').click();
  await expect(page.getByTestId('user-apps-kb')).toHaveCount(0);
  // on: it comes up under the app while a text box has focus, and the device's keyboard stays down
  await page.getByTestId('user-apps-back').click();
  await page.getByTestId('craft-close').click();
  await page.getByTestId('kb-toggle').click();
  await page.getByTestId('craft-toggle').click();
  await page.getByTestId('craft-mine').click();
  await app.locator('#t').click();
  const kb = page.getByTestId('user-apps-kb');
  await expect(kb).toBeVisible();
  await expect(app.locator('#t')).toHaveAttribute('inputmode', 'none');
  const key = (c: string) => kb.locator(`[data-code="${c}"]`).first();
  for (const c of ['KeyK', 'KeyH', 'KeyH', 'KeyL']) await key(c).click();
  await expect(app.locator('#t')).toHaveValue('ক্‌ল'); // the ProNotes rules, there too
  await key('#Back').click();
  await key('#Back').click(); // ্ + ZWNJ go in one ⌫
  await expect(app.locator('#t')).toHaveValue('ক');
  await key('#Space').click();
  await key('KeyJ').click();
  await expect(app.locator('#t')).toHaveValue('ক জ');
  await key('#Enter').click();
  await key('KeyK').click();
  await expect(app.locator('#t')).toHaveValue('ক জ\nক');
  // a contenteditable editor too
  await app.locator('#ce').click();
  await key('KeyL').click();
  await expect(app.locator('#ce')).toHaveText('ল');
});

test('apps show as icons: the app\'s own icon from its manifest, a letter when it has none', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const WITH_ICON = zip({
    'index.html': '<!doctype html><title>Iconic</title><link rel="manifest" href="manifest.json"><p>hi</p>',
    'manifest.json': JSON.stringify({ name: 'Iconic', icons: [{ src: 'img/i-48.png', sizes: '48x48' }, { src: 'img/i-192.png', sizes: '192x192' }] }),
    'img/i-48.png': png,
    'img/i-192.png': png,
  });
  const runner = await openMine(page);
  await runner.getByTestId('apps-add-file').setInputFiles({ name: 'iconic.zip', mimeType: 'application/zip', buffer: WITH_ICON });
  await runner.getByTestId('apps-add-file').setInputFiles({ name: 'khata.zip', mimeType: 'application/zip', buffer: APP });
  await expect(runner.getByTestId('apps-card')).toHaveCount(2);
  const iconic = runner.getByTestId('apps-card').filter({ hasText: 'Iconic' });
  await expect(iconic.locator('img')).toHaveAttribute('src', /\/img\/i-192\.png$/);
  await expect.poll(() => iconic.locator('img').evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(1);
  await expect(runner.getByTestId('apps-card').filter({ hasText: 'Test Khata' }).locator('.letter')).toHaveText('T');
});
