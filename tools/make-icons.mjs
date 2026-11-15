// Regenerate all installed-app icons from the approved ProNotes vector master.
// Run: npm run icons
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('public/icons');
const svg = await fs.readFile(path.resolve('public/branding/app-icon.svg'), 'utf8');
const b = await chromium.launch();
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['maskable-512.png', 512], ['apple-touch-icon.png', 180], ['favicon-64.png', 64]]) {
  const page = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden}</style>${svg}`);
  await page.screenshot({ path: path.join(out, name), omitBackground: true });
  await page.close();
}
await b.close();
console.log('Official ProNotes icons written to', out);
