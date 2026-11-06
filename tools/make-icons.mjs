// Renders the app icons (public/icons/*.png) from one HTML design with Chromium.
// Needs the Noto Sans Bengali font on the machine running it. Run: node tools/make-icons.mjs
import { chromium } from '@playwright/test';
import path from 'node:path';

const out = path.resolve('public/icons');
const design = (size, maskable) => `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:${size}px;height:${size}px;background:${maskable ? '#0f2a4f' : 'transparent'}}
.i{position:absolute;inset:${maskable ? 0 : size * 0.04}px;border-radius:${maskable ? 0 : size * 0.22}px;background:#0f2a4f;display:grid;place-items:center}
.p{position:relative;width:${size * (maskable ? 0.46 : 0.58)}px;height:${size * (maskable ? 0.56 : 0.7)}px;border:${Math.max(2, size * 0.022)}px solid #c8a45d;border-radius:${size * 0.04}px;
  display:grid;place-items:center;font:700 ${size * (maskable ? 0.28 : 0.36)}px "Noto Sans Bengali";color:#c8a45d;line-height:1}
.p:after{content:"";position:absolute;right:${-size * 0.022}px;top:${-size * 0.022}px;border-style:solid;border-width:0 ${size * 0.09}px ${size * 0.09}px 0;border-color:#0f2a4f #0f2a4f #c8a45d #c8a45d}
</style><div class="i"><div class="p">প্র</div></div>`;
const b = await chromium.launch();
for (const [name, size, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true], ['favicon-64.png', 64, false]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(design(size, maskable));
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(out, name), omitBackground: !maskable });
  await p.close();
}
await b.close();
console.log('icons written to', out);
