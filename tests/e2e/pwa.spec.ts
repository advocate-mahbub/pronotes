import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const editor = (p: Page) => p.getByTestId('editor');
const paras = (p: Page) => editor(p).locator('p').allTextContents();

/** Wait until a service worker is active, then reload so it controls the page. */
async function controlled(page: Page) {
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    if (!r.active) throw new Error('no active worker');
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(editor(page)).toBeVisible();
}

test('manifest, icons and Apple home-screen tags are in place', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const m = await (await request.get(href!)).json();
  expect(m.short_name).toBe('ProNotes');
  expect(m.display).toBe('standalone');
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
  for (const i of m.icons) expect((await request.get(i.src)).status()).toBe(200);
  expect(await page.locator('link[rel=apple-touch-icon]').count()).toBe(1);
  expect(await page.locator('meta[name=apple-mobile-web-app-capable]').getAttribute('content')).toBe('yes');
});

test('no request leaves for Google Fonts or any other host', async ({ page }) => {
  const hosts = new Set<string>();
  page.on('request', (r) => hosts.add(new URL(r.url()).host));
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect([...hosts]).toEqual(['localhost:4173']);
});

test('works offline after the first visit: open, type, save, Word file, fonts', async ({ page, context }) => {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await controlled(page);
  await context.setOffline(true);
  await page.reload();
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
  for (const k of ['KeyK', 'KeyM', 'KeyR']) await page.keyboard.press(k);
  await expect(page.getByTestId('save-status')).toHaveText('এই ডিভাইসে সেভ হয়েছে');
  expect(await page.evaluate(async () => {
    await document.fonts.load('16px "Noto Sans Bengali"', 'ক');
    return document.fonts.check('16px "Noto Sans Bengali"', 'ক');
  })).toBe(true);
  // the exporter is a separate file loaded on first use; it must come from the offline copy
  await page.evaluate(() => {
    (window as unknown as { __dl: string[] }).__dl = [];
    HTMLAnchorElement.prototype.click = function () { (window as unknown as { __dl: string[] }).__dl.push(this.download); };
  });
  await page.getByTestId('share').click();
  await page.getByTestId('save-docx').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __dl: string[] }).__dl.length)).toBe(1);
  await page.reload();
  await expect(editor(page).locator('p').first()).toHaveText('কমর');
  await context.setOffline(false);
});

test('settings explain offline and install', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('settings').click();
  await page.locator('summary', { hasText: 'অ্যাপ' }).click();
  await expect(page.getByTestId('app-status')).toContainText('অফলাইন');
  await expect(page.getByTestId('check-update')).toBeVisible();
});

test('iPad (Safari user agent) gets Add to Home Screen steps', async ({ browser }) => {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    hasTouch: true, viewport: { width: 1180, height: 820 },
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/');
  await page.getByTestId('settings').click();
  await page.locator('summary', { hasText: 'অ্যাপ' }).click();
  await expect(page.getByTestId('install-howto')).toContainText('Add to Home Screen');
  await ctx.close();
});

/** Serves a private copy of dist/, so this test can publish a "new version" without touching other tests. */
async function serveCopy(): Promise<{ url: string; dir: string; close: () => Promise<void> }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pronotes-pwa-'));
  fs.cpSync(path.resolve('dist'), dir, { recursive: true });
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(fs.readFileSync(f));
  });
  await new Promise<void>((r) => server.listen(0, 'localhost', r));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://localhost:${port}/`, dir, close: () => new Promise((r) => server.close(() => r())) };
}

test('new version: notice appears, the open draft is saved, then the app reloads', async ({ page }) => {
  const s = await serveCopy();
  try {
    await page.goto(s.url);
    await expect(editor(page)).toBeVisible();
    await controlled(page);
    await expect(page.getByTestId('update-banner')).toHaveCount(0);
    // publish a "new version"
    fs.appendFileSync(path.join(s.dir, 'sw.js'), '\n// new version\n');
    await editor(page).click();
    for (const k of ['KeyK', 'KeyM']) await page.keyboard.press(k);
    await page.getByTestId('settings').click();
    await page.locator('summary', { hasText: 'অ্যাপ' }).click();
    await page.getByTestId('check-update').click();
    await expect(page.getByTestId('update-banner')).toBeVisible({ timeout: 15_000 });
    // "later" hides it; the check finds it again
    await page.getByTestId('update-later').click();
    await expect(page.getByTestId('update-banner')).toHaveCount(0);
    await page.getByTestId('check-update').click();
    await expect(page.getByTestId('update-banner')).toBeVisible({ timeout: 15_000 });
    await editor(page).click();
    await page.keyboard.press('KeyR');
    // update right after typing, before the autosave timer: the text must still be kept
    await Promise.all([page.waitForEvent('load'), page.getByTestId('update-now').click()]);
    await expect(editor(page)).toBeVisible();
    expect((await paras(page))[0]).toBe('কমর');
    await expect(page.getByTestId('update-banner')).toHaveCount(0);
  } finally {
    await s.close();
  }
});
