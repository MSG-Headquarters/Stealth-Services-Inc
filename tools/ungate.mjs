#!/usr/bin/env node
/**
 * Take the pretend gate out of the served bundle.
 *
 *   node tools/ungate.mjs [--check]
 *
 * ── WHAT THE GATE ACTUALLY WAS ──────────────────────────────────────────────
 *
 * A full-screen `.auth-gate` div painted over the page, plus a client-side
 * redirect to /Sunday/ when SundayAuth.init({requireAuth:true}) found no
 * session. The complete marketing copy still went over the wire either way —
 * `curl` returned all of it — so the "gate" hid the page from people and from
 * nobody else. A carrier reviewer with JavaScript on saw a spinner; the same
 * reviewer with `curl` saw everything. It protected nothing and blocked the one
 * audience that mattered.
 *
 * Removed rather than disabled. A gate that CSS can lift was never a gate, and
 * leaving the machinery in place invites it back as a "temporary" stopgap —
 * which the packet forbids in as many words.
 *
 * ── WHY THIS COUNTS DEPTH INSTEAD OF MATCHING END MARKERS ───────────────────
 *
 * The first version of this script searched for a literal closing string. It
 * threw on the very first file, because the overlay's `</div>` sits on its own
 * line in one page and inline in another. A cut driven by a guessed end marker
 * either misses or — worse — succeeds at the wrong place and eats content
 * silently. So the element and function cuts below count `<div>`/`</div>` and
 * `{`/`}` to their real closer, and every removal is asserted afterwards.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const FILES = ['index.html', 'apps.html', 'enterprise.html', '404.html'];
const CHECK = process.argv.includes('--check');

/** From `<div …` at `start`, return the index just past its matching `</div>`. */
function endOfDiv(src, start) {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const open = src.indexOf('<div', i);
    const close = src.indexOf('</div>', i);
    if (close === -1) throw new Error('unbalanced <div>');
    if (open !== -1 && open < close) {
      depth++;
      i = open + 4;
    } else {
      depth--;
      i = close + 6;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced <div>');
}

/** From the first `{` at or after `start`, return the index past its match. */
function endOfBraces(src, start) {
  const open = src.indexOf('{', start);
  if (open === -1) throw new Error('no opening brace');
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error('unbalanced braces');
}

/** Widen [from,to) to whole lines, so no blank fragments are left behind. */
function wholeLines(src, from, to) {
  const a = src.lastIndexOf('\n', from) + 1;
  const b = src.indexOf('\n', to - 1);
  return [a, b === -1 ? src.length : b + 1];
}

function ungate(src, file) {
  // 1 · Every CSS rule whose selector mentions .auth-gate.
  // `\r?\n` and `[ \t\r]` throughout this file: the working tree is CRLF, and
  // patterns anchored on a bare `\n` matched NOTHING — silently, because a
  // regex that finds no match is not an error. The end-of-run assertion is what
  // turned that into a failure instead of a quiet no-op.
  src = src.replace(/^[^\n{}]*\.auth-gate[^\n{}]*\{[^}]*\}[ \t\r]*\r?\n?/gm, '');

  // 2 · The overlay element, to its real closer.
  for (let guard = 0; guard < 5; guard++) {
    const at = src.indexOf('<div class="auth-gate"');
    if (at === -1) break;
    const [a, b] = wholeLines(src, at, endOfDiv(src, at));
    src = src.slice(0, a) + src.slice(b);
  }

  // 3 · The user badge, with the <li> that exists only to hold it. It only ever
  //     appeared once SundayAuth reported a session, so with the SDK gone it is
  //     a permanently hidden element wired to functions that no longer exist.
  for (let guard = 0; guard < 5; guard++) {
    const at = src.indexOf('<div class="user-badge"');
    if (at === -1) break;
    const liStart = src.lastIndexOf('<li>', at);
    const divEnd = endOfDiv(src, at);
    const liEnd = src.indexOf('</li>', divEnd);
    const useLi = liStart !== -1 && liEnd !== -1 && liStart > at - 200;
    const [a, b] = useLi
      ? wholeLines(src, liStart, liEnd + 5)
      : wholeLines(src, at, divEnd);
    src = src.slice(0, a) + src.slice(b);
  }

  // 4 · The SDK script tag and its comment.
  src = src.replace(/^[ \t]*<!-- Sunday Auth SDK -->[ \t\r]*\r?\n/m, '');
  src = src.replace(/^[ \t]*<script src="js\/sunday-auth\.js"><\/script>[ \t\r]*\r?\n/m, '');

  // 5 · The init block — from its comment through the end of the listener.
  for (let guard = 0; guard < 5; guard++) {
    const at = src.indexOf('// Initialize Sunday Auth');
    if (at === -1) break;
    const listener = src.indexOf('document.addEventListener', at);
    if (listener === -1) break;
    const end = src.indexOf(';', endOfBraces(src, listener) - 1);
    const [a, b] = wholeLines(src, at, end + 1);
    src = src.slice(0, a) + src.slice(b);
  }

  // 6 · A bare `SundayAuth.init({…});` with no comment above it — 404.html
  //     calls it with requireAuth:false purely to paint the user badge.
  for (let guard = 0; guard < 5; guard++) {
    const at = src.indexOf('SundayAuth.init(');
    if (at === -1) break;
    const end = src.indexOf(';', endOfBraces(src, at));
    const [a, b] = wholeLines(src, at, end + 1);
    src = src.slice(0, a) + src.slice(b);
  }

  // Whatever shape the pages were in, none of these may survive.
  for (const forbidden of ['auth-gate', 'SundayAuth', 'sunday-auth.js']) {
    if (src.includes(forbidden)) {
      throw new Error(`${file}: "${forbidden}" still present after ungating`);
    }
  }
  return src;
}

let total = 0;
for (const file of FILES) {
  const before = readFileSync(file, 'utf8');
  const after = ungate(before, file);
  if (!CHECK) writeFileSync(file, after);
  total += before.length - after.length;
  console.log(`  ${file.padEnd(18)} -${before.length - after.length} bytes`);
}
console.log(`\n  ${total} bytes of gate removed${CHECK ? ' (check only, nothing written)' : ''}`);
