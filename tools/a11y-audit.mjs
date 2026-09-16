// Stage 10.11 — the cross-site responsive + accessibility audit.
//
// Every key page at six widths (390 / 600 / 834 / 1024 / 1200 / 1440) in
// both languages, every generated route at 390 and 1440: horizontal
// overflow (with the offending element), clipped text, touch targets under
// 40px, text under 12px, images without alt, decorative SVGs exposed,
// controls without a name, inputs without a label, heading order and
// landmarks, duplicate ids, dangling aria references, colour contrast
// (WCAG AA, computed against the composited background), focus rings on
// the first 30 tab stops, every header control (opens, Escape closes,
// focus returns), and transitions under prefers-reduced-motion.
//
//   BASE=http://localhost:8000/ node tools/a11y-audit.mjs        # everything
//   ONLY=book/index.html node tools/a11y-audit.mjs               # one page, all widths
//
// Needs playwright and the bundled Chromium (see tools/i18n-audit.mjs).
// Prints one line per unique finding and exits 1 when anything is found.
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ORIGIN = process.env.BASE || 'http://localhost:8000/';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..') + '/';
const KEY = ['index.html', '404.html', 'styleguide.html', 'services/index.html', 'destinations/index.html', 'offers/index.html', 'book/index.html', 'services/flights/index.html', 'offers/umrah/index.html', 'supervisor/supervisor-1/index.html'];
const REST = [...readdirSync(ROOT + 'services', { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'flights').map((d) => `services/${d.name}/index.html`),
  ...readdirSync(ROOT + 'offers', { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'umrah').map((d) => `offers/${d.name}/index.html`),
  ...readdirSync(ROOT + 'supervisor', { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'supervisor-1').map((d) => `supervisor/${d.name}/index.html`)];
const WIDTHS = [390, 600, 834, 1024, 1200, 1440];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const findings = new Map();
const add = (check, page, w, loc, detail) => { const k = `${check} | ${detail}`; const e = findings.get(k) ?? { where: new Set() }; e.where.add(`${page}@${w}/${loc}`); findings.set(k, e); };

const INPAGE = () => {
  const out = [];
  const vis = (n) => n.checkVisibility?.({ visibilityProperty: true }) && !n.closest('[aria-hidden="true"], [hidden]');
  const name = (n) => (n.getAttribute('aria-label') || (n.getAttribute('aria-labelledby') && document.getElementById(n.getAttribute('aria-labelledby'))?.textContent) || n.getAttribute('title') || n.textContent || (n.querySelector('img[alt]')?.alt) || '').trim();
  const cw = document.documentElement.clientWidth;
  // 1 overflow
  if (document.documentElement.scrollWidth > cw) {
    for (const n of document.querySelectorAll('body *')) { const r = n.getBoundingClientRect(); if (r.width && vis(n) && (r.right > cw + 1 || r.left < -1)) { out.push(['overflow', `${n.tagName.toLowerCase()}.${[...n.classList].slice(0, 2).join('.')} L${Math.round(r.left)} R${Math.round(r.right)}`]); if (out.length > 4) break; } }
    if (!out.length) out.push(['overflow', `scrollWidth ${document.documentElement.scrollWidth} > ${cw}`]);
  }
  // 2 clipped text
  for (const n of document.querySelectorAll('h1,h2,h3,h4,p,a,button,span,li,dt,dd,label,legend,th,td,option')) {
    if (!vis(n) || !n.textContent.trim() || n.classList.contains('u-visually-hidden')) continue;
    const cs = getComputedStyle(n);
    if ((cs.overflowX === 'hidden' || cs.overflow === 'hidden') && cs.textOverflow !== 'ellipsis' && n.scrollWidth > n.clientWidth + 2) out.push(['clipped', `${n.tagName.toLowerCase()}.${[...n.classList].slice(0, 2).join('.')} "${n.textContent.trim().slice(0, 30)}" ${n.scrollWidth}>${n.clientWidth}`]);
  }
  // 3 touch targets
  for (const n of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio], summary, [tabindex="0"]')) {
    if (!vis(n)) continue;
    // a stretched card link's hit area is the card; a wrapped input's is its label
    const box = n.classList.contains('c-card__link') ? n.closest('.c-card') : (n.matches('input') && n.closest('label')) || n;
    const r = box.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const inline = n.tagName === 'A' && n.closest('p, dd, .c-breadcrumb, .t-body, .t-body-sm') && getComputedStyle(n).display === 'inline';
    if (inline) continue;
    if (r.height < 40 || (r.width < 40 && !n.textContent.trim())) out.push(['target', `${n.tagName.toLowerCase()}.${[...n.classList].slice(0, 2).join('.')} "${name(n).slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`]);
  }
  // 4 small text
  for (const n of document.querySelectorAll('p,a,button,span,li,dt,dd,label,legend,th,td,small,h1,h2,h3,h4,time,output')) {
    if (!vis(n) || !n.textContent.trim() || n.querySelector('*') && !Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    if (parseFloat(getComputedStyle(n).fontSize) < 12) out.push(['small-text', `${n.tagName.toLowerCase()}.${[...n.classList].slice(0, 2).join('.')} ${getComputedStyle(n).fontSize}`]);
  }
  // 5 images / icons / icon-only names
  document.querySelectorAll('img:not([alt])').forEach((n) => out.push(['img-alt', n.getAttribute('src')]));
  document.querySelectorAll('svg').forEach((n) => { if (vis(n) && n.getAttribute('aria-hidden') !== 'true' && !n.getAttribute('role') && !n.querySelector('title')) out.push(['svg-noise', `svg.${[...n.classList].slice(0, 2).join('.')} in ${n.parentElement?.tagName.toLowerCase()}`]); });
  document.querySelectorAll('button, a[href], [role=button]').forEach((n) => { if (vis(n) && !name(n)) out.push(['no-name', `${n.tagName.toLowerCase()}.${[...n.classList].slice(0, 2).join('.')}`]); });
  // 6 form labels
  document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach((n) => {
    if (!vis(n)) return;
    const labelled = (n.id && document.querySelector(`label[for="${CSS.escape(n.id)}"]`)) || n.closest('label') || n.getAttribute('aria-label') || n.getAttribute('aria-labelledby');
    if (!labelled) out.push(['no-label', `${n.tagName.toLowerCase()}[name=${n.name}] type=${n.type}`]);
    if (n.placeholder && !labelled) out.push(['placeholder-only', `${n.name}`]);
  });
  // 7 headings + landmarks
  const hs = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter((h) => vis(h) || h.classList.contains('u-visually-hidden')).map((h) => Number(h.tagName[1]));
  if (document.querySelectorAll('h1').length !== 1) out.push(['h1', `${document.querySelectorAll('h1').length} h1`]);
  for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) { out.push(['heading-jump', `h${hs[i - 1]}→h${hs[i]}`]); break; }
  if (document.querySelectorAll('main').length !== 1) out.push(['landmark', `${document.querySelectorAll('main').length} main`]);
  if (!document.querySelector('header')) out.push(['landmark', 'no header']);
  if (!document.querySelector('footer')) out.push(['landmark', 'no footer']);
  if (!document.querySelector('nav')) out.push(['landmark', 'no nav']);
  document.querySelectorAll('nav, [role=navigation]').forEach((n) => { if (!n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby')) out.push(['nav-name', `nav.${[...n.classList].slice(0, 1)}`]); });
  // an unnamed <section> is not a landmark — fine — but a named one must resolve (checked above)
  // 8 ids + aria refs
  const ids = Array.from(document.querySelectorAll('[id]')).map((n) => n.id); const seen = new Set();
  ids.forEach((id) => { if (seen.has(id)) out.push(['dup-id', id]); seen.add(id); });
  for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) document.querySelectorAll(`[${attr}]`).forEach((n) => { if (n.closest('[hidden]')) return; n.getAttribute(attr).split(/\s+/).forEach((id) => { if (id && !document.getElementById(id)) out.push(['aria-ref', `${attr}=${id} on ${n.tagName.toLowerCase()}.${[...n.classList].slice(0, 1)}`]); }); });
  // 9 contrast
  const parse = (c) => { const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]; return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const bgOf = (n) => { let bg = { r: 255, g: 255, b: 255, a: 1 }; const layers = []; let e = n; while (e && e !== document.documentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none') return null; const c = parse(cs.backgroundColor); if (c.a > 0) layers.push(c); if (c.a >= 1) break; e = e.parentElement; } for (const c of layers.reverse()) bg = blend(c, bg); return bg; };
  const reported = new Set();
  for (const n of document.querySelectorAll('p,a,button,span,li,dt,dd,label,legend,th,td,small,h1,h2,h3,h4,time,output,option')) {
    if (!vis(n) || !Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    if (n.closest('[disabled], [aria-disabled="true"], .c-skeleton, .c-btn--primary:disabled')) continue;
    const cs = getComputedStyle(n); const fg = parse(cs.color); const bg = bgOf(n); if (!bg) continue;
    const f = fg.a < 1 ? blend(fg, bg) : fg;
    const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700; const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) { const key = `${n.tagName.toLowerCase()}.${[...n.classList].slice(0, 2).join('.')}`; if (!reported.has(key)) { reported.add(key); out.push(['contrast', `${key} ${ratio.toFixed(2)}:1 (${cs.color} on rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}) ${size}px)`]); } }
  }
  return out;
};

async function audit(page, w, loc, deep) {
  const p = await b.newPage({ viewport: { width: w, height: w < 700 ? 844 : 1000 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(ORIGIN + page, { waitUntil: 'networkidle' });
  if (loc !== 'ar') await p.evaluate(async (l) => { const m = await import('./assets/js/foundation.js'); m.setLocale(l); }, loc);
  await p.waitForTimeout(500);
  for (const [c, d] of await p.evaluate(INPAGE)) add(c, page, w, loc, d);
  errs.forEach((e) => add('console', page, w, loc, e.slice(0, 120)));
  // header controls: burger / search / help at this width
  const controls = await p.evaluate(() => Array.from(document.querySelectorAll('header button[aria-expanded], header [aria-haspopup]')).filter((n) => n.checkVisibility()).map((n) => n.getAttribute('aria-label') || n.textContent.trim()));
  for (const label of controls) {
    const sel = `header button[aria-expanded]:visible, header [aria-haspopup]:visible`;
    const btn = p.locator(sel).filter({ has: p.locator(`text="${label}"`) }).first();
    const target = (await btn.count()) ? btn : p.locator(`header [aria-label="${label}"]`).first();
    if (!(await target.count())) continue;
    await target.click(); await p.waitForTimeout(350);
    const r = await p.evaluate(() => ({ hs: document.documentElement.scrollWidth > document.documentElement.clientWidth, open: Array.from(document.querySelectorAll('header [aria-expanded="true"]')).length, bodyOv: getComputedStyle(document.body).overflow }));
    if (r.hs) add('overflow-menu-open', page, w, loc, label);
    if (!r.open) add('menu-not-open', page, w, loc, label);
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    const after = await p.evaluate(() => ({ open: document.querySelectorAll('header [aria-expanded="true"]').length, focusedLabel: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent.trim() }));
    if (after.open) add('escape-no-close', page, w, loc, label);
    if (after.focusedLabel !== label && !(after.focusedLabel ?? '').includes(label)) add('focus-not-returned', page, w, loc, `${label} → ${after.focusedLabel}`);
  }
  if (deep) {
    // focus rings on the first 30 tab stops
    await p.evaluate(() => document.activeElement?.blur());
    for (let i = 0; i < 30; i++) {
      await p.keyboard.press('Tab');
      const r = await p.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return { end: true }; const cs = getComputedStyle(a); const opt = a.closest('.c-segmented__option'); const card = a.closest('.c-card--interactive'); const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (opt && getComputedStyle(opt).boxShadow !== 'none') || (card && getComputedStyle(card).outlineStyle !== 'none' && parseFloat(getComputedStyle(card).outlineWidth) > 0) || cs.boxShadow.includes('rgb') && a.matches('.c-choice__input, .c-segmented__input'); const rect = a.getBoundingClientRect(); return { name: `${a.tagName.toLowerCase()}.${[...a.classList].slice(0, 2).join('.')}`, ring, dateShadow: a.matches('input[type=date]') && !a.matches(':focus-visible'), offscreen: rect.bottom < 0 || rect.top > innerHeight, visible: a.checkVisibility() }; });
      if (r.end) break;
      // Chromium moves focus into a date input's shadow picker button, which paints its own ring
      if (!r.ring && !r.dateShadow) add('no-focus-ring', page, w, loc, r.name);
      if (!r.visible) add('focus-hidden', page, w, loc, r.name);
    }
    // reduced motion: transitions and animations collapse
    await p.emulateMedia({ reducedMotion: 'reduce' }); await p.waitForTimeout(100);
    const rm = await p.evaluate(() => { const bad = []; for (const n of document.querySelectorAll('a, button, .c-card, .c-gh__drawer, .c-gh__panel, .c-search__advanced, [class*="c-"]')) { if (!n.checkVisibility()) continue; const cs = getComputedStyle(n); const td = cs.transitionDuration.split(',').map((v) => parseFloat(v) * (v.includes('ms') ? 1 : 1000)); const ad = cs.animationDuration.split(',').map((v) => parseFloat(v) * (v.includes('ms') ? 1 : 1000)); if (td.some((v) => v > 20) && cs.transitionProperty !== 'none') bad.push(`${n.tagName.toLowerCase()}.${[...n.classList].slice(0, 2).join('.')} t=${cs.transitionDuration}`); if (ad.some((v) => v > 20) && cs.animationName !== 'none' && !/pulse/.test(cs.animationName)) bad.push(`${n.tagName.toLowerCase()}.${[...n.classList].slice(0, 2).join('.')} a=${cs.animationName}`); if (bad.length > 5) break; } return bad; });
    rm.forEach((d) => add('reduced-motion', page, w, loc, d));
    await p.emulateMedia({ reducedMotion: 'no-preference' });
  }
  await p.close();
}

for (const page of (ONLY ?? KEY)) for (const w of WIDTHS) for (const loc of ['ar', 'en']) await audit(page, w, loc, (w === 390 || w === 1440) && loc === 'ar');
if (!ONLY) for (const page of REST) for (const w of [390, 1440]) await audit(page, w, 'ar', false);
await b.close();
const list = [...findings.entries()].sort();
for (const [k, e] of list) console.log(`${k}   ← ${[...e.where].slice(0, 3).join(', ')}${e.where.size > 3 ? ` +${e.where.size - 3}` : ''}`);
console.log(`\n${list.length} unique findings`);
process.exit(list.length ? 1 : 0);
