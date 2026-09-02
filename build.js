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
     4. JavaScript comments are removed, for the same reason: 10KB of the
        behaviour script's 25KB is the design log of why each observer exists.

   M13 also copies the self-hosted faces and the responsive photo variants,
   both read out of the built markup rather than kept in a list here.

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
  /* M13 — the machine-readable summary AI assistants look for at /llms.txt.
     Same facts as the page, plus an explicit list of what the site does NOT
     state, so an assistant has no gap to fill in with an invention. */
  'llms.txt',
  /* M13 §28/§29 — compression, cache headers, the 404 handler and the MIME
     types for avif/woff2. Measured on this build: without compression the
     mobile performance score is 93 and LCP is 3.1s; with it, 99 and 2.2s.
     Inert on Nginx — DEPLOY.md carries the equivalent server block. */
  '.htaccess',
  /* M13 — the licence that permits redistributing the two font families.
     fonts/font-face.css is source: its rules are already inside the inline
     stylesheets, so shipping it would be a second copy nothing requests. */
  'fonts/OFL.txt',
  /* RECOVERY 01 — the configuration template, so an operator has the shape to
     fill in on the server. It holds no values; .htaccess denies it over HTTP
     anyway, and the real .env belongs above the web root. */
  '.env.example',
];

/* RECOVERY 01 — the backend and the admin ship as whole directory trees,
   because unlike the public site they are not reachable from index.html and
   so cannot be worked out from the markup.

   app/ sits under the document root only because the documented Hostinger
   deployment is a single zip extracted into public_html. Its own .htaccess
   denies the whole directory, and every file in it also guards on AUN_APP —
   two independent locks, because a host that ignores .htaccess would
   otherwise serve the source. DEPLOY.md explains how to move .env above the
   web root, which is stronger still.

   Excluded on purpose: .env (credentials never enter a build), the SQLite
   database and the logs (runtime state), and the design logs and QA reports
   in admin/, which are working documents rather than part of the app. */
const SHIP_TREES = [
  { dir: 'api',   skip: () => false },
  { dir: 'app',   skip: (rel) => rel.startsWith('storage/') && !rel.endsWith('.htaccess') },
  { dir: 'admin', skip: (rel) => rel.endsWith('.md') || /^stage-\d/.test(rel) },
  { dir: 'bin',   skip: (rel) => rel === 'verify.php' },
];

/* Everything else — photographs, faces, logos, the social card, the icons —
   is worked out from the markup instead of listed, so an asset that stops
   being referenced stops being uploaded on the next build without anyone
   having to remember. M13 removed brand/aun-aldrb-logo-white.png from the
   package this way: nothing had referenced it since the Open Graph image
   became og-image.png. */
const SITE = 'https://aunaldrb.com/';
const ASSET_DIRS = ['img/', 'fonts/', 'brand/'];

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

/* --- 2b · JavaScript comments ---------------------------------------------
   M13. The behaviour script is 25KB of which 10KB is prose: why each observer
   exists, what was measured, what broke before. That belongs in source and is
   parsed by every visitor in production.

   The same scanner shape as the CSS one, with the two things JavaScript adds:
   a `//` line comment, and the fact that `/` is ambiguous — divide or the
   start of a regex literal. The last significant character decides: after a
   value (identifier, number, `)`, `]`) a slash divides; after an operator,
   `(`, `,`, `{`, `;` or `return` it opens a regex. Template literals are
   tracked too, since `${...}` can nest quotes inside them.

   Nothing else is touched. No renaming, no whitespace games, no reordering:
   the output must run identically, and the harnesses in ux/ are run against
   it to prove that it does. */
