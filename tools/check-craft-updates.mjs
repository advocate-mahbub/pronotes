#!/usr/bin/env node
/**
 * Looks for new versions of the Craft apps in src/craft/apps.json, and for new Craft apps, and
 * writes the changes into apps.json. Run by .github/workflows/craft-update.yml, which opens a
 * pull request: nothing reaches the live site until the owner merges it.
 *
 * - A newer release of a listed app → version and sha256 updated (from the release's SHA256SUMS.txt).
 * - A new storytold repo whose latest release has a "<repo>-web-<version>.zip" → added with
 *   enabled=false and bridge "unknown", for the owner to try on the iPad first.
 *
 * Uses the public GitHub REST API; GITHUB_TOKEN (set in Actions) raises the rate limit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'src/craft/apps.json');
const ORG = 'storytold';
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'pronotes-craft-check', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${path}: HTTP ${res.status}`);
  return res.json();
}

/** Newer-than for plain x.y.z versions (pre-release tags are skipped by the caller). */
export function newer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

/** The web zip of a release and its SHA-256, or null when the release has no web build. */
async function webBuild(repo) {
  const rel = await gh(`/repos/${repo}/releases/latest`);
  if (!rel || rel.prerelease || rel.draft) return null;
  const version = String(rel.tag_name).replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
  const name = repo.split('/')[1];
  const zip = rel.assets?.find((x) => x.name === `${name}-web-${version}.zip`);
  const sums = rel.assets?.find((x) => x.name === 'SHA256SUMS.txt');
  if (!zip || !sums) return null;
  const text = await (await fetch(sums.browser_download_url)).text();
  const line = text.split('\n').find((l) => l.trim().endsWith(zip.name));
  const sha256 = line?.trim().split(/\s+/)[0];
  if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  return { version, sha256, sizeMiB: Math.round(zip.size / 2 ** 20) };
}

export async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const changes = [];
  for (const app of manifest.apps) {
    const b = await webBuild(app.repo);
    if (b && newer(b.version, app.version)) {
      changes.push(`${app.name}: ${app.version} → ${b.version} (zip ${b.sizeMiB} MiB)`);
      Object.assign(app, { version: b.version, sha256: b.sha256 });
    }
  }
  // new apps: every public repo of the org with a web zip in its latest release
  const known = new Set(manifest.apps.map((a) => a.repo.toLowerCase()));
  for (let page = 1; page < 10; page++) {
    const repos = await gh(`/orgs/${ORG}/repos?type=public&per_page=100&page=${page}`);
    if (!repos?.length) break;
    for (const r of repos) {
      if (r.archived || known.has(r.full_name.toLowerCase())) continue;
      const b = await webBuild(r.full_name);
      if (!b) continue;
      const id = r.name.toLowerCase();
      if (!/^[a-z0-9-]+$/.test(id)) continue;
      manifest.apps.push({ id, name: r.name, label: r.description?.slice(0, 60) ?? r.name, repo: r.full_name, version: b.version, sha256: b.sha256, bridge: 'unknown', accept: '', enabled: false });
      changes.push(`new app: ${r.name} ${b.version} (zip ${b.sizeMiB} MiB) — added switched off`);
    }
  }
  if (!changes.length) return console.log('no Craft app changes');
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(changes.join('\n'));
  // the workflow puts this list into the pull request
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `summary<<EOF\n${changes.map((c) => '- ' + c).join('\n')}\nEOF\n`, { flag: 'a' });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
