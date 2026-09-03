#!/usr/bin/env node
/**
 * Does every control actually DO something?
 *
 * This exists because the other two gates missed the obvious. bin/verify.php
 * proved the endpoints work. bin/qa-browser.js proved every control has an
 * accessible name, meets its target size and sits inside the viewport. Both
 * passed while two items in the account menu on all eleven pages were bound to
 * nothing at all — no handler, no endpoint, no error. The operator clicked
 * them and the dashboard simply did not respond.
 *
 * Nothing about a dead control is visible in markup: the button is there, it
 * is styled, it is named, it is the right size. The only way to catch it is to
 * ask the browser what is listening. So that is what this does — for every
 * visible interactive control on every admin page and on the public site, it
 * asks Chromium, over the DevTools protocol:
 *
 *   1. Does this element have its own event listener? Then it is wired.
 *   2. Does it have native behaviour that needs no listener at all?
 *      — a submit or reset button inside a form
 *      — an <a> with a real destination
 *      — a <label for=…> pointing at a control that exists
 *      — an <input>, <select> or <textarea> the operator types into
 *      — a <summary>, which opens its own <details>
 *   3. Otherwise the answer is not knowable by inspection, so it is CLICKED,
 *      and the page is watched for any effect at all: a DOM mutation, a
 *      request, a navigation, a dialog, a moved focus. No effect means dead.
 *
 * Step 3 is the whole point, and the first version of this file did not have
 * it. It asked instead whether any ANCESTOR had a listener, on the grounds
 * that these pages use delegation — and every page has a click handler on
 * `document` to close its menus, so every control passed. Run against the
 * account-menu defect it was written to catch, it reported the dashboard
 * clean. A gate that cannot fail on a known bug is worse than no gate, so it
 * clicks now, and it is validated against that same defect before it is
 * trusted.
 *
 * Clicking has consequences, so it is not done blindly. A control that
 * deletes, publishes, restores, uploads, signs out or saves is never clicked;
 * it is listed as excluded, with its reason, and counted separately. The page
 * is reloaded after any click that navigated, so one control cannot hide the
 * next.
 *
 * Usage:  node bin/qa-controls.js [baseUrl] --email=… --password=…
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
  '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find((p) => fs.existsSync(p));

const BLOCKED = ['*fonts.googleapis.com*', '*fonts.gstatic.com*',
  '*www.googletagmanager.com*', '*google-analytics.com*'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const lines = [];
const dead = [];
const excluded = [];
const stale = [];
let instances = 0;
function check(page, name, ok, detail = '') {
  ok ? pass++ : fail++;
  lines.push(`  ${ok ? 'PASS' : 'FAIL'} ${(page + ' · ' + name).padEnd(58)} ${detail}`);
}
function section(t) { lines.push('\n' + t); }

/* ------------------------------------------------------------------ */
async function main() {
  if (!CHROME) { console.error('no chromium found'); process.exit(2); }
  const userDir = fs.mkdtempSync('/tmp/qa-ctl-');
  const port = 9400 + Math.floor(Math.random() * 300);
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--no-first-run', '--disable-dev-shm-usage', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, 'about:blank'],
    { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; }
    catch (e) { /* not up */ }
  }
  if (!wsUrl) { chrome.kill(); console.error('no debugging port'); process.exit(2); }

  const sock = new WebSocket(wsUrl);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
  let id = 0; const waiting = new Map(); let sessionId = null;
  let loaded = false;
  const inFlight = new Set(); let lastActivity = Date.now();

  sock.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) {
      const { resolve, reject } = waiting.get(m.id);
      waiting.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      return;
    }
    if (m.method === 'Page.loadEventFired') loaded = true;
    if (m.method === 'Network.requestWillBeSent') { inFlight.add(m.params.requestId); lastActivity = Date.now(); }
    if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') {
      inFlight.delete(m.params.requestId); lastActivity = Date.now();
    }
  };
  const send = (method, params = {}, scoped = true) => {
    const i = ++id;
    return new Promise((resolve, reject) => {
      waiting.set(i, { resolve, reject });
      sock.send(JSON.stringify(scoped && sessionId ? { id: i, method, params, sessionId } : { id: i, method, params }));
      setTimeout(() => { if (waiting.has(i)) { waiting.delete(i); reject(new Error(method + ' timed out')); } }, 60000);
    });
  };

  const target = await send('Target.createTarget', { url: 'about:blank' }, false);
  sessionId = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, false)).sessionId;
  await send('Page.enable'); await send('Runtime.enable');
  await send('DOM.enable');   /* DOMDebugger has no enable — its methods are always available */
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: BLOCKED });

  const goto = async (url) => {
    loaded = false; inFlight.clear(); lastActivity = Date.now();
    await send('Page.navigate', { url });
    for (let i = 0; i < 80 && !loaded; i++) await sleep(100);
    const started = Date.now();
    while (Date.now() - started < 8000) {
      if (inFlight.size === 0 && Date.now() - lastActivity > 900) break;
      await sleep(150);
    }
    await sleep(500);
  };

  /* ---- sign in ---------------------------------------------------- */
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await goto(`${BASE}/admin/login.html`);
  const login = await send('Runtime.evaluate', {
    expression: `(async () => {
      const t = await fetch('${BASE}/api/csrf', {credentials:'same-origin'}).then(r=>r.json());
      const r = await fetch('${BASE}/api/auth/login', {method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRF-Token':t.token},
        body: JSON.stringify({csrf_token:t.token, email:${JSON.stringify(EMAIL)}, password:${JSON.stringify(PASSWORD)}})});
      return r.status;})()`,
    returnByValue: true, awaitPromise: true,
  });
  section('SIGNING IN');
  check('login', 'a real session is opened', login.result.value === 200, 'status=' + login.result.value);
  if (login.result.value !== 200) { console.log(lines.join('\n')); chrome.kill(); process.exit(1); }

  /* ---- the sweep -------------------------------------------------- */
  const pages = fs.readdirSync(path.join(__dirname, '..', 'admin'))
    .filter((f) => f.endsWith('.html') && !/^(stage-\d|recovery-\d)/.test(f))
    .sort()
    .map((f) => '/admin/' + f)
    .concat(['/']);

  /* Controls the page hides are still controls, and a dead one there is just
     as dead — the account menu is the proof: it sits inside a popover that is
     `hidden` until clicked, so the first two versions of this file never saw
     its items at all and reported the pages clean while two of the three did
     nothing. Everything that hides controls is opened first, on every page. */
  /* One at a time, each from a freshly loaded page. Opening them in sequence
     does not work: every one of these closes the last, so only the final
     popover stayed open and the account menu — the very thing this file was
     written to catch — was collected as hidden and skipped. */
  const REVEAL_STATES = [
    { name: 'as loaded', steps: [] },
    { name: 'account menu open', steps: ["var b=document.getElementById('whobtn'); b && b.click()"] },
    { name: 'notifications open', steps: ["var n=document.getElementById('bell'); n && n.click()"] },
    { name: 'mobile drawer open', steps: ["var m=document.getElementById('menubtn'); m && m.click()"] },
  ];

  /* Panels a page hides behind a tab or a view switch hold controls too. Each
     entry opens one, by clicking what a person would click. */
  const REVEALS = {
    'activity.html': ["document.getElementById('tab-log') && document.getElementById('tab-log').click()"],
    'settings.html': ["Array.prototype.slice.call(document.querySelectorAll('#catnav button')).forEach(function(b){b.click();})"],
    'users.html':    ["document.getElementById('addbtn') && document.getElementById('addbtn').click()"],
    'content.html':  ["var f=document.querySelector('[data-area]'); f && f.click()"],
  };

  let totalControls = 0;
  for (const rel of pages) {
    const file = rel === '/' ? 'index.html' : path.basename(rel);
    section(`CONTROLS · ${file}`);
    await goto(BASE + rel);

    const pageDead = [];
    const seen = new Set();
    let pageCount = 0;
    /* A click that re-renders detaches everything collected after it, so the
       page is re-loaded and re-collected before the next kind is tried. */
    let mustReload = false;
    const states = REVEAL_STATES.concat(
      (REVEALS[file] || []).map((step, i) => ({ name: 'panel ' + (i + 1), steps: [step] })));

    for (const state of states) {
      if (state.steps.length || mustReload) {
        await goto(BASE + rel);          /* clean load, so one panel cannot close another */
        mustReload = false;
        for (const step of state.steps) {
          try { await send('Runtime.evaluate', { expression: `(function(){try{${step}}catch(e){}})()`, returnByValue: true }); }
          catch (e) { /* the page may not have it */ }
          await sleep(650);
        }
      }

    /* Collect the controls as a JS array in the page, then hand each one back
       as a remote object so DOMDebugger can be asked about it. */
    const collected = await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = 'a[href], a[role], button, [role="button"], [role="menuitem"], [role="tab"],'
          + ' [role="checkbox"], [role="switch"], input:not([type=hidden]), select, textarea,'
          + ' label[for], summary, [onclick], [tabindex]:not([tabindex="-1"])';
        const all = Array.prototype.slice.call(document.querySelectorAll(sel));
        const seen = [];
        window.__aunControls = all.filter((n) => {
          const r = n.getBoundingClientRect();
          if (r.width <= 2 || r.height <= 2) return false;
          if (r.bottom < -50 || r.right < -50) return false;
          const cs = getComputedStyle(n);
          if (cs.visibility === 'hidden' || cs.display === 'none') return false;
          if (parseFloat(cs.opacity) < 0.05) return false;
          if (n.getAttribute('aria-hidden') === 'true') return false;
          if (n.closest('[hidden]')) return false;
          return true;
        });
        return JSON.stringify({n: window.__aunControls.length, url: location.pathname,
          title: document.title, ready: document.readyState,
          anchors: document.querySelectorAll('a[href]').length,
          buttons: document.querySelectorAll('button').length});
      })()`,
      returnByValue: true,
    });
    const info = JSON.parse(collected.result.value);
    const n = info.n || 0;

    for (let i = 0; i < n; i++) {
      const handle = await send('Runtime.evaluate', { expression: `window.__aunControls[${i}]` });
      const objectId = handle.result.objectId;
      if (!objectId) continue;

      /* its own listeners — the only inspection that proves anything */
      let listeners = 0;
      try {
        const own = await send('DOMDebugger.getEventListeners', { objectId, depth: -1, pierce: true });
        listeners = (own.listeners || []).filter((l) =>
          ['click', 'mousedown', 'pointerdown', 'change', 'input', 'submit', 'keydown', 'keyup'].includes(l.type)
        ).length;
      } catch (e) { /* treated as none */ }

      const verdict = await send('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: `function () {
          const n = this;
          const tag = n.tagName;
          const label = (n.getAttribute('aria-label') || n.innerText || n.value || n.getAttribute('title') || '')
            .trim().replace(/\\s+/g, ' ').slice(0, 40);
          const outer = n.outerHTML.replace(/\\s+/g, ' ').slice(0, 110);

          let native = '';
          if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
            const t = (n.type || '').toLowerCase();
            if (t === 'submit' || t === 'reset' || t === 'image') native = n.form ? 'form ' + t : '';
            else if (t === 'button') native = '';
            else native = 'typed into';
          } else if (tag === 'BUTTON') {
            const t = (n.type || 'submit').toLowerCase();
            if ((t === 'submit' || t === 'reset') && n.form) native = 'form ' + t;
          } else if (tag === 'A') {
            const h = n.getAttribute('href');
            if (h && h !== '#' && h !== '') {
              if (h.charAt(0) === '#') native = document.querySelector(h) ? 'in-page anchor' : '';
              else native = 'link';
            }
          } else if (tag === 'LABEL') {
            const f = n.getAttribute('for');
            native = (f && document.getElementById(f)) ? 'label for a control' : '';
          } else if (tag === 'SUMMARY') {
            native = n.closest('details') ? 'opens its details' : '';
          }

          /* Clicking this must not cost anything. The words are what an
             operator reads on the control, so they are what is matched. */
          const risky = /حذف|إلغاء الوصول|إلغاء وصول|نشر|استعادة|رفع|تسجيل الخروج|خروج|أرشفة|إخفاء|استبدال/;
          let skip = '';
          if (n.getAttribute('data-acct') === 'logout') skip = 'signs out';
          else if (n.hasAttribute('data-save')) skip = 'saves';
          else if (n.hasAttribute('data-reset')) skip = 'discards edits';
          else if (risky.test(label)) skip = 'destructive: "' + label + '"';
          else if (n.type === 'file') skip = 'file picker';
          else if (n.closest('[data-dlg]')) skip = 'inside a dialog this sweep opened';

          /* What KIND of control this is, ignoring its content: the same
             markup repeated fifty times down a list is wired by one piece of
             code, so one instance answers for all of them. Without this the
             sweep clicked all fifty — and the first click re-rendered the
             list, detaching the other forty-nine, which then registered no
             effect and were reported dead. */
          const attrs = Array.prototype.slice.call(n.attributes)
            .map((a) => a.name).filter((x) => x !== 'style' && !x.startsWith('aria-label'))
            .sort().join(',');
          const shape = tag + '|' + (n.className || '').toString().trim().replace(/\\s+/g, ' ')
            + '|' + attrs + '|' + (n.type || '') + '|' + (n.getAttribute('data-acct') || '')
            + '|' + (n.id || '');

          return JSON.stringify({ tag, label, outer, native, skip, shape });
        }`,
        returnByValue: true,
      });
      const v = JSON.parse(verdict.result.value);

      /* One instance per kind, and each kind only once across the states. */
      if (seen.has(v.shape)) { await send('Runtime.releaseObject', { objectId }).catch(() => {}); continue; }
      seen.add(v.shape);
      pageCount++;
      instances += 1;

      /* Step 3 — click it, and watch for any effect at all. Only reached when
         inspection could not answer, which keeps the clicking to the controls
         whose state is genuinely unknown. */
      let clicked = '';
      if (!listeners && !v.native && !v.skip) {
        /* What a click is allowed to change WITHOUT counting as doing
           something: the closing of the menu it sits in. Clicking any item in
           an open popover closes that popover, and closing it is a DOM
           mutation — so a dead menu item looked alive.
           
           Only the closing is discounted, not the popover's contents: the
           first attempt ignored every mutation inside the popover and so
           called the notification list's «تعليم كمقروء» buttons dead, when
           changing a row in that list is exactly what they are for. So what is
           ignored is a mutation ON the popover element itself (its `hidden`
           attribute) and on the button that toggles it. Anything else counts,
           including everything inside. */
        await send('Runtime.callFunctionOn', {
          objectId,
          functionDeclaration: `function () {
            const pop = this.closest('.pop, [role="menu"], .drawer, .modalwrap');
            window.__aunScope = pop || null;
            window.__aunToggle = pop && pop.id
              ? document.querySelector('[aria-controls="' + pop.id + '"]') : null;
            return 1; }`,
          returnByValue: true,
        }).catch(() => {});
        await send('Runtime.evaluate', {
          expression: `(() => {
            window.__aunFx = { mut: 0, req: 0, nav: false, err: 0 };
            if (window.__aunObs) window.__aunObs.disconnect();
            window.__aunObs = new MutationObserver((records) => {
              for (const r of records) {
                const t = r.target && r.target.nodeType === 1 ? r.target
                        : (r.target && r.target.parentElement) || null;
                if (t && (t === window.__aunScope || t === window.__aunToggle)) continue;
                window.__aunFx.mut++;
              }
            });
            window.__aunObs.observe(document.documentElement,
              { childList: true, subtree: true, attributes: true, characterData: true });
            if (!window.__aunHooked) {
              window.__aunHooked = true;
              const f = window.fetch;
              window.fetch = function () { if (window.__aunFx) window.__aunFx.req++; return f.apply(this, arguments); };
              const o = XMLHttpRequest.prototype.open;
              XMLHttpRequest.prototype.open = function () { if (window.__aunFx) window.__aunFx.req++; return o.apply(this, arguments); };
              window.addEventListener('beforeunload', () => { if (window.__aunFx) window.__aunFx.nav = true; });
              window.addEventListener('error', () => { if (window.__aunFx) window.__aunFx.err++; });
            }
            window.__aunFocusBefore = document.activeElement;
            return 1;})()`,
          returnByValue: true,
        });
        /* A control the page has since re-rendered is a detached node, and
           clicking it does nothing whatever it is wired to. Check first, and
           say so rather than calling it dead. */
        const attached = await send('Runtime.callFunctionOn', {
          objectId, functionDeclaration: 'function(){ return document.contains(this); }', returnByValue: true,
        }).catch(() => ({ result: { value: false } }));
        if (attached.result.value !== true) {
          stale.push({ page: file, ...v });
          await send('Runtime.releaseObject', { objectId }).catch(() => {});
          continue;
        }
        await send('Runtime.callFunctionOn', {
          objectId, functionDeclaration: 'function(){ this.click(); }', returnByValue: true,
        }).catch(() => {});
        await sleep(450);
        const fx = await send('Runtime.evaluate', {
          expression: `(() => {
            const f = window.__aunFx || {mut:0,req:0,nav:false,err:0};
            const a = document.activeElement;
            const moved = a !== window.__aunFocusBefore && a !== window.__aunScope;
            const dlg = !!document.querySelector('[data-dlg]');
            if (window.__aunObs) window.__aunObs.disconnect();
            return JSON.stringify({...f, moved, dlg});})()`,
          returnByValue: true,
        }).catch(() => ({ result: { value: '{"mut":0,"req":0,"nav":false,"moved":false,"dlg":false}' } }));
        const e = JSON.parse(fx.result.value);
        const effect = e.mut > 0 || e.req > 0 || e.nav || e.moved || e.dlg;
        clicked = effect
          ? `click → ${e.mut} mutations, ${e.req} requests${e.nav ? ', navigated' : ''}${e.dlg ? ', dialog' : ''}`
          : '';
        /* anything that redrew the page invalidates what was collected */
        if (e.mut > 4 || e.dlg || e.nav) mustReload = true;
        if (e.dlg || e.nav) {
          await send('Runtime.evaluate', {
            expression: `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`, returnByValue: true,
          }).catch(() => {});
          await sleep(200);
        }
      }

      if (v.skip) {
        /* Not clicked — but the ones this sweep refuses to click are the ones
           that publish, delete and restore, which makes them exactly the ones
           it must not simply wave through. They are checked the weaker way:
           a handler of their own, or a delegating ancestor. Weaker, and stated
           as such, but not nothing. */
        let anyHandler = listeners > 0 || v.native !== '';
        if (!anyHandler) {
          const anc = await send('Runtime.callFunctionOn', {
            objectId,
            functionDeclaration: `function(){ const out=[]; let p=this.parentElement;
              while(p){ out.push(p); p=p.parentElement; }
              out.push(document); window.__aunAnc = out; return out.length; }`,
            returnByValue: true,
          }).catch(() => ({ result: { value: 0 } }));
          for (let a = 0; a < (anc.result.value || 0) && !anyHandler; a++) {
            const h2 = await send('Runtime.evaluate', { expression: `window.__aunAnc[${a}]` }).catch(() => ({ result: {} }));
            if (!h2.result || !h2.result.objectId) continue;
            try {
              const l2 = await send('DOMDebugger.getEventListeners', { objectId: h2.result.objectId, depth: -1, pierce: true });
              anyHandler = (l2.listeners || []).some((l) => ['click', 'change', 'submit'].includes(l.type));
            } catch (e) { /* none */ }
            await send('Runtime.releaseObject', { objectId: h2.result.objectId }).catch(() => {});
          }
        }
        excluded.push({ page: file, wired: anyHandler, ...v });
        if (!anyHandler) { pageDead.push(v); dead.push({ page: file, ...v, label: v.label + ' [not clicked, and nothing listens]' }); }
      } else if (!listeners && !v.native && !clicked) {
        pageDead.push(v);
        dead.push({ page: file, ...v });
      }
      await send('Runtime.releaseObject', { objectId }).catch(() => {});
    }
    }   /* every reveal state */

    totalControls += pageCount;
    check(file, `every one of its ${pageCount} controls does something`,
      pageDead.length === 0,
      pageDead.length ? pageDead.map((d) => `${d.tag} "${d.label}"`).join(' | ').slice(0, 110)
                      : `${pageCount} controls`);
  }

  section('SUMMARY');
  check('all', 'no control anywhere is bound to nothing', dead.length === 0,
    `${totalControls} kinds of control examined, ${dead.length} dead, `
    + `${excluded.length} not clicked by design, ${stale.length} re-rendered mid-sweep`);

  console.log(lines.join('\n'));
  console.log('\n' + '='.repeat(78));
  console.log(`  ${pass} passed, ${fail} failed, ${pass + fail} total — ${totalControls} controls examined`);
  console.log('='.repeat(78));
  if (excluded.length) {
    console.log(`\n${excluded.length} controls were deliberately not clicked (they delete, publish,`);
    console.log('restore, upload, save or sign out). Their wiring is read, never exercised:\n');
    const unwired = excluded.filter((e) => !e.wired);
    excluded.forEach((e) => console.log(`  ${e.wired ? '✓ wired' : '✗ NOTHING LISTENS'}  ${e.page.padEnd(16)} ${e.skip}`));
    console.log(`\n  ${excluded.length - unwired.length} of ${excluded.length} have a handler; `
      + `${unwired.length} do not.`);
  }
  if (dead.length) {
    console.log('\nControls bound to nothing:\n');
    dead.forEach((d) => {
      console.log(`  ${d.page}  <${d.tag.toLowerCase()}> "${d.label}"`);
      console.log(`      ${d.outer}`);
    });
  }
  try { sock.close(); } catch (e) { /* gone */ }
  chrome.kill();
  fs.rmSync(userDir, { recursive: true, force: true });
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
