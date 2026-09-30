// End-to-end check of the editing panel, /cms/, against a stand-in for
// GitHub's API: signs in with a token, edits a price and a study, saves, and
// checks what would be committed — one file per save, to main, only the
// field that was edited changed. A malformed WhatsApp number must not save.
//
//   node tests/cms.mjs        (after the build; CHROMIUM=/path/to/chrome if needed)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const site = path.join(root, 'site');
const STUDIES = ['brand-identity-systems', 'editorial-publication-design', 'information-design', 'digital-campaigns'];
const FILES = ['content/prices.json', 'content/brands.json', 'tools/config.json', ...STUDIES.map((s) => `content/studies/${s}.json`)];
const repo = Object.fromEntries(FILES.map((f) => [f, readFileSync(path.join(root, f), 'utf8')]));
const original = structuredClone(repo);
const sha = (t) => createHash('sha1').update(`blob ${Buffer.byteLength(t)}\0${t}`).digest('hex');
const commits = [];
const changedLines = (a, b) => { const x = a.split('\n'), y = b.split('\n'); return x.length === y.length ? x.filter((l, i) => l !== y[i]).length : -1; };

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  — ${extra}` : ''}`);
  if (!ok) failures += 1;
};

// GitHub, as much of it as the panel uses: the signed-in user, the repository
// and its permissions, the file tree, file contents, commit metadata, and
// createCommitOnBranch (recorded, and applied to the stand-in repository).
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const unknown = [];
async function github(route) {
  const req = route.request();
  const url = new URL(req.url());
  if (url.pathname === '/user') return json(route, { login: 'owner', name: 'Owner', id: 1, avatar_url: '' });
  if (url.pathname === '/repos/mashhorfoods/mashhor-demo') {
    return json(route, { name: 'mashhor-demo', full_name: 'mashhorfoods/mashhor-demo', default_branch: 'main', private: false,
      owner: { login: 'mashhorfoods' }, html_url: 'https://github.com/mashhorfoods/mashhor-demo', permissions: { admin: false, push: true, pull: true } });
  }
  if (url.pathname.startsWith('/repos/mashhorfoods/mashhor-demo/git/trees/')) {
    return json(route, { sha: 'tree', truncated: false,
      tree: Object.entries(repo).map(([p, t]) => ({ path: p, mode: '100644', type: 'blob', sha: sha(t), size: Buffer.byteLength(t) })) });
  }
  if (url.pathname === '/graphql') {
    const { query, variables } = JSON.parse(req.postData() || '{}');
    const head = `head${commits.length}`;
    if (query.includes('createCommitOnBranch')) {
      commits.push(variables.input);
      for (const f of variables.input.fileChanges?.additions || []) repo[f.path] = Buffer.from(f.contents, 'base64').toString('utf8');
      return json(route, { data: { createCommitOnBranch: { commit: { oid: `head${commits.length}`, committedDate: new Date().toISOString(), url: '' } } } });
    }
    if (/content_\d+: object/.test(query)) {
      const bySha = Object.fromEntries(Object.values(repo).map((t) => [sha(t), t]));
      const out = {};
      for (const m of query.matchAll(/(content_\d+): object\(oid: "([0-9a-f]+)"\)/g)) out[m[1]] = { text: bySha[m[2]], isTruncated: false };
      return json(route, { data: { repository: out } });
    }
    if (/commit_\d+:\s+ref/.test(query)) {
      const out = {};
      for (const m of query.matchAll(/(commit_\d+):/g)) {
        out[m[1]] = { target: { history: { nodes: [{ author: { name: 'Owner', email: 'owner@example.com', user: { id: 1, login: 'owner' } }, committedDate: '2026-09-01T00:00:00Z' }] } } };
      }
      return json(route, { data: { repository: out } });
    }
    if (query.includes('history(first: 1)')) return json(route, { data: { repository: { ref: { target: { history: { nodes: [{ oid: head, message: 'x' }] } } } } } });
    if (query.includes('... on Commit { oid }')) return json(route, { data: { repository: { ref: { target: { oid: head } } } } });
    if (query.includes('viewerCanPush')) return json(route, { data: { repository: { ref: { refUpdateRule: null } } } });
    if (/commit_\d+: object/.test(query)) return json(route, { data: { repository: {} } }); // CI status: none
    unknown.push(query.slice(0, 120));
  } else unknown.push(`${req.method()} ${url.pathname}`);
  return json(route, { message: 'Not Found' }, 404);
}

const PORT = 8096;
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', site, path.join(here, 'router.php')], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

// The value of the n-th text box whose current value is `value`, as a locator.
async function boxWithValue(page, value) {
  const i = await page.locator('input, textarea').evaluateAll((els, v) => els.findIndex((e) => e.value === v), value);
  return i < 0 ? null : page.locator('input, textarea').nth(i);
}
const saved = async (page) => {
  await page.getByRole('button', { name: 'حفظ', exact: true }).first().click();
  await page.waitForTimeout(1500);
};

