// `npm test` — serves the repository the way GitHub Pages does (at /mashhor-demo/
// and, for the foundation suites, at /), runs every browser suite, then the
// language and accessibility audits. Exits 1 on any failure.
//
//   npm test                    everything
//   npm test -- home booking    only these suites (no audits)
//   npm test -- --audits        only the audits
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join } from 'node:path';
import './env.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const PREFIX = '/mashhor-demo/';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.pdf': 'application/pdf', '.md': 'text/markdown' };

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.startsWith(PREFIX)) path = path.slice(PREFIX.length - 1);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': MIME['.html'] }); res.end(readFileSync(join(ROOT, '404.html'))); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(req.method === 'HEAD' ? '' : readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const env = { ...process.env, TEST_ORIGIN: origin, BASE: `${origin}${PREFIX}` };

const args = process.argv.slice(2);
const SUITES = ['final', 'ghx', 'ghm', 'gfx', 'home', 'services', 'detail', 'destinations', 'offers', 'booking', 'supervisor', 'journey', 'account', 'integration', 'rm', 'links'];
const wanted = args.filter((a) => !a.startsWith('--'));
const suites = wanted.length ? wanted : (args.includes('--audits') ? [] : SUITES);
const audits = !wanted.length;
const rows = []; let failed = 0;
// The suites run one at a time, asynchronously: the server lives in this
// process, so a blocking spawn would starve it and every page would time out.
const exec = (file, extra) => new Promise((resolve) => {
  const child = spawn(process.execPath, [file], { env: { ...env, ...extra } });
  let out = ''; child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
  child.on('close', (status) => resolve({ status, out }));
});
const run = async (label, file, extra = {}) => {
  const t = Date.now();
  const r = await exec(file, extra);
  const out = r.out;
  const summary = out.split('\n').filter((l) => /passed|untranslated strings|unique findings|problems$/.test(l)).pop() ?? out.trim().split('\n').pop();
  const bad = out.split('\n').filter((l) => /✗|pageerror|Error:/.test(l)).slice(0, 8);
  // A suite fails on a non-zero exit OR on any ✗ line (the older suites only print).
  const ok = r.status === 0 && !bad.some((l) => l.includes('✗'));
  if (!ok) failed++;
  rows.push(`${ok ? '✓' : '✗'} ${label.padEnd(12)} ${String(Math.round((Date.now() - t) / 1000) + 's').padStart(5)}  ${summary?.trim() ?? ''}`);
  if (!ok) rows.push(...bad.map((l) => '    ' + l.trim()));
};
for (const s of suites) await run(s, join(ROOT, 'tests', `${s}.mjs`));
if (audits) {
  const pages = ['index.html', '404.html', 'styleguide.html', 'services/index.html', 'destinations/index.html', 'offers/index.html', 'book/index.html'];
  for (const dir of ['services', 'offers', 'supervisor']) for (const d of readdirSync(join(ROOT, dir), { withFileTypes: true })) if (d.isDirectory()) pages.push(`${dir}/${d.name}/index.html`);
  pages.push('search/index.html'); for (const d of readdirSync(join(ROOT, 'booking'), { withFileTypes: true })) if (d.isDirectory()) pages.push(`booking/${d.name}/index.html`);
  pages.push('trips/index.html', 'account/index.html', 'legal/terms/index.html', 'legal/privacy/index.html'); for (const d of readdirSync(join(ROOT, 'account'), { withFileTypes: true })) if (d.isDirectory()) pages.push(`account/${d.name}/index.html`);
  await run('i18n', join(ROOT, 'tools/i18n-audit.mjs'), { PAGES: pages.join(',') });
  await run('a11y', join(ROOT, 'tools/a11y-audit.mjs'));
}
server.close();
console.log(rows.join('\n'));
console.log(failed ? `\n${failed} failed` : '\nall green');
process.exit(failed ? 1 : 0);
