#!/usr/bin/env node
/**
 * The seventh gate: the operator's experience, module by module.
 *
 * The six gates before this one ask whether the dashboard is correct —
 * whether the API answers, whether authorization holds, whether anything
 * overflows, whether a control is dead, whether the public site is sound.
 * None of them asks the question the operator actually lives with: when
 * something goes wrong, or nothing is there, or she is working from the
 * keyboard, does the page tell her what happened and how to get out of it?
 *
 * That question decomposes into six things a page either does or does not do,
 * each checkable without an opinion:
 *
 *   A · RECOVERY   the network fails; the section says so in words, and
 *                  offers a way to try again. A blank card and a spinner that
 *                  never stops are both failures.
 *   B · EMPTY      a filter matches nothing; the page says so, and offers the
 *                  way back out of the filter.
 *   C · DIALOG     opening a dialog moves focus into it, the dialog carries a
 *                  name, Escape closes it, and focus comes back to the
 *                  control that opened it.
 *   D · LABEL      every visible field is named programmatically. A
 *                  placeholder is not a label — it disappears the moment she
 *                  types, and it is not read as the field's name.
 *   E · ERROR      a field's error is tied to the field (aria-describedby)
 *                  and the field is marked invalid, so it is announced rather
 *                  than merely drawn.
 *   F · LIVE       the page has one polite live region, so a toast is heard
 *                  and not only seen.
 *
 * Usage:  node bin/qa-ux.js [baseUrl] --email=… --password=…
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');

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

/* The ten modules plus the two single-purpose screens, in the order the
   navigation lists them.
     `search`  the field a filter is typed into, if the module has one
     `loads`   whether the page reads anything from the API. intake is the
               documented walk-through of the public form — it simulates its
               own responses and asks the server for nothing, so a failed
               network is not a state it has.
     `before`  something to do first, when the thing under test is not on the
               pane the page opens on
     `dialogs` openers whose click puts a real dialog on screen; a control
               that switches views instead (users' «إضافة مستخدم») is not one */
const MODULES = [
  { page: 'dashboard', name: 'الرئيسية',   loads: true,  search: null, dialogs: [] },
  { page: 'requests',  name: 'الطلبات',    loads: true,  search: '#q', dialogs: ['#newreq'] },
  { page: 'intake',    name: 'نموذج الموقع', loads: false, search: null, dialogs: [] },
  { page: 'customers', name: 'العملاء',    loads: true,  search: '#q', dialogs: [] },
  { page: 'services',  name: 'الخدمات',    loads: true,  search: '#q', dialogs: ['#newbtn'] },
  { page: 'content',   name: 'المحتوى',    loads: true,  search: null, dialogs: [] },
  { page: 'media',     name: 'الوسائط',    loads: true,  search: '#q', dialogs: ['#upbtn'] },
  { page: 'reports',   name: 'التقارير',   loads: true,  search: null, dialogs: [] },
  { page: 'users',     name: 'المستخدمون', loads: true,  search: '#q', dialogs: [] },
  { page: 'activity',  name: 'السجل',      loads: true,  search: '#q', dialogs: [],
    before: '(function(){ var t = document.getElementById("tab-log"); if (t) t.click(); })()' },
  { page: 'settings',  name: 'الإعدادات',  loads: true,  search: null, dialogs: [] },
];

/* Words that mean "this did not work" and words that mean "try again". A
   recovery message has to contain one of each family: "تعذّر التحميل" alone
   leaves her stuck, and a bare "إعادة المحاولة" button over an empty card
   never says what failed. */
const SAYS_FAILED = ['تعذّر', 'تعذر', 'فشل', 'لم يتم', 'لم نتمكن', 'انقطع', 'خطأ'];
const SAYS_RETRY = ['إعادة المحاولة', 'أعد المحاولة', 'المحاولة مرة أخرى', 'حاول مرة أخرى', 'إعادة التحميل', 'تحديث'];
const SAYS_EMPTY = ['لا توجد', 'لا يوجد', 'لم نعثر', 'لا نتائج', 'لا شيء'];
const SAYS_CLEAR = ['إعادة تعيين', 'مسح', 'إزالة الفلاتر', 'عرض الكل'];

