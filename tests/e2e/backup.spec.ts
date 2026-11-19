import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { section } from './settings-tab';

// One backup system, two places (decisions.md 74): the status line, the reminder with its buttons,
// "ডিভাইসে নামান" when Drive fails, the automatic Drive backup and ⤓ for one Drive backup.
// The Drive parts need a build with a Client ID; without one they stop where Drive is off.

test('a new install is not reminded at once', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(3800);
  await expect(page.getByTestId('toast-remind-device')).toHaveCount(0);
});

test('no backup for a day: the reminder offers the device, and "পরে" waits', async ({ page }) => {
  await page.addInitScript((t) => { if (!localStorage.getItem('pronotes.device.firstSeen')) localStorage.setItem('pronotes.device.firstSeen', String(t)); }, Date.now() - 2 * 86400_000);
  await page.goto('/');
  await expect(page.getByTestId('toast-remind-device')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('toast')).toContainText(/No backup|এখনো কোনো ব্যাকআপ/);
  await expect(page.getByTestId('toast-remind-later')).toBeVisible();
  // it stays until answered
  await page.waitForTimeout(5000);
  await expect(page.getByTestId('toast-remind-device')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('toast-remind-device').click()]);
  const json = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(json.app).toBe('pronotes');
  // when it was made stays on this device: never in the file
  expect(Object.keys(json.prefs.store).filter((k) => k.startsWith('device.'))).toEqual([]);
  const last = await page.evaluate(() => JSON.parse(localStorage.getItem('pronotes.device.backupLast') || '{}'));
  expect(last.device).toBeGreaterThan(Date.now() - 60_000);
  await section(page, 'app');
  await expect(page.getByTestId('backup-status')).toContainText(/Last backup|শেষ ব্যাকআপ/);
  await expect(page.getByTestId('backup-remind')).toHaveValue('24');
});

test('"পরে" puts the reminder off for 12 hours', async ({ page }) => {
  await page.addInitScript((t) => localStorage.setItem('pronotes.device.firstSeen', String(t)), Date.now() - 2 * 86400_000);
  await page.goto('/');
  await page.getByTestId('toast-remind-later').click({ timeout: 20000 });
  await expect(page.getByTestId('toast')).toHaveCount(0);
  const until = await page.evaluate(() => Number(localStorage.getItem('pronotes.device.backupSnooze')));
  expect(until - Date.now()).toBeGreaterThan(11 * 3600_000);
  await page.reload();
  await page.waitForTimeout(3800);
  await expect(page.getByTestId('toast-remind-device')).toHaveCount(0);
});

// ---------- Drive (only when the build has a Client ID) ----------
async function connected(page: Page, upload: 'ok' | 'fail' | 'auth', seen: string[]) {
  await page.route('https://www.googleapis.com/**', (r) => {
    const req = r.request();
    const u = new URL(req.url());
    seen.push(req.method() + ' ' + u.pathname);
    if (req.method() === 'POST' && u.pathname.includes('upload')) {
      if (upload === 'fail') return r.fulfill({ status: 500, body: 'no' });
      if (upload === 'auth') return r.fulfill({ status: 401, body: 'auth' });
      return r.fulfill({ json: { id: 'B2' } });
    }
    if (req.method() === 'PATCH') return r.fulfill({ json: { id: 'B1' } });
    if (u.searchParams.get('alt') === 'media') return r.fulfill({ json: { app: 'pronotes', docs: [] } });
    if (u.searchParams.get('q')?.includes('folder')) return r.fulfill({ json: { files: [{ id: 'F1' }] } });
    return r.fulfill({ json: { files: [{ id: 'B1', name: 'pronotes-backup-test.json', createdTime: '2026-11-18T10:00:00Z', size: '52000' }] } });
  });
  await page.route('https://accounts.google.com/**', (r) => r.abort());
  await page.addInitScript(() => { if (!sessionStorage.getItem('seen')) { sessionStorage.setItem('seen', '1'); sessionStorage.setItem('pronotes.gdrive.state', 'S1'); } });
  await page.goto('/#access_token=TEST&token_type=Bearer&expires_in=3600&state=S1');
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  return !(await page.getByTestId('drive-off').isVisible());
}

test('Drive backup fails: the message stays and "ডিভাইসে নামান" saves it here', async ({ page }) => {
  const seen: string[] = [];
  if (!(await connected(page, 'fail', seen))) return;
  await page.getByTestId('drive-backup').click();
  await expect(page.getByTestId('toast-to-device')).toBeVisible();
  await page.waitForTimeout(5000);
  await expect(page.getByTestId('toast-to-device')).toBeVisible(); // not gone by itself
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('toast-to-device').click()]);
  expect(dl.suggestedFilename()).toMatch(/^pronotes-backup-/);
});

test('Drive permission expired: connect again, or save on the device', async ({ page }) => {
  const seen: string[] = [];
  if (!(await connected(page, 'auth', seen))) return;
  await page.getByTestId('drive-backup').click();
  await expect(page.getByTestId('toast-reconnect')).toBeVisible();
  await expect(page.getByTestId('toast-to-device')).toBeVisible();
  await page.getByTestId('toast-close').click();
  await expect(page.getByTestId('toast')).toHaveCount(0);
});

test('while connected, a changed draft goes to Drive by itself when ProNotes is put away; ⤓ saves one', async ({ page }) => {
  const seen: string[] = [];
  if (!(await connected(page, 'ok', seen))) return;
  await expect(page.getByTestId('drive-auto')).toBeVisible();
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }));
  // put away (again, until the new draft has reached the list)
  await expect.poll(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(300);
    return seen.some((s) => s.startsWith('POST') && s.includes('upload'));
  }).toBe(true);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pronotes.device.backupLast') || '{}').drive ?? 0)).toBeGreaterThan(0);
  await expect(page.getByTestId('backup-status')).toContainText('Drive');
  // nothing changed since: the next time it is put away, nothing more goes
  const n = seen.filter((s) => s.includes('upload')).length;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(800);
  expect(seen.filter((s) => s.includes('upload')).length).toBe(n);
  // one Drive backup, saved as a file here
  await page.getByTestId('drive-refresh').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('drive-download-B1').click()]);
  expect(dl.suggestedFilename()).toBe('pronotes-backup-test.json');
});

test('the automatic Drive backup can be turned off (this device only)', async ({ page }) => {
  const seen: string[] = [];
  if (!(await connected(page, 'ok', seen))) return;
  await expect.poll(() => page.evaluate(() => new Promise<number>((ok) => { const r = indexedDB.open('pronotes'); r.onsuccess = () => { try { const q = r.result.transaction('docs').objectStore('docs').count(); q.onsuccess = () => ok(q.result); } catch { ok(0); } }; r.onerror = () => ok(0); }))).toBeGreaterThan(0);
  await page.getByTestId('drive-auto').click();
  expect(await page.evaluate(() => localStorage.getItem('pronotes.device.autoDrive'))).toBe('false');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1000);
  expect(seen.some((s) => s.includes('upload'))).toBe(false);
});
