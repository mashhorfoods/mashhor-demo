// Writes the stylesheet <link> block into every page from the one list in
// tools/lib/stylesheets.mjs. Run it after adding, renaming or removing a
// stylesheet:
//
//   node tools/css-links.mjs           rewrite the pages
//   node tools/css-links.mjs --check   exit 1 if any page is out of date (npm test runs this)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withStylesheets } from './lib/stylesheets.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SKIP = new Set(['node_modules', '.git', '.claude', 'tests', 'templates', 'docs', 'backend', 'tools']);
const pages = [];
(function walk(dir) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.isDirectory()) { if (!SKIP.has(d.name) && !d.name.startsWith('.')) walk(join(dir, d.name)); } else if (d.name.endsWith('.html')) pages.push(join(dir, d.name));
  }
})(ROOT);

const check = process.argv.includes('--check');
const stale = []; let linked = 0;
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const next = withStylesheets(html);
  if (next === null) continue;
  linked++;
  if (next === html) continue;
  stale.push(relative(ROOT, file));
  if (!check) writeFileSync(file, next);
}
if (check) {
  stale.forEach((f) => console.log(`✗ out of date: ${f} (run node tools/css-links.mjs)`));
  console.log(`${linked} pages checked, ${stale.length} out of date — ${stale.length ? 'failed' : 'passed'}`);
  process.exit(stale.length ? 1 : 0);
}
console.log(`${linked} pages, ${stale.length} rewritten`);
