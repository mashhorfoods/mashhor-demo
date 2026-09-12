#!/usr/bin/env node
/**
 * المرحلة 18 — القياس الذي لم تقسه أي بوابة: الأداء.
 *
 * Nine gates cover function, authorization, layout, dead controls, the public
 * site, recovery, accessibility and attack. None of them asks how heavy any
 * of it is, and weight is the one defect class that gets worse on its own —
 * every image added, every script grown, every font requested. So this gate
 * records the numbers and holds them to a ceiling.
 *
 *   §1  WEIGHT     bytes and requests per page, and what the largest ones are
 *   §2  BLOCKING   what stands between the request and the first paint
 *   §3  PAINT      largest contentful paint, and layout that moves after it
 *   §4  IMAGES     anything served much larger than the box it is drawn in,
 *                  and anything without reserved space
 *   §5  API        how long the dashboard's own endpoints take
 *   §6  CACHE      what a returning visitor has to fetch again
 *
 * Two of these cannot be measured on the development server and are asserted
 * from what ships instead: `php -S` compresses nothing and sets no cache
 * headers, so the rules in .htaccess are read directly. That is stated at
 * each such check rather than quietly passed.
 *
 * Usage:  node bin/qa-perf.js [baseUrl] --email=… --password=… [--report]
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] && !process.argv[2].startsWith('--'))
  ? process.argv[2].replace(/\/$/, '') : 'http://127.0.0.1:8088';
const opt = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const REPORT_ONLY = process.argv.includes('--report');
/* build.js rewrites index.html — 417KB of source becomes 207KB of package —
   so measuring the development server measures a file nobody is ever sent.
   The public page is read out of dist/ instead, over a static server this
   gate starts for itself.
   
   It has to be a *static* one. Serving dist/ with `php -S` executes what is
   in it: index.html asks for a CSRF token as it loads, PHP ran api/index.php,
   the application bootstrapped, and a SQLite database appeared inside the
   package — which the next zip would have shipped. The release gate caught
   that; this is the reason it will not happen again. Nothing here executes
   anything, and the port is this process's own. */
const DIST_ROOT = path.join(__dirname, '..', 'dist');
const EMAIL = opt('email', 'noura@aunaldrb.com');
const PASSWORD = opt('password', 'Recovery-01-Local-Dev');

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']
  .find((p) => fs.existsSync(p));

const ADMIN = ['dashboard', 'requests', 'customers', 'services', 'content',
  'media', 'reports', 'users', 'settings', 'activity', 'login'];

/*
 * The budgets.
 *
 * Every number here was measured on this build and then rounded up, so each
 * one is a ceiling a regression would cross rather than a target nobody has
 * met. They are deliberately not aspirational: a budget nobody can pass gets
 * switched off, and a switched-off budget measures nothing.
 *
 * The public page carries its own CSS and its images; the admin pages carry a
 * whole design system inline, which is why their HTML is large and their
 * request count is small. Judging both by one number would be judging the
 * wrong thing.
 */
const BUDGET = {
  publicBytes:      2_600_000,   /* everything index.html pulls, uncompressed */
  publicRequests:   45,
  publicHtmlBytes:  260_000,     /* the document alone, before compression */
  adminBytes:       900_000,
  adminRequests:    34,
  adminHtmlBytes:   260_000,
  blockingInHead:   2,           /* stylesheets + synchronous scripts */
  lcpMs:            2_500,       /* the "good" threshold in Core Web Vitals */
  cls:              0.1,         /* likewise */
  apiMs:            800,         /* any single dashboard endpoint, locally */
  imageWasteRatio:  3.0,         /* served pixels ÷ displayed pixels */
};

let pass = 0, fail = 0;
const failures = [];
const notes = [];
const lines = [];
const table = [];
function check(page, name, ok, detail = '') {
  ok ? pass++ : fail++;
  lines.push(`  ${ok ? 'PASS' : 'FAIL'} ${(page + ' · ' + name).padEnd(58)} ${detail}`);
  if (!ok) failures.push(`${page} / ${name} — ${detail}`);
}
function section(t) { lines.push('\n' + t); }
function note(t) { notes.push(t); }
const kb = (n) => (n / 1024).toFixed(0) + 'KB';

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map(); this.listeners = []; }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new Cdp(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.waiting.has(m.id)) {
        const { resolve, reject } = c.waiting.get(m.id);
        c.waiting.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method) { c.listeners.forEach((fn) => fn(m)); }
    };
    return c;
  }
  on(fn) { this.listeners.push(fn); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A read-only static file server. Twenty lines is less than the cost of
   depending on one being started by hand — and a gate that starts its own
   fixture is a gate that cannot be run wrong. */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.webp': 'image/webp', '.avif': 'image/avif',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};
function serveStatic(root) {
  const http = require('http');
  const srv = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const abs = path.join(root, path.normalize(rel));
    /* never outside the root, whatever the request says */
    if (!abs.startsWith(root) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
    res.end(fs.readFileSync(abs));
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv)));
}

