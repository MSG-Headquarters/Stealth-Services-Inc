#!/usr/bin/env node
/**
 * Assemble the deployable site into `dist/`.
 *
 *   node tools/build-bundle.mjs
 *
 * ── WHY THIS EXISTS: THE .git LEAK ──────────────────────────────────────────
 *
 * `wrangler.toml` pointed `[assets] directory` at the REPO ROOT, with an
 * `.assetsignore` listing what to keep out. Two things went wrong at once:
 *
 *   1. The ignore file forgot `.git/`, so the first deploy uploaded the entire
 *      repository — objects, refs, logs, hooks — to a public website. A served
 *      `.git` directory hands over the whole history, including files deleted
 *      from the tip, which here means the old covrd page and its fake numbers.
 *
 *   2. Fixing the list did not help: wrangler kept reporting "Read 243 files"
 *      no matter what `.assetsignore` said, so the ignore was not being honoured
 *      at all with `directory = "./"`.
 *
 * The second point is the important one. A deploy whose safety depends on a
 * denylist being both complete AND actually read is a deploy that leaks the
 * first time either assumption slips. This repo's own rulebook says it in as
 * many words: assert the allowed set instead of enumerating the forbidden one.
 *
 * ── SO THE BUNDLE IS AN ALLOWLIST, DERIVED FROM VERSION CONTROL ─────────────
 *
 * `git ls-files` is the source of truth: only files committed to this branch
 * can ship, minus the handful that are tooling rather than website. Nothing
 * untracked can leak — not `.git`, not `.wrangler`, not an editor swap file,
 * not a `.env` somebody drops in the root next month.
 *
 * `dist/` is rebuilt from scratch every run, so a file removed from the repo
 * disappears from the deploy rather than lingering.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');

/** Tracked, but tooling or notes rather than website. */
const NOT_THE_WEBSITE = [
  /^tools\//,
  /^docs\//,
  /^dist\//,
  /^\.github\//,
  /^CAPTURE\.md$/,
  /^README\.md$/,
  /^wrangler\.toml$/,
  /^\.assetsignore$/,
  /^\.gitignore$/,
];

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

const shipping = tracked.filter((f) => !NOT_THE_WEBSITE.some((re) => re.test(f)));

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

for (const rel of shipping) {
  const from = join(ROOT, rel);
  if (!existsSync(from)) continue; // deleted but not yet committed
  const to = join(DIST, rel);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

// The guard. This bundle is a small static site; a three-digit count means
// something is being swept in that should not be, which is exactly the failure
// this script was written after.
if (shipping.length > 60) {
  throw new Error(
    `refusing: ${shipping.length} files would ship. This bundle is ~28 files — ` +
      'something is being included that should not be.',
  );
}

console.log(`  dist/ built — ${shipping.length} files`);
for (const f of shipping) console.log(`    ${f}`);
