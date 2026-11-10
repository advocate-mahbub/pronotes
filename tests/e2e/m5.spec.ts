import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const layouts = JSON.parse(fs.readFileSync(new URL('../golden/layouts.json', import.meta.url), 'utf8')) as { id: string; map: Record<string, string[]> }[];
const editor = (p: Page) => p.getByTestId('editor');
const paras = (p: Page) => editor(p).locator('p').allTextContents();

async function start(page: Page) {
  await page.goto('./');
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
}
async function section(page: Page, name: string) {
  if (!(await page.getByTestId('settings-panel').isVisible())) await page.getByTestId('settings').click();
  const d = page.locator('details', { has: page.locator('summary', { hasText: name }) });
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator('summary').click();
}

/** A scriptable SpeechRecognition. window.__sr.say(text, final) sends a result. */
const MOCK_SR = () => {
  const w = window as unknown as Record<string, unknown>;
  class SR {
    lang = ''; continuous = false; interimResults = false; maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null; onerror: unknown = null; onend: (() => void) | null = null;
    start() { (w.__sr as { cur: SR; starts: number }).cur = this; (w.__sr as { starts: number }).starts++; }
    stop() {}
  }
  w.__sr = {
    cur: null, starts: 0,
    say(text: string, isFinal: boolean) {
      const cur = (w.__sr as { cur: SR }).cur;
      cur.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text }, length: 1 }] });
    },
    lang() { return (w.__sr as { cur: SR }).cur.lang; },
  };
  w.webkitSpeechRecognition = SR;
  w.SpeechRecognition = SR;
};

test('live voice (mocked engine): interim text, spoken punctuation, new paragraph, stop', async ({ page }) => {
  await page.addInitScript(MOCK_SR);
  await start(page);
  await page.getByTestId('mic').click();
  // one-time privacy notice: cancel does not start, OK starts
  await page.getByTestId('voice-consent-cancel').click();
  await expect(page.getByTestId('voice-bar')).toHaveCount(0);
  await page.getByTestId('mic').click();
  await page.getByTestId('voice-consent-ok').click();
  await expect(page.getByTestId('voice-bar')).toContainText('শুনছি');
  expect(await page.evaluate(() => (window as never as { __sr: { lang: () => string } }).__sr.lang())).toBe('bn-BD');
  await page.evaluate(() => (window as never as { __sr: { say: (t: string, f: boolean) => void } }).__sr.say('আমি বাদী', false));
  await expect(page.getByTestId('voice-interim')).toHaveText('আমি বাদী');
  await page.evaluate(() => (window as never as { __sr: { say: (t: string, f: boolean) => void } }).__sr.say('আমি বাদী দাঁড়ি নতুন লাইন জমির পরিমাণ 25 শতাংশ', true));
  expect(await paras(page)).toEqual(['আমি বাদী।', 'জমির পরিমাণ ২৫ শতাংশ ']);
  await page.getByTestId('voice-stop').click();
  await expect(page.getByTestId('suggestions')).toBeVisible();
  // shown only once
  await page.getByTestId('mic').click();
  await expect(page.getByTestId('voice-consent')).toHaveCount(0);
  await expect(page.getByTestId('voice-bar')).toContainText('শুনছি');
});

test('iPad-like device: mic opens the device keyboard instead (engine suspended)', async ({ browser }) => {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    hasTouch: true, isMobile: true, viewport: { width: 1024, height: 768 },
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/');
  await expect(editor(page)).toBeVisible();
  await page.getByTestId('kb-toggle').click(); // touch devices start with their own keyboard
  await expect(page.getByTestId('osk')).toBeVisible();
  await expect(editor(page)).toHaveAttribute('inputmode', 'none');
  await page.getByTestId('mic').click();
  await expect(page.getByTestId('voice-back')).toBeVisible();
  await expect(page.getByTestId('toast')).toContainText('iPhone/iPad');
  await expect(editor(page)).toHaveAttribute('inputmode', 'text');
  await expect(page.getByTestId('osk')).toBeHidden();
  // typing goes straight through (no Bornona mapping) while the device keyboard is in use
  await page.keyboard.type('ok');
  expect((await paras(page))[0]).toBe('ok');
  await page.getByTestId('voice-back').click();
  await expect(page.getByTestId('osk')).toBeVisible();
  await ctx.close();
});

