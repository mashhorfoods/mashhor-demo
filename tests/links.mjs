// Stage 10.12 — every link on every page, both languages, resolved against the
// local server; plus the SEO head of every page. Prints dead links (not
// existing, not a planned future route) and head problems.
import './env.mjs';
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import http from 'node:http';
const ORIGIN = process.env.TEST_ORIGIN + ''; const BASE = '/mashhor-demo/';
const ROOT = new URL('../', import.meta.url).pathname;
const PAGES = ['index.html', '404.html', 'styleguide.html', 'services/index.html', 'destinations/index.html', 'offers/index.html', 'book/index.html',
  ...readdirSync(ROOT + 'services', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `services/${d.name}/index.html`),
  ...readdirSync(ROOT + 'offers', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `offers/${d.name}/index.html`),
  ...readdirSync(ROOT + 'supervisor', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `supervisor/${d.name}/index.html`)];
// Routes that later stages own: they 404 today by design (the 404 page explains and routes back).
const PLANNED = /^\/mashhor-demo\/(help|supervisors|destinations\/[a-z-]+|hotels\/[A-Z0-9-]+|packages\/[A-Z0-9-]+|legal|about|careers|partners|privacy|terms|cookies|faq|contact|offers\/categories)(\/|$)/;
const head = (path) => new Promise((res) => http.request({ host: new URL(process.env.TEST_ORIGIN).hostname, port: new URL(process.env.TEST_ORIGIN).port, path, method: 'HEAD' }, (r) => res(r.statusCode)).on('error', () => res(0)).end());
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const seen = new Map(); const dead = []; const external = new Set(); const heads = []; const planned = new Set();
for (const page of PAGES) for (const loc of ['ar', 'en']) {
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(ORIGIN + BASE + page, { waitUntil: 'networkidle' });
  if (loc === 'en') await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); await m.setLocale('en'); });
  await p.waitForTimeout(400);
  const info = await p.evaluate(() => ({
    title: document.title, desc: document.querySelector('meta[name=description]')?.content ?? '', canonical: document.querySelector('link[rel=canonical]')?.href ?? '',
    lang: document.documentElement.lang, dir: document.documentElement.dir, h1: document.querySelectorAll('h1').length, ogTitle: document.querySelector('meta[property="og:title"]')?.content ?? '',
    links: Array.from(document.querySelectorAll('a[href]')).map((a) => ({ href: a.href, text: (a.getAttribute('aria-label') || a.textContent).trim().slice(0, 40) })),
    vague: Array.from(document.querySelectorAll('a[href]')).filter((a) => /^(اضغط هنا|هنا|click here|here|more|المزيد|read more)$/i.test((a.getAttribute('aria-label') || a.textContent).trim())).length,
    imgs: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map((i) => i.getAttribute('src')),
  }));
  heads.push({ page, loc, ...info, links: undefined });
  if (!info.title || info.title.length < 10 || (loc === 'en' && !/Number One/.test(info.title)) || (loc === 'ar' && !/نمبرون/.test(info.title))) dead.push(`HEAD title ${page}/${loc}: "${info.title}"`);
  if (!info.desc) dead.push(`HEAD no description ${page}/${loc}`);
  if (page !== '404.html' && page !== 'styleguide.html' && !info.canonical.endsWith('/' + page.replace('index.html', ''))) dead.push(`HEAD canonical ${page}: ${info.canonical}`);
  if (info.lang !== loc || info.dir !== (loc === 'ar' ? 'rtl' : 'ltr')) dead.push(`HEAD lang/dir ${page}/${loc}: ${info.lang}/${info.dir}`);
  if (info.h1 !== 1) dead.push(`HEAD h1 ${page}/${loc}: ${info.h1}`);
  if (info.vague) dead.push(`vague link text ${page}/${loc}: ${info.vague}`);
  if (info.imgs.length) dead.push(`broken images ${page}/${loc}: ${info.imgs.join(',')}`);
  for (const { href, text } of info.links) {
    const u = new URL(href);
    if (u.origin !== ORIGIN) { external.add(href); continue; }
    const path = u.pathname;
    if (seen.has(path)) continue;
    let status = await head(path);
    if (status === 404 && PLANNED.test(path)) { planned.add(path); seen.set(path, 'planned'); continue; }
    seen.set(path, status);
    if (status !== 200) dead.push(`${status} ${path} ("${text}" on ${page}/${loc})`);
  }
  await p.close();
}
await b.close();
console.log(`pages: ${PAGES.length} × 2 · unique internal paths: ${seen.size} · planned (future stage) routes: ${planned.size}`);
console.log('planned:', [...planned].sort().join(' '));
console.log('external:', [...external].length ? [...external].join(' ') : 'none');
dead.forEach((d) => console.log('  ✗', d));
console.log(`${dead.length} problems`);