try {
  const context = await browser.newContext({ locale: 'ar' });
  // The interface's Arabic text comes from unpkg.com; its fonts from jsDelivr.
  await context.route(/unpkg\.com|cdn\.jsdelivr\.net|githubstatus\.com/, (r) => r.abort());
  await context.route(/unpkg\.com\/@sveltia\/cms@[^/]+\/locales\/ar\.json/, (r) =>
    r.fulfill({ contentType: 'application/json', body: readFileSync(path.join(root, 'node_modules/@sveltia/cms/locales/ar.json')) }));
  await context.route(/api\.github\.com/, github);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  /* ---- 1. Sign in ------------------------------------------------------- */
  await page.goto(`${BASE}/cms/`);
  const tokenButton = page.getByRole('button', { name: /رمز الوصول/ });
  await tokenButton.first().waitFor({ timeout: 15000 });
  check(await tokenButton.count() > 0, 'the panel loads, in Arabic, with token sign-in');
  await tokenButton.first().click();
  await page.locator('input').first().fill('github_pat_example');
  await page.keyboard.press('Enter');
  await page.getByText('الأسعار والتواصل').first().waitFor({ timeout: 15000 });
  const studies = await page.getByText('دراسات الحالة').first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  check(studies, 'signed in: prices & contact, and case studies');

  /* ---- 2. A price ------------------------------------------------------- */
  await page.getByText('أسعار الباقات').first().click();
  await page.getByRole('spinbutton').first().waitFor();
  const prices = JSON.parse(original['content/prices.json']);
  await page.getByRole('spinbutton').nth(1).fill('1050');
  await saved(page);
  const [priceCommit] = commits;
  const expected = structuredClone(prices);
  expected.branding['tier-professional'] = 1050;
  check(priceCommit?.branch?.branchName === 'main' && priceCommit?.branch?.repositoryNameWithOwner === 'mashhorfoods/mashhor-demo',
    'saving commits to main of the site’s repository');
  check(priceCommit?.fileChanges?.additions?.length === 1 && priceCommit.fileChanges.additions[0].path === 'content/prices.json',
    'one file per save: content/prices.json');
  check(JSON.stringify(JSON.parse(repo['content/prices.json'])) === JSON.stringify(expected),
    'only the edited price changed, as a whole number');
  check(changedLines(original['content/prices.json'], repo['content/prices.json']) === 1, 'the file’s diff is that one line');
  check(/content\/prices\.json/.test(priceCommit?.message?.headline || ''), 'the commit message names the file', priceCommit?.message?.headline);

  /* ---- 3. A study ------------------------------------------------------- */
  await page.goto(`${BASE}/cms/#/collections/studies/entries/information-design`);
  const study = JSON.parse(original['content/studies/information-design.json']);
  let headline = null;
  for (let i = 0; i < 30 && !headline; i += 1) {
    headline = await boxWithValue(page, study.headline.ar);
    if (!headline) await page.waitForTimeout(300);
  }
  check(headline !== null, 'the study opens with its Arabic headline');
  if (headline) {
    await headline.fill('أبحاث يفهمها الجميع.');
    await saved(page);
    const after = JSON.parse(repo['content/studies/information-design.json']);
    const want = structuredClone(study);
    want.headline.ar = 'أبحاث يفهمها الجميع.';
    const same = JSON.stringify(after) === JSON.stringify(want);
    check(commits.length === 2 && same, 'the study saves with only its headline changed',
      same ? `${commits.length} commits` : repo['content/studies/information-design.json'].slice(0, 400));
    check(changedLines(original['content/studies/information-design.json'], repo['content/studies/information-design.json']) === 1,
      'the study file’s diff is that one line');
  }

  /* ---- 4. A malformed WhatsApp number does not save ---------------------- */
  await page.goto(`${BASE}/cms/#/collections/settings/entries/whatsapp`);
  let number = null;
  const current = JSON.parse(original['tools/config.json']).whatsapp;
  for (let i = 0; i < 30 && !number; i += 1) {
    number = await boxWithValue(page, current);
    if (!number) await page.waitForTimeout(300);
  }
  check(number !== null, 'the WhatsApp number is editable');
  if (number) {
    const before = commits.length;
    await number.fill('+971 50 123 4567');
    await saved(page);
    check(commits.length === before && repo['tools/config.json'] === original['tools/config.json'], 'a number with + or spaces is refused, nothing saved');
  }

  check(errors.length === 0, 'no script errors', errors.join(' | ').slice(0, 300));
  check(unknown.length === 0, 'the panel used only the GitHub calls this test stands in for', unknown.join(' | '));
  await context.close();
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${failures ? `${failures} FAILED` : 'All passed'}`);
process.exit(failures ? 1 : 0);