test('pasting Bijoy text converts it to Unicode (setting on), leaves it when off', async ({ page }) => {
  await start(page);
  const paste = (text: string, html = '') =>
    editor(page).evaluate((el, [t, h]) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', t);
      if (h) dt.setData('text/html', h);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, [text, html]);
  await paste('Avgvi †mvbvi evsjv');
  expect((await paras(page))[0]).toBe('আমার সোনার বাংলা');
  await expect(page.getByTestId('toast')).toContainText('ইউনিকোডে');
  await page.keyboard.press('Enter');
  await paste('x', '<p><span style="font-family:SutonnyMJ">evw`</span> <span style="font-family:Arial">Plaintiff</span></p>');
  expect((await paras(page))[1]).toBe('বাদি Plaintiff');
  await section(page, 'ইউনিকোড ⇄ বিজয়');
  await page.getByTestId('auto-bijoy').uncheck();
  await page.getByTestId('settings').click();
  await editor(page).click();
  await page.keyboard.press('Enter');
  await paste('Avgvi');
  expect((await paras(page))[2]).toBe('Avgvi');
});

test('Bijoy panel: Unicode → Bijoy preview, Bijoy → Unicode insert', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await start(page);
  await page.getByTestId('tab-tools').click();
  await page.getByTestId('bijoy-toggle').click();
  await page.getByTestId('bijoy-in').fill('Avgvi †mvbvi evsjv');
  await page.getByTestId('to-unicode').click();
  expect((await paras(page))[0]).toBe('আমার সোনার বাংলা');
  await page.getByTestId('to-bijoy').click();
  await expect(page.getByTestId('bijoy-out')).toHaveText('Avgvi †mvbvi evsjv');
  await expect(page.getByTestId('toast')).toContainText('বিজয়ে কপি');
  const html = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return (await items[0].getType('text/html')).text();
  });
  expect(html).toContain("font-family:'SutonnyMJ'");
});

function avroXml(name: string, map: Record<string, string[]>): string {
  const back: Record<string, string> = { Backquote: 'OEM3', Minus: 'MINUS', Equal: 'PLUS', BracketLeft: 'OEM4', BracketRight: 'OEM6', Backslash: 'OEM5', Semicolon: 'OEM1', Quote: 'OEM7', Comma: 'COMMA', Period: 'PERIOD', Slash: 'OEM2' };
  const layers = ['Normal', 'Shift', 'AltGr', 'ShiftAltGr'];
  let keys = '';
  for (const [code, v] of Object.entries(map)) {
    if (code.startsWith('Numpad')) continue;
    const k = back[code] || code.replace(/^Key|^Digit/, '');
    v.forEach((ch, i) => { keys += `<Key_${k}_${layers[i]}><![CDATA[${ch}]]></Key_${k}_${layers[i]}>\n`; });
  }
  return `<?xml version="1.0"?><Layout><LayoutName><![CDATA[${name}]]></LayoutName><DeveloperName><![CDATA[Test]]></DeveloperName><KeyData>\n${keys}</KeyData></Layout>`;
}

test('custom .avrolayout: import, type with it, survives reload, delete needs two taps', async ({ page }) => {
  const probhat = layouts.find((l) => l.id === 'probhat')!;
  await start(page);
  await section(page, 'কিবোর্ড ও টাইপিং');
  await page.getByTestId('layout-add-file').setInputFiles({ name: 'Test.avrolayout', mimeType: 'text/xml', buffer: Buffer.from(avroXml('পরীক্ষা লেআউট', probhat.map)) });
  await expect(page.getByTestId('toast')).toContainText('পরীক্ষা লেআউট');
  await expect(page.getByTestId('layout')).toHaveValue(/^custom-/);
  await page.getByTestId('settings').click();
  await editor(page).click();
  await page.keyboard.press('KeyK');
  expect((await paras(page))[0]).toBe(probhat.map.KeyK[0]);
  await page.reload();
  await expect(page.getByTestId('layout')).toHaveValue(/^custom-/);
  await expect(page.getByTestId('layout').locator('optgroup[label="আপনার যোগ করা"] option')).toHaveText(['পরীক্ষা লেআউট']);
  await section(page, 'কিবোর্ড ও টাইপিং');
  const del = page.getByTestId('layout-list').getByRole('button');
  await del.click();
  await expect(page.getByTestId('layout-list')).toBeVisible();
  await del.click();
  await expect(page.getByTestId('layout-list')).toHaveCount(0);
  await expect(page.getByTestId('layout')).toHaveValue('pronotes');
});

