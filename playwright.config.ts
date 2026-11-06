import { defineConfig, devices } from '@playwright/test';

// iPad is the first target. WebKit is the closest engine to iPad Safari, but it is not a real iPad:
// the manual checklist in docs/ipad-checklist.md (from M6) is still required.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  webServer: { command: 'npm run build && npm run preview -- --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 120_000 },
  use: { baseURL: 'http://localhost:4173/' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-ipad', use: { ...devices['iPad Pro 11 landscape'] } },
  ],
});
