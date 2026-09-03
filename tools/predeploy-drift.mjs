#!/usr/bin/env node
/**
 * What is live that this repo does not have? — run BEFORE the first deploy.
 *
 *   node tools/predeploy-drift.mjs
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 *
 * `wrangler deploy` replaces the Worker's entire asset bundle. The bundle live
 * today was hand-uploaded through the dashboard over seven months, and the only
 * record of it is CAPTURE.md — which says in its own words that completeness
 * cannot be proven, because Cloudflare exposes no API to list a deployed
 * Worker's assets.
 *
 * So the honest position before the first deploy is: an unlinked file that was
 * also absent from the capture's probe list is invisible, and deploying deletes
 * it. This narrows that window as far as it can be narrowed without an API that
 * does not exist — it re-probes every path the capture knew about plus every
 * path this repo would serve, and reports anything that answers live but is NOT
 * in the repo.
 *
 * A clean run does NOT prove there is nothing else. It proves nothing KNOWN is
 * about to be lost, which is a smaller claim and the true one.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ORIGIN = process.env.SSI_ORIGIN ?? 'https://www.umbrassi.com';
const ROOT = process.cwd();

const SKIP = new Set(['.git', 'tools', 'docs', 'node_modules']);

/** Every file the repo would publish, as the URL path it would answer on. */
function repoPaths(dir = ROOT, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      repoPaths(full, out);
      continue;
    }
    const rel = relative(ROOT, full).split('\\').join('/');
    if (rel.startsWith('.') || rel === 'CAPTURE.md' || rel === 'wrangler.toml') continue;
    out.push(rel);
  }
  return out;
}

/** Cloudflare Static Assets rewrites: /x.html → /x, /dir/index.html → /dir/. */
function servedAs(rel) {
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  if (rel === 'index.html') return '/';
  if (rel.endsWith('.html')) return '/' + rel.slice(0, -'.html'.length);
  return '/' + rel;
}

const repo = repoPaths();
const repoServed = new Set(repo.map(servedAs));

/**
 * The capture's probe list — paths nobody links to. `/covrd/` and `/Sunday/`
 * were BOTH found this way and neither was reachable by crawling, which is the
 * whole argument for keeping this list rather than trusting a crawl.
 */
const UNLINKED_PROBES = [
  '/covrd/', '/Sunday/', '/Apps/', '/Zenith/', '/macra/', '/iaxis/',
  '/robots.txt', '/sitemap.xml', '/favicon.ico', '/manifest.json',
  '/manifest.webmanifest', '/.well-known/security.txt',
  '/admin/', '/login', '/dashboard/', '/api/', '/assets/', '/static/',
  '/index.html', '/apps.html', '/enterprise.html', '/404.html',
  '/terms', '/privacy', '/apps', '/enterprise',
];

const toProbe = [...new Set([...repoServed, ...UNLINKED_PROBES])].sort();

console.log(`  probing ${toProbe.length} paths against ${ORIGIN}\n`);

const missing = [];
const present = [];

for (const path of toProbe) {
  let status = 0;
  try {
    const res = await fetch(`${ORIGIN}${path}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    status = res.status;
  } catch {
    status = -1;
  }

  if (status !== 200) continue;
  present.push(path);

  // Does the repo answer this path?
  const candidates = [
    path === '/' ? 'index.html' : null,
    path.endsWith('/') ? `${path.slice(1)}index.html` : null,
    `${path.slice(1)}.html`,
    path.slice(1),
  ].filter(Boolean);

  if (!candidates.some((c) => existsSync(join(ROOT, c)))) missing.push(path);
}

console.log(`  ${present.length} paths answer 200 live`);

if (missing.length) {
  console.log(`\n  ⚠️ LIVE BUT NOT IN THIS REPO — deploying would DELETE these:\n`);
  for (const m of missing) console.log(`     ${m}`);
  console.log('\n  Capture them before deploying.\n');
} else {
  console.log('\n  ✓ nothing known is live that this repo does not also serve');
  console.log('    (not a completeness proof — see the header)\n');
}

process.exitCode = missing.length ? 1 : 0;
