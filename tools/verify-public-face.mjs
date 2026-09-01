#!/usr/bin/env node
/**
 * Prove the public face is actually public — §7 DoD 1 and 2.
 *
 *   node tools/verify-public-face.mjs
 *
 * Serves the bundle the way Cloudflare Static Assets does (`/x` → `x.html`,
 * `/dir/` → `dir/index.html`) and drives it in a real headless browser with no
 * cookies and no storage.
 *
 * ── WHY A BROWSER AND NOT `curl` ────────────────────────────────────────────
 *
 * `curl` never showed the problem in the first place. The gate was a CSS
 * overlay plus a client-side redirect, so the full marketing copy was always on
 * the wire — the capture proved that — and a fetch-based check would have
 * reported the site as public on the day it was not. The failure only existed
 * for someone running JavaScript, which is every reviewer and every customer.
 *
 * So the assertions are about what a browser ENDS UP SHOWING: the URL it
 * settles on after any redirect, and whether the rendered text is really
 * visible rather than painted over.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.COVRD_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 4173;
const ROOT = process.cwd();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain',
};

/** Cloudflare Static Assets resolution, as the capture documented it. */
function resolve(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const candidates = [clean, `${clean}.html`, join(clean, 'index.html')];
  for (const c of candidates) {
    const p = join(ROOT, c);
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

const server = createServer((req, res) => {
  const file = resolve(req.url);
  if (!file) {
    const notFound = join(ROOT, '404.html');
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    res.end(existsSync(notFound) ? readFileSync(notFound) : 'not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(PORT, r));
const base = `http://127.0.0.1:${PORT}`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
});

let failures = 0;
const fail = (m) => {
  failures++;
  console.log(`  ✗ ${m}`);
};

const PAGES = ['/', '/apps', '/enterprise', '/terms', '/privacy'];

for (const path of PAGES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 900)); // let any redirect fire

  const landed = page.url().replace(base, '') || '/';
  const info = await page.evaluate(() => {
    // Anything painted over the whole viewport with a high z-index.
    const covering = [...document.querySelectorAll('body *')].filter((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        (s.position === 'fixed' || s.position === 'absolute') &&
        s.visibility !== 'hidden' &&
        s.display !== 'none' &&
        parseFloat(s.opacity) > 0.5 &&
        Number(s.zIndex) >= 1000 &&
        r.width >= window.innerWidth * 0.9 &&
        r.height >= window.innerHeight * 0.9
      );
    });
    return {
      text: document.body.innerText.trim(),
      covering: covering.map((el) => el.className || el.tagName),
    };
  });

  const redirected = landed !== path && !(path === '/' && landed === '/');
  const visible = info.text.length;

  if (redirected) fail(`${path} redirected to ${landed}`);
  if (info.covering.length) fail(`${path} has a full-screen overlay: ${info.covering.join(', ')}`);
  if (visible < 400) fail(`${path} rendered only ${visible} chars of visible text`);

  // 30919 is answered by TEXT A REVIEWER CAN READ, not by markup that exists.
  // Asserted on innerText, which excludes anything display:none or clipped
  // away — the distinction that matters when the last thing on this page to
  // hide content did it with CSS.
  if (path === '/') {
    for (const required of [
      'Stealth Services Inc.',
      'contact@umbrassi.com',
      // "c/o" is the whole point: post reaches this business at that mailbox,
      // which is a fact about a place. Asserted WITH the prefix so a future
      // edit that drops it — turning the line back into a bare company address
      // — fails here rather than on a reviewer's desk.
      'c/o Main Street Group LLC',
      '400 N Tampa St Ste 1550 #520419',
      'Tampa, FL 33602',
    ]) {
      if (!info.text.includes(required)) fail(`/ does not display "${required}"`);
    }

    // ── THE INVERSE ASSERTION ────────────────────────────────────────────
    //
    // Stealth Services Inc is owned 100% by one person; the entity whose
    // mailbox is above is separately owned. There is no parent/subsidiary
    // relationship on paper, so the rendered page may not assert one — and
    // this is the surface a carrier reviewer cross-checks against Sunbiz.
    //
    // Checked on innerText rather than the source, because what matters is
    // what a person READS. The claim reached `main` once already by being
    // written into copy that nobody re-read; a green test is what stops the
    // next well-meaning edit putting it back.
    for (const forbidden of [
      'A Main Street Group LLC company',
      'A Main Street Group Company',
      'A Main Street Group LLC Company',
      'Main Street Group portfolio',
    ]) {
      if (info.text.includes(forbidden)) fail(`/ displays the ownership claim "${forbidden}"`);
    }

    // Belt and braces: the entity name may appear on the rendered page ONLY as
    // part of the c/o postal line. Catches a phrasing the list above has not
    // thought of.
    const mentions = info.text.split('Main Street Group').length - 1;
    const allowed = info.text.split('c/o Main Street Group LLC').length - 1;
    if (mentions !== allowed) {
      fail(`/ mentions the other entity ${mentions}× but only ${allowed}× as "c/o"`);
    }
  }

  if (!redirected && !info.covering.length && visible >= 400) {
    console.log(`  ✓ ${path.padEnd(12)} ${String(visible).padStart(5)} chars visible, no overlay, no redirect`);
  }

  if (process.env.SSI_SHOTS === '1') {
    // Look at the pages, rather than trusting a character count. The business
    // block being present in the DOM and being legible on screen are two
    // different claims.
    mkdirSync('docs/shots', { recursive: true });
    await page.evaluate(() => document.getElementById('contact')?.scrollIntoView());
    await new Promise((r) => setTimeout(r, 500));
    const name = path === '/' ? 'home' : path.slice(1);
    await page.screenshot({ path: `docs/shots/${name}.png`, fullPage: true });
  }
  await page.close();
}

// DoD 2 — no fake numbers anywhere in what is served.
console.log('');
const served = PAGES.map((p) => resolve(p)).filter(Boolean);
for (const f of ['index.html', 'apps.html', 'enterprise.html', '404.html', 'terms.html', 'privacy.html', 'Sunday/index.html', 'Apps/index.html', 'Zenith/index.html', 'macra/index.html', 'iaxis/index.html']) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  const src = readFileSync(p, 'utf8');
  if (/555/.test(src)) fail(`${f} still contains "555"`);
  if (/tel:/.test(src)) fail(`${f} still contains a tel: link`);
}
if (!failures) console.log('  ✓ no "555" and no tel: link anywhere in the served bundle');

await browser.close();
server.close();
console.log(failures ? `\n  ${failures} failure(s)\n` : '\n  public face verified\n');
process.exitCode = failures ? 1 : 0;
