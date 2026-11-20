import type { Page } from '@playwright/test';

export type SettingsTab = 'type' | 'voice' | 'font' | 'words' | 'app';

/** Where each part of Settings lives now (tabs), by the names the older tests used. */
const TAB_OF: [RegExp, SettingsTab][] = [
  [/কিবোর্ড|শর্টকাট|টাইপিং-এর/, 'type'],
  [/AI|ভ[\u09df\u09af]|Gemini/, 'voice'],
  [/ফন্ট|বিজ|Font/, 'font'],
  [/শব্দ/, 'words'],
  [/অ্যাপ|ব্যাকআপ|App|menu/i, 'app'],
];

/** Opens Settings (if closed) on the tab that holds this part. */
export async function section(page: Page, name: string): Promise<void> {
  const tab = (['type', 'voice', 'font', 'words', 'app'] as string[]).includes(name) ? (name as SettingsTab) : TAB_OF.find(([re]) => re.test(name))?.[1];
  if (!tab) throw new Error('no Settings tab for ' + name);
  if (!(await page.getByTestId('settings-panel').isVisible())) await page.getByTestId('settings').click();
  await page.getByTestId('stab-' + tab).click();
  // the backup group can be folded (decisions.md 78): open it for the tests that use it
  if (tab === 'app') {
    const f = page.getByTestId('backup-fold');
    if ((await f.count()) && (await f.getAttribute('aria-expanded')) === 'false') await f.click();
  }
  // own font files are folded too (decisions.md 85)
  if (tab === 'font') await openOwnFonts(page);
}

/** Unfolds Settings → ফন্ট → নিজের ফন্ট ফাইল. */
export async function openOwnFonts(page: Page): Promise<void> {
  const f = page.getByTestId('own-fonts-fold');
  if ((await f.count()) && (await f.getAttribute('aria-expanded')) === 'false') await f.click();
}
