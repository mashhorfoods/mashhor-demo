#!/usr/bin/env node
/**
 * هل تعمل الصفحة تحت سياسة المحتوى التي ستُرسَل فعلاً؟
 *
 * The CSP is sealed into .htaccess at build time, and `php -S` ignores
 * .htaccess — so every other gate in this project measures the pages with no
 * policy applied at all. That was survivable while style-src carried
 * 'unsafe-inline', because a wildcard cannot be wrong. It stopped being
 * survivable the moment the stylesheet was pinned to a hash: one byte of
 * difference between the file and the hash and the live site loses all of its
 * styling, and nothing in the build or the other gates would say a word.
 *
 * So this reads the policy out of the built .htaccess, serves dist/ with that
 * exact header, opens the page in a real browser and asks Chromium itself
 * whether anything was blocked. A hash that does not match is a violation
 * event, and a violation event fails the gate.
 *
 * Usage:  node bin/qa-csp.js
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const DIST = path.join(__dirname, '..', 'dist');
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']
  .find((p) => fs.existsSync(p));

let pass = 0, fail = 0;
const lines = [], failures = [];
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  lines.push(`  ${ok ? 'PASS' : 'FAIL'} ${name.padEnd(56)} ${detail}`);
  if (!ok) failures.push(`${name} — ${detail}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.webp': 'image/webp', '.avif': 'image/avif',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

/** The policy exactly as .htaccess will hand it to LiteSpeed. */
function policyFromHtaccess() {
  const rules = fs.readFileSync(path.join(DIST, '.htaccess'), 'utf8');
  const m = rules.match(/Header always set Content-Security-Policy\s+"([^"]+)"/);
  if (!m) throw new Error('no Content-Security-Policy found in dist/.htaccess');
  if (m[1].includes('__AUN_')) throw new Error('the CSP still carries an unsealed token: ' + m[1].slice(0, 60));
  return m[1];
}

