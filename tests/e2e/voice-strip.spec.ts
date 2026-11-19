import { test, expect, devices, type Page } from '@playwright/test';
import { section } from './settings-tab';

// decisions.md 77: one 🎙 in the keyboard's strip — a tap = Live, held = record-to-text; while voice is on
// the strip shows ● time · ⏸ · ■; the words being heard are grey at the caret in the page itself.
const iphone = devices['iPhone 13'];
test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

const setup = async (page: Page) => {
  const ctl = { finish: () => {} };
  await page.routeWebSocket(/generativelanguage\.googleapis\.com\/ws\//, (ws) => {
    ws.onMessage((m) => {
      const msg = JSON.parse(String(m));
      if (!msg.setup) return;
      ws.send(JSON.stringify({ setupComplete: {} }));
      setTimeout(() => ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'বাদী পক্ষের ' } } })), 300);
      ctl.finish = () => ws.send(JSON.stringify({ serverContent: { turnComplete: true } }));
    });
  });
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { models: [] } });
    await new Promise((r) => setTimeout(r, 800));
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: 'রেকর্ড থেকে লেখা।' }] } }] } });
  });
  await page.goto('./');
  await section(page, 'voice');
  await page.getByTestId('ai-key-in').fill('AIzaTEST1234');
  await page.getByTestId('ai-key-save').click();
  await page.getByTestId('settings').click();
  await page.evaluate(() => { localStorage.setItem('pronotes.liveConsent', 'true'); localStorage.setItem('pronotes.aiVoiceConsent', 'true'); });
  await page.getByTestId('editor').click();
  if (!(await page.getByTestId('osk').isVisible())) await page.getByTestId('kb-toggle').tap();
  await expect(page.getByTestId('osk')).toBeVisible();
  return ctl;
};

test('a tap on 🎙 = Live: ● ⏸ ■ in the strip, grey words at the caret, solid when final', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  const ctl = await setup(page);
  const strip = page.getByTestId('kb-strip');
  // the page's own mic buttons give way to the strip's
  await expect(page.getByTestId('live-mic')).toHaveCount(0);
  await expect(page.getByTestId('ai-voice')).toHaveCount(0);
  await strip.getByTestId('strip-mic').tap();
  await expect(strip.getByTestId('live-strip')).toHaveClass(/live/);
  await expect(strip).toHaveClass(/voicing/); // 🌐 rests
  await expect(strip.getByTestId('live-pause')).toBeVisible();
  await expect(strip.getByTestId('live-stop')).toBeVisible();
  // grey at the caret, not yet text
  await expect(page.getByTestId('pn-interim')).toContainText('বাদী পক্ষের');
  expect(await page.getByTestId('editor').locator('p').first().evaluate((p) => p.firstChild?.nodeType === 3 ? p.firstChild.textContent : '')).toBe('');
  ctl.finish();
  await expect(page.getByTestId('pn-interim')).toHaveCount(0);
  await expect(page.getByTestId('editor')).toContainText('বাদী পক্ষের');
  // no "the words appear here" bar any more
  await expect(page.getByTestId('live-interim')).toHaveCount(0);
  await strip.getByTestId('live-stop').click();
  await expect(strip.getByTestId('strip-mic')).toBeVisible();
});

test('🎙 held = record-to-text: "লিখছে…" at the caret, then the text; with Live off a tap records', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await setup(page);
  const strip = page.getByTestId('kb-strip');
  const m = (await strip.getByTestId('strip-mic').boundingBox())!;
  await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(strip.getByTestId('ai-voice-bar')).toHaveClass(/rec/);
  await page.waitForTimeout(600);
  await strip.getByTestId('aiv-write').click();
  await expect(page.getByTestId('pn-interim')).toHaveClass(/busy/);
  await expect(page.getByTestId('editor')).toContainText('রেকর্ড থেকে লেখা।');
  await expect(page.getByTestId('pn-interim')).toHaveCount(0);
  // Live turned off in Settings: a plain tap records
  await section(page, 'voice');
  await page.getByTestId('voice-live-on').click();
  await expect(page.getByTestId('live-test')).toHaveCount(0);
  await expect(page.getByTestId('voice-card-rec').getByTestId('voice-test')).toBeVisible();
  await page.getByTestId('settings').click();
  await page.getByTestId('editor').click();
  await page.getByTestId('kb-strip').getByTestId('strip-mic').tap();
  await expect(page.getByTestId('kb-strip').getByTestId('ai-voice-bar')).toHaveClass(/rec/);
  await page.getByTestId('kb-strip').getByTestId('aiv-pause').click();
  await expect(page.getByTestId('kb-strip').getByTestId('aiv-discard')).toBeVisible();
});

test('put down, the strip still records: ● ⏸ ■ where 🎙 was', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await setup(page);
  await page.getByTestId('kb-hide').click();
  const down = page.getByTestId('kb-strip-down');
  await down.getByTestId('strip-mic').tap();
  await expect(down.getByTestId('live-strip')).toHaveClass(/live|starting/);
  await expect(down).toHaveClass(/voicing/);
  await down.getByTestId('live-stop').click();
  await expect(down.getByTestId('strip-mic')).toBeVisible();
});
