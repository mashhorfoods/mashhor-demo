#!/usr/bin/env node
/* Renders every image of the food-supplier demo template with headless
   Chromium, so the template carries no photo, packaging or logo from any real
   client and can be re-branded by editing the constants below and re-running:

     templates/food-supplier/assets/img/product-{1..6}.jpg   rice sacks, variety names only
     templates/food-supplier/assets/img/slide-{1..4}.jpg     gallery slider (1200x600); slide-3 is also the about image
     templates/food-supplier/assets/img/cert-*.svg           generic certification seals
     templates/food-supplier/assets/share-card.jpg           1200x630 og:image / twitter:image (English page)
     templates/food-supplier/assets/share-card-ar.jpg        the same for the Arabic page (ar/)
     templates/food-supplier/assets/icon-32.png              browser tab icon
     templates/food-supplier/assets/icon-180.png             home-screen (apple-touch) icon

   Everything is drawn from shapes and text (seeded, so re-runs are identical).
   Nothing here is a logo: the site name is set as plain text on the share card
   only.

   node tools/build-food-supplier-images.mjs   (CHROMIUM=/path/to/chromium optional) */
import { launch, renderTo } from './lib/browser.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'templates/food-supplier/assets');
mkdirSync(join(OUT, 'img'), { recursive: true });

// ---- Edit these to re-brand -------------------------------------------------
const SITE_NAME = 'Rice & Foodstuff Trading';
const SITE_NAME_AR = 'تجارة الأرز والمواد الغذائية';
const TAGLINE = 'Premium Basmati & Non-Basmati rice · Wholesale & retail';
const TAGLINE_2 = 'Delivered wherever you are';
const TAGLINE_AR = 'أرز بسمتي وغير بسمتي فاخر · جملة وتجزئة';
const TAGLINE_2_AR = 'يصلك أينما كنت';
const GREEN = '#2e7d32';
const GREEN_DARK = '#1e5a22';
const ACCENT = '#ff9800';
// Label text on each sack (English and Arabic, so one image serves both pages): variety, grade line, pack size, colours.
const PRODUCTS = [
  { ar: 'بسمتي 1121', name: '1121 Basmati', grade: 'Extra-long grain · Aged', kg: '35 kg', sack: '#f4ead2', band: GREEN },
  { ar: 'بسمتي 1121', name: '1121 Basmati', grade: 'Extra-long grain · Aged', kg: '5 kg', sack: '#f4ead2', band: GREEN, small: true },
  { ar: 'أرز برياني', name: 'Biryani Rice', grade: 'Classic XXL grain', kg: '35 kg', sack: '#f1e4d6', band: '#8e2430' },
  { ar: 'سيلا ذهبي', name: 'Golden Sella', grade: '1121 Parboiled Basmati', kg: '20 kg', sack: '#f6e7bf', band: '#c9891b', grain: '#e8c472' },
  { ar: 'أرز ماتا', name: 'Matta Rice', grade: 'Palakkadan red rice', kg: '18 kg', sack: '#efe2d3', band: '#7a4a2a', grain: '#b8745a' },
  { ar: 'سونا مسوري', name: 'Sona Masoori', grade: 'Light & fluffy', kg: '18 kg', sack: '#e9eef4', band: '#2c5d8f' },
];
// -----------------------------------------------------------------------------

const b64 = (p) => readFileSync(join(ROOT, p)).toString('base64');
const fonts = [400, 600, 700].map((w) => `@font-face { font-family: Plex; font-weight: ${w};
  src: url(data:font/woff2;base64,${b64(`assets/fonts/ibm-plex-sans-arabic-latin-${w}.woff2`)}) format('woff2'); }
  @font-face { font-family: Plex; font-weight: ${w}; unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF;
  src: url(data:font/woff2;base64,${b64(`assets/fonts/ibm-plex-sans-arabic-arabic-${w}.woff2`)}) format('woff2'); }`).join('');
const BASE_CSS = `${fonts} * { margin: 0; box-sizing: border-box; } body { font-family: Plex, sans-serif; overflow: hidden; }`;

