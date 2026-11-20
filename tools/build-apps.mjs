/**
 * Builds apps.mahbuburrahman.bd (decisions.md 81) into dist-apps/: the page, the service worker (/sw.js)
 * and the bridge put into every app page (/bridge.js). sw.js and bridge.js keep fixed names (no hash):
 * the browser looks for them at those addresses.
 */
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { copyFileSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.join(here, '..', 'apps-site');
const out = path.join(here, '..', 'dist-apps');
const quiet = { logLevel: 'warn', configFile: false };

await build({ ...quiet, root: site, base: '/', publicDir: path.join(site, 'public'), build: { outDir: out, emptyOutDir: true } });
for (const name of ['sw', 'bridge']) {
  await build({
    ...quiet, publicDir: false,
    build: { outDir: out, emptyOutDir: false, minify: true, lib: { entry: path.join(site, name + '.ts'), formats: ['iife'], name: 'pn_' + name, fileName: () => name + '.js' } },
  });
}
// the app's own Bangla font (SIL OFL, decisions.md 80) with its licence, from the one copy in src/assets
for (const f of ['kalpurush.woff2', 'Kalpurush-OFL.txt']) copyFileSync(path.join(here, '..', 'src', 'assets', 'fonts', f), path.join(out, f));
console.log('dist-apps ready');