/* G · Strings that are the machine talking to itself. The brief forbids
   showing raw technical errors to the operator, and the way they arrive is
   never a decision anybody made: fetch() rejects with the browser's own
   "Failed to fetch", a template prints an absent value as "undefined", a
   dimension pair with nothing in it renders "null×null". Each is a real
   defect that has already shipped here at least once, and none of them is
   visible to a check that only asks whether an error state appeared. */
const RAW_TECHNICAL = [
  'Failed to fetch', 'NetworkError', 'TypeError', 'ReferenceError',
  'SyntaxError', 'Uncaught', '[object Object]', 'undefined', 'null×null',
  'NaN', 'Error:', 'stack', '/home/', '/var/www', 'Fatal error',
];

let pass = 0, fail = 0;
const failures = [];
const lines = [];
function check(page, name, ok, detail = '') {
  ok ? pass++ : fail++;
  lines.push(`  ${ok ? 'PASS' : 'FAIL'} ${(page + ' · ' + name).padEnd(64)} ${detail}`);
  if (!ok) failures.push(`${page} / ${name} — ${detail}`);
}
function section(t) { lines.push('\n' + t); }

/* ---------- a minimal CDP client (same shape as bin/qa-browser.js) ----- */
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
  on(fn) { this.listeners.push(fn); }
  close() { try { this.ws.close(); } catch (e) { /* already gone */ } }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- the page-side helpers, shared by several checks ----------- */
/* Visibility here means what a person can see, not what the DOM contains:
   a hidden empty state and a rendered one are the same node, and reading
   through the hidden one is how a check reports success and failure at the
   same time. (bin/qa-public.js had exactly that bug.) */
const VIS_FN = `
  function vis(n) {
    if (!n) return false;
    if (n.closest('[hidden]')) return false;
    const r = n.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(n);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    if (parseFloat(cs.opacity) < 0.05) return false;
    return true;
  }
  function seen(root) {
    root = root || document.body;
    let out = '';
    root.querySelectorAll('*').forEach((n) => {
      if (n.children.length) return;
      if (!vis(n)) return;
      out += ' ' + (n.textContent || '').trim();
    });
    return out.replace(/\\s+/g, ' ');
  }
`;

