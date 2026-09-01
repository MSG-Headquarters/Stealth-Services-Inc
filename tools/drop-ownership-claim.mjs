#!/usr/bin/env node
/**
 * Remove every claim that SSI is owned by, or part of, Main Street Group.
 *
 *   node tools/drop-ownership-claim.mjs [--check]
 *
 * ── WHY THIS IS A SCRIPT AND WHY IT ASSERTS ─────────────────────────────────
 *
 * The claim is spread across eight places in six files and phrased five
 * different ways — "A Main Street Group LLC Company", "A Main Street Group
 * Company", "a Main Street Group LLC company", "Part of the Main Street Group
 * portfolio", "Main Street Group • Stealth Services Inc". Hand-editing that set
 * is how one survives in the file nobody reopened.
 *
 * So the end state is asserted rather than assumed: after this runs, the string
 * "Main Street Group" may appear ONLY in the `c/o` postal line, and the script
 * fails if it appears anywhere else.
 *
 * ── WHAT IS TRUE AND WHAT IS NOT ────────────────────────────────────────────
 *
 * Stealth Services Inc is owned 100% by one person. Main Street Group LLC is a
 * separately owned entity. There is no parent/subsidiary relationship on paper,
 * so the site may not assert one — least of all on the surface a carrier
 * reviewer cross-checks against Sunbiz.
 *
 * What IS true is that post addressed to MSG's mailbox reaches this business.
 * "c/o" says exactly that and nothing more. An address is a place, not an org
 * chart.
 *
 * Nothing here invents a replacement phrase. "Affiliated with", "partner of"
 * and "in association with" are all the same unprovable claim wearing a hedge.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CHECK = process.argv.includes('--check');

/** The one place the string is allowed to survive. */
const ALLOWED = 'c/o Main Street Group LLC';

const EDITS = [
  // Footers — the copyright line, in each of the shapes the pages carry it.
  {
    file: 'apps.html',
    from: '© 2026 <a href="index.html">Stealth Services Inc.</a> — A Main Street Group LLC Company<br>',
    to: '© 2026 <a href="index.html">Stealth Services Inc.</a><br>',
  },
  {
    file: 'enterprise.html',
    from: '© 2026 <a href="index.html">Stealth Services Inc.</a> — A Main Street Group LLC Company<br>',
    to: '© 2026 <a href="index.html">Stealth Services Inc.</a><br>',
  },
  {
    file: 'terms.html',
    from: '© 2026 Stealth Services Inc. — A Main Street Group LLC Company',
    to: '© 2026 Stealth Services Inc.',
  },
  {
    file: 'privacy.html',
    from: '© 2026 Stealth Services Inc. — A Main Street Group LLC Company',
    to: '© 2026 Stealth Services Inc.',
  },

  // Body copy on the two pages I wrote last packet — the same claim, inherited
  // from the business block it was drafted alongside.
  {
    file: 'terms.html',
    from: `                This site is operated by <strong>Stealth Services Inc.</strong>,
                a Main Street Group LLC company. Full details are in the`,
    to: `                This site is operated by <strong>Stealth Services Inc.</strong>
                Full details are in the`,
  },
  {
    file: 'privacy.html',
    from: `            Stealth Services Inc., a Main Street Group LLC company. Postal
            address and contact route are in the`,
    to: `            Stealth Services Inc. Postal
            address and contact route are in the`,
  },

  // Footer brand juxtapositions on two inner pages. Weaker than "A … Company",
  // but §2's proof is that the string survives only in the c/o line, and a
  // reviewer reading "Main Street Group • Stealth Services Inc" reads an
  // association we cannot paper.
  {
    file: 'Apps/index.html',
    from: '<p class="footer-brand">Main Street Group • Stealth Services Inc</p>',
    to: '<p class="footer-brand">Stealth Services Inc</p>',
  },
  {
    file: 'Zenith/index.html',
    from: '<p class="footer-brand">Main Street Group • Stealth Services Inc</p>',
    to: '<p class="footer-brand">Stealth Services Inc</p>',
  },
];

for (const { file, from, to } of EDITS) {
  if (!existsSync(file)) {
    console.log(`  ${file.padEnd(20)} absent, skipped`);
    continue;
  }
  const src = readFileSync(file, 'utf8');
  // CRLF working tree — match on either ending rather than on `\n` alone. This
  // repo has already lost an afternoon to that once.
  const fromCRLF = from.replace(/\n/g, '\r\n');
  const hit = src.includes(from) ? from : src.includes(fromCRLF) ? fromCRLF : null;
  if (!hit) {
    console.log(`  ${file.padEnd(20)} pattern not found (already clean?)`);
    continue;
  }
  const toMatched = hit === fromCRLF ? to.replace(/\n/g, '\r\n') : to;
  if (!CHECK) writeFileSync(file, src.replace(hit, toMatched));
  console.log(`  ${file.padEnd(20)} claim removed`);
}

// ── the assertion that makes this provable ────────────────────────────────
const BUNDLE = [
  'index.html', 'apps.html', 'enterprise.html', '404.html',
  'terms.html', 'privacy.html',
  'Apps/index.html', 'Zenith/index.html', 'Sunday/index.html',
  'macra/index.html', 'iaxis/index.html',
];

let bad = 0;
console.log('');
for (const f of BUNDLE) {
  if (!existsSync(f)) continue;
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.includes('Main Street Group')) return;
    // The c/o postal line is the one permitted survivor. HTML comments
    // explaining the removal are not part of what a visitor is served, but they
    // do carry the string — so they are allowed and named as such.
    if (line.includes(ALLOWED)) {
      console.log(`  ✓ ${f}:${i + 1} — the permitted c/o postal line`);
      return;
    }
    if (/^\s*(<!--|.*-->|\s*")/.test(line) || line.trim().startsWith('*')) return;
    console.log(`  ✗ ${f}:${i + 1} — ${line.trim().slice(0, 90)}`);
    bad++;
  });
}

console.log(bad ? `\n  ${bad} ownership claim(s) still present\n` : '\n  no ownership claim survives\n');
process.exitCode = bad ? 1 : 0;
