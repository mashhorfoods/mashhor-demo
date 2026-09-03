#!/usr/bin/env node
/**
 * The browser half of the final QA gate.
 *
 * bin/verify.php drives the API and the database. This drives the pages: it
 * opens every admin page and the public site in a real Chromium, signed in as
 * a real Super Admin, at several widths, and asserts the things that only
 * exist once a browser has laid the page out —
 *
 *   · no console error and no failed request, including the CSP violations
 *     that are otherwise invisible: a blocked script logs to the console and
 *     nowhere else, and the page just quietly stops working
 *   · no horizontal overflow at any width (scrollWidth === clientWidth)
 *   · every interactive control at least 44px on its shorter side
 *   · every interactive control with an accessible name
 *   · no dead link — no href="#", no href="" , no unresolved target
 *   · terminology: ذوي الاحتياجات الخاصة and nothing else, in rendered text
 *   · exactly the five approved statuses and the three approved roles
 *
 * It talks to Chromium over the DevTools protocol using Node's built-in
 * WebSocket, so it needs nothing installed. Usage:
 *
 *   node bin/qa-browser.js [baseUrl] --email=… --password=…
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
const EMAIL = opt('email', 'noura@aunaldrb.com');
const PASSWORD = opt('password', 'Recovery-01-Local-Dev');

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']
  .find((p) => fs.existsSync(p));

/*
 * Target size. The project's own design system sets --tap:44px and applies it
 * to the navigation, the menus and .btn--lg; ordinary buttons are 40px and
 * small ones 32px, which is a deliberate desktop density rather than an
 * oversight. So 44 is not the line to fail on. The line is WCAG 2.2 AA
 * (SC 2.5.8 Target Size Minimum), which is 24 CSS px — a real conformance
 * requirement that 40 and 32 clear comfortably. Anything under 44 at a phone
 * width is reported as an advisory, because that is guidance rather than
 * conformance, and calling guidance a failure is how a gate stops being read.
 */
const TARGET_MIN = 24;
const TARGET_TOUCH = 44;

/* Hosts this sandbox cannot reach. A request to one of them failing says
 * something about the network here, not about the page — but it is not
 * silently dropped either: it is counted and reported on its own, because
 * "the admin pages load their typefaces from Google" is a real finding that
 * this is the evidence for. */
const EXTERNAL_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com',
  'www.googletagmanager.com', 'www.google-analytics.com'];

/* The terms the brief forbids outright. ذوي الاحتياجات الخاصة is the only
   approved wording; every one of these is a rejection, not a warning. */
const FORBIDDEN = ['الإعاقة', 'الاعاقة', 'ذوي الإعاقة', 'معاق', 'معاقين', 'معاقون', 'إعاقة'];
const STATUSES = ['جديد', 'قيد المراجعة', 'مؤكد', 'مكتمل', 'ملغي'];
const ROLES = ['مدير النظام', 'مدير', 'مدير المحتوى'];

const WIDTHS = [
  { w: 1440, h: 900, label: '1440' },
  { w: 1024, h: 800, label: '1024' },
  { w: 768,  h: 900, label: '768'  },
  { w: 390,  h: 844, label: '390'  },
];

let pass = 0, fail = 0;
const failures = [];
const advisories = [];
const navFailures = [];
const externalSeen = new Map();
const lines = [];
function check(page, name, ok, detail = '') {
  ok ? pass++ : fail++;
  lines.push(`  ${ok ? 'PASS' : 'FAIL'} ${(page + ' · ' + name).padEnd(62)} ${detail}`);
  if (!ok) failures.push(`${page} / ${name} ${detail}`);
}
function section(t) { lines.push('\n' + t); }

