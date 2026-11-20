import { test, expect, devices, type Page } from '@playwright/test';

// decisions.md 83: iPad split/floating keyboard — the room between 🌐 and 🎙 is for voice; lower corners follow the screen
const ipad = devices['iPad Pro 11 landscape'];
// an iPad-sized screen in Chrome, whose speech recognition does Bangla (Safari's does not; there the app sends
// the user to the device keyboard's mic instead)
test.use({ viewport: ipad.viewport, hasTouch: true });

const MOCK_SR = () => {
  const w = window as unknown as Record<string, unknown>;
  class SR {
    lang = ''; continuous = false; interimResults = false; maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null; onerror: unknown = null; onend: (() => void) | null = null; onstart: (() => void) | null = null;
    start() { (w.__sr as { cur: SR }).cur = this; setTimeout(() => this.onstart?.(), 0); }
    stop() { setTimeout(() => this.onend?.(), 0); }
    abort() { this.stop(); }
  }
  w.__sr = { cur: null, say(text: string, isFinal: boolean) { (w.__sr as { cur: SR }).cur?.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text }, length: 1 }] }); } };
  w.webkitSpeechRecognition = SR;
  w.SpeechRecognition = SR;
};

async function openSplit(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('pronotes.kb.mode', '"splitPhone"');
    localStorage.setItem('pronotes.liveConsent', 'true');
    localStorage.setItem('pronotes.voiceConsent', 'true');
  });
  await page.addInitScript(MOCK_SR);
  await page.goto('./');
  await page.getByTestId('editor').click();
  if (!(await page.getByTestId('osk').isVisible())) await page.getByTestId('kb-toggle').click();
  await expect(page.getByTestId('osk')).toHaveClass(/split/);
}

test('the gap between 🌐 and 🎙 starts voice; while it runs, the controls and the words heard sit there', async ({ page }) => {
  await openSplit(page);
  const strip = page.getByTestId('kb-strip');
  const gap = strip.getByTestId('kb-voice-gap');
  await expect(gap).toBeVisible();
  // wide: most of the strip
  const sw = (await strip.boundingBox())!.width;
  expect((await gap.boundingBox())!.width).toBeGreaterThan(sw * 0.4);
  // the ⌄ (put the keyboard away) moved beside 🌐
  await expect(strip.locator('.strip-side').first().getByTestId('kb-hide')).toHaveCount(1);
  await gap.click();
  await expect(strip.getByTestId('kb-voice-gap')).toHaveClass(/on/);
  await expect(strip.getByTestId('kb-voice-gap').getByTestId('live-stop')).toBeVisible();
  await page.evaluate(() => (window as never as { __sr: { say: (t: string, f: boolean) => void } }).__sr.say('आमार सोनार', false));
  await expect(strip.getByTestId('kb-heard')).toHaveText('আমার সোনার'); // Bengali letters there too (decisions.md 82)
  await strip.getByTestId('live-stop').click();
  await expect(strip.getByTestId('kb-voice-gap')).not.toHaveClass(/on/);
});

test('the docked split keyboard’s lower corners follow the iPad screen’s corners', async ({ page }) => {
  await openSplit(page);
  const r = await page.getByTestId('osk').evaluate((el) => { const s = getComputedStyle(el); return [s.borderBottomLeftRadius, s.borderBottomRightRadius]; });
  expect(r).toEqual(['18px', '18px']);
});
