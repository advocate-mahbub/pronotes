// Builds a single-file preview (dist-preview/pronotes-preview.html) for testing on an iPad through a link
// (a claude.ai artifact). One JS bundle (no code splitting), fonts inlined as data: URLs.
// No service worker, so no offline/install in the preview. Literal U+FFFD characters are written as escapes.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

process.env.PRONOTES_PREVIEW = '1';
await build({ logLevel: 'warn' });
const dist = path.resolve('dist-preview/build');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const js = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/);
const css = html.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/);
if (!js || !css) throw new Error('unexpected index.html layout');
const read = (f) => fs.readFileSync(path.join(dist, f), 'utf8');
let style = read(css[1])
  .replace(/,\s*url\([^)]*\.woff\)\s*format\(["']woff["']\)/g, '')
  .replace(/url\(\.?\/?([^)]+\.woff2)\)/g, (_m, f) => {
    const file = path.join(dist, 'assets', path.basename(f));
    return 'url(data:font/woff2;base64,' + fs.readFileSync(file).toString('base64') + ')';
  });
if (/url\((?!data:)[^)]*\.woff/.test(style)) throw new Error('a font file was not inlined');
const out = `<title>ProNotes Preview</title>
<style>${style}</style>
<div id="root"></div>
<script type="module">${read(js[1]).replace(/<\/script/gi, '<\\/script').replace(/\uFFFD/g, '\\uFFFD')}</script>
`;
fs.writeFileSync('dist-preview/pronotes-preview.html', out);
fs.rmSync(dist, { recursive: true, force: true });
console.log('dist-preview/pronotes-preview.html', Math.round(out.length / 1024) + ' KB');
