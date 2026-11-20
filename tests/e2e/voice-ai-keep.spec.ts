import { test, expect, type Page } from '@playwright/test';
import { section } from './settings-tab';

// AI voice keeps what was said: pause/continue in one recording, a failed send is kept and sent again
// (by itself when the connection is back), and a recording cut off by a closed app is offered again.
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

const setup = async (page: Page, answer: { fail: boolean }) => {
  const sent: number[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { models: [] } });
    if (answer.fail) return route.abort('internetdisconnected');
    sent.push((route.request().postData() ?? '').length);
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: 'রাখা কথা লেখা হলো।' }] } }] } });
  });
  await page.goto('./');
  await section(page, 'voice');
  await page.getByTestId('ai-key-in').fill('AIzaTEST1234');
  await page.getByTestId('ai-key-save').click();
  await page.getByTestId('settings').click();
  await page.evaluate(() => localStorage.setItem('pronotes.aiVoiceConsent', 'true'));
  await page.getByTestId('editor').click();
  return sent;
};

test('pause and continue in one recording; a failed send is kept and goes out when the internet is back', async ({ page, context }) => {
  // Live off: this test is about the other voice mode (one 🎙 starts Live first; decisions.md 82)
  await page.addInitScript(() => localStorage.setItem('pronotes.voice.modes', JSON.stringify({ live: false })));
  await context.grantPermissions(['microphone']);
  const answer = { fail: true };
  const sent = await setup(page, answer);
  const bar = page.getByTestId('ai-voice-bar');
  await page.getByTestId('ai-voice').click();
  await expect(bar).toHaveClass(/rec/);
  await page.waitForTimeout(1200);
  await page.getByTestId('aiv-pause').click();
  await expect(bar).toHaveClass(/paused/);
  // a second's tick already on its way when ⏸ was pressed may still land: read the clock after it
  await page.waitForTimeout(300);
  const t1 = await bar.innerText();
  await page.waitForTimeout(1200);
  expect(await bar.innerText()).toBe(t1); // the clock stands still while paused
  await page.getByTestId('aiv-resume').click();
  await expect(bar).toHaveClass(/rec/);
  await page.waitForTimeout(1200);
  // write it: no internet → kept
  await page.getByTestId('aiv-write').click();
  await expect(bar).toHaveClass(/held/);
  expect(await page.evaluate(async () => {
    const r = indexedDB.open('pronotes-voice');
    const db: IDBDatabase = await new Promise((ok) => { r.onsuccess = () => ok(r.result); });
    return new Promise<number>((ok) => { const q = db.transaction('pieces').objectStore('pieces').count(); q.onsuccess = () => ok(q.result); });
  })).toBeGreaterThan(0);
  // the connection comes back: it goes out by itself
  answer.fail = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByTestId('editor')).toContainText('রাখা কথা লেখা হলো।');
  await expect(bar).toHaveCount(0);
  expect(sent.length).toBe(1);
  expect(sent[0]).toBeGreaterThan(60000); // both parts of the recording (about 2.4 s)
});

test('a recording cut off by a closed app is offered again; 🗑 asks once more, then throws it away', async ({ page, context }) => {
  // Live off: this test is about the other voice mode (one 🎙 starts Live first; decisions.md 82)
  await page.addInitScript(() => localStorage.setItem('pronotes.voice.modes', JSON.stringify({ live: false })));
  await context.grantPermissions(['microphone']);
  const answer = { fail: false };
  await setup(page, answer);
  await page.getByTestId('ai-voice').click();
  await page.waitForTimeout(5200); // long enough for a piece to be kept on the device
  await page.reload(); // the app is closed mid-recording
  await page.getByTestId('editor').click();
  const bar = page.getByTestId('ai-voice-bar');
  await expect(bar).toHaveClass(/held/);
  await page.getByTestId('aiv-discard').click();
  await expect(page.getByTestId('aiv-discard')).toHaveClass(/warn/);
  await page.getByTestId('aiv-discard').click();
  await expect(bar).toHaveCount(0);
  await page.waitForTimeout(500); // the device copy is deleted in the background
  await page.reload();
  await page.waitForTimeout(800);
  await expect(page.getByTestId('ai-voice-bar')).toHaveCount(0);
});
