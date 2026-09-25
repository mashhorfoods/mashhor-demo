// Language-completeness audit (docs/FOUNDATION.md §5, "Language completeness").
//
// For every page and both locales, every visible text node, every human-readable
// attribute (aria-label, placeholder, alt, title), the <title> and the meta
// description must be in that locale's script. Text an ancestor tags with a
// different lang= (a deliberate specimen) or translate="no" (a code, a token, a
// data cell) is exempt. Exit code 1 if anything is left untranslated.
//
// `npm test` runs it (tests/run.mjs serves the site and passes BASE). By hand it needs a static server and
// Playwright (a devDependency — `npm ci`):
//   python3 -m http.server 8000
//   BASE=http://localhost:8000/ PAGES=index.html,404.html node tools/i18n-audit.mjs
//   CHROMIUM=/path/to/chromium   # optional: use an existing browser binary
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8000/';
const PAGES = (process.env.PAGES || 'index.html,404.html,styleguide.html').split(',');
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let total = 0;
for (const page of PAGES) {
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(BASE + page, { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
  for (const locale of ['ar', 'en']) {
    await p.evaluate(async (l) => { const m = await import('./assets/js/foundation.js'); await m.setLocale(l); }, locale);
    await p.waitForTimeout(800);
    const found = await p.evaluate((locale) => {
      const AR = /[؀-ۿ]/, LAT = /[A-Za-z]{2,}/;
      const wrong = (s) => locale === 'en' ? AR.test(s) : prose(s);
      const SKIP = 'script,style,noscript,code,kbd,bdi,.u-data,.t-data,[data-numeric],time,[translate="no"]';
      // Latin that is a code, not prose: hex colours, px/kg sizes, ratios, short
      // all-caps codes (IATA, airline), token/class names, "§16", "6@md".
      const CODE = /^(#[0-9A-Fa-f]{6}|\d+(\.\d+)?\s?(px|kg|:1)?( AA)?|[A-Z]{2,3}|[.§\-#][\w@.§ \-\/·+]*|\w+@\w+.*|(xs|sm|md|lg|pill|full)( ·.*)?)$/;
      const prose = (s) => !CODE.test(s.trim()) && /[A-Za-z]{2,}/.test(s.replace(/#[0-9A-Fa-f]{6}\b/g,'').replace(/[A-Z]{2,3}\b/g,'').replace(/\d+\s?(px|kg)/g,''));
      const effLang = (el) => (el.closest('[lang]')?.getAttribute('lang') || document.documentElement.lang).slice(0,2);
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode());) {
        const el = n.parentElement; if (!el || el.closest(SKIP)) continue;
        const s = n.textContent.trim(); if (!s || !/[A-Za-z؀-ۿ]/.test(s)) continue;
        if (effLang(el) !== locale) continue;          // explicitly tagged as the other language
        if (wrong(s)) out.push({ where: el.tagName.toLowerCase() + (el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : ''), text: s.slice(0, 60) });
      }
      for (const el of document.querySelectorAll('[aria-label],[placeholder],[alt],[title]')) {
        if (el.closest(SKIP) || effLang(el) !== locale) continue;
        for (const a of ['aria-label','placeholder','alt','title']) {
          const v = el.getAttribute(a); if (v && wrong(v) && !/Travel & Tourism/.test(v)) out.push({ where: `${el.tagName.toLowerCase()}[${a}]`, text: v.slice(0,60) });
        }
      }
      if (wrong(document.title)) out.push({ where: '<title>', text: document.title });
      const md = document.querySelector('meta[name=description]')?.content || '';
      if (wrong(md)) out.push({ where: 'meta[description]', text: md.slice(0,60) });
      return out;
    }, locale);
    total += found.length;
    console.log(`\n${page} [${locale}] — ${found.length} untranslated`);
    const seen = new Set();
    for (const f of found) { const k = f.where + '|' + f.text; if (seen.has(k)) continue; seen.add(k); console.log(`  ${f.where.padEnd(34)} ${f.text}`); }
  }
  await p.close();
}
await b.close();
console.log(`\nTOTAL untranslated strings: ${total}`);
process.exit(total ? 1 : 0);
