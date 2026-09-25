// The food-supplier demo template (templates/food-supplier/): English (index.html,
// LTR) and Arabic (ar/index.html, RTL) pages sharing assets/site.css + site.js.
// Proves it carries no trace of the original client (brand, logo, country, phone
// codes, currency, image host, analytics) and that it still works in both
// languages: local assets and anchors resolve, contact links agree with SITE,
// the two pages have the same structure, the Arabic page has no untranslated
// copy, the layout holds from 390 to 1440px in both directions, basic
// accessibility holds, and the cart totals in the template currency.
// Serves the template itself, so it runs standalone:  node tests/food-supplier.mjs
import './env.mjs';
import { shot } from './env.mjs';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';

const DIR = new URL('../templates/food-supplier/', import.meta.url).pathname;
const DEPLOY = 'https://mashhorfoods.github.io/mashhor-demo/templates/food-supplier/';
const PAGES = [
  { file: 'index.html', url: '', lang: 'en', dir: 'ltr', locale: 'en_US', share: 'share-card.jpg', other: 'ar/' },
  { file: 'ar/index.html', url: 'ar/', lang: 'ar', dir: 'rtl', locale: 'ar_SA', share: 'share-card-ar.jpg', other: '../' },
];
let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`✗ ${name}${extra ? ' — ' + extra : ''}`); } };