// Seeded PRNG so every run draws the same grains.
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// n rice grains scattered over (x, y, w, h); `heap` piles them towards the bottom centre.
function grains(n, { x = 0, y = 0, w, h, seed = 1, color = '#fbf6e9', edge = '#d9ccaa', len = 26, heap = false }) {
  const r = rng(seed); let s = '';
  for (let i = 0; i < n; i++) {
    let gx = x + r() * w; let gy = y + r() * h;
    if (heap) { // triangular pile: fewer grains near the top edges
      const t = r() * r(); gx = x + w / 2 + (r() - 0.5) * w * (1 - t); gy = y + h - t * h;
    }
    const l = len * (0.8 + r() * 0.4); const t = l * 0.3; const a = r() * 180;
    s += `<ellipse cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" rx="${(l / 2).toFixed(1)}" ry="${(t / 2).toFixed(1)}" transform="rotate(${a.toFixed(0)} ${gx.toFixed(1)} ${gy.toFixed(1)})" fill="${color}" stroke="${edge}" stroke-width="1"/>`;
  }
  return s;
}

// One sack as an absolutely positioned HTML block (w x h px at left/top).
function sack(p, { left, top, w, h, seed = 3 }) {
  const small = p.small;
  const radius = small ? '18px 18px 26px 26px' : '38px 38px 60px 60px / 30px 30px 70px 70px';
  const fs = w / 360;
  return `<div style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;">
    <div style="position:absolute;left:6%;right:6%;bottom:-${h * 0.04}px;height:${h * 0.08}px;border-radius:50%;background:rgba(0,0,0,.18);filter:blur(${10 * fs}px)"></div>
    <div style="position:absolute;inset:0;border-radius:${radius};overflow:hidden;
      background:
        repeating-linear-gradient(0deg, rgba(0,0,0,.035) 0 2px, transparent 2px 5px),
        repeating-linear-gradient(90deg, rgba(0,0,0,.035) 0 2px, transparent 2px 5px),
        linear-gradient(90deg, rgba(0,0,0,.10), rgba(255,255,255,.18) 35%, rgba(0,0,0,.02) 60%, rgba(0,0,0,.14)), ${p.sack};
      box-shadow: inset 0 -${12 * fs}px ${24 * fs}px rgba(0,0,0,.10);">
      <div style="position:absolute;left:0;right:0;top:0;height:${h * 0.09}px;background:${p.band};opacity:.92"></div>
      <div style="position:absolute;left:4%;right:4%;top:${h * 0.045}px;border-top:${2.5 * fs}px dashed rgba(255,255,255,.75)"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:${h * 0.07}px;background:${p.band};opacity:.92"></div>
      <div style="position:absolute;left:11%;right:11%;top:${h * 0.2}px;bottom:${h * 0.17}px;background:#fff;border-radius:${14 * fs}px;
        border:${3 * fs}px solid ${p.band};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:${6 * fs}px;padding:${10 * fs}px">
        <svg viewBox="0 0 120 40" style="width:58%;height:auto">${grains(9, { x: 10, y: 8, w: 100, h: 24, seed, color: p.grain ?? '#fbf6e9', edge: '#bda878', len: 20 })}</svg>
        <div style="font-size:${34 * fs}px;font-weight:700;color:${p.band};line-height:1.05">${p.name}</div>
        <div dir="rtl" style="font-size:${22 * fs}px;font-weight:600;color:${p.band};line-height:1.2">${p.ar}</div>
        <div style="font-size:${15 * fs}px;font-weight:400;color:#555;line-height:1.2">${p.grade}</div>
        <div style="margin-top:${8 * fs}px;font-size:${22 * fs}px;font-weight:700;color:#fff;background:${p.band};border-radius:${40 * fs}px;padding:${4 * fs}px ${18 * fs}px">${p.kg}</div>
      </div>
    </div>
  </div>`;
}

function productScene(p, i) {
  const W = 800; const H = 600;
  const w = p.small ? 250 : 340; const h = p.small ? 340 : 440;
  return `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}
    body { width:${W}px; height:${H}px; background: radial-gradient(ellipse at 50% 40%, #ffffff 0%, #f3f5f1 70%, #e8ede6 100%); position:relative }</style>
    ${sack(p, { left: (W - w) / 2, top: p.small ? 150 : 70, w, h, seed: 10 + i })}
    <svg style="position:absolute;left:0;top:0" width="${W}" height="${H}">
      ${grains(70, { x: 470, y: 470, w: 250, h: 90, seed: 40 + i, heap: true, color: p.grain ?? '#fbf6e9', edge: '#cbb98f', len: 22 })}
    </svg>`;
}