/* ---------- a minimal CDP client ------------------------------------- */
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
      } else if (m.method) {
        c.listeners.forEach((fn) => fn(m));
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.waiting.has(id)) { this.waiting.delete(id); reject(new Error(method + ' timed out')); }
      }, 60000);
    });
  }
  on(fn) { this.listeners.push(fn); }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' — ' + expression.slice(0, 80));
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch (e) { /* already gone */ } }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- the audit that runs inside the page ----------------------- */
const AUDIT = `(() => {
  const TARGET_MIN_IN_PAGE = ${TARGET_MIN}, TARGET_TOUCH_IN_PAGE = ${TARGET_TOUCH};
  const doc = document, root = doc.documentElement;
  const text = (doc.body ? doc.body.innerText : '') || '';

  /* interactive controls that are actually on screen */
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role="button"], [role="checkbox"], [role="tab"], [role="menuitem"]';
  const all = Array.prototype.slice.call(doc.querySelectorAll(sel));
  /* "Visible" means a person can see and reach it. Three things are none of
     those and were being counted before: the spam honeypot on the public form
     (tabindex=-1, deliberately unreachable), the 1x1 transparent file input
     the logo picker hides behind its label, and anything positioned off
     screen. Counting them produced findings about controls no user has. */
  const visible = all.filter((n) => {
    const r = n.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) return false;
    if (r.bottom < -50 || r.right < -50) return false;
    if (n.getAttribute('tabindex') === '-1') return false;
    if (n.getAttribute('aria-hidden') === 'true') return false;
    const cs = getComputedStyle(n);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    if (parseFloat(cs.opacity) < 0.05) return false;
    if (cs.clipPath === 'inset(50%)' || cs.clip === 'rect(0px, 0px, 0px, 0px)') return false;
    return n.closest('[hidden]') === null;
  });

  const named = (n) => {
    const t = (n.innerText || n.textContent || '').trim();
    if (t) return true;
    for (const a of ['aria-label', 'title', 'placeholder', 'alt', 'value']) {
      if ((n.getAttribute(a) || '').trim()) return true;
    }
    const lb = n.getAttribute('aria-labelledby');
    if (lb && lb.split(/\\s+/).some((id) => doc.getElementById(id))) return true;
    if (n.id && doc.querySelector('label[for="' + CSS.escape(n.id) + '"]')) return true;
    if (n.closest('label')) return true;
    /* an icon-only control is named by the symbol it points at */
    const use = n.querySelector('use[href], use');
    if (use && (n.getAttribute('aria-label') || '').trim()) return true;
    return false;
  };

  const describe = (n) => {
    const r = n.getBoundingClientRect();
    return n.tagName + '.' + (n.className || '').toString().split(' ')[0] + ' ' +
      Math.round(r.width) + 'x' + Math.round(r.height);
  };
  const targets = visible.filter((n) => {
    /* inline links inside running text are text, not tap targets */
    return !(n.tagName === 'A' && n.closest('p, li, td, .field__help, .readonly, .empty'));
  });
  const under24 = targets.filter((n) => {
    const r = n.getBoundingClientRect();
    return Math.min(r.width, r.height) < TARGET_MIN_IN_PAGE;
  }).map(describe);
  const under44 = targets.filter((n) => {
    const r = n.getBoundingClientRect();
    return Math.min(r.width, r.height) < TARGET_TOUCH_IN_PAGE;
  }).map(describe);

  const unnamed = visible.filter((n) => !named(n))
    .map((n) => n.tagName + '.' + (n.className || '').toString().split(' ')[0]);

  /* A dead link is one a person can follow that goes nowhere. The navigation
     entry for the page you are already on is href="#" with aria-current="page"
     — the standard way to say "you are here", and not a destination anyone is
     being offered. It is counted separately rather than either failed or
     ignored. */
  const anchors = Array.prototype.slice.call(doc.querySelectorAll('a[href]'));
  const isCurrent = (a) => a.getAttribute('aria-current') === 'page';
  const goesNowhere = (a) => {
    const h = a.getAttribute('href');
    if (h === null || h === '' || h === '#') return true;
    if (h.startsWith('#') && h.length > 1) { try { return !doc.querySelector(h); } catch (e) { return true; } }
    return false;
  };
  const selfMarkers = anchors.filter((a) => goesNowhere(a) && isCurrent(a)).length;
  /* Some anchors are controls rather than destinations: a card that opens a
     record in place, a "back" link that switches the view. They carry
     href="#" and a handler that preventDefaults, so nothing is broken and
     nobody lands nowhere — but <button> is the element that means "acts on
     this page", and an anchor saying it is a nit worth listing rather than a
     failure. Marked so the two can be told apart. */
  const inPageControls = anchors.filter((a) => goesNowhere(a) && !isCurrent(a)
    && (a.dataset.control === '1' || a.closest('[data-inpage]') !== null
        || /reccard|histrow|page__crumb/.test(a.className + ' ' + (a.parentElement ? a.parentElement.className : ''))));
  const inPageSet = new Set(inPageControls);
  const dead = anchors.filter((a) => goesNowhere(a) && !isCurrent(a) && !inPageSet.has(a))
    .filter((a) => {
      const r = a.getBoundingClientRect();
      return !(r.width === 0 && r.height === 0);
    })
    .map((a) => (a.innerText || a.className || a.tagName).toString().trim().slice(0, 40) + ' → ' + a.getAttribute('href'));

  /* A number on its own ("1217 vs 1024") says something is wrong and nothing
     about what. Name the elements that stick out past the viewport, and
     whether each one is inside a container that was supposed to scroll. */
  const vw = root.clientWidth;
  const wide = [];
  doc.querySelectorAll('*').forEach((n) => {
    const b = n.getBoundingClientRect();
    if (b.width > vw + 1 || b.right > vw + 1) {
      const cs = getComputedStyle(n);
      wide.push(n.tagName + '.' + (n.className || '').toString().trim().split(/\s+/).slice(0, 2).join('.') +
        ' w=' + Math.round(b.width) + ' right=' + Math.round(b.right) + ' overflowX=' + cs.overflowX);
    }
  });

  return {
    title: doc.title,
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    wide: wide.slice(0, 5),
    wideCount: wide.length,
    bodyScroll: doc.body ? doc.body.scrollWidth : 0,
    controls: visible.length,
    under24: under24.slice(0, 8),
    under24Count: under24.length,
    under44: under44.slice(0, 6),
    under44Count: under44.length,
    unnamed: unnamed.slice(0, 8),
    unnamedCount: unnamed.length,
    dead: dead.slice(0, 8),
    deadCount: dead.length,
    selfMarkers: selfMarkers,
    inPageControls: inPageControls.length,
    text: text,
    dir: root.getAttribute('dir'),
    lang: root.getAttribute('lang'),
  };
})()`;

