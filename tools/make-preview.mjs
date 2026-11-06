// Builds a single-file preview (dist-preview/pronotes-preview.html) from dist/ for testing on an iPad
// through a link (e.g. a claude.ai artifact). No service worker, so no offline/install in the preview.
// Run after `npm run build`. Literal U+FFFD characters in the bundle are written as escapes.
import fs from 'node:fs';
import path from 'node:path';
const dist = path.resolve('dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const js = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/);
const css = html.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/);
if (!js || !css) throw new Error('unexpected dist/index.html layout');
const read = (f) => fs.readFileSync(path.join(dist, f), 'utf8');
const fonts = [...html.matchAll(/<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts[^>]+>/g)].map((m) => m[0]).join('\n');
const out = `<title>ProNotes Preview</title>
${fonts}
<style>${read(css[1])}</style>
<div id="root"></div>
<script type="module">${read(js[1]).replace(/<\/script/gi, '<\\/script').replace(/\uFFFD/g, '\\uFFFD')}</script>
`;
fs.mkdirSync('dist-preview', { recursive: true });
fs.writeFileSync('dist-preview/pronotes-preview.html', out);
console.log('dist-preview/pronotes-preview.html', Math.round(out.length / 1024) + ' KB');