// ---- 1. text audit over every deployed text file -----------------------------
// The deployment URL is the hosting account's, not marketing copy, so it is
// stripped before the scan (see templates/food-supplier/README.md).
const FORBIDDEN = [/mashhor/i, /\blogo/i, /\boman/i, /muscat/i, /rusayl/i, /sultanate/i, /عمان|مسقط/, /\bOMR\b/, /\+?968/, /i\.ibb\.co/, /placeholder\.com/,
  /mahinaz/i, /indian pride/i, /mahavir/i, /googletagmanager|gtag\(|clarity\.ms/, /docs\.google\.com/, /@gmail\.com/, /geo\.(region|placename|position)/, /ICBM/];
const files = (d) => readdirSync(d).flatMap((f) => statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]);
// README.md is the operator's notes (it names what was removed) and is not deployed.
for (const f of files(DIR).filter((f) => /\.(html|svg|css|js|json|txt|xml)$/.test(f))) {
  const text = readFileSync(f, 'utf8').split(DEPLOY).join('');
  for (const re of FORBIDDEN) { const m = text.match(re); ok(`no ${re} in ${f.slice(DIR.length)}`, !m, m && text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')); }
}

// ---- 2. static references, per page ------------------------------------------
const js = readFileSync(join(DIR, 'assets/site.js'), 'utf8');
const wa = js.match(/whatsapp: '(\d+)'/)?.[1];
const email = js.match(/email: '([^']+)'/)?.[1];
ok('SITE.whatsapp and SITE.email set', !!wa && !!email);
ok('prices carry the template currency', /currency: 'USD'/.test(js));
const jpg = (p) => { const b = readFileSync(join(DIR, p)); for (let i = 2; i < b.length;) { const m = b[i + 1]; const len = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + len; } return []; };
const png = (p) => { const b = readFileSync(join(DIR, p)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
ok('icon-32 is 32x32', png('assets/icon-32.png').join() === '32,32');
ok('icon-180 is 180x180', png('assets/icon-180.png').join() === '180,180');
for (const [, u] of readFileSync(join(DIR, 'assets/site.css'), 'utf8').matchAll(/url\('?([^')"]+)'?\)/g)) {
  if (!/^(data:|https?:)/.test(u)) ok(`site.css: url() exists: ${u}`, existsSync(join(DIR, 'assets', u)));
}
const shape = {};
for (const pg of PAGES) {
  const html = readFileSync(join(DIR, pg.file), 'utf8');
  const base = dirname(join(DIR, pg.file));
  const refs = [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:|tel:|data:)/.test(u));
  for (const r of new Set(refs)) ok(`${pg.file}: local reference exists: ${r}`, existsSync(join(base, r)));
  for (const u of new Set([...html.matchAll(/"(https?:\/\/[^"]+)"/g)].map((m) => m[1]))) {
    // only these third parties may be referenced: fonts, the icon font CDN, WhatsApp, schema.org, and the deployment itself
    ok(`${pg.file}: allowed external URL: ${u}`, /^https:\/\/(fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com|wa\.me)\//.test(u) || u === 'https://schema.org' || u.startsWith(DEPLOY), u);
  }
  ok(`${pg.file}: <html lang dir>`, html.includes(`<html lang="${pg.lang}" dir="${pg.dir}">`));
  for (const prop of ['og:image', 'twitter:image']) {
    const v = html.match(new RegExp(`(?:property|name)="${prop}" content="([^"]+)"`))?.[1] ?? '';
    ok(`${pg.file}: ${prop} is this language's card on the deployment`, v === DEPLOY + 'assets/' + pg.share, v);
  }
  ok(`${pg.file}: share card is 1200x630`, jpg('assets/' + pg.share).join() === '1200,630');
  ok(`${pg.file}: canonical = og:url`, html.includes(`rel="canonical" href="${DEPLOY}${pg.url}"`) && html.includes(`property="og:url" content="${DEPLOY}${pg.url}"`));
  ok(`${pg.file}: hreflang alternates`, html.includes(`hreflang="en" href="${DEPLOY}"`) && html.includes(`hreflang="ar" href="${DEPLOY}ar/"`));
  ok(`${pg.file}: og:locale`, html.includes(`property="og:locale" content="${pg.locale}"`));
  ok(`${pg.file}: language switch points at the other page`, (html.match(new RegExp(`class="lang-switch" href="${pg.other.replace(/\./g, '\\.')}"`, 'g')) ?? []).length === 2);
  ok(`${pg.file}: JSON-LD has no logo/address/phone`, !/"(logo|address|telephone|sameAs)"/.test(html.match(/application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? 'x'));
  ok(`${pg.file}: every wa.me link uses SITE.whatsapp`, [...html.matchAll(/wa\.me\/(\d+)/g)].every((m) => m[1] === wa));
  ok(`${pg.file}: every mailto uses SITE.email`, [...html.matchAll(/mailto:([^"?]+)/g)].every((m) => m[1] === email));
  shape[pg.lang] = {
    ids: [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).join(),
    anchors: [...html.matchAll(/href="(#[^"]*)"/g)].map((m) => m[1]).join(),
    products: [...html.matchAll(/data-product-id="(\d)"/g)].map((m) => m[1]).join(),
    wa: (html.match(/wa\.me\//g) ?? []).length, imgs: (html.match(/<img /g) ?? []).length,
  };
}
for (const k of Object.keys(shape.en)) ok(`en and ar pages have the same ${k}`, String(shape.en[k]) === String(shape.ar[k]), `${shape.en[k]} vs ${shape.ar[k]}`);

// ---- 3. in the browser -------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = join(DIR, p);
  if (!f.startsWith(DIR) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const errs = [];
for (const pg of PAGES) for (const width of [390, 768, 1024, 1440]) {
  const tag = `${pg.lang}@${width}`;
  const p = await b.newPage({ viewport: { width, height: 900 } });
  p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  // Third-party CDNs (fonts, icon font) may be unreachable in CI; the page must not depend on them.
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  p.on('response', (r) => { if (r.status() >= 400) errs.push(`${tag} HTTP ${r.status()} ${r.url()}`); });
  await p.goto(origin + pg.url, { waitUntil: 'load' });
  // the slider's off-screen slides are lazy by design: load every image explicitly before checking
  await p.evaluate(() => Promise.all([...document.images].filter((i) => i.id !== 'modalProductImage').map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); })));
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const name = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();
    const inView = (el) => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; };
    const latin = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode; if (n.parentElement.closest('script,style,[lang="en"]')) continue;
      // standards and grade codes, the unit-free email, and product codes stay Latin in Arabic copy
      const t = n.textContent.replace(/ISO|HACCP|GMP|X{2,3}L|[\w.+-]+@[\w.-]+/g, '');
      if (/[A-Za-z]{2,}/.test(t)) latin.push(n.textContent.trim().slice(0, 50));
    }
    for (const el of document.querySelectorAll('[alt],[aria-label],[placeholder]')) for (const a of ['alt', 'aria-label', 'placeholder']) {
      const v = (el.getAttribute(a) || '').replace(/ISO|HACCP|GMP|X{2,3}L/g, ''); if (/[A-Za-z]{2,}/.test(v) && !el.closest('[lang="en"]')) latin.push(`${a}=${v.slice(0, 40)}`);
    }
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
      h1: document.querySelectorAll('h1').length, lang: document.documentElement.lang, dir: getComputedStyle(document.body).direction,
      font: getComputedStyle(document.body).fontFamily,
      ids: (() => { const s = new Set(); const d = []; document.querySelectorAll('[id]').forEach((e) => { if (s.has(e.id)) d.push(e.id); s.add(e.id); }); return d; })(),
      anchors: [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')).filter((h) => h.length > 1 && h !== '#top' && !document.querySelector(h)),
      latin,
    };
  });
  ok(`${tag}: no horizontal overflow`, r.overflow <= 0, `${r.overflow}px`);
  ok(`${tag}: every image loads`, !r.broken.length, r.broken.join(', '));
  ok(`${tag}: no logo element`, r.logoish === 0);
  if (width > 768) ok(`${tag}: desktop nav visible and inside the viewport`, r.nav && !r.burger && r.navInView);
  else ok(`${tag}: hamburger visible and inside the viewport`, r.burger && !r.nav && r.burgerInView);
  if (width === 1440) {
    ok(`${tag}: lang and direction`, r.lang === pg.lang && r.dir === pg.dir, `${r.lang}/${r.dir}`);
    if (pg.lang === 'ar') {
      ok(`${tag}: Arabic font first`, r.font.startsWith('"IBM Plex Sans Arabic"'), r.font);
      ok(`${tag}: no untranslated English copy`, !r.latin.length, r.latin.join(' | '));
    }
    ok(`${tag}: a11y: every image has alt text`, !r.noAlt.length, r.noAlt.join(' | '));
    ok(`${tag}: a11y: every control has a name`, !r.unnamed.length, r.unnamed.join(' | '));
    ok(`${tag}: a11y: every field has a label`, !r.unlabelled.length, r.unlabelled.join(' | '));
    ok(`${tag}: a11y: one h1`, r.h1 === 1);
    ok(`${tag}: no duplicate ids`, !r.ids.length, r.ids.join(','));
    ok(`${tag}: every in-page anchor resolves`, !r.anchors.length, r.anchors.join(','));
  }
  await p.screenshot({ path: shot(`food-supplier-${pg.lang}-home-${width}.png`) });
  if (width === 390) {
    // the drawer slides in from the reading-start edge and lands fully on screen
    await p.click('.hamburger'); await p.waitForTimeout(700);
    const box = await p.evaluate(() => { const b = document.getElementById('mobileNav').getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right) }; });
    ok(`${tag}: menu drawer opens on the ${pg.dir === 'rtl' ? 'left' : 'right'} edge`, pg.dir === 'rtl' ? box.left === 0 : box.right === width, JSON.stringify(box));
    await p.screenshot({ path: shot(`food-supplier-${pg.lang}-drawer-390.png`) });
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  }
  if (width === 390 || width === 1440) {
    await p.evaluate(() => document.querySelector('#products').scrollIntoView());
    await p.waitForTimeout(300);
    await p.screenshot({ path: shot(`food-supplier-${pg.lang}-products-${width}.png`) });
  }
  if (width === 1440) {
    // cart: totals in the template currency; checkout goes to the SITE WhatsApp number in the page's language
    await p.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); }; });
    await p.evaluate(() => document.querySelector('.add-to-cart-btn[data-product-id="1"]').click());
    await p.evaluate(() => document.querySelector('.add-to-cart-btn[data-product-id="2"]').click());
    const total = await p.textContent('#cartEstimatedTotal');
    ok(`${tag}: cart total in USD`, pg.lang === 'en' ? total === '$77.50' : /77\.50/.test(total) && /US\$|\$/.test(total), total);
    await p.evaluate(() => document.getElementById('cartCheckout').click());
    const opened = await p.evaluate(() => window.__opened[0] ?? '');
    ok(`${tag}: checkout opens the SITE WhatsApp number`, opened.startsWith(`https://wa.me/${wa}?text=`), opened.slice(0, 60));
    const msg = decodeURIComponent(opened.split('?text=')[1] ?? '');
    ok(`${tag}: checkout message has real line breaks and no brand`, msg.includes('\n') && !msg.includes('%0A') && !/mashhor/i.test(msg), msg.slice(0, 80));
    ok(`${tag}: checkout message is in the page's language`, pg.lang === 'ar' ? /أرز بسمتي 1121/.test(msg) : /XXXL 1121 Basmati/.test(msg), msg.slice(0, 80));
  }
  await p.close();
}
ok('no page errors or failed local requests', !errs.length, errs.join(' | '));
await b.close(); server.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
