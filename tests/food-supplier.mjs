// The food-supplier demo template (templates/food-supplier/): proves it carries
// no trace of the original client (brand, logo, country, phone codes, currency,
// image host, analytics) and that it still works: local assets resolve, anchors
// resolve, contact links agree with SITE settings, the layout holds from 390 to
// 1440px, basic accessibility holds, and the cart totals in the template currency.
// Serves the template itself, so it runs standalone:  node tests/food-supplier.mjs
import './env.mjs';
import { shot } from './env.mjs';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const DIR = new URL('../templates/food-supplier/', import.meta.url).pathname;
const DEPLOY = 'https://mashhorfoods.github.io/mashhor-demo/templates/food-supplier/';
let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`✗ ${name}${extra ? ' — ' + extra : ''}`); } };

// ---- 1. text audit over every text file in the template ----------------------
// The deployment URL is the hosting account's, not marketing copy, so it is
// stripped before the scan (see templates/food-supplier/README.md).
const FORBIDDEN = [/mashhor/i, /\blogo/i, /\boman/i, /muscat/i, /rusayl/i, /sultanate/i, /\bOMR\b/, /\+?968/, /i\.ibb\.co/, /placeholder\.com/,
  /mahinaz/i, /indian pride/i, /mahavir/i, /googletagmanager|gtag\(|clarity\.ms/, /docs\.google\.com/, /@gmail\.com/, /geo\.(region|placename|position)/, /ICBM/];
const files = (d) => readdirSync(d).flatMap((f) => statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]);
// README.md is the operator's notes (it names what was removed) and is not deployed.
for (const f of files(DIR).filter((f) => /\.(html|svg|css|js|json|txt|xml)$/.test(f))) {
  const text = readFileSync(f, 'utf8').split(DEPLOY).join('');
  for (const re of FORBIDDEN) { const m = text.match(re); ok(`no ${re} in ${f.slice(DIR.length)}`, !m, m && text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')); }
}

// ---- 2. static references ----------------------------------------------------
const html = readFileSync(join(DIR, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g), ...html.matchAll(/url\('([^')]+)'\)/g)].map((m) => m[1])
  .filter((u) => !/^(https?:|mailto:|tel:|data:)/.test(u) && !u.includes('${'));
for (const r of new Set(refs)) ok(`local asset exists: ${r}`, existsSync(join(DIR, r)));
for (const u of new Set([...html.matchAll(/"(https?:\/\/[^"]+)"/g)].map((m) => m[1]))) {
  // only these third parties may be referenced: fonts, the icon font CDN, WhatsApp, schema.org, and the deployment itself
  ok(`allowed external URL: ${u}`, /^https:\/\/(fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com|wa\.me)\//.test(u) || u === 'https://schema.org' || u.startsWith(DEPLOY), u);
}
for (const prop of ['og:image', 'twitter:image']) {
  const v = html.match(new RegExp(`(?:property|name)="${prop}" content="([^"]+)"`))?.[1] ?? '';
  ok(`${prop} is absolute on the deployment`, v.startsWith(DEPLOY), v);
  ok(`${prop} file exists`, existsSync(join(DIR, v.slice(DEPLOY.length))));
}
ok('canonical = og:url = deployment', html.includes(`rel="canonical" href="${DEPLOY}"`) && html.includes(`property="og:url" content="${DEPLOY}"`));
ok('og:locale is neutral', /property="og:locale" content="en_US"/.test(html));
ok('JSON-LD has no logo/address/phone', !/"(logo|address|telephone|sameAs)"/.test(html.match(/application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? 'x'));
const png = (p) => { const b = readFileSync(join(DIR, p)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
ok('icon-32 is 32x32', png('assets/icon-32.png').join() === '32,32');
ok('icon-180 is 180x180', png('assets/icon-180.png').join() === '180,180');
const jpg = (p) => { const b = readFileSync(join(DIR, p)); for (let i = 2; i < b.length;) { const m = b[i + 1]; const len = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + len; } return []; };
ok('share card is 1200x630', jpg('assets/share-card.jpg').join() === '1200,630');
const wa = html.match(/whatsapp: '(\d+)'/)?.[1];
ok('SITE.whatsapp set', !!wa);
ok('every wa.me link uses SITE.whatsapp', [...html.matchAll(/wa\.me\/(\d+)/g)].every((m) => m[1] === wa));
const email = html.match(/email: '([^']+)'/)?.[1];
ok('every mailto uses SITE.email', [...html.matchAll(/mailto:([^"?]+)/g)].every((m) => m[1] === email || m[1] === '${SITE.email}'));
ok('prices carry the template currency', /currency: 'USD'/.test(html) && !/price: \d+\.\d+,[^\n]*OMR/.test(html));

// ---- 3. in the browser -------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = join(DIR, p);
  if (!f.startsWith(DIR) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const errs = [];
for (const width of [390, 768, 1024, 1440]) {
  const p = await b.newPage({ viewport: { width, height: 900 } });
  p.on('pageerror', (e) => errs.push(`${width} pageerror: ${e.message}`));
  // Third-party CDNs (fonts, icon font) may be unreachable in CI; the page must not depend on them.
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  p.on('response', (r) => { if (r.status() >= 400) errs.push(`${width} HTTP ${r.status()} ${r.url()}`); });
  await p.goto(origin, { waitUntil: 'load' });
  // bring every lazy image into view so it loads, then come back up
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } window.scrollTo(0, 0); });
  // the slider's off-screen slides are lazy by design: load them explicitly before checking
  await p.evaluate(() => Promise.all([...document.images].filter((i) => i.id !== 'modalProductImage').map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); })));
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const name = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();
    const inView = (el) => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; };
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      broken: [...document.images].filter((i) => i.id !== 'modalProductImage' && i.getAttribute('src') && (!i.complete || i.naturalWidth === 0)).map((i) => i.getAttribute('src')),
      noAlt: [...document.images].filter((i) => i.id !== 'modalProductImage' && !(i.getAttribute('alt') || '').trim()).map((i) => i.outerHTML.slice(0, 80)),
      logoish: [...document.querySelectorAll('[class*=logo i],[id*=logo i],img[alt*=logo i]')].length,
      nav: vis(document.querySelector('.nav-container')), burger: vis(document.querySelector('.hamburger')),
      burgerInView: inView(document.querySelector('.hamburger')),
      navInView: [...document.querySelectorAll('.nav-menu a')].every(inView),
      unnamed: [...document.querySelectorAll('button, a[href], [role=button]')].filter((e) => !name(e)).map((e) => e.outerHTML.slice(0, 90)),
      unlabelled: [...document.querySelectorAll('input, textarea, select')].filter((e) => !e.getAttribute('aria-label') && !(e.id && document.querySelector(`label[for="${e.id}"]`))).map((e) => e.outerHTML.slice(0, 90)),
      h1: document.querySelectorAll('h1').length, lang: document.documentElement.lang,
      ids: (() => { const s = new Set(); const d = []; document.querySelectorAll('[id]').forEach((e) => { if (s.has(e.id)) d.push(e.id); s.add(e.id); }); return d; })(),
      anchors: [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')).filter((h) => h.length > 1 && h !== '#top' && !document.querySelector(h)),
    };
  });
  ok(`${width}: no horizontal overflow`, r.overflow <= 0, `${r.overflow}px`);
  ok(`${width}: every image loads`, !r.broken.length, r.broken.join(', '));
  ok(`${width}: no logo element`, r.logoish === 0);
  if (width > 768) ok(`${width}: desktop nav visible and inside the viewport`, r.nav && !r.burger && r.navInView);
  else ok(`${width}: hamburger visible and inside the viewport`, r.burger && !r.nav && r.burgerInView);
  if (width === 1440) {
    ok('a11y: every image has alt text', !r.noAlt.length, r.noAlt.join(' | '));
    ok('a11y: every control has a name', !r.unnamed.length, r.unnamed.join(' | '));
    ok('a11y: every field has a label', !r.unlabelled.length, r.unlabelled.join(' | '));
    ok('a11y: one h1, lang set', r.h1 === 1 && r.lang === 'en');
    ok('no duplicate ids', !r.ids.length, r.ids.join(','));
    ok('every in-page anchor resolves', !r.anchors.length, r.anchors.join(','));
  }
  await p.screenshot({ path: shot(`food-supplier-home-${width}.png`) });
  if (width === 390 || width === 1440) {
    await p.evaluate(() => document.querySelector('#products').scrollIntoView());
    await p.waitForTimeout(300);
    await p.screenshot({ path: shot(`food-supplier-products-${width}.png`) });
  }
  if (width === 1440) {
    // cart: totals in the template currency; checkout goes to the SITE WhatsApp number
    await p.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); }; });
    await p.evaluate(() => document.querySelector('.add-to-cart-btn[data-product-id="1"]').click());
    await p.evaluate(() => document.querySelector('.add-to-cart-btn[data-product-id="2"]').click());
    const total = await p.textContent('#cartEstimatedTotal');
    ok('cart total in USD', total === '$77.50', total);
    await p.evaluate(() => document.getElementById('cartCheckout').click());
    const opened = await p.evaluate(() => window.__opened[0] ?? '');
    ok('checkout opens the SITE WhatsApp number', opened.startsWith(`https://wa.me/${wa}?text=`), opened.slice(0, 60));
    ok('checkout message names the products without any brand', /XXXL%201121%20Basmati/.test(opened) && !/mashhor/i.test(decodeURIComponent(opened)));
    // mobile drawer header has no logo, only the close button
  }
  await p.close();
}
ok('no page errors or failed local requests', !errs.length, errs.join(' | '));
await b.close(); server.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
