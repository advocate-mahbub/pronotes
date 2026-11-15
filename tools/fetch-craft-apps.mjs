#!/usr/bin/env node
/**
 * Puts the official Craft web builds listed in src/craft/apps.json into <out>/apps/<id>/<version>/.
 *
 *   node tools/fetch-craft-apps.mjs dist     ← after `npm run build` (deploy does this)
 *   node tools/fetch-craft-apps.mjs public   ← for `npm run dev` (public/apps is git-ignored)
 *
 * The zips are never committed. Each one is downloaded from the app's GitHub release, checked
 * against the SHA-256 in apps.json, kept in .craft-cache/ and unpacked unchanged (licence and
 * NOTICE files included). Only apps with "enabled": true are fetched.
 * Stops with an error when a file is over GitHub Pages' 100 MiB limit or the apps together pass
 * the size budget (the published site may be at most 1 GB).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_FILE = 100 * 1024 * 1024; // GitHub Pages refuses larger files
const BUDGET = 700 * 1024 * 1024; // leaves room for ProNotes itself under the 1 GB site limit
const SAFE_ID = /^[a-z0-9-]+$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$/;

export const zipName = (a) => `${a.id}-web-${a.version}.zip`;
export const zipUrl = (a) => `https://github.com/${a.repo}/releases/download/v${a.version}/${zipName(a)}`;

async function getZip(app, cacheDir) {
  const file = join(cacheDir, zipName(app));
  let bytes = existsSync(file) ? readFileSync(file) : null;
  if (!bytes) {
    console.log(`  downloading ${zipUrl(app)}`);
    const res = await fetch(zipUrl(app));
    if (!res.ok) throw new Error(`${app.id}: download failed (HTTP ${res.status})`);
    bytes = Buffer.from(await res.arrayBuffer());
  }
  const sum = createHash('sha256').update(bytes).digest('hex');
  if (sum !== app.sha256) {
    rmSync(file, { force: true });
    throw new Error(`${app.id}: SHA-256 does not match apps.json (got ${sum})`);
  }
  writeFileSync(file, bytes);
  return bytes;
}

export async function fetchApps(outDir, { manifest = join(ROOT, 'src/craft/apps.json'), cacheDir = join(ROOT, '.craft-cache') } = {}) {
  const { apps } = JSON.parse(readFileSync(manifest, 'utf8'));
  mkdirSync(cacheDir, { recursive: true });
  let total = 0;
  for (const app of apps.filter((a) => a.enabled)) {
    if (!SAFE_ID.test(app.id) || !SAFE_VERSION.test(app.version)) throw new Error(`bad id/version: ${app.id} ${app.version}`);
    const dest = join(outDir, 'apps', app.id, app.version);
    const marker = join(dest, '.sha256');
    if (existsSync(marker) && readFileSync(marker, 'utf8') === app.sha256) {
      console.log(`✓ ${app.name} ${app.version} (already in place)`);
      continue;
    }
    console.log(`→ ${app.name} ${app.version}`);
    const zip = await JSZip.loadAsync(await getZip(app, cacheDir));
    rmSync(dest, { recursive: true, force: true });
    const top = `${app.id}-web-${app.version}/`;
    let size = 0;
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const rel = entry.name.startsWith(top) ? entry.name.slice(top.length) : entry.name;
      // never write outside the app's folder
      if (!rel || rel.split('/').some((p) => p === '..' || p === '') || rel.startsWith('/')) throw new Error(`${app.id}: unsafe path in zip: ${entry.name}`);
      const data = await entry.async('nodebuffer');
      if (data.length > MAX_FILE) throw new Error(`${app.id}: ${rel} is ${(data.length / 2 ** 20).toFixed(1)} MiB, over the 100 MiB GitHub Pages limit`);
      size += data.length;
      const target = join(dest, rel);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data);
    }
    if (!existsSync(join(dest, 'index.html'))) throw new Error(`${app.id}: no index.html in the zip`);
    writeFileSync(marker, app.sha256);
    total += size;
    console.log(`  ${(size / 2 ** 20).toFixed(1)} MiB`);
  }
  if (total > BUDGET) throw new Error(`apps total ${(total / 2 ** 20).toFixed(0)} MiB, over the ${BUDGET / 2 ** 20} MiB budget`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: node tools/fetch-craft-apps.mjs <dist|public>');
    process.exit(2);
  }
  fetchApps(resolve(out)).catch((e) => {
    console.error('✗ ' + e.message);
    process.exit(1);
  });
}