function stripJsComments(js) {
  let out = '', i = 0, prev = '';
  const opensRegex = () => !prev || '(,=:[!&|?{};+-*%~^<>'.includes(prev)
    || /\b(return|typeof|instanceof|in|of|new|delete|void|do|else|case)$/.test(out.trimEnd());
  while (i < js.length) {
    const c = js[i], n = js[i + 1];

    if (c === '/' && n === '*') { const e = js.indexOf('*/', i + 2); i = e < 0 ? js.length : e + 2; continue; }
    if (c === '/' && n === '/') { const e = js.indexOf('\n', i);    i = e < 0 ? js.length : e;     continue; }

    if (c === '"' || c === "'" || c === '`') {          /* a string, verbatim */
      const q = c; out += c; i++;
      while (i < js.length) {
        const d = js[i];
        if (d === '\\') { out += d + (js[i + 1] || ''); i += 2; continue; }
        out += d; i++;
        if (d === q) break;
      }
      prev = q; continue;
    }

    if (c === '/' && opensRegex()) {                    /* a regex, verbatim */
      out += c; i++;
      let cls = false;
      while (i < js.length) {
        const d = js[i];
        if (d === '\\') { out += d + (js[i + 1] || ''); i += 2; continue; }
        if (d === '[') cls = true; else if (d === ']') cls = false;
        out += d; i++;
        if (d === '/' && !cls) break;
        if (d === '\n') break;                          /* not a regex after all */
      }
      prev = '/'; continue;
    }

    out += c; i++;
    if (!/\s/.test(c)) prev = c;
  }
  /* the comments leave blank and trailing-whitespace lines behind */
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
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

  /* M13 — the same for the behaviour script */
  let jsBefore = 0, jsAfter = 0;
  html = html.replace(/<script>([\s\S]*?)<\/script>/g, (whole, js) => {
    jsBefore += Buffer.byteLength(js);
    const stripped = stripJsComments(js);
    jsAfter += Buffer.byteLength(stripped);
    return '<script>' + stripped + '</script>';
  });
  console.log(`  js comments        : ${((jsBefore - jsAfter)/1024).toFixed(1)}KB removed`);

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
  const note = raw => {
    if (!raw) return;
    /* the same asset is written three ways across the project: relative from
       index.html, root-absolute from 404.html, and fully qualified inside the
       JSON-LD and the Open Graph tags. All three name one file. */
    let u = raw.trim();
    if (u.startsWith(SITE)) u = u.slice(SITE.length);
    if (u.startsWith('/')) u = u.slice(1);
    if (ASSET_DIRS.some(d => u.startsWith(d))) referenced.add(u);
  };
  /* src, srcset, imagesrcset, href — srcset values are comma-separated and
     carry a width descriptor after the URL */
  for (const m of html.matchAll(/(?:src|srcset|href|content)="([^"]*)"/g)) {
    for (const part of m[1].split(',')) note(part.trim().split(/\s+/)[0]);
  }
  /* and the faces, out of the @font-face rules, so a weight that stops being
     declared stops being uploaded */
  for (const m of html.matchAll(/url\(([^)"']+)\)/g)) note(m[1]);
  /* and anything the JSON-LD names, where the assets are values in an object
     rather than attributes on an element */
  for (const m of html.matchAll(new RegExp(SITE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^"\\s]+', 'g')))
    note(m[0]);

  /* 404.html ships too, and it has its own logo, icons and @font-face rules */
  {
    const nf = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
    for (const m of nf.matchAll(/(?:src|href)="([^"]*)"/g)) note(m[1]);
    for (const m of nf.matchAll(/url\(([^)"']+)\)/g)) note(m[1]);
    /* §26 — no document may reach off-origin for a render-blocking stylesheet */
    if (/<link[^>]+rel="stylesheet"[^>]+href="https?:/.test(nf))
      throw new Error('404.html links an external stylesheet');
  }
  if (/<link[^>]+rel="stylesheet"[^>]+href="https?:/.test(html))
    throw new Error('index.html links an external stylesheet');

  let assetBytes = 0;
  for (const u of [...referenced].sort()) {
    const src = path.join(ROOT, u);
    if (!fs.existsSync(src)) throw new Error('the page references a missing asset: ' + u);
    fs.mkdirSync(path.dirname(path.join(DIST, u)), { recursive: true });
    fs.copyFileSync(src, path.join(DIST, u));
    assetBytes += fs.statSync(src).size;
  }
  console.log('  referenced assets  : ' + referenced.size + ' files, '
    + (assetBytes/1024).toFixed(0) + 'KB (image masters not shipped)');

  for (const f of SHIP) {
    const src = path.join(ROOT, f);
    if (!fs.existsSync(src)) { console.warn('  ! missing, not shipped: ' + f); continue; }
    fs.mkdirSync(path.dirname(path.join(DIST, f)), { recursive: true });
    fs.copyFileSync(src, path.join(DIST, f));
  }

  let treeFiles = 0, treeBytes = 0;
  for (const { dir, skip } of SHIP_TREES) {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) { console.warn('  ! missing, not shipped: ' + dir + '/'); continue; }
    (function walk(abs) {
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        const p = path.join(abs, e.name);
        const rel = path.relative(base, p).split(path.sep).join('/');
        if (e.isDirectory()) { walk(p); continue; }
        /* credentials and runtime state never ship */
        if (e.name === '.env' || e.name.endsWith('.sqlite') || e.name.endsWith('.log')) continue;
        if (e.name.startsWith('.env.') && e.name !== '.env.example') continue;
        if (skip(rel)) continue;
        const dest = path.join(DIST, dir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(p, dest);
        treeFiles++; treeBytes += fs.statSync(p).size;
      }
    })(base);
  }
  console.log('  backend + admin    : ' + treeFiles + ' files, '
    + (treeBytes / 1024).toFixed(0) + 'KB');
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
