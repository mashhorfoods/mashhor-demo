#!/usr/bin/env node
/* STAGE M12 §47/§48 — the production build.
   This site has no framework and no bundler: index.html IS the application.
   That is a strength (nothing to compile, nothing to go stale) but it means
   the file that is pleasant to work in and the file that should be shipped are
   not the same file. This script is the difference between them, and it does
   only three things — all of them provably lossless:

     1. The brand logo is inlined as a base64 data URI three times (favicon,
        header, footer). Decoded, two of those are byte-identical to
        brand/aun-aldrb-logo.svg and one to brand/aun-aldrb-logo-white.svg.
        Base64 also inflates every byte by a third. Pointing at the files that
        already ship removes 86KB from a render-blocking document and lets the
        browser cache one asset instead of parsing three copies of it.
     2. CSS comments are removed. There are ~88KB of them: the design log of
        twelve stages. They belong in source and cost every visitor bandwidth
        in production.
     3. HTML comments are removed, for the same reason.

   Nothing is minified beyond that: no selector rewriting, no property
   reordering, no JavaScript touched. The output must be byte-for-byte
   equivalent in behaviour, and the harnesses in ux/ are run against it.

   Usage:  node build.js          →  dist/
*/
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

/* Files that make up the deployable site. Everything else in the repo —
   ux/ (verification harnesses), brand/*.md and the design-system pages,
   build.js itself, node_modules — is development material and is not copied. */
const SHIP = [
  '404.html', 'robots.txt', 'sitemap.xml',
  'google192f612c4e876e6f.html',
  'brand/aun-aldrb-logo.svg', 'brand/aun-aldrb-logo-white.svg',
  'brand/aun-aldrb-logo.png', 'brand/aun-aldrb-logo-white.png',
];

/* --- 1 · the three inlined logos ----------------------------------------- */
function externaliseLogos(html) {
  const assets = [
    ['brand/aun-aldrb-logo.svg',       'brand/aun-aldrb-logo.svg'],
    ['brand/aun-aldrb-logo-white.svg', 'brand/aun-aldrb-logo-white.svg'],
  ];
  const b64 = {};
  for (const [file, href] of assets) {
    b64[fs.readFileSync(path.join(ROOT, file)).toString('base64')] = href;
  }
  let replaced = 0, saved = 0;
  html = html.replace(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g, (whole, data) => {
    const href = b64[data];
    if (!href) { console.warn('  ! an inlined image did not match any brand asset — left as is'); return whole; }
    replaced++; saved += whole.length - href.length;
    return href;
  });
  console.log(`  logos externalised : ${replaced} of 3   (${(saved/1024).toFixed(1)}KB removed)`);
  if (replaced !== 3) throw new Error('expected 3 inlined logos, replaced ' + replaced);
  return html;
}

/* --- 2 · CSS comments ----------------------------------------------------
   A scanner, not a regex: a `/*` inside a quoted string (a content: value,
   a url()) is not a comment, and removing it would corrupt the rule. */
function stripCssComments(css) {
  let out = '', i = 0, q = null;
  while (i < css.length) {
    const c = css[i], n = css[i + 1];
    if (q) {                                   /* inside '...' or "..." */
      out += c;
      if (c === '\\') { out += css[i + 1] || ''; i += 2; continue; }
      if (c === q) q = null;
      i++; continue;
    }
    if (c === '"' || c === "'") { q = c; out += c; i++; continue; }
    if (c === '/' && n === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      continue;
    }
    out += c; i++;
  }
  /* the comments leave blank lines behind; collapse runs of them */
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}

function build() {
  console.log('building production output → dist/\n');
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const before = Buffer.byteLength(html);

  html = externaliseLogos(html);

  const style = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!style) throw new Error('no <style> block found');
  const cssBefore = Buffer.byteLength(style[1]);
  const css = stripCssComments(style[1]);
  console.log(`  css comments       : ${((cssBefore - Buffer.byteLength(css))/1024).toFixed(1)}KB removed`);
  html = html.replace(style[0], '<style>' + css + '</style>');

  /* HTML comments, but never inside the script or style blocks */
  const parts = html.split(/(<script[\s\S]*?<\/script>|<style>[\s\S]*?<\/style>)/);
  const htmlBefore = Buffer.byteLength(html);
  html = parts.map(p =>
    (p.startsWith('<script') || p.startsWith('<style')) ? p : p.replace(/<!--[\s\S]*?-->/g, '')
  ).join('').replace(/\n{3,}/g, '\n\n');
  console.log(`  html comments      : ${((htmlBefore - Buffer.byteLength(html))/1024).toFixed(1)}KB removed`);

  fs.rmSync(DIST, { recursive: true, force: true });          /* §48 — never ship a stale build */
  fs.mkdirSync(path.join(DIST, 'brand'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'index.html'), html);

  /* M13 — the photographs that ship are exactly the ones the built page asks
     for, read back out of the markup rather than kept in a list here. The
     originals in img/ are the masters that tools-images.js resizes from; they
     are several times larger than any variant and must never be uploaded. */
  const referenced = new Set();
  for (const m of html.matchAll(/(?:src|srcset|href)="([^"]*)"/g)) {
    for (const part of m[1].split(',')) {
      const u = part.trim().split(/\s+/)[0];
      if (u.startsWith('img/')) referenced.add(u);
    }
  }
  let imgBytes = 0;
  for (const u of referenced) {
    const src = path.join(ROOT, u);
    if (!fs.existsSync(src)) throw new Error('the page references a missing image: ' + u);
    fs.mkdirSync(path.dirname(path.join(DIST, u)), { recursive: true });
    fs.copyFileSync(src, path.join(DIST, u));
    imgBytes += fs.statSync(src).size;
  }
  console.log('  photographs        : ' + referenced.size + ' variants, '
    + (imgBytes/1024).toFixed(0) + 'KB (originals not shipped)');

  for (const f of SHIP) {
    const src = path.join(ROOT, f);
    if (!fs.existsSync(src)) { console.warn('  ! missing, not shipped: ' + f); continue; }
    fs.mkdirSync(path.dirname(path.join(DIST, f)), { recursive: true });
    fs.copyFileSync(src, path.join(DIST, f));
  }
  const after = Buffer.byteLength(html);
  console.log(`\n  index.html         : ${(before/1024).toFixed(0)}KB → ${(after/1024).toFixed(0)}KB `
    + `(-${(100 - after/before*100).toFixed(0)}%)`);
  const files = [];
  (function walk(d){ for (const e of fs.readdirSync(d, {withFileTypes:true})) {
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p) : files.push([path.relative(DIST, p), fs.statSync(p).size]); } })(DIST);
  console.log(`  dist contents      : ${files.length} files, `
    + `${(files.reduce((a,f)=>a+f[1],0)/1024).toFixed(0)}KB total`);
  files.sort().forEach(([f,s]) => console.log(`      ${f.padEnd(34)} ${(s/1024).toFixed(1)}KB`));
}

build();
