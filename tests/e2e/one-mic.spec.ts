import { test, expect } from '@playwright/test';

// decisions.md 82: one 🎙 on the page — no second (LIVE) button beside it
test('one microphone on the page: a tap is Live, held is the other voice', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('editor').click();
  const mics = page.locator('[data-testid="mic"], [data-testid="live-mic"], [data-testid="ai-voice"]');
  await expect(mics).toHaveCount(1);
  await expect(page.getByTestId('live-mic')).toHaveAttribute('data-hold', 'yes'); // Chrome: Live, and the device's voice when held
});
