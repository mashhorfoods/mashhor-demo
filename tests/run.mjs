// `npm test` — serves the repository the way GitHub Pages does (at /mashhor-demo/
// and, for the foundation suites, at /), runs every browser suite, then the
// language and accessibility audits. Exits 1 on any failure.
//
//   npm test                    everything
//   npm test -- home booking    only these suites (no audits)
//   npm test -- --audits        only the audits (npm run audit)
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { staticServer, REPO_ROOT as ROOT } from './env.mjs';

const PREFIX = '/mashhor-demo/';
const site = await staticServer({ prefix: PREFIX, bare: true });
const env = { ...process.env, TEST_ORIGIN: site.origin, BASE: `${site.origin}${PREFIX}` };

const args = process.argv.slice(2);
const SUITES = ['final', 'ghx', 'ghm', 'gfx', 'home', 'services', 'detail', 'destinations', 'offers', 'booking', 'supervisor', 'journey', 'account', 'integration', 'backend', 'supervisor-portal', 'ops-portal', 'rm', 'links', 'food-supplier'];
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
  // Both audits take their page lists from tests/pages.mjs.
  await run('i18n', join(ROOT, 'tools/i18n-audit.mjs'));
  await run('a11y', join(ROOT, 'tools/a11y-audit.mjs'));
}
site.close();
console.log(rows.join('\n'));
console.log(failed ? `\n${failed} failed` : '\nall green');
process.exit(failed ? 1 : 0);