function serve(root, csp) {
  const srv = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    /* dist/ is the static half of the site; the API is PHP and does not live
       there. index.html asks GET /api/csrf for a token as soon as it loads, so
       a fixture with no backend would answer 404 and the page would log an
       error that says nothing about the policy under test. Answer it the way
       Routes::csrf() does — token + scope — so the one call the page makes on
       load behaves as it does on the server, and every other console error
       stays a real finding. */
    if (rel === '/api/csrf') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ token: 'f'.repeat(64), scope: 'guest' }));
      return;
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const abs = path.join(root, path.normalize(rel));
    if (!abs.startsWith(root) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.existsSync(path.join(root, '404.html')) ? fs.readFileSync(path.join(root, '404.html')) : 'not found');
      return;
    }
    const head = { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' };
    /* the header goes on html only, exactly as <FilesMatch "\.html$"> does */
    if (abs.endsWith('.html')) head['Content-Security-Policy'] = csp;
    res.writeHead(200, head);
    res.end(fs.readFileSync(abs));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

async function main() {
  if (!CHROME) { console.error('no chromium found'); process.exit(2); }
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('no dist/ — run `node build.js` first'); process.exit(2);
  }
  const csp = policyFromHtaccess();
  check('السياسة مختومة بلا رموز معلَّقة', !csp.includes('__AUN_'));
  check("style-src لا يحمل 'unsafe-inline'",
    !/style-src[^;]*'unsafe-inline'/.test(csp),
    (csp.match(/style-src[^;]*/) || [''])[0].slice(0, 70));
  check("script-src لا يحمل 'unsafe-inline'",
    !/script-src[^;]*'unsafe-inline'/.test(csp));

  /* The runner cannot reach Google, so a browser here can never prove the
     analytics tag loads. What it can prove without a network is the thing that
     would actually break the live site: a resource the page fetches from
     another origin that the policy never names. default-src is 'self', so an
     unnamed host is refused in production and nothing in a local run says so.
     Anchor hrefs are navigation, not a fetch, and form-action governs those. */
  const fetched = new Set();
  for (const f of fs.readdirSync(DIST).filter((x) => x.endsWith('.html'))) {
    const body = fs.readFileSync(path.join(DIST, f), 'utf8');
    for (const m of body.matchAll(/<(?:script|img|iframe|source|video|audio)\b[^>]*\ssrc=["'](https?:\/\/[^"'\/]+)/gi)) fetched.add(m[1]);
    for (const m of body.matchAll(/<link\b[^>]*\shref=["'](https?:\/\/[^"'\/]+)/gi)) {
      if (!/\brel=["']?(?:canonical|alternate)/i.test(m[0])) fetched.add(m[1]);
    }
  }
  const unnamed = [...fetched].filter((o) => !csp.includes(o));
  check('كل مصدر خارجي تجلبه الصفحات مذكور في السياسة', unnamed.length === 0,
    unnamed.length ? unnamed.join(' ') : [...fetched].join(' ') || 'لا مصادر خارجية');

  const srv = await serve(DIST, csp);
  const base = 'http://127.0.0.1:' + srv.address().port;

  const userDir = fs.mkdtempSync('/tmp/qa-csp-');
  const port = 9600 + Math.floor(Math.random() * 80);
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--no-first-run', '--disable-dev-shm-usage', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; }
    catch (e) { /* not up yet */ }
  }
  if (!wsUrl) { chrome.kill(); console.error('chromium never opened a port'); process.exit(2); }

  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const waiting = new Map(); const violations = []; const consoleErrors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); w(m.result); return; }
    /* Chromium's own report of anything the policy stopped */
    if (m.method === 'Network.responseReceived') {
      if (m.params.response && m.params.response.status >= 400) {
        consoleErrors.push({ text: 'HTTP ' + m.params.response.status, url: m.params.response.url });
      }
    }
    if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      if (e.source === 'security' || /Content Security Policy|Refused to/i.test(e.text)) violations.push(e.text);
      else if (e.level === 'error') consoleErrors.push({ text: e.text, url: e.url || '' });
    }
  };
  const sid = { v: null };
  const send = (method, params = {}, useSession = true) => new Promise((res) => {
    const i = ++id; waiting.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params, ...(useSession && sid.v ? { sessionId: sid.v } : {}) }));
    setTimeout(() => { if (waiting.has(i)) { waiting.delete(i); res(null); } }, 30000);
  });

  const t = await send('Target.createTarget', { url: 'about:blank' }, false);
  const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true }, false);
  sid.v = a.sessionId;
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  for (const [label, url] of [['index.html', base + '/'], ['404.html', base + '/nope-' + Date.now()]]) {
    violations.length = 0; consoleErrors.length = 0;
    await send('Page.navigate', { url });
    await sleep(2500);

    /* The question a hash mismatch actually answers: did the stylesheet apply?
       A blocked <style> leaves the page rendered in the browser's defaults, so
       ask for a property the project's own CSS sets and the browser never
       would. */
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const cs = getComputedStyle(document.body);
        /* Ask each <style> element for its own sheet rather than counting
           document.styleSheets in bulk. A block the policy refused is still in
           the DOM — the element is there, .sheet is null or carries no rules —
           so element-by-element is the exact question, and it needs no
           threshold guess about how big a given page's stylesheet ought to be.
           404.html is legitimately 30 rules and index.html 703; both are whole. */
        const tags = Array.from(document.querySelectorAll('style'));
        let live = 0, rules = 0;
        for (const el of tags) {
          let n = 0;
          try { n = (el.sheet && el.sheet.cssRules) ? el.sheet.cssRules.length : 0; } catch (e) { n = 0; }
          if (n > 0) live++;
          rules += n;
        }
        return { bg: cs.backgroundColor, font: cs.fontFamily,
                 styleTags: tags.length, liveSheets: live, rules: rules };
      })()`, returnByValue: true, awaitPromise: true,
    });
    const v = (r && r.result && r.result.value) || {};
    check(label + ' · لا انتهاك لسياسة المحتوى', violations.length === 0,
      violations.slice(0, 2).join(' | ').slice(0, 90));
    check(label + ' · كل كتلة أنماط سُمح بها ونفَذت',
      (v.styleTags || 0) > 0 && v.liveSheets === v.styleTags && (v.rules || 0) > 0,
      `${v.liveSheets}/${v.styleTags} <style> نفَذت · ${v.rules} قاعدة`);
    check(label + ' · والصفحة تُرسم بخط المشروع لا بخط المتصفّح',
      /IBM Plex|Cairo/i.test(String(v.font || '')), String(v.font || '').slice(0, 46));
    if (label === 'index.html') {
      /* This machine reaches the internet through a proxy that has no route to
         Google, so the analytics tag fails to load here with net::ERR_… — a
         property of the runner, not of the policy. A resource the policy
         refuses does not look like this: it arrives as a security log entry
         and is counted as a violation above, which is the assertion that would
         catch it. So drop only off-origin transport failures, and let every
         same-origin error and every other kind of error stand. */
      const real = consoleErrors.filter((e) => {
        const offOrigin = e.url && !e.url.startsWith(base);
        return !(offOrigin && /net::ERR_/.test(e.text));
      });
      check(label + ' · ولا خطأ آخر في الطرفية', real.length === 0,
        real.slice(0, 1).map((e) => e.text + ' ' + e.url).join('').slice(0, 80));
    }
  }

  console.log(lines.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFAILURES'); failures.forEach((f) => console.log('  · ' + f)); }
  chrome.kill();
  try { srv.close(); } catch (e) { /* down already */ }
  try { fs.rmSync(userDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 }); } catch (e) {}
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
