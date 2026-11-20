import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { toBijoy } from '../../src/bijoy';
import { section } from './settings-tab';

// decisions.md 82: Bangla voice in Bengali letters; ☰ stays put; the top bar folds; ask before a font rewrites letters
const editor = (p: Page) => p.getByTestId('editor');
const stand = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';

const MOCK_SR = () => {
  const w = window as unknown as Record<string, unknown>;
  class SR {
    lang = ''; continuous = false; interimResults = false; maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null; onerror: unknown = null; onend: (() => void) | null = null;
    start() { (w.__sr as { cur: SR }).cur = this; }
    stop() {}
  }
  w.__sr = { cur: null, say(text: string, isFinal: boolean) { (w.__sr as { cur: SR }).cur.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text }, length: 1 }] }); } };
  w.webkitSpeechRecognition = SR;
  w.SpeechRecognition = SR;
};
const say = (p: Page, text: string, fin: boolean) => p.evaluate(([t, f]) => (window as never as { __sr: { say: (t: string, f: boolean) => void } }).__sr.say(t as string, f as boolean), [text, fin]);

test('Bangla voice never shows Hindi, Chinese or Japanese letters', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pronotes.voice.modes', JSON.stringify({ live: false })); localStorage.setItem('pronotes.voiceConsent', 'true'); });
  await page.addInitScript(MOCK_SR);
  await page.goto('./');
  await editor(page).click();
  await page.getByTestId('mic').click();
  await expect(page.getByTestId('voice-bar')).toBeVisible();
  await say(page, 'आमार 我的', false);
  await expect(page.getByTestId('voice-interim')).toHaveText('আমার');
  await say(page, 'आमार सोनार बांला 我的 ジミ', true);
  await expect(editor(page).locator('p').first()).toHaveText(/^আমার সোনার বাংলা\s*$/);
});

test('☰ stays at the start while the tab row scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 800 });
  await page.goto('./');
  await editor(page).click();
  const menu = page.getByTestId('side-toggle').first();
  const x0 = (await menu.boundingBox())!.x;
  await page.locator('.ribbon-tabs').evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await expect.poll(async () => Math.round((await menu.boundingBox())!.x)).toBe(Math.round(x0));
  await expect(menu).toBeInViewport();
});

test('the top bar folds into a thin strip and comes back; remembered', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByTestId('top-collapse').click();
  await expect(page.getByTestId('settings')).toBeHidden();
  await expect(page.getByTestId('top-mini')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('top-mini')).toBeVisible();
  await page.getByTestId('top-expand').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByTestId('top-mini')).toHaveCount(0);
});

test('a font of the other kind asks before it rewrites letters: cancel keeps them; "don’t ask" and the Settings switch', async ({ page }) => {
  test.skip(!fs.existsSync(stand), 'needs a local TTF file');
  await page.goto('./');
  await section(page, 'ফন্ট');
  await page.getByTestId('font-add-ansi-file').setInputFiles({ name: 'stand.ttf', mimeType: 'font/ttf', buffer: fs.readFileSync(stand) });
  await expect(page.getByTestId('font-convert-ask')).toBeChecked();
  await page.getByTestId('settings').click();
  await editor(page).click();
  for (const k of ['KeyD', 'KeyL', 'KeyI', 'KeyL']) await page.keyboard.press(k);
  const p0 = editor(page).locator('p').first();
  await page.keyboard.press('ControlOrMeta+A');
  const pick = async () => { await page.getByTestId('font').click(); await page.getByTestId('fp-tab-ansi').click(); await page.getByTestId('fp-DejaVu Serif').click(); };
  await pick();
  await page.getByTestId('convert-cancel').click();
  await expect(p0).toHaveText('দলিল'); // as it was
  await page.keyboard.press('ControlOrMeta+A');
  await pick();
  await page.getByTestId('convert-noask').check();
  await page.getByTestId('convert-ok').click();
  await expect(p0).toHaveText(toBijoy('দলিল'));
  // no longer asked; the switch in Settings shows it off
  await page.getByTestId('undo').click();
  await expect(p0).toHaveText('দলিল');
  await page.keyboard.press('ControlOrMeta+A');
  await pick();
  await expect(page.getByTestId('convert-ask')).toHaveCount(0);
  await expect(p0).toHaveText(toBijoy('দলিল'));
  await section(page, 'ফন্ট');
  await expect(page.getByTestId('font-convert-ask')).not.toBeChecked();
});