const slides = [
  // 1 — close-up of grains
  () => `<!doctype html><meta charset="utf-8"><style>${BASE_CSS} body{width:1200px;height:600px;background:linear-gradient(135deg,#efe3c4,#d9c79a)}</style>
    <svg width="1200" height="600">${grains(1400, { w: 1240, h: 640, x: -20, y: -20, seed: 7, len: 44, color: '#fbf7ec', edge: '#c9b484' })}</svg>`,
  // 2 — warehouse: stacked sacks on pallets
  () => {
    let s = ''; const cols = 6; const rows = 3; const sw = 150; const sh = 110;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const p = PRODUCTS[(c + r) % PRODUCTS.length];
      s += `<div style="position:absolute;left:${70 + c * 180 + (r % 2) * 12}px;top:${330 - r * 100}px;width:${sw}px;height:${sh}px;border-radius:26px 26px 30px 30px;
        background:repeating-linear-gradient(0deg,rgba(0,0,0,.04) 0 2px,transparent 2px 5px),linear-gradient(180deg,rgba(255,255,255,.2),rgba(0,0,0,.12)),${p.sack};
        box-shadow:0 6px 12px rgba(0,0,0,.35)"><div style="position:absolute;left:0;right:0;top:0;height:16px;border-radius:26px 26px 0 0;background:${p.band}"></div>
        <div style="position:absolute;left:30px;right:30px;top:38px;height:40px;border-radius:8px;background:#fff;border:3px solid ${p.band}"></div></div>`;
    }
    for (let c = 0; c < cols; c++) s += `<div style="position:absolute;left:${60 + c * 180}px;top:450px;width:180px;height:26px;background:repeating-linear-gradient(90deg,#8a6a45 0 40px,#6e5234 40px 46px)"></div>`;
    return `<!doctype html><meta charset="utf-8"><style>${BASE_CSS} body{width:1200px;height:600px;position:relative;
      background:linear-gradient(180deg,#39433a 0%,#4c574d 62%,#6d6a63 62%,#5d5a53 100%)}</style>
      <div style="position:absolute;left:0;right:0;top:0;height:60px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.08) 0 4px,transparent 4px 120px)"></div>${s}`;
  },
  // 3 — packaging range
  () => `<!doctype html><meta charset="utf-8"><style>${BASE_CSS} body{width:1200px;height:600px;position:relative;background:linear-gradient(180deg,#f7f8f4 0%,#eef2ea 72%,#dfe6da 72%,#e8ede4 100%)}</style>
    ${sack(PRODUCTS[0], { left: 40, top: 80, w: 250, h: 360, seed: 21 })}
    ${sack(PRODUCTS[3], { left: 320, top: 130, w: 220, h: 310, seed: 22 })}
    ${sack(PRODUCTS[2], { left: 570, top: 80, w: 250, h: 360, seed: 23 })}
    ${sack(PRODUCTS[5], { left: 850, top: 150, w: 200, h: 290, seed: 24 })}
    ${sack(PRODUCTS[1], { left: 1060, top: 250, w: 130, h: 190, seed: 25 })}`,
  // 4 — rice dish, top view
  () => {
    const r = rng(99); let garnish = '';
    for (let i = 0; i < 40; i++) { const a = r() * Math.PI * 2; const d = r() * 150; const x = 600 + Math.cos(a) * d; const y = 300 + Math.sin(a) * d;
      garnish += i % 3 ? `<circle cx="${x}" cy="${y}" r="${4 + r() * 5}" fill="${i % 2 ? '#4f8a2b' : '#6aa43a'}"/>` : `<rect x="${x}" y="${y}" width="${8 + r() * 8}" height="${6 + r() * 4}" rx="2" fill="#e58a2b" transform="rotate(${r() * 90} ${x} ${y})"/>`; }
    return `<!doctype html><meta charset="utf-8"><style>${BASE_CSS} body{width:1200px;height:600px;background:repeating-linear-gradient(90deg,#8b5e3c 0 118px,#7d5334 118px 120px)}</style>
      <svg width="1200" height="600">
        <ellipse cx="600" cy="316" rx="268" ry="268" fill="rgba(0,0,0,.25)"/>
        <circle cx="600" cy="300" r="262" fill="#f4f1ea"/><circle cx="600" cy="300" r="238" fill="#fff"/>
        <clipPath id="c"><circle cx="600" cy="300" r="200"/></clipPath>
        <circle cx="600" cy="300" r="200" fill="#f2d98e"/>
        <g clip-path="url(#c)">${grains(900, { x: 390, y: 90, w: 420, h: 420, seed: 5, len: 30, color: '#fbf1cf', edge: '#dcc07a' })}</g>
        ${garnish}
        <circle cx="200" cy="140" r="70" fill="#f4f1ea"/><circle cx="200" cy="140" r="56" fill="#b7372a"/>
        <circle cx="1010" cy="470" r="80" fill="#f4f1ea"/><circle cx="1010" cy="470" r="64" fill="#7fa34a"/>
      </svg>`;
  },
];