async function main() {
  if (!CHROME) { console.error('no chromium found'); process.exit(2); }

  const userDir = fs.mkdtempSync('/tmp/qa-ux-chrome-');
  const port = 9800 + Math.floor(Math.random() * 300);
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
  /* raw (browser-scoped) send, used only to open and attach to the tab */
  const rawSend = (method, params = {}) => {
    const id = ++browser.id;
    return new Promise((resolve, reject) => {
      browser.waiting.set(id, { resolve, reject });
      browser.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (browser.waiting.has(id)) { browser.waiting.delete(id); reject(new Error(method + ' timed out')); }
      }, 60000);
    });
  };
  const t = await rawSend('Target.createTarget', { url: 'about:blank' });
  const at = await rawSend('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const sessionId = at.sessionId;

  const send = (method, params = {}) => {
    const id = ++browser.id;
    return new Promise((resolve, reject) => {
      browser.waiting.set(id, { resolve, reject });
      browser.ws.send(JSON.stringify({ id, method, params, sessionId }));
      setTimeout(() => {
        if (browser.waiting.has(id)) { browser.waiting.delete(id); reject(new Error(method + ' timed out')); }
      }, 60000);
    });
  };
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' — ' + expression.slice(0, 100));
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  /* network quiet, so a page that fills itself after load is measured settled */
  const inFlight = new Set();
  let lastActivity = 0;
  browser.on((m) => {
    if (m.method === 'Network.requestWillBeSent') { inFlight.add(m.params.requestId); lastActivity = Date.now(); }
    if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') {
      inFlight.delete(m.params.requestId); lastActivity = Date.now();
    }
  });

  /* A timeout on a navigation is the development server stalling, not the page
     failing; letting it reject kills the whole gate and the runner reads a
     failed gate where every check passed. One retry; a second failure is real. */
  const goto = async (url) => {
    try {
      await send('Page.navigate', { url });
    } catch (e) {
      if (!/timed out/.test(String(e && e.message))) throw e;
      await sleep(1500);
      await send('Page.navigate', { url });
    }
    await sleep(500);
    const started = Date.now();
    while (Date.now() - started < 9000) {
      if (inFlight.size === 0 && Date.now() - lastActivity > 700) break;
      await sleep(150);
    }
    await sleep(400);
  };

  /* ---- sign in ------------------------------------------------------ */
  section('SIGNING IN');
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
  check('login', 'a real session is opened', status === 200, 'status=' + status);
  if (status !== 200) { console.log(lines.join('\n')); chrome.kill(); process.exit(1); }

  /* =====================================================================
     F · one polite live region per page, and D/E on the page's own fields
     ===================================================================== */
  section('F · صوت الواجهة — منطقة إعلان واحدة في كل صفحة');
  section('D · كل حقل ظاهر له اسم مقروء');
  const dLines = [], eLines = [];
  for (const mod of MODULES) {
    await goto(`${BASE}/admin/${mod.page}`);

    const live = await evaluate(`(() => {
      ${VIS_FN}
      const regions = Array.from(document.querySelectorAll('[aria-live], [role="status"], [role="alert"]'));
      const polite = regions.filter((n) => n.getAttribute('aria-live') === 'polite'
        || n.getAttribute('role') === 'status');
      return { total: regions.length, polite: polite.length,
               ids: polite.map((n) => n.id || n.className).slice(0, 4) };
    })()`);
    check(mod.page, 'منطقة إعلان مهذّبة للإشعارات', live.polite >= 1,
      `regions=${live.total} polite=${live.polite} ${live.ids.join(',')}`);

    const rawOk = await evaluate(`(() => {
      ${VIS_FN}
      const txt = seen();
      return ${JSON.stringify(RAW_TECHNICAL)}.filter((w) => txt.includes(w));
    })()`);
    check(mod.page, 'لا نص تقني خام في الحالة الطبيعية', rawOk.length === 0, rawOk.join(' | '));

    /* D — a visible field with no programmatic name. Placeholder deliberately
       does not count: it is gone the moment she types into the field. */
    const labels = await evaluate(`(() => {
      ${VIS_FN}
      const fields = Array.from(document.querySelectorAll('input:not([type=hidden]), select, textarea'));
      const bad = [];
      fields.forEach((n) => {
        if (!vis(n) && !(n.type === 'file')) return;      /* the file input hides behind its label */
        if (n.type === 'file' && !n.closest('label') && !n.id) return;
        const named =
          (n.getAttribute('aria-label') || '').trim() ||
          (n.getAttribute('aria-labelledby') || '').split(/\\s+/).some((id) => id && document.getElementById(id)) ||
          (n.id && document.querySelector('label[for="' + CSS.escape(n.id) + '"]')) ||
          n.closest('label');
        if (!named) bad.push((n.tagName + '#' + (n.id || '?') + '[' + (n.type || '') + ']'));
      });
      return bad;
    })()`);
    check(mod.page, 'لا حقل بلا اسم مقروء', labels.length === 0, labels.slice(0, 5).join(' '));
    if (labels.length) dLines.push(`${mod.page}: ${labels.join(' ')}`);

    /* E — an error message has to reach the person it is about. There are
       two shapes of message and each has its own answer:
         · a field's error belongs to that field, so the field points at it
           with aria-describedby and it is read as part of the field
         · a form-level error ("تعذّرت الإضافة") belongs to no field, so it
           is role="alert" and is announced the moment it appears
       An error span that is neither is drawn and never spoken. */
    const errs = await evaluate(`(() => {
      const spans = Array.from(document.querySelectorAll('.field__err[id]'));
      const orphan = [];
      spans.forEach((s) => {
        if (s.getAttribute('role') === 'alert') return;
        const described = document.querySelector('[aria-describedby~="' + s.id + '"]');
        if (!described) orphan.push('#' + s.id);
      });
      return { spans: spans.length, orphan: orphan };
    })()`);
    if (errs.spans) {
      check(mod.page, 'كل رسالة خطأ مربوطة بحقلها', errs.orphan.length === 0,
        `${errs.spans - errs.orphan.length}/${errs.spans} ${errs.orphan.slice(0, 6).join(' ')}`);
      if (errs.orphan.length) eLines.push(`${mod.page}: ${errs.orphan.join(' ')}`);
    }
  }

  /* =====================================================================
     B · nothing matched — say so, and offer the way back
     ===================================================================== */
  section('B · نتيجة فارغة — تشرح نفسها وتعرض المخرج');
  for (const mod of MODULES.filter((m) => m.search)) {
    await goto(`${BASE}/admin/${mod.page}`);
    /* السجل opens on the notifications pane; its search box belongs to the
       log pane, so typing into it without switching first measures a pane
       nobody is looking at. */
    if (mod.before) { await evaluate(mod.before); await sleep(400); }
    const typed = await evaluate(`(() => {
      const q = document.querySelector(${JSON.stringify(mod.search)});
      if (!q) return false;
      q.focus(); q.value = 'قققزززكككلاشيءمطلقا';
      q.dispatchEvent(new Event('input', {bubbles:true}));
      q.dispatchEvent(new KeyboardEvent('keyup', {bubbles:true, key:'a'}));
      return true;
    })()`);
    if (!typed) { check(mod.page, 'حقل البحث موجود', false, mod.search); continue; }
    await sleep(900);
    const started = Date.now();
    while (Date.now() - started < 5000) {
      if (inFlight.size === 0 && Date.now() - lastActivity > 600) break;
      await sleep(150);
    }
    await sleep(300);

    const empty = await evaluate(`(() => {
      ${VIS_FN}
      const txt = seen();
      const says = ${JSON.stringify(SAYS_EMPTY)}.some((w) => txt.includes(w));
      const outs = Array.from(document.querySelectorAll('button, a[href]')).filter((b) =>
        vis(b) && ${JSON.stringify(SAYS_CLEAR)}.some((w) => (b.innerText || '').includes(w)));
      return { says: says, out: outs.length, label: outs.map((b)=>b.innerText.trim()).slice(0,2),
               sample: txt.slice(0, 160) };
    })()`);
    check(mod.page, 'الحالة الفارغة تشرح نفسها', empty.says, empty.sample);
    check(mod.page, 'وتعرض طريقة الخروج من الفلتر', empty.out >= 1, empty.label.join(' | '));
  }

  /* =====================================================================
     C · the dialog keyboard contract
     ===================================================================== */
  section('C · عقد لوحة المفاتيح في النوافذ');
  for (const mod of MODULES.filter((m) => m.dialogs.length)) {
    await goto(`${BASE}/admin/${mod.page}`);
    for (const opener of mod.dialogs) {
      const opened = await evaluate(`(() => {
        ${VIS_FN}
        const b = document.querySelector(${JSON.stringify(opener)});
        if (!b) return {err:'no opener'};
        window.__opener = b;
        /* A person reaches a button before pressing it, so the dialog has
           something to give focus back to. Clicking it cold from script
           leaves document.activeElement on <body>, and then "focus was not
           restored" is a fact about the check, not about the page. */
        b.focus();
        b.click();
        return {ok:true};
      })()`);
      if (opened.err) { check(mod.page, `${opener} · النافذة تُفتح`, false, opened.err); continue; }
      await sleep(500);

      const state = await evaluate(`(() => {
        ${VIS_FN}
        const dlgs = Array.from(document.querySelectorAll('[role="dialog"], .modalwrap, .sheet'))
          .filter(vis);
        const d = dlgs[dlgs.length - 1];
        if (!d) return {open:false};
        const named = !!((d.getAttribute('aria-label') || '').trim()
          || (d.getAttribute('aria-labelledby') || '').split(/\\s+/).some((id)=>id && document.getElementById(id))
          || (d.querySelector('[role="dialog"]') && false));
        const inner = d.querySelector('[role="dialog"]');
        const target = inner || d;
        const named2 = !!((target.getAttribute('aria-label') || '').trim()
          || (target.getAttribute('aria-labelledby') || '').split(/\\s+/).some((id)=>id && document.getElementById(id)));
        return {
          open: true,
          modal: target.getAttribute('aria-modal') === 'true',
          named: named || named2,
          focusInside: !!(document.activeElement && target.contains(document.activeElement)),
          focusOn: document.activeElement ? (document.activeElement.tagName + '#' + (document.activeElement.id||'')) : 'none'
        };
      })()`);
      check(mod.page, `${opener} · النافذة تُفتح`, state.open === true, '');
      if (!state.open) continue;
      check(mod.page, `${opener} · التركيز ينتقل داخلها`, state.focusInside, state.focusOn);
      check(mod.page, `${opener} · للنافذة اسم مقروء`, state.named, '');
      check(mod.page, `${opener} · aria-modal`, state.modal, '');

      /* Escape closes it, and focus comes back to the button that opened it */
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await sleep(450);
      const after = await evaluate(`(() => {
        ${VIS_FN}
        const still = Array.from(document.querySelectorAll('[role="dialog"], .modalwrap, .sheet')).filter(vis).length;
        return { still: still,
                 restored: document.activeElement === window.__opener,
                 focusOn: document.activeElement ? (document.activeElement.tagName + '#' + (document.activeElement.id||'')) : 'none' };
      })()`);
      check(mod.page, `${opener} · Escape يغلقها`, after.still === 0, 'open=' + after.still);
      check(mod.page, `${opener} · التركيز يعود إلى زر الفتح`, after.restored, after.focusOn);
    }
  }

  /* =====================================================================
     A · the network fails — the section says so, and offers a retry
     ===================================================================== */
  section('A · تعذّر التحميل — الصفحة تقول ذلك وتعرض إعادة المحاولة');
  browser.on((m) => {
    if (m.method === 'Fetch.requestPaused' && m.sessionId === sessionId) {
      /* every admin read fails; auth and csrf are left alone so the shell
         still knows who is signed in — otherwise the page would redirect to
         the sign-in screen and the check would measure nothing. */
      send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'Failed' }).catch(() => {});
    }
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/admin/*', requestStage: 'Request' }] });

  for (const mod of MODULES.filter((m) => m.loads)) {
    await goto(`${BASE}/admin/${mod.page}`);
    await sleep(1200);
    const rec = await evaluate(`(() => {
      ${VIS_FN}
      const txt = seen();
      const says = ${JSON.stringify(SAYS_FAILED)}.some((w) => txt.includes(w));
      const retry = Array.from(document.querySelectorAll('button, a[href]')).filter((b) =>
        vis(b) && ${JSON.stringify(SAYS_RETRY)}.some((w) => (b.innerText || '').includes(w)));
      const spinner = Array.from(document.querySelectorAll('.loadbar, .spinner, [aria-busy="true"]')).filter(vis).length;
      /* the toast is the usual carrier, and it is on screen only briefly —
         read everything visible, including it */
      const raw = ${JSON.stringify(RAW_TECHNICAL)}.filter((w) => txt.includes(w));
      return { says: says, retry: retry.length, labels: retry.map((b)=>b.innerText.trim()).slice(0,2),
               spinner: spinner, raw: raw, sample: txt.slice(0, 200) };
    })()`);
    check(mod.page, 'يقول إن التحميل تعذّر', rec.says, rec.sample.slice(0, 120));
    check(mod.page, 'ولا يعرض نصاً تقنياً خاماً', rec.raw.length === 0, rec.raw.join(' | '));
    check(mod.page, 'ويعرض زر إعادة المحاولة', rec.retry >= 1, rec.labels.join(' | '));
    check(mod.page, 'ولا يترك مؤشر تحميل دائرًا', rec.spinner === 0, 'spinners=' + rec.spinner);
  }
  await send('Fetch.disable');

  /* ---- report -------------------------------------------------------- */
  console.log(lines.join('\n'));
  if (dLines.length) { console.log('\nحقول بلا اسم مقروء:'); dLines.forEach((l) => console.log('  ' + l)); }
  if (eLines.length) { console.log('\nرسائل خطأ غير مربوطة بحقولها:'); eLines.forEach((l) => console.log('  ' + l)); }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    console.log('\nFAILURES');
    failures.forEach((f) => console.log('  · ' + f));
  }
  chrome.kill();
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
