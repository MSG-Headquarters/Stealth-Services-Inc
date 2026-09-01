#!/usr/bin/env node
/**
 * Sweep up what removing the gate left behind.
 *
 *   node tools/tidy-gate-residue.mjs [--check]
 *
 * ── THE BUG THIS SCRIPT ALREADY CAUSED ONCE ─────────────────────────────────
 *
 * The first version removed `@keyframes spin` with the regex
 * `@keyframes spin \{[\s\S]*?\n[ \t]*\}` — "everything up to a line that starts
 * with a closing brace". index.html writes CSS one property per line, so that
 * worked there. **enterprise.html writes one whole rule per line**, so the
 * pattern found no line-leading `}` until ~100 rules later and deleted the
 * entire stylesheet: 118 lines, 9.4 KB, including `.geo-grid`, `nav`, `.hero`
 * and every button style. The page would have shipped unstyled.
 *
 * It was caught by reading the diff, not by the byte count — which looked
 * plausible. A removal driven by "the next line that looks like an ending" is a
 * guess about formatting; brace counting is a fact about the text. Everything
 * below counts braces, exactly as tools/ungate.mjs does.
 *
 * What it removes, and only where genuinely unused:
 *   · the orphaned `/* ===== AUTH GATE OVERLAY ===== *\/` section header
 *   · `@keyframes spin` / `@keyframes pulse` — the gate's spinner
 *   · `.user-badge`, `.user-badge-avatar`, `.logout-btn` — markup went with the SDK
 *
 * `pulse` survives on index.html because something else still animates with it.
 * Checked per file rather than assumed.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const FILES = ['index.html', 'apps.html', 'enterprise.html', '404.html'];
const CHECK = process.argv.includes('--check');

/** From the first `{` at or after `start`, the index just past its match. */
function endOfBraces(src, start) {
  const open = src.indexOf('{', start);
  if (open === -1) return -1;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** Remove the whole construct beginning at `needle`, brace-counted. */
function dropConstruct(src, needle, guard = 10) {
  for (let n = 0; n < guard; n++) {
    const at = src.indexOf(needle);
    if (at === -1) break;
    const end = endOfBraces(src, at);
    if (end === -1) break;
    const lineStart = src.lastIndexOf('\n', at) + 1;
    // Only swallow to end-of-line if nothing else shares the line.
    const nl = src.indexOf('\n', end);
    const trailing = src.slice(end, nl === -1 ? src.length : nl);
    const lineEnd = /^\s*$/.test(trailing) && nl !== -1 ? nl + 1 : end;
    const leading = src.slice(lineStart, at);
    const from = /^\s*$/.test(leading) ? lineStart : at;
    src = src.slice(0, from) + src.slice(lineEnd);
  }
  return src;
}

function animatedWith(src, name) {
  return new RegExp(`animation[^;{}]*\\b${name}\\b`).test(src);
}

let total = 0;
for (const file of FILES) {
  const before = readFileSync(file, 'utf8');
  let src = before;

  // `\r?\n`: the working tree is CRLF, and a bare `\n` anchor matches nothing.
  src = src.replace(/^[ \t]*\/\* =+ AUTH GATE OVERLAY =+ \*\/[ \t\r]*\r?\n/gm, '');

  for (const name of ['spin', 'pulse']) {
    if (!animatedWith(src, name)) src = dropConstruct(src, `@keyframes ${name}`, 2);
  }

  if (!/class="user-badge|id="userBadge/.test(src)) {
    for (const sel of ['.user-badge-avatar', '.user-badge']) {
      src = dropConstruct(src, `\n        ${sel} `, 3);
      src = dropConstruct(src, `\n        ${sel}\n`, 3);
    }
  }
  if (!/class="logout-btn/.test(src)) {
    for (const sel of ['.logout-btn:hover', '.logout-btn']) {
      src = dropConstruct(src, `\n        ${sel} `, 3);
      src = dropConstruct(src, `\n        ${sel}\n`, 3);
    }
  }

  src = src.replace(/(\r?\n){4,}/g, (m) => (m.includes('\r') ? '\r\n\r\n\r\n' : '\n\n\n'));

  // GUARD: this script only ever removes orphans. Anything approaching the
  // scale of a stylesheet means the patterns matched something they should not
  // — which is precisely what happened the first time.
  const removed = before.length - src.length;
  if (removed > 2500) {
    throw new Error(
      `${file}: refusing to remove ${removed} bytes of "residue" — that is a stylesheet, not an orphan`,
    );
  }

  if (!CHECK) writeFileSync(file, src);
  total += removed;
  console.log(`  ${file.padEnd(18)} -${removed} bytes`);
}
console.log(`\n  ${total} bytes of residue${CHECK ? ' (check only)' : ''}`);