const shareCard = (name, tag, tag2, rtl = false) => `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}
  body { width:1200px; height:630px; position:relative; color:#fff; background:linear-gradient(135deg,#efe3c4,#d9c79a) }
  .bg { position:absolute; inset:0 }
  .shade { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; padding:0 88px; gap:18px;
    background:linear-gradient(${rtl ? 270 : 90}deg, rgba(20,48,22,.94) 0%, rgba(20,48,22,.80) 55%, rgba(20,48,22,.25) 100%) }
  .bar { width:72px; height:6px; background:${ACCENT}; border-radius:3px }
  .name { font-size:70px; font-weight:700; line-height:1.1 }
  .tag { font-size:30px; font-weight:400; opacity:.92 }
</style><svg class="bg" width="1200" height="630">${grains(1500, { w: 1240, h: 670, x: -20, y: -20, seed: 7, len: 44, color: '#fbf7ec', edge: '#c9b484' })}</svg>
<div class="shade" dir="${rtl ? 'rtl' : 'ltr'}"><div class="bar"></div><div class="name">${name.replace('&', '&amp;')}</div>
  <div class="tag">${tag}</div><div class="tag">${tag2}</div></div>`;

// Icon: brand-green tile with a stalk of grain (a plain symbol, not a logo).
const icon = (size) => {
  const big = size >= 64;
  let stalk = '<path d="M50 88 V30" stroke="#fff" stroke-width="5" stroke-linecap="round"/>';
  for (let i = 0; i < 4; i++) { const y = 36 + i * 13;
    stalk += `<ellipse cx="38" cy="${y}" rx="11" ry="5.5" fill="#fff" transform="rotate(-35 38 ${y})"/><ellipse cx="62" cy="${y}" rx="11" ry="5.5" fill="#fff" transform="rotate(35 62 ${y})"/>`; }
  stalk += '<ellipse cx="50" cy="22" rx="5.5" ry="11" fill="#fff"/>';
  return `<!doctype html><style>*{margin:0} body{width:${size}px;height:${size}px;background:transparent}
    div{width:100%;height:100%;background:${GREEN};border-radius:${big ? 0 : Math.round(size * 0.22)}px;display:grid;place-items:center}
    svg{width:${Math.round(size * 0.8)}px;height:${Math.round(size * 0.8)}px}</style><div><svg viewBox="0 0 100 100">${stalk}</svg></div>`;
};

// Certification seals: plain SVG, the standard's name as text. Placeholders for the
// client's real certificates — replace or remove per client.
const CERTS = [
  ['iso-22000', 'ISO 22000', 'FOOD SAFETY'],
  ['iso-9001', 'ISO 9001', 'QUALITY'],
  ['haccp', 'HACCP', 'FOOD SAFETY'],
  ['gmp', 'GMP', 'GOOD PRACTICE'],
];
const seal = (title, sub) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="${title}">
  <circle cx="60" cy="60" r="56" fill="#fff" stroke="${GREEN}" stroke-width="4"/>
  <circle cx="60" cy="60" r="46" fill="none" stroke="${GREEN}" stroke-width="1.5" stroke-dasharray="3 3"/>
  <text x="60" y="58" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-weight="700" font-size="${title.length > 6 ? 17 : 22}" fill="${GREEN_DARK}">${title}</text>
  <text x="60" y="76" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-weight="600" font-size="8.5" letter-spacing="1" fill="${ACCENT}">${sub}</text>
</svg>
`;
for (const [file, title, sub] of CERTS) { writeFileSync(join(OUT, 'img', `cert-${file}.svg`), seal(title, sub)); console.log(`wrote img/cert-${file}.svg`); }

const browser = await launch();
const shot = (html, w, h, out, type = 'jpeg') => renderTo(browser, html, w, h, join(OUT, out), type, 84);
for (const [i, p] of PRODUCTS.entries()) await shot(productScene(p, i), 800, 600, `img/product-${i + 1}.jpg`);
for (const [i, s] of slides.entries()) await shot(s(), 1200, 600, `img/slide-${i + 1}.jpg`);
await shot(shareCard(SITE_NAME, TAGLINE, TAGLINE_2), 1200, 630, 'share-card.jpg');
await shot(shareCard(SITE_NAME_AR, TAGLINE_AR, TAGLINE_2_AR, true), 1200, 630, 'share-card-ar.jpg');
await shot(icon(32), 32, 32, 'icon-32.png', 'png');
await shot(icon(180), 180, 180, 'icon-180.png', 'png');
await browser.close();