test('bad layout file shows a message', async ({ page }) => {
  await start(page);
  await section(page, 'কিবোর্ড ও টাইপিং');
  await page.getByTestId('layout-add-file').setInputFiles({ name: 'x.avrolayout', mimeType: 'text/xml', buffer: Buffer.from('<Layout/>') });
  await expect(page.getByTestId('toast')).toContainText('পড়া গেল না');
});

const realFont = path.join(os.homedir(), '.fonts/NotoSansBengali_400Regular.ttf');
test('own font file: family read from the file, used for the page, kept after reload', async ({ page }) => {
  test.skip(!fs.existsSync(realFont), 'needs a local TTF file');
  await start(page);
  await section(page, 'ফন্ট');
  await page.getByTestId('font-add-uni-file').setInputFiles({ name: 'some-file-name.ttf', mimeType: 'font/ttf', buffer: fs.readFileSync(realFont) });
  await expect(page.getByTestId('font-list')).toContainText('Noto Sans Bengali');
  await expect(page.locator('.desk')).toHaveCSS('--doc-font', '"Noto Sans Bengali"');
  await page.reload();
  await section(page, 'ফন্ট');
  await expect(page.getByTestId('font-list')).toContainText('Noto Sans Bengali');
  expect(await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Noto Sans Bengali' && f.status === 'loaded'))).toBe(true);
});

test('not a font file shows a message', async ({ page }) => {
  await start(page);
  await section(page, 'ফন্ট');
  await page.getByTestId('font-add-uni-file').setInputFiles({ name: 'x.ttf', mimeType: 'font/ttf', buffer: Buffer.from('not a font') });
  await expect(page.getByTestId('toast')).toContainText('ফন্ট হিসেবে খোলা গেল না');
});

test('word bank: learn this draft, export (v8 format), reset needs two taps, import back', async ({ page }) => {
  await start(page);
  await editor(page).evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'মোকদ্দমা চলমান থাকিবে');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await section(page, 'শব্দভান্ডার');
  await page.getByTestId('learn-doc').click();
  await expect(page.getByTestId('toast')).toContainText('শেখা হলো');
  const count = async () => (await page.getByTestId('word-count').textContent()) ?? '';
  expect(await count()).not.toContain('শেখা শব্দ: ০টা');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('words-export').click()]);
  const file = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(file.app).toBe('bornona-pad');
  expect(file.words['মোকদ্দমা']).toBeGreaterThan(0);
  await page.getByTestId('words-reset').click();
  expect(await count()).not.toContain('শেখা শব্দ: ০টা');
  await page.getByTestId('words-reset').click();
  await expect(page.getByTestId('word-count')).toContainText('শেখা শব্দ: ০টা');
  await page.getByTestId('words-import-file').setInputFiles({ name: 'w.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.getByTestId('toast')).toContainText('নতুন শব্দ যোগ হলো');
  expect(await count()).not.toContain('শেখা শব্দ: ০টা');
});

test('voice settings and corrections are applied to the next result', async ({ page }) => {
  await page.addInitScript(MOCK_SR);
  await page.addInitScript(() => localStorage.setItem('pronotes.voiceConsent', 'true'));
  await start(page);
  await section(page, 'ভয়েস টাইপিং');
  await page.getByTestId('corr').fill('এক্তিয়ার = এখতিয়ার');
  await page.getByTestId('vdig').uncheck();
  await page.getByTestId('settings').click();
  await editor(page).click();
  await page.getByTestId('mic').click();
  await page.evaluate(() => (window as never as { __sr: { say: (t: string, f: boolean) => void } }).__sr.say('এক্তিয়ার 12', true));
  expect((await paras(page))[0]).toBe('এখতিয়ার 12 ');
});
