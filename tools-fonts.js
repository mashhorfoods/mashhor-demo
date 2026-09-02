#!/usr/bin/env node
/* STAGE M13 §19/§26 — the five approved faces, self-hosted.
   -------------------------------------------------------------------------
   The site loaded its typography from fonts.googleapis.com. That stylesheet
   is render-blocking and lives on a third origin, so first paint waited on a
   DNS lookup, a TLS handshake and a round trip before the browser had even
   seen a font file — and if the request is slow or fails, the page stays
   blank for as long as the browser is willing to wait. Measured on a
   throttled mobile profile that was the single largest cost on this page.

   Self-hosting removes two origins from the critical path and lets the
   @font-face rules live in the stylesheet that is already inline, so the font
   files are discovered while the CSS is parsed with no request in front of
   them. Visually nothing changes: these are the files Google serves.

   Both families are under the SIL Open Font License 1.1, which permits
   redistribution. fonts/OFL.txt ships alongside them.

   THE FIVE WEIGHTS are exactly the ones the design system uses, no more:
     Cairo (body)                 400  body copy
                                  500  .hero__lead
     IBM Plex Sans Arabic (head)  500  nav links, field labels, chips
                                  600  h3/h4, most component titles
                                  700  h1/h2, .text-display, the phone number

   TWO SUBSETS per family, and only two. Google's stylesheet offers arabic,
   latin, latin-ext, cyrillic, greek and vietnamese; this site can render the
   first two and nothing else asks for the rest.

     arabic  every word of copy on the page. Shipped whole — the copy will
             change, and a missing glyph is a broken page.
     latin   the phone number, 24/7, and the Latin numerals. Subset to
             printable ASCII, which is a safe superset of any Latin a future
             edit could introduce and a fraction of Google's own latin subset.

   TWO SIZE DECISIONS worth knowing about:

     Cairo is a variable font, and Google serves the SAME file for 400 and
     500 — self-hosting it under two names would download it twice. One file
     per subset ships instead, declared `font-weight:400 500`, and its wght
     axis is limited to that range (fonttools varLib.instancer), which drops
     the variation data for weights the site never asks for. Roughly a third
     off the file, and half the requests.

     IBM Plex Sans Arabic is static: three real files, one per weight.

   WHAT IT WRITES
     fonts/<family>-<weights>-<subset>.woff2
     fonts/font-face.css   the @font-face block to paste into index.html

   Usage:  node tools-fonts.js
   Requires curl, and python3 with fonttools + brotli, to REBUILD only —
   never to serve.  pip install fonttools brotli
*/
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'fonts');
const UA = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 '
         + '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const SOURCE = 'https://fonts.googleapis.com/css2'
             + '?family=IBM+Plex+Sans+Arabic:wght@500;600;700'
             + '&family=Cairo:wght@400;500&display=swap';

/* printable ASCII, plus the marks an RTL document needs inside a Latin run */
const LATIN_RANGE = 'U+0020-007E,U+00A0,U+200C-200E,U+2010-2011';

const py = (mod, args) => execFileSync('python3', ['-m', mod, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/\.woff2$/.test(f)) fs.unlinkSync(path.join(OUT, f));

const css = execFileSync('curl', ['-sS', '-A', UA, SOURCE], { maxBuffer: 1e8 }).toString();

/* --- 1 · read the faces out of Google's stylesheet ----------------------- */
const faces = [];
const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
let m;
while ((m = re.exec(css))) {
  const [, subset, body] = m;
  if (subset !== 'arabic' && subset !== 'latin') continue;
  faces.push({
    subset,
    family: /font-family:\s*'([^']+)'/.exec(body)[1],
    weight: +/font-weight:\s*(\d+)/.exec(body)[1],
    url:    /url\((https:[^)]+)\)/.exec(body)[1],
    range:  /unicode-range:\s*([^;]+);/.exec(body)[1].trim(),
  });
}
if (faces.length !== 10) throw new Error('expected 10 faces (5 weights × 2 subsets), got ' + faces.length);

/* --- 2 · collapse the faces Google serves from one file ------------------ */
const byUrl = new Map();
for (const f of faces) {
  const g = byUrl.get(f.url);
  if (g) { g.weights.push(f.weight); continue; }
  byUrl.set(f.url, { ...f, weights: [f.weight] });
}

/* --- 3 · download, trim, write ------------------------------------------- */
let total = 0, block = '';
for (const f of byUrl.values()) {
  f.weights.sort((a, b) => a - b);
  const lo = f.weights[0], hi = f.weights[f.weights.length - 1];
  const slug = f.family.toLowerCase().replace(/\s+/g, '-')
             + '-' + f.weights.join('') + '-' + f.subset + '.woff2';
  const dest = path.join(OUT, slug);
  execFileSync('curl', ['-sS', '-A', UA, f.url, '-o', dest]);
  const raw = fs.statSync(dest).size;

  const variable = py('fontTools.ttx', ['-l', dest]).toString().includes('fvar');
  if (variable) {
    /* limit wght to the range actually declared, then re-compress */
    py('fontTools.varLib.instancer', [dest, `wght=${lo}:${hi}`, '-o', dest, '--no-overlap-flag']);
  }
  const args = [dest, '--no-hinting', '--flavor=woff2', '--output-file=' + dest];
  if (f.subset === 'latin') { args.splice(1, 0, '--unicodes=' + LATIN_RANGE); f.range = LATIN_RANGE.replace(/,/g, ', '); }
  else                      { args.splice(1, 0, '--unicodes=' + f.range.replace(/\s+/g, '')); }
  py('fontTools.subset', args);

  const size = fs.statSync(dest).size;
  total += size;
  console.log('  ' + slug.padEnd(40) + (raw / 1024).toFixed(1).padStart(6) + 'KB → '
    + (size / 1024).toFixed(1).padStart(5) + 'KB' + (variable ? '   variable, wght ' + lo + '–' + hi : ''));

  block += `@font-face{font-family:'${f.family}';font-style:normal;`
        +  `font-weight:${lo === hi ? lo : lo + ' ' + hi};font-display:swap;`
        +  `src:url(fonts/${slug}) format('woff2');unicode-range:${f.range}}\n`;
}
fs.writeFileSync(path.join(OUT, 'font-face.css'), block);
console.log('\n  ' + byUrl.size + ' files, ' + (total / 1024).toFixed(1) + 'KB total'
  + '   (' + faces.length + ' declared faces, ' + (faces.length - byUrl.size) + ' served from a shared file)');
console.log('  fonts/font-face.css written — paste it into the <style> in index.html');
