#!/usr/bin/env node
/**
 * Photograph just the business-information block.
 *
 *   node tools/shoot-contact.mjs
 *
 * The full-page shot from verify-public-face.mjs is 4,065px tall, so the block
 * that matters is a sliver of it. This clips to the element, which is the part
 * a carrier reviewer actually reads and the part this change is about.
 *
 * (Written as a file rather than piped through a heredoc: the shell has eaten
 * the backslash out of this script's path regex twice now.)
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = process.cwd();
const PORT = 4176;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.txt': 'text/plain',
};

function resolve(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  for (const c of [clean, `${clean}.html`, join(clean, 'index.html')]) {
    const p = join(ROOT, c);
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

const server = createServer((req, res) => {
  const file = resolve(req.url);
  if (!file) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(PORT, r));
mkdirSync('docs/shots', { recursive: true });

const browser = await puppeteer.launch({
  executablePath:
    process.env.COVRD_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900 });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 1000));

const el = await page.$('.business-info');
if (!el) throw new Error('.business-info not found — the block a reviewer needs is missing');
await el.screenshot({ path: 'docs/shots/contact-business-info.png' });
console.log('  wrote docs/shots/contact-business-info.png');

await browser.close();
server.close();
