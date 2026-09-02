#!/usr/bin/env node
/* STAGE M13 §45 — the upload package.
   -------------------------------------------------------------------------
   Zips dist/ into a single archive to upload and extract on the server.

   The one thing that has to be right is the SHAPE. The archive holds the
   CONTENTS of dist/ at its root — index.html is the first entry, not
   dist/index.html — because on Hostinger (and every other cPanel-style host)
   the archive is uploaded into public_html and extracted there. An archive
   with a folder inside it produces public_html/dist/index.html, and the site
   answers 404 at its own address. That is the mistake this script exists to
   make impossible, and it is asserted below rather than trusted.

   The second thing is .htaccess. It is a dotfile, and a surprising number of
   archive tools skip dotfiles silently — losing compression, caching, the
   404 handler and the canonical redirects without a single error message.
   `zip -r . ` includes it; the assertion at the end proves it did.

   Nothing is added that build.js did not put in dist/. In particular there is
   no README inside the archive: everything in it is served at a public URL,
   and deployment notes are not content. They are in DEPLOY.md, which stays in
   the repository.

   Usage:  node build.js && node tools-package.js
   Requires the `zip` command (present by default on macOS and Linux).
*/
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const OUT  = path.join(ROOT, 'aun-aldrb-site.zip');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('  dist/ is missing or empty — run `node build.js` first.');
  process.exit(1);
}

/* dist/ must be newer than the sources it is built from, or the archive ships
   a build nobody asked for */
const distTime = fs.statSync(path.join(DIST, 'index.html')).mtimeMs;
const stale = ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'llms.txt', '.htaccess']
  .filter(f => fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).mtimeMs > distTime);
if (stale.length) {
  console.error('  dist/ is older than: ' + stale.join(', ') + '\n  run `node build.js` first.');
  process.exit(1);
}

fs.rmSync(OUT, { force: true });

/* -X drops the extended attributes (uid/gid, Finder metadata) that are
   meaningless on a web server and that make the archive differ between
   machines for no reason. */
try {
  execFileSync('zip', ['-r', '-X', '-9', '-q', OUT, '.'], { cwd: DIST });
} catch (e) {
  console.error('  the `zip` command failed or is not installed.');
  process.exit(1);
}

/* --- verify the archive, rather than assume it ---------------------------- */
const listing = execFileSync('zip', ['-sf', OUT]).toString();
const entries = listing.split('\n').map(l => l.trim())
  .filter(l => l && !/^(Archive contains:|Total \d+ entries)/.test(l));
const files = entries.filter(e => !e.endsWith('/'));

const problems = [];
if (!files.includes('index.html'))
  problems.push('index.html is not at the archive root — extracting this would nest the site in a folder');
if (!files.includes('.htaccess'))
  problems.push('.htaccess is missing — the archive tool dropped the dotfile');
if (files.some(f => f.startsWith('dist/')))
  problems.push('entries are nested under dist/');
const forbidden = files.filter(f =>
  /(^|\/)(ux|seo|node_modules)\//.test(f) || /^(build|tools-[a-z-]+)\.js$/.test(f)
  || /^package(-lock)?\.json$/.test(f) || /\.md$/.test(f) && !f.startsWith('fonts/'));
if (forbidden.length) problems.push('development material in the archive: ' + forbidden.join(', '));

/* every file build.js wrote must be in the archive, and nothing else */
const onDisk = [];
(function walk(d, prefix) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p, prefix + e.name + '/') : onDisk.push(prefix + e.name);
  }
})(DIST, '');
const missing = onDisk.filter(f => !files.includes(f));
const extra   = files.filter(f => !onDisk.includes(f));
if (missing.length) problems.push('missing from the archive: ' + missing.join(', '));
if (extra.length)   problems.push('in the archive but not in dist/: ' + extra.join(', '));

const size = fs.statSync(OUT).size;
console.log('  ' + path.basename(OUT));
console.log('  ' + files.length + ' files, ' + (size / 1024 / 1024).toFixed(2) + 'MB compressed'
  + '  (dist/ is ' + (onDisk.reduce((a, f) => a + fs.statSync(path.join(DIST, f)).size, 0) / 1024 / 1024).toFixed(2) + 'MB)');
console.log('  root entries: ' + [...new Set(files.map(f => f.split('/')[0] + (f.includes('/') ? '/' : '')))].sort().join('  '));

if (problems.length) {
  console.error('\n  ARCHIVE IS NOT DEPLOYABLE:');
  problems.forEach(p => console.error('    ! ' + p));
  process.exit(1);
}
console.log('\n  verified: index.html and .htaccess are at the archive root,');
console.log('  every file in dist/ is present, and nothing else is.');
console.log('  Upload and extract INTO public_html — not into a folder inside it.');