/* ---------- driver ---------------------------------------------------- */
async function main() {
  if (!CHROME) { console.error('no chromium found'); process.exit(2); }

  const userDir = fs.mkdtempSync('/tmp/qa-chrome-');
  const port = 9333 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      wsUrl = (await r.json()).webSocketDebuggerUrl;
    } catch (e) { /* not up yet */ }
  }
  if (!wsUrl) { chrome.kill(); console.error('chromium never opened a debugging port'); process.exit(2); }

  const browser = await Cdp.attach(wsUrl);
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });

  /* a session-scoped sender */
  const page = {
    send: (method, params = {}) => browser.send(method, params).catch(() => null),
  };
  const raw = browser.send.bind(browser);
  browser.send = (method, params = {}) => {
    const id = ++browser.id;
    return new Promise((resolve, reject) => {
      browser.waiting.set(id, { resolve, reject });
      browser.ws.send(JSON.stringify({ id, method, params, sessionId }));
      setTimeout(() => {
        if (browser.waiting.has(id)) { browser.waiting.delete(id); reject(new Error(method + ' timed out')); }
      }, 60000);
    });
  };

  const consoleErrors = [];
  const failedRequests = [];
  const inFlight = new Set();
  let lastActivity = 0;
  const externalFailures = [];
  const requestUrls = new Map();
  browser.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      const t = m.params.entry.text + ' ' + (m.params.entry.url || '');
      (EXTERNAL_HOSTS.some((h) => t.includes(h)) ? externalFailures : consoleErrors).push(m.params.entry.text);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('uncaught: ' + (m.params.exceptionDetails.text || ''));
    }
    if (m.method === 'Network.requestWillBeSent') {
      requestUrls.set(m.params.requestId, m.params.request.url);
      inFlight.add(m.params.requestId);
      lastActivity = Date.now();
    }
    if (m.method === 'Network.loadingFinished') {
      inFlight.delete(m.params.requestId);
      lastActivity = Date.now();
    }
    if (m.method === 'Network.loadingFailed') {
      const url = requestUrls.get(m.params.requestId);
      inFlight.delete(m.params.requestId);
      lastActivity = Date.now();
      /* A request this navigation never started is the previous page's, aborted
         by leaving it. Chrome reports the abort after the new document has
         begun, so it lands here looking like a failure on the page being
         measured — which is exactly what it is not. */
      if (url === undefined) return;
      const line = m.params.type + ' ' + m.params.errorText + ' ' + url.slice(0, 70);
      (EXTERNAL_HOSTS.some((h) => url.includes(h)) ? externalFailures : failedRequests).push(line);
    }
  });

  await browser.send('Page.enable');
  await browser.send('Runtime.enable');
  await browser.send('Log.enable');
  await browser.send('Network.enable');
  /* This sandbox cannot reach Google's font and analytics hosts, and a request
     that hangs rather than fails keeps a navigation from ever settling — which
     is what stalled this gate at sixty seconds a page. Block them outright:
     the run then measures the page instead of the network. The dependency is
     still reported below, read from the markup, which is where it lives. */
  await browser.send('Network.setBlockedURLs', { urls: EXTERNAL_HOSTS.map((h) => `*${h}*`) });

  /* Waiting a fixed number of milliseconds and hoping is how the first run of
     this gate reported dir=null on four pages: it read the document before the
     navigation had produced one. Wait for the load event, then give the page's
     own fetches a settling period. */
  let loaded = false;
  browser.on((m) => { if (m.method === 'Page.loadEventFired') loaded = true; });
  const goto = async (url, settleMs = 1200) => {
    consoleErrors.length = 0; failedRequests.length = 0;
    externalFailures.length = 0; requestUrls.clear();
    inFlight.clear(); lastActivity = Date.now();
    loaded = false;
    try {
      await browser.send('Page.navigate', { url });
    } catch (e) {
      /* One retry, then record it and move on. A gate that dies on page nine
         tells you nothing about pages ten through thirteen. */
      try { await browser.send('Page.navigate', { url }); }
      catch (e2) { navFailures.push(url); return; }
    }
    for (let i = 0; i < 80 && !loaded; i++) await sleep(100);
    await sleep(settleMs);

    /* These pages fill themselves from the API after load, so the layout is
       still moving when the load event fires — measuring then reported six
       horizontal overflows that do not exist, because the table was mid-render
       and its scroll container had not yet clamped it.
       "Two identical readings" was not good enough either: a transient state
       that lasts longer than the sampling interval reads as settled. Wait for
       the network instead — nothing in flight, and nothing started, for a
       clear stretch. That is the condition the page is actually waiting on. */
    const started = Date.now();
    while (Date.now() - started < 8000) {
      if (inFlight.size === 0 && Date.now() - lastActivity > 900) break;
      await sleep(150);
    }
    await sleep(400);   /* one more frame for layout to settle after the paint */
  };
  const resize = (w, h) => browser.send('Emulation.setDeviceMetricsOverride',
    { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });

  /* ---- sign in ------------------------------------------------------ */
  section('SIGNING IN');
  await resize(1440, 900);
  await goto(`${BASE}/admin/login.html`);
  const loggedIn = await browser.send('Runtime.evaluate', {
    expression: `(async () => {
      const t = await fetch('${BASE}/api/csrf', {credentials:'same-origin'}).then(r => r.json());
      const r = await fetch('${BASE}/api/auth/login', {
        method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRF-Token':t.token},
        body: JSON.stringify({csrf_token:t.token, email:${JSON.stringify(EMAIL)}, password:${JSON.stringify(PASSWORD)}})
      });
      return r.status;
    })()`, returnByValue: true, awaitPromise: true,
  });
  check('login', 'a real session is opened in the browser',
    loggedIn.result.value === 200, 'status=' + loggedIn.result.value);
  if (loggedIn.result.value !== 200) {
    console.log(lines.join('\n'));
    chrome.kill();
    process.exit(1);
  }

  /* ---- every admin page, every width -------------------------------- */
  const adminPages = fs.readdirSync(path.join(__dirname, '..', 'admin'))
    .filter((f) => f.endsWith('.html') && !/^(stage-\d|recovery-\d)/.test(f))
    .sort();

  const seenStatuses = new Set(), seenRoles = new Set();

  for (const file of adminPages) {
    section(`ADMIN · ${file}`);
    for (const { w, h, label } of WIDTHS) {
      await resize(w, h);
      await goto(`${BASE}/admin/${file}`, w === 1440 ? 2600 : 1600);
      let a;
      try { a = await browser.send('Runtime.evaluate', { expression: AUDIT, returnByValue: true, awaitPromise: true }); }
      catch (e) { check(file, `${label}px audit ran`, false, e.message); continue; }
      if (a.exceptionDetails) { check(file, `${label}px audit ran`, false, a.exceptionDetails.text); continue; }
      const r = a.result.value;

      check(file, `${label}px · no horizontal overflow`,
        r.scrollWidth <= r.clientWidth,
        r.scrollWidth <= r.clientWidth ? '' : `${r.scrollWidth} vs ${r.clientWidth} — ${r.wideCount} element(s): ${r.wide.join(' | ')}`);
      check(file, `${label}px · no console error`,
        consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | ').slice(0, 90));
      check(file, `${label}px · nothing same-origin failed to load`,
        failedRequests.length === 0, failedRequests.slice(0, 2).join(' | ').slice(0, 90));
      check(file, `${label}px · every target meets WCAG 2.2 AA (${TARGET_MIN}px)`,
        r.under24Count === 0, r.under24Count ? `${r.under24Count}: ${r.under24.join(', ')}` : `${r.controls} controls`);
      check(file, `${label}px · every control has a name`,
        r.unnamedCount === 0, r.unnamedCount ? `${r.unnamedCount}: ${r.unnamed.join(', ')}` : '');
      check(file, `${label}px · no dead link`,
        r.deadCount === 0, r.deadCount ? `${r.deadCount}: ${r.dead.join(', ')}` : `${r.selfMarkers} "you are here" markers`);
      if (label === '390' && r.under44Count > 0) {
        advisories.push(`${file} @390px — ${r.under44Count} control(s) under the 44px touch guideline: ${r.under44.join(', ')}`);
      }
      if (label === '390' && r.inPageControls > 0) {
        advisories.push(`${file} @390px — ${r.inPageControls} anchor(s) used as in-page controls (href="#" + handler); <button> is the right element`);
      }
      if (externalFailures.length) {
        externalSeen.set(file, externalFailures.slice(0, 2).join(' | '));
      }

      if (label === '1440') {
        const hits = FORBIDDEN.filter((t) => r.text.includes(t));
        check(file, 'terminology: only ذوي الاحتياجات الخاصة', hits.length === 0, hits.join(', '));
        check(file, 'the document is Arabic and right-to-left',
          r.dir === 'rtl' && r.lang === 'ar', `dir=${r.dir} lang=${r.lang}`);
        STATUSES.forEach((s) => { if (r.text.includes(s)) seenStatuses.add(s); });
        ROLES.forEach((s) => { if (r.text.includes(s)) seenRoles.add(s); });
        /* a sixth status would have to appear somewhere; look for the words
           an invented one would most likely use */
        const invented = ['معلّق', 'مؤجل', 'مرفوض', 'قيد التنفيذ', 'منتهي'];
        const bad = invented.filter((t) => r.text.includes(t));
        check(file, 'no status outside the five approved', bad.length === 0, bad.join(', '));
      }
    }
  }

  /* ---- the public site ---------------------------------------------- */
  section('PUBLIC SITE');
  for (const { w, h, label } of WIDTHS) {
    await resize(w, h);
    await goto(`${BASE}/`, 2600);
    const a = await browser.send('Runtime.evaluate', { expression: AUDIT, returnByValue: true, awaitPromise: true });
    const r = a.result.value;
    check('index.html', `${label}px · no horizontal overflow`,
      r.scrollWidth <= r.clientWidth,
      r.scrollWidth <= r.clientWidth ? '' : `${r.scrollWidth} vs ${r.clientWidth} — ${r.wideCount} element(s): ${r.wide.join(' | ')}`);
    check('index.html', `${label}px · no console error`,
      consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | ').slice(0, 90));
    check('index.html', `${label}px · nothing same-origin failed to load`,
      failedRequests.length === 0, failedRequests.slice(0, 2).join(' | ').slice(0, 90));
    check('index.html', `${label}px · every target meets WCAG 2.2 AA (${TARGET_MIN}px)`,
      r.under24Count === 0, r.under24Count ? `${r.under24Count}: ${r.under24.join(', ')}` : `${r.controls} controls`);
    check('index.html', `${label}px · every control has a name`,
      r.unnamedCount === 0, r.unnamedCount ? `${r.unnamedCount}: ${r.unnamed.join(', ')}` : '');
    check('index.html', `${label}px · no dead link`,
      r.deadCount === 0, r.deadCount ? `${r.deadCount}: ${r.dead.join(', ')}` : '');
    if (label === '390' && r.under44Count > 0) {
      advisories.push(`index.html @390px — ${r.under44Count} control(s) under the 44px touch guideline: ${r.under44.join(', ')}`);
    }
    if (externalFailures.length) externalSeen.set('index.html', externalFailures.slice(0, 2).join(' | '));
    if (label === '1440') {
      const hits = FORBIDDEN.filter((t) => r.text.includes(t));
      check('index.html', 'terminology: only ذوي الاحتياجات الخاصة', hits.length === 0, hits.join(', '));
      check('index.html', 'the approved wording IS present',
        r.text.includes('ذوي الاحتياجات الخاصة'));
    }
  }

  /* ---- the account menu, exercised rather than inspected -------------- */
  section('THE ACCOUNT MENU — CLICKED, NOT READ');
  /* Every item in this menu but logout used to do nothing, on every page. A
     check that reads the markup would have passed then too, so this one
     clicks. It runs on two pages: one that exports its own toast helper and
     one that does not, because the two take different paths out. */
  await resize(1440, 900);
  for (const page of ['dashboard.html', 'users.html']) {
    await goto(`${BASE}/admin/${page}`);

    const hooks = await browser.send('Runtime.evaluate', {
      expression: `JSON.stringify(Array.prototype.map.call(
        document.querySelectorAll('[data-acct]'), function(b){ return b.getAttribute('data-acct'); }))`,
      returnByValue: true,
    });
    const found = JSON.parse(hooks.result.value || '[]');
    check(page, 'the menu offers info, password and logout',
      ['info', 'password', 'logout'].every((k) => found.includes(k)), found.join(', '));

    /* معلومات الحساب — must open and must fill in from /auth/me */
    const info = await browser.send('Runtime.evaluate', {
      expression: `(async () => {
        document.querySelector('[data-acct="info"]').click();
        for (let i = 0; i < 40; i++) {
          await new Promise(r => setTimeout(r, 100));
          const dl = document.querySelector('.aun-dlg .aun-dl');
          if (dl && !dl.textContent.includes('جارٍ التحميل')) break;
        }
        const box = document.querySelector('.aun-dlg');
        const txt = box ? box.innerText : '';
        const close = box && box.querySelector('.aun-btn');
        if (close) close.click();
        return JSON.stringify({ opened: !!box, txt: txt, gone: !document.querySelector('.aun-dlg') });
      })()`,
      returnByValue: true, awaitPromise: true,
    });
    const i = JSON.parse(info.result.value);
    check(page, 'معلومات الحساب opens a dialog', i.opened === true);
    check(page, 'and it carries the real account, not a placeholder',
      i.txt.includes('نورة العتيبي') && i.txt.includes('@'), i.txt.replace(/\s+/g, ' ').slice(0, 70));
    check(page, 'and it closes again', i.gone === true);

    /* تغيير كلمة المرور — must open, must validate, must reach the server */
    const pw = await browser.send('Runtime.evaluate', {
      expression: `(async () => {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        document.querySelector('[data-acct="password"]').click();
        await wait(200);
        const box = document.querySelector('.aun-dlg');
        if (!box) return JSON.stringify({ opened: false });
        const inputs = box.querySelectorAll('input');
        const save = box.querySelector('.aun-btn');

        /* empty current password — refused before anything is sent */
        save.click(); await wait(150);
        const emptyMsg = box.querySelector('.aun-err:not([hidden])');
        const guardedEmpty = !!emptyMsg;

        /* mismatch — refused locally too */
        inputs[0].value = 'whatever-current';
        inputs[1].value = 'Aaaa-Bbbb-Cccc-1';
        inputs[2].value = 'Aaaa-Bbbb-Cccc-2';
        save.click(); await wait(150);
        const mismatch = !!box.querySelector('.aun-err:not([hidden])');

        /* a wrong current password must be refused by the SERVER, and the
           message must land on the field it belongs to */
        inputs[2].value = 'Aaaa-Bbbb-Cccc-1';
        save.click();
        let serverMsg = '';
        for (let k = 0; k < 60; k++) {
          await wait(150);
          const e = box.querySelector('.aun-err:not([hidden])');
          if (e && e.textContent.indexOf('الحالية') > -1) { serverMsg = e.textContent; break; }
        }
        const onCurrentField = !!(serverMsg && inputs[0].classList.contains('is-bad'));
        const passwordNotEchoed = !box.innerText.includes('Aaaa-Bbbb-Cccc-1');
        const typeIsPassword = Array.prototype.every.call(inputs, function(n){ return n.type === 'password'; });

        box.querySelectorAll('.aun-btn')[1].click();
        await wait(150);
        return JSON.stringify({ opened: true, fields: inputs.length, guardedEmpty, mismatch,
          serverMsg, onCurrentField, passwordNotEchoed, typeIsPassword,
          closed: !document.querySelector('.aun-dlg') });
      })()`,
      returnByValue: true, awaitPromise: true,
    });
    const r = JSON.parse(pw.result.value);
    check(page, 'تغيير كلمة المرور opens a dialog', r.opened === true);
    check(page, 'with current, new and confirm', r.fields === 3, `${r.fields} fields`);
    check(page, 'an empty current password is refused before anything is sent', r.guardedEmpty === true);
    check(page, 'a mismatched confirmation is refused', r.mismatch === true);
    check(page, 'a wrong current password is refused BY THE SERVER',
      !!r.serverMsg, (r.serverMsg || '').slice(0, 50));
    check(page, 'and the message lands on the field it belongs to', r.onCurrentField === true);
    check(page, 'every field masks what is typed', r.typeIsPassword === true);
    check(page, 'and no password is echoed back into the page', r.passwordNotEchoed === true);
    check(page, 'the dialog closes on تراجع', r.closed === true);
  }

  /* One change carried all the way through, on a throwaway account, so the
     dialog is proved to do the thing and not merely to reach the endpoint:
     the new password signs in afterwards and the old one does not. */
  const scratchEmail = 'uipw' + Date.now().toString().slice(-6) + '@aunaldrb.com';
  const oldPw = 'Ui-Dialog-Old-Pass-1';
  const newPw = 'Ui-Dialog-New-Pass-2';

  const made = await browser.send('Runtime.evaluate', {
    expression: `(async () => {
      const t = await fetch('${BASE}/api/csrf', {credentials:'same-origin'}).then(r => r.json());
      const r = await fetch('${BASE}/api/admin/users/save', {method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRF-Token':t.token},
        body: JSON.stringify({csrf_token:t.token, name:'حساب اختبار الحوار',
          email:${JSON.stringify(scratchEmail)}, role:'admin', active:'1', password:${JSON.stringify(oldPw)}})});
      return String(r.status);
    })()`, returnByValue: true, awaitPromise: true,
  });
  check('menu', 'a throwaway account is created for the round trip',
    made.result.value === '201', 'status=' + made.result.value);

  /* become that account */
  await browser.send('Runtime.evaluate', {
    expression: `(async () => {
      await fetch('${BASE}/api/auth/logout', {method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRF-Token':
          (await fetch('${BASE}/api/csrf',{credentials:'same-origin'}).then(r=>r.json())).token},
        body: JSON.stringify({})}).catch(()=>null);
      const t = await fetch('${BASE}/api/csrf', {credentials:'same-origin'}).then(r => r.json());
      return String((await fetch('${BASE}/api/auth/login', {method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRF-Token':t.token},
        body: JSON.stringify({csrf_token:t.token, email:${JSON.stringify(scratchEmail)},
          password:${JSON.stringify(oldPw)}})})).status);
    })()`, returnByValue: true, awaitPromise: true,
  });

  await goto(`${BASE}/admin/dashboard.html`);
  const changed = await browser.send('Runtime.evaluate', {
    expression: `(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      document.querySelector('[data-acct="password"]').click();
      await wait(250);
      const box = document.querySelector('.aun-dlg');
      if (!box) return JSON.stringify({ opened:false });
      const inp = box.querySelectorAll('input');
      inp[0].value = ${JSON.stringify(oldPw)};
      inp[1].value = ${JSON.stringify(newPw)};
      inp[2].value = ${JSON.stringify(newPw)};
      box.querySelector('.aun-btn').click();
      /* On success the form closes and a confirmation takes its place, so the
         thing to wait for is the form going away — not every dialog going
         away, which is what made a working change read as a failure. */
      let closed = false, told = false;
      for (let k = 0; k < 80; k++) {
        await wait(150);
        if (!document.querySelector('[data-dlg="password"]')) { closed = true; break; }
      }
      await wait(300);
      const done = document.querySelector('[data-dlg="done"]');
      const toast = document.querySelector('.toasts .toast, #toasts .toast');
      told = !!(done || toast);
      const shown = done ? done.innerText : (toast ? toast.innerText : '');
      const leaked = shown.indexOf(${JSON.stringify(newPw)}) > -1;
      const stillIn = (await fetch('${BASE}/api/auth/me', {credentials:'same-origin'})).status;
      return JSON.stringify({ opened:true, closed, told, leaked, shown: shown.slice(0,60), stillIn });
    })()`, returnByValue: true, awaitPromise: true,
  });
  const c = JSON.parse(changed.result.value);
  check('menu', 'a real change closes the form on success', c.closed === true);
  check('menu', 'and says so, rather than closing silently', c.told === true,
    (c.shown || '').replace(/\s+/g, ' '));
  check('menu', 'without repeating the password back', c.leaked === false);
  check('menu', 'and does NOT sign the operator out of the session that made it',
    c.stillIn === 200, 'me=' + c.stillIn);

  const proof = await browser.send('Runtime.evaluate', {
    expression: `(async () => {
      const attempt = async (pw) => {
        await fetch('${BASE}/api/auth/logout', {method:'POST', credentials:'same-origin',
          headers:{'Content-Type':'application/json','X-CSRF-Token':
            (await fetch('${BASE}/api/csrf',{credentials:'same-origin'}).then(r=>r.json())).token},
          body: JSON.stringify({})}).catch(()=>null);
        const t = await fetch('${BASE}/api/csrf', {credentials:'same-origin'}).then(r => r.json());
        return (await fetch('${BASE}/api/auth/login', {method:'POST', credentials:'same-origin',
          headers:{'Content-Type':'application/json','X-CSRF-Token':t.token},
          body: JSON.stringify({csrf_token:t.token, email:${JSON.stringify(scratchEmail)}, password:pw})})).status;
      };
      const withOld = await attempt(${JSON.stringify(oldPw)});
      const withNew = await attempt(${JSON.stringify(newPw)});
      return JSON.stringify({ withOld, withNew });
    })()`, returnByValue: true, awaitPromise: true,
  });
  const pr = JSON.parse(proof.result.value);
  check('menu', 'the old password no longer signs in', pr.withOld === 401, 'status=' + pr.withOld);
  check('menu', 'and the one typed into the dialog does', pr.withNew === 200, 'status=' + pr.withNew);

  /* back to the account the rest of the run uses */
  await browser.send('Runtime.evaluate', {
    expression: `(async () => {
      await fetch('${BASE}/api/auth/logout', {method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRF-Token':
          (await fetch('${BASE}/api/csrf',{credentials:'same-origin'}).then(r=>r.json())).token},
        body: JSON.stringify({})}).catch(()=>null);
      const t = await fetch('${BASE}/api/csrf', {credentials:'same-origin'}).then(r => r.json());
      return String((await fetch('${BASE}/api/auth/login', {method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRF-Token':t.token},
        body: JSON.stringify({csrf_token:t.token, email:${JSON.stringify(EMAIL)},
          password:${JSON.stringify(PASSWORD)}})})).status);
    })()`, returnByValue: true, awaitPromise: true,
  });

  /* Logout is the one item that always worked; assert it still does. The
     click navigates, so nothing may be awaited inside the page across it —
     doing that destroys the execution context mid-promise and takes the whole
     run down with it. Click, then wait and ask from out here. */
  await goto(`${BASE}/admin/dashboard.html`);
  await browser.send('Runtime.evaluate', {
    expression: `document.querySelector('[data-acct="logout"]').click(); true;`,
    returnByValue: true,
  }).catch(() => null);

  let landedOn = '', meStatus = 0;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const r = await browser.send('Runtime.evaluate', {
      expression: `location.pathname`, returnByValue: true,
    }).catch(() => null);
    landedOn = (r && r.result && r.result.value) || landedOn;
    if (landedOn.includes('login')) break;
  }
  const meCheck = await browser.send('Runtime.evaluate', {
    expression: `fetch('${BASE}/api/auth/me',{credentials:'same-origin'}).then(r=>String(r.status))`,
    returnByValue: true, awaitPromise: true,
  }).catch(() => null);
  meStatus = Number((meCheck && meCheck.result && meCheck.result.value) || 0);
  check('dashboard.html', 'تسجيل الخروج still ends the session', meStatus === 401, `me=${meStatus}`);
  check('dashboard.html', 'and lands on the sign-in page', landedOn.includes('login'), landedOn);

  /* sign back in for whatever follows */
  await goto(`${BASE}/admin/login.html`);
  await browser.send('Runtime.evaluate', {
    expression: `(async () => {
      const t = await fetch('${BASE}/api/csrf', {credentials:'same-origin'}).then(r => r.json());
      return (await fetch('${BASE}/api/auth/login', {method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRF-Token':t.token},
        body: JSON.stringify({csrf_token:t.token, email:${JSON.stringify(EMAIL)}, password:${JSON.stringify(PASSWORD)}})})).status;
    })()`, returnByValue: true, awaitPromise: true,
  });

  /* ---- the account menu, driven the way a person drives it ------------ */
  section('THE ACCOUNT MENU');
  /* Two of its three items did nothing at all for the life of this project:
     the menu looked complete and only logout worked. Clicking them is the
     only check that catches that — the markup was always there. */
  for (const file of ['dashboard.html', 'requests.html', 'settings.html', 'activity.html']) {
    await resize(1440, 950);
    await goto(`${BASE}/admin/${file}`);

    const opened = await browser.send('Runtime.evaluate', {
      expression: `(()=>{const b=document.getElementById('whobtn'); if(!b) return 'no button';
        b.click(); return document.getElementById('whopop').hidden ? 'stayed shut' : 'open';})()`,
      returnByValue: true,
    });
    check(file, 'the account menu opens', opened.result.value === 'open', String(opened.result.value));

    /* معلومات الحساب — must show THIS account, read from the server */
    const info = await browser.send('Runtime.evaluate', {
      expression: `(async()=>{
        document.querySelector('[data-acct="info"]').click();
        for (let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,150));
          const d=document.querySelector('[data-dlg="account"]');
          if (d && !/جارٍ التحميل/.test(d.innerText)) break; }
        const d=document.querySelector('[data-dlg="account"]');
        return JSON.stringify({open:!!d, text:d?d.innerText.replace(/\\s+/g,' '):''});})()`,
      returnByValue: true, awaitPromise: true,
    });
    const iv = JSON.parse(info.result.value);
    check(file, 'معلومات الحساب opens', iv.open === true);
    check(file, 'and shows the signed-in account, not a placeholder',
      iv.text.includes(EMAIL), iv.text.slice(-90));
    await browser.send('Runtime.evaluate', {
      expression: `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`, returnByValue: true });
    await sleep(300);
    const closed = await browser.send('Runtime.evaluate', {
      expression: `!document.querySelector('[data-dlg="account"]')`, returnByValue: true });
    check(file, 'and Escape closes it', closed.result.value === true);

    /* تغيير كلمة المرور — a real form, and every field masked */
    const pw = await browser.send('Runtime.evaluate', {
      expression: `(()=>{document.getElementById('whobtn').click();
        document.querySelector('[data-acct="password"]').click();
        const d=document.querySelector('[data-dlg="password"]');
        if(!d) return JSON.stringify({open:false});
        const i=d.querySelectorAll('input');
        return JSON.stringify({open:true, fields:i.length,
          masked:Array.prototype.every.call(i,x=>x.type==='password'),
          buttons:d.querySelectorAll('.aun-dlg__f button').length});})()`,
      returnByValue: true,
    });
    const pv = JSON.parse(pw.result.value);
    check(file, 'تغيير كلمة المرور opens a real form', pv.open === true && pv.fields === 3,
      'fields=' + pv.fields);
    check(file, 'and every field masks what is typed', pv.masked === true);
    check(file, 'and it offers a save and a cancel', pv.buttons === 2, 'buttons=' + pv.buttons);
    await browser.send('Runtime.evaluate', {
      expression: `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`, returnByValue: true });
    check(file, 'the menu raised no console error', consoleErrors.length === 0,
      consoleErrors.slice(0, 1).join('').slice(0, 80));
  }

  /* And it changes a password — the wrong current one refused first, in the
     dialog, which is where the person typing it is looking. Run on a throwaway
     account so the credentials this gate signs in with are untouched. */
  await goto(`${BASE}/admin/dashboard.html`);
  /* Built by concatenation, not by nesting one template literal inside
     another: the nested form put the literal text "${JSON.stringify(curPw)}"
     into the page, where that name does not exist, and the whole call returned
     undefined. */
  async function attempt(curPw, newPw) {
    const expr = '(async()=>{\n'
      + "  document.getElementById('whobtn').click();\n"
      + '  document.querySelector(\'[data-acct="password"]\').click();\n'
      + '  await new Promise(r=>setTimeout(r,400));\n'
      + '  const d=document.querySelector(\'[data-dlg="password"]\');\n'
      + '  if (!d) return JSON.stringify({stillOpen:false,refused:false,confirmed:false,note:"dialog never opened"});\n'
      + '  const i=d.querySelectorAll("input");\n'
      + '  i[0].value=' + JSON.stringify(curPw) + ';\n'
      + '  i[1].value=' + JSON.stringify(newPw) + ';\n'
      + '  i[2].value=' + JSON.stringify(newPw) + ';\n'
      + "  d.querySelector('.aun-dlg__f button').click();\n"
      + '  for (let k=0;k<50;k++){ await new Promise(r=>setTimeout(r,150));\n'
      + '    const s=document.querySelector(\'[data-dlg="password"]\');\n'
      + '    if (!s || /' + 'غير صحيحة|أقل من|مطابقة|شائعة' + '/.test(s.innerText)) break; }\n'
      + '  const s=document.querySelector(\'[data-dlg="password"]\');\n'
      + '  return JSON.stringify({stillOpen:!!s,\n'
      + '    refused: s ? /' + 'غير صحيحة' + '/.test(s.innerText) : false,\n'
      + '    confirmed: document.body.innerText.indexOf("' + 'غُيّرت كلمة المرور' + '") > -1});})()';
    const r = await browser.send('Runtime.evaluate',
      { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.text };
    try { return JSON.parse(r.result.value); }
    catch (e) { return { error: 'unparseable: ' + String(r.result.value).slice(0, 80) }; }
  }
  /* The signed-in account here IS the suite's account, so the change is made
     and then made back — the password it started with is the password it ends
     with, and the endpoint is still exercised for real. */
  const wrong = await attempt('not-the-current-password', PASSWORD + '-x');
  check('menu', 'a wrong current password is refused in the dialog',
    wrong.stillOpen === true && wrong.refused === true, JSON.stringify(wrong));
  await browser.send('Runtime.evaluate', {
    expression: `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`, returnByValue: true });
  await sleep(300);
  const right = await attempt(PASSWORD, PASSWORD + '-Rotated1');
  check('menu', 'the right one changes it and says so',
    right.stillOpen === false && right.confirmed === true, JSON.stringify(right));
  await goto(`${BASE}/admin/dashboard.html`);
  const back = await attempt(PASSWORD + '-Rotated1', PASSWORD);
  check('menu', 'and it changes back, so the account ends as it started',
    back.stillOpen === false && back.confirmed === true, JSON.stringify(back));

  /* ---- the third-party dependency, read from the markup --------------- */
  section('THIRD-PARTY DEPENDENCIES');
  const adminSrc = adminPages.map((f) => fs.readFileSync(path.join(__dirname, '..', 'admin', f), 'utf8'));
  const googleFontPages = adminPages.filter((f, i) => /<link[^>]+fonts\.googleapis\.com/.test(adminSrc[i]));
  /* The public page mentions the host only inside a comment recording that its
     faces used to come from there and are self-hosted now — and build.js
     strips comments, so the shipped page has no reference at all. Matched on
     the actual <link>, not on the substring, which is what made this read as a
     failure the first time it ran. */
  const built = fs.existsSync(path.join(__dirname, '..', 'dist', 'index.html'))
    ? fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8') : '';
  check('admin', 'the public site loads no third-party stylesheet',
    !/<link[^>]+fonts\.googleapis\.com/.test(built || ''), built ? '' : 'dist/ not built — run node build.js');
  if (googleFontPages.length) {
    advisories.push(`admin — ${googleFontPages.length}/${adminPages.length} pages load typefaces from fonts.googleapis.com. `
      + 'Known and accepted for now: every sign-in is visible to Google, and the dashboard loses its typefaces whenever '
      + 'Google is unreachable. Removing it means shipping Cairo 600, IBM Plex Sans Arabic 400 and IBM Plex Mono locally.');
  }

  /* ---- what the five statuses and three roles add up to -------------- */
  section('THE APPROVED VOCABULARY, ACROSS EVERY PAGE');
  check('all pages', 'all five approved statuses appear',
    seenStatuses.size === 5, [...seenStatuses].join('، ') || 'none');
  check('all pages', 'all three approved roles appear',
    seenRoles.size === 3, [...seenRoles].join('، ') || 'none');

  console.log(lines.join('\n'));
  console.log('\n' + '='.repeat(78));
  console.log(`  ${pass} passed, ${fail} failed, ${pass + fail} total`);
  console.log('='.repeat(78));
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  if (navFailures.length) {
    console.log('\nNavigations that never completed (the page was not measured):');
    navFailures.forEach((u) => console.log('  ! ' + u));
  }
  if (advisories.length) {
    console.log('\nAdvisories (guidance, not conformance — reported, not failed):');
    advisories.forEach((a) => console.log('  · ' + a));
  }
  if (externalSeen.size) {
    console.log('\nThird-party resources this environment cannot reach.');
    console.log('  Not page defects here — but the dependency itself is the finding:');
    for (const [f, d] of externalSeen) console.log(`  · ${f}: ${d}`);
  }

  browser.close();
  chrome.kill();
  fs.rmSync(userDir, { recursive: true, force: true });
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
