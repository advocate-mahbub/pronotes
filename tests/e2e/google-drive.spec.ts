import { test, expect } from '@playwright/test';
import { section } from './settings-tab';

// Google Drive backups. The build may or may not carry a Client ID (deploy has the secret, CI and local don't),
// so these tests accept either and never reach the real Google: its API is answered here.
test.beforeEach(async ({ page }) => {
  await page.route('https://www.googleapis.com/**', (r) => {
    const u = new URL(r.request().url());
    if (r.request().method() === 'PATCH') return r.fulfill({ json: { id: 'B1' } });
    if (u.searchParams.get('q')?.includes('folder')) return r.fulfill({ json: { files: [{ id: 'F1' }] } });
    return r.fulfill({ json: { files: [{ id: 'B1', name: 'pronotes-backup-test.json', createdTime: '2026-11-18T10:00:00Z', size: '52000', appProperties: { device: 'Office PC' } }] } });
  });
  await page.route('https://accounts.google.com/**', (r) => r.abort());
});

test('Settings → App has a Google Drive group, off or ready to connect', async ({ page }) => {
  await page.goto('/');
  await section(page, 'app');
  await expect(page.getByTestId('drive-off').or(page.getByTestId('drive-connect'))).toBeVisible();
});

test('back from Google: the token is kept for this session only and the address is cleaned', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seen')) { sessionStorage.setItem('seen', '1'); sessionStorage.setItem('pronotes.gdrive.state', 'S1'); } });
  await page.goto('/#access_token=TEST&token_type=Bearer&expires_in=3600&state=S1');
  await expect(page.getByTestId('settings-panel')).toBeVisible(); // opens Settings → App
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
  const kept = await page.evaluate(() => ({ s: sessionStorage.getItem('pronotes.gdrive.token'), l: Object.keys(localStorage).filter((k) => /gdrive|token/i.test(k)) }));
  expect(kept.s).toContain('TEST');
  expect(kept.l).toEqual([]); // nothing about Google in lasting storage
  if (await page.getByTestId('drive-off').isVisible()) return; // build without a Client ID
  // the list is folded away until opened
  await expect(page.getByTestId('drive-list')).toHaveCount(0);
  await expect(page.getByTestId('drive-refresh')).toContainText(/[1১]/);
  await page.getByTestId('drive-refresh').click();
  await expect(page.getByTestId('drive-list').locator('li')).toHaveCount(1);
  // which device made it: "this device" once our name matches
  await expect(page.getByTestId('drive-list')).toContainText('Office PC');
  await expect(page.getByTestId('drive-list')).not.toContainText(/this device|এই ডিভাইস/);
  await page.getByTestId('device-name').fill('Office PC');
  await expect(page.getByTestId('drive-list')).toContainText(/this device|এই ডিভাইস/);
  // how many to keep: a choice, remembered
  await page.getByTestId('drive-keep').selectOption('5');
  expect(await page.evaluate(() => localStorage.getItem('pronotes.drive.keep'))).toBe('5');
  // delete asks once more, then the row goes
  await page.getByTestId('drive-delete-B1').click();
  await expect(page.getByTestId('drive-list')).toBeVisible();
  await page.getByTestId('drive-delete-B1').click();
  await expect(page.getByText(/Trash/).first()).toBeVisible();
  await expect(page.getByTestId('drive-delete-B1')).toHaveCount(0);
});

test('a token with the wrong state is refused', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pronotes.gdrive.state', 'MINE'));
  await page.goto('/#access_token=EVIL&expires_in=3600&state=OTHER');
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('pronotes.gdrive.token'))).toBeNull();
});