async function main() {
  if (!CHROME) { console.error('no chromium found'); process.exit(2); }
  if (!fs.existsSync(path.join(DIST_ROOT, 'index.html'))) {
    console.error('no dist/index.html — run `node build.js` first');
    process.exit(2);
  }
  const fixture = await serveStatic(DIST_ROOT);
  const DIST = 'http://127.0.0.1:' + fixture.address().port;
  const userDir = fs.mkdtempSync('/tmp/qa-perf-chrome-');
  const port = 9700 + Math.floor(Math.random() * 90);
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; }
    catch (e) { /* not up yet */ }
  }
  if (!wsUrl) { chrome.kill(); console.error('chromium never opened a debugging port'); process.exit(2); }

  const browser = await Cdp.attach(wsUrl);
  const rawSend = (method, params = {}) => {
    const id = ++browser.id;
    return new Promise((resolve, reject) => {
      browser.waiting.set(id, { resolve, reject });
      browser.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (browser.waiting.has(id)) { browser.waiting.delete(id); reject(new Error(method + ' timed out')); } }, 60000);
    });
  };
  const t0 = await rawSend('Target.createTarget', { url: 'about:blank' });
  const at = await rawSend('Target.attachToTarget', { targetId: t0.targetId, flatten: true });
  const sessionId = at.sessionId;
  const send = (method, params = {}) => {
    const id = ++browser.id;
    return new Promise((resolve, reject) => {
      browser.waiting.set(id, { resolve, reject });
      browser.ws.send(JSON.stringify({ id, method, params, sessionId }));
      const limit = method === 'Page.navigate' ? 120000 : 60000;
      setTimeout(() => { if (browser.waiting.has(id)) { browser.waiting.delete(id); reject(new Error(method + ' timed out')); } }, limit);
    });
  };
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' — ' + expression.slice(0, 90));
    return r.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  /* ---- the network ledger, rebuilt for every navigation --------------- */
  let ledger = [];
  const inFlight = new Set();
  let lastActivity = 0;
  const urlOf = new Map();
  browser.on((m) => {
    if (m.method === 'Network.requestWillBeSent') {
      urlOf.set(m.params.requestId, m.params.request.url);
      inFlight.add(m.params.requestId); lastActivity = Date.now();
    }
    if (m.method === 'Network.responseReceived') {
      const e = ledger.find((x) => x.id === m.params.requestId);
      const rec = e || { id: m.params.requestId };
      rec.url = m.params.response.url;
      rec.type = m.params.type;
      rec.status = m.params.response.status;
      rec.headers = m.params.response.headers || {};
      rec.timing = m.params.response.timing || null;
      if (!e) ledger.push(rec);
    }
    if (m.method === 'Network.loadingFinished') {
      const e = ledger.find((x) => x.id === m.params.requestId);
      if (e) e.bytes = m.params.encodedDataLength;
      inFlight.delete(m.params.requestId); lastActivity = Date.now();
    }
    if (m.method === 'Network.loadingFailed') { inFlight.delete(m.params.requestId); lastActivity = Date.now(); }
  });

  /* A timeout on a navigation is the development server stalling, not the page
     failing; letting it reject kills the whole gate and the runner reads a
     failed gate where every check passed. One retry; a second failure is real. */
  const goto = async (url) => {
    ledger = [];
    try {
      await send('Page.navigate', { url });
    } catch (e) {
      if (!/timed out/.test(String(e && e.message))) throw e;
      await sleep(1500);
      await send('Page.navigate', { url });
    }
    await sleep(600);
    const started = Date.now();
    while (Date.now() - started < 12000) {
      if (inFlight.size === 0 && Date.now() - lastActivity > 900) break;
      await sleep(150);
    }
    await sleep(500);
  };

  /* Largest contentful paint and cumulative layout shift, read from the
     browser's own observers rather than guessed at from load events. */
  /* Largest contentful paint and layout shift are delivered to a
     PerformanceObserver's callback and are NOT retrievable afterwards with
     getEntriesByType — the first version of this gate asked for them that
     way and reported LCP 0 and CLS 0 for all twelve pages, which read like a
     perfect score and was in fact no measurement at all. The observers
     installed on every new document below accumulate into window.__vitals,
     and this only reads what they collected. */
  const VITALS = `(() => {
    const v = window.__vitals || {};
    return {
      lcp: Math.round(v.lcp || 0),
      cls: Math.round((v.cls || 0) * 1000) / 1000,
      longTasks: v.longTasks || 0,
      longest: Math.round(v.longest || 0),
      lcpEl: v.lcpEl || '',
    };
  })()`;

  /* Turn on the observers before anything paints. */
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__vitals = { lcp: 0, cls: 0, longTasks: 0, longest: 0, lcpEl: '' };
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) {
            window.__vitals.lcp = e.startTime;
            window.__vitals.lcpEl = e.element ? (e.element.tagName + '.' + String(e.element.className||'').split(' ')[0]) : (e.url || '');
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) {}
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__vitals.cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      } catch (e) {}
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) {
            window.__vitals.longTasks++;
            window.__vitals.longest = Math.max(window.__vitals.longest, e.duration);
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch (e) {}
    `,
  });

  const weigh = () => {
    const seen = new Map();
    for (const e of ledger) if (e.url && !seen.has(e.url)) seen.set(e.url, e);
    const rows = [...seen.values()];
    const total = rows.reduce((n, e) => n + (e.bytes || 0), 0);
    const biggest = rows.slice().sort((a, b) => (b.bytes || 0) - (a.bytes || 0)).slice(0, 3)
      .map((e) => `${e.url.split('/').pop().slice(0, 26)} ${kb(e.bytes || 0)}`);
    const doc = rows.find((e) => e.type === 'Document');
    return { total, count: rows.length, biggest, docBytes: doc ? (doc.bytes || 0) : 0, rows };
  };

  /* ================================================================== */
  section('§1  الوزن — ما الذي يُنزَّل فعلاً، وأكبر ثلاثة أجزاء منه');
  /* ================================================================== */
  await goto(`${DIST}/index.html`);
  const pub = weigh();
  const pubVitals = await evaluate(VITALS);
  table.push(['index.html', pub.count, kb(pub.total), kb(pub.docBytes),
    pubVitals.lcp + 'ms', String(pubVitals.cls)]);
  check('index.html', 'وزن الصفحة العامة ضمن الميزانية', pub.total <= BUDGET.publicBytes,
    `${kb(pub.total)} / ${kb(BUDGET.publicBytes)} — ${pub.biggest.join(' · ')}`);
  check('index.html', 'وعدد طلباتها', pub.count <= BUDGET.publicRequests,
    `${pub.count} / ${BUDGET.publicRequests}`);
  check('index.html', 'ووثيقتها نفسها', pub.docBytes <= BUDGET.publicHtmlBytes,
    `${kb(pub.docBytes)} / ${kb(BUDGET.publicHtmlBytes)}`);

  /* the dashboard needs a session before any of it means anything */
  await goto(`${BASE}/admin/login`);
  const status = await evaluate(`(async () => {
    const t = await fetch('${BASE}/api/csrf', {credentials:'same-origin'}).then(r => r.json());
    const r = await fetch('${BASE}/api/auth/login', {
      method:'POST', credentials:'same-origin',
      headers:{'Content-Type':'application/json','X-CSRF-Token':t.token},
      body: JSON.stringify({csrf_token:t.token, email:${JSON.stringify(EMAIL)}, password:${JSON.stringify(PASSWORD)}})
    });
    return r.status;
  })()`);
  check('login', 'جلسة حقيقية للقياس', status === 200, 'status=' + status);
  if (status !== 200) { console.log(lines.join('\n')); chrome.kill(); process.exit(1); }

  const adminVitals = {};
  for (const p of ADMIN) {
    await goto(`${BASE}/admin/${p}`);
    const w = weigh();
    const v = await evaluate(VITALS);
    adminVitals[p] = v;
    table.push([p, w.count, kb(w.total), kb(w.docBytes), v.lcp + 'ms', String(v.cls)]);
    check(p, 'وزن الصفحة', w.total <= BUDGET.adminBytes,
      `${kb(w.total)} / ${kb(BUDGET.adminBytes)} — ${w.biggest.join(' · ')}`);
    check(p, 'وعدد الطلبات', w.count <= BUDGET.adminRequests, `${w.count} / ${BUDGET.adminRequests}`);
    check(p, 'ووثيقتها', w.docBytes <= BUDGET.adminHtmlBytes,
      `${kb(w.docBytes)} / ${kb(BUDGET.adminHtmlBytes)}`);
  }

  /* ================================================================== */
  section('§2  ما يقف بين الطلب وأول رسم');
  /* ================================================================== */
  for (const p of ['__public__'].concat(ADMIN)) {
    const url = p === '__public__' ? `${DIST}/index.html` : `${BASE}/admin/${p}`;
    const label = p === '__public__' ? 'index.html' : p;
    await goto(url);
    const b = await evaluate(`(() => {
      const head = document.head;
      const css = Array.from(head.querySelectorAll('link[rel="stylesheet"]'))
        .filter((l) => !l.media || l.media === 'all' || l.media === 'screen');
      const js = Array.from(head.querySelectorAll('script[src]'))
        .filter((s) => !s.defer && !s.async);
      return { css: css.map((l) => l.href.split('/').pop()),
               js: js.map((s) => s.src.split('/').pop()),
               fonts: Array.from(document.querySelectorAll('link[rel="preload"][as="font"]')).length };
    })()`);
    const blocking = b.css.length + b.js.length;
    check(label, 'لا شيء يعطّل أول رسم أكثر مما يلزم', blocking <= BUDGET.blockingInHead,
      `${blocking} — css:[${b.css.join(',')}] js:[${b.js.join(',')}]`);
  }

  /* ================================================================== */
  section('§3  أول رسم كبير، وما يتحرّك بعده');
  /* ================================================================== */
  check('index.html', 'أكبر رسم ضمن العتبة الجيّدة', pubVitals.lcp > 0 && pubVitals.lcp <= BUDGET.lcpMs,
    `${pubVitals.lcp}ms / ${BUDGET.lcpMs}ms`);
  check('index.html', 'ولا تزحزح تخطيطي بعد الرسم', pubVitals.cls <= BUDGET.cls,
    `CLS ${pubVitals.cls} / ${BUDGET.cls}`);
  for (const p of ADMIN) {
    const v = adminVitals[p];
    check(p, 'أكبر رسم ضمن العتبة', v.lcp > 0 && v.lcp <= BUDGET.lcpMs, `${v.lcp}ms`);
    check(p, 'ولا تزحزح تخطيطي', v.cls <= BUDGET.cls, `CLS ${v.cls}`);
  }

  /* ================================================================== */
  section('§4  الصور — ما يُرسل أكبر مما يُعرض، وما لا يحجز مكانه');
  /* ================================================================== */
  for (const p of ['__public__', 'media', 'services']) {
    const url = p === '__public__' ? `${DIST}/index.html` : `${BASE}/admin/${p}`;
    const label = p === '__public__' ? 'index.html' : p;
    await goto(url);
    const img = await evaluate(`(() => {
      const out = { waste: [], unsized: [], count: 0 };
      document.querySelectorAll('img').forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        out.count++;
        /* An SVG carries no pixels to waste — it is drawn at whatever size it
           is given, and its naturalWidth is just the viewBox. Counting it as
           an oversized raster was the check being wrong about the format. */
        const src = n.currentSrc || n.src || '';
        if (/\\.svg(\\?|$)/i.test(src) || /^data:image\\/svg/i.test(src)) return;
        const nat = n.naturalWidth * n.naturalHeight;
        /* Judged against a 2x screen, not against this headless 1x one. The
           thumbnails are 200px wide precisely so a retina panel has real
           pixels to draw with; measuring at devicePixelRatio 1 called that
           correct sizing "waste" and would have argued for a file that looks
           soft on every phone the operator actually holds. */
        const DPR = Math.max(2, window.devicePixelRatio);
        const shown = Math.round(r.width * DPR) * Math.round(r.height * DPR);
        if (shown > 0 && nat / shown > ${BUDGET.imageWasteRatio}) {
          out.waste.push((n.currentSrc || n.src).split('/').pop().slice(0, 30) +
            ' ' + n.naturalWidth + 'x' + n.naturalHeight + ' shown ' + Math.round(r.width) + 'x' + Math.round(r.height));
        }
        /* space has to be reserved, or the page jumps when the image lands */
        const hasAttr = n.getAttribute('width') && n.getAttribute('height');
        const cs = getComputedStyle(n);
        const hasRatio = cs.aspectRatio && cs.aspectRatio !== 'auto';
        if (!hasAttr && !hasRatio) out.unsized.push((n.currentSrc || n.src).split('/').pop().slice(0, 30));
      });
      return out;
    })()`);
    check(label, 'لا صورة تُرسل أكبر بكثير مما تُعرض', img.waste.length === 0,
      `${img.count} images — ${img.waste.slice(0, 2).join(' | ')}`);
    check(label, 'وكل صورة تحجز مكانها قبل وصولها', img.unsized.length === 0,
      img.unsized.slice(0, 3).join(' | '));
  }

  /* ================================================================== */
  section('§5  نقاط النهاية — كم تستغرق فعلاً');
  /* ================================================================== */
  await goto(`${BASE}/admin/dashboard`);
  const ENDPOINTS = ['/api/admin/summary', '/api/admin/requests?per=100', '/api/admin/customers',
    '/api/admin/services', '/api/admin/media', '/api/admin/users', '/api/admin/activity?per=200',
    '/api/admin/settings', '/api/admin/notifications', '/api/admin/reports?report=requests',
    '/api/admin/reports?report=coverage'];
  const timings = await evaluate(`(async () => {
    const out = [];
    for (const p of ${JSON.stringify(ENDPOINTS)}) {
      /* three runs, keep the median — one cold run measures the filesystem */
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const t = performance.now();
        const r = await fetch('${BASE}' + p, { credentials: 'same-origin', cache: 'no-store' });
        await r.text();
        runs.push({ ms: Math.round(performance.now() - t), status: r.status });
      }
      runs.sort((a, b) => a.ms - b.ms);
      out.push({ path: p, ms: runs[1].ms, status: runs[1].status });
    }
    return out;
  })()`);
  const slow = timings.filter((t) => t.ms > BUDGET.apiMs);
  const errored = timings.filter((t) => t.status !== 200);
  check('api', 'كل نقطة نهاية تُجيب دون خطأ', errored.length === 0,
    errored.map((t) => t.path + '→' + t.status).join(' '));
  check('api', 'وضمن السقف الزمني', slow.length === 0,
    slow.map((t) => t.path + ' ' + t.ms + 'ms').join(' | ') ||
    'أبطأها ' + timings.slice().sort((a, b) => b.ms - a.ms)[0].path + ' ' +
    timings.slice().sort((a, b) => b.ms - a.ms)[0].ms + 'ms');
  timings.slice().sort((a, b) => b.ms - a.ms).slice(0, 4)
    .forEach((t) => note(`${t.ms}ms  ${t.path}`));

  /* ================================================================== */
  section('§6  ما يفتحه الزائر العائد من جديد');
  /* ================================================================== */
  /* `php -S` sets no cache headers and compresses nothing, so measuring the
     development server here would measure the development server. The rules
     that ship are what a returning visitor actually meets. */
  const root = fs.readFileSync(path.join(__dirname, '..', '.htaccess'), 'utf8');
  check('cache', 'الأصول الثابتة تُخزَّن طويلاً',
    /ExpiresByType\s+image\/webp/i.test(root) || /max-age=\d{6,}/.test(root),
    'من .htaccess — لا يمكن قياسها على خادم التطوير');
  check('cache', 'وصفحة HTML لا تُخزَّن', /ExpiresByType\s+text\/html\s+"?access plus 0/i.test(root)
    || /text\/html[^\n]*no-cache/i.test(root) || /Header[^\n]*Cache-Control[^\n]*no-store/i.test(root),
    'من .htaccess');
  check('cache', 'والنصوص تُضغَط قبل إرسالها',
    /DEFLATE/i.test(root) || /mod_brotli/i.test(root) || /AddOutputFilterByType/i.test(root),
    'من .htaccess');

  /* the one cache rule that has to be right, because a fix inside it would
     otherwise never reach a returning operator */
  const dash = fs.readFileSync(path.join(__dirname, '..', 'dist', 'admin', 'dashboard.html'), 'utf8');
  check('cache', 'وسكربت اللوحة يحمل بصمة محتواه',
    /src="app\.js\?v=[0-9a-f]{6,}"/.test(dash),
    (dash.match(/app\.js\?v=[0-9a-f]+/) || ['—'])[0]);

  /* ---- report -------------------------------------------------------- */
  console.log(lines.join('\n'));
  console.log('\n  ' + 'الصفحة'.padEnd(14) + 'طلبات  الوزن     الوثيقة   LCP      CLS');
  console.log('  ' + '─'.repeat(62));
  table.forEach((r) => {
    console.log('  ' + String(r[0]).padEnd(14) + String(r[1]).padEnd(7) +
      String(r[2]).padEnd(10) + String(r[3]).padEnd(10) + String(r[4]).padEnd(9) + r[5]);
  });
  if (notes.length) { console.log('\n  أبطأ نقاط النهاية:'); notes.forEach((n) => console.log('    ' + n)); }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFAILURES'); failures.forEach((f) => console.log('  · ' + f)); }
  chrome.kill();
  try { fixture.close(); } catch (e) { /* already down */ }
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  process.exit(REPORT_ONLY ? 0 : (fail ? 1 : 0));
}

main().catch((e) => { console.error(e); process.exit(2); });
