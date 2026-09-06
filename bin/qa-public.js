/**
 * The public site, inspected in a real browser.
 *
 * The other gates cover the page's layout, its accessibility and its wording.
 * Two things they never touched:
 *
 *   · the request form — the entire conversion path of this business. The
 *     suite tests POST /api/requests; nobody had ever filled the form in on
 *     the page and pressed the button. A form that silently fails loses leads
 *     and nothing on any dashboard would ever say so.
 *   · what the page tells a search engine and a social card about the
 *     business — the number, the address, the hours — which must agree with
 *     what the page itself shows, or Google publishes a number nobody answers.
 *
 *   node bin/qa-public.js [--base=http://127.0.0.1:8088]
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '--base=http://127.0.0.1:8088').slice(7);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const failed = [], lines = [];
function check(group, name, ok, detail = '') {
  if (ok) pass++; else { fail++; failed.push(`${group} / ${name}${detail ? ' — ' + detail : ''}`); }
  lines.push(`  ${ok ? 'PASS' : 'FAIL'} ${name.padEnd(60)} ${detail}`);
}
function section(t) { lines.push('\n' + t); }

(async () => {
  const userDir = fs.mkdtempSync('/tmp/qa-pub-');
  const port = 9300 + Math.floor(Math.random() * 300);
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let list = null;
  for (let i = 0; i < 60 && !list; i++) {
    await sleep(250);
    try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) { /* not up yet */ }
  }
  if (!list) { console.error('chromium did not start'); process.exit(1); }

  const sock = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const waits = new Map(); const consoleErrors = [];
  await new Promise((r) => { sock.onopen = r; });
  sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(String(m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    }
  };
  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id; waits.set(i, r); sock.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  const goto = async (url, settle = 2200) => {
    consoleErrors.length = 0;
    await send('Page.navigate', { url });
    await sleep(settle);
  };

  /* ================================================================= */
  section('WHAT THE PAGE TELLS A SEARCH ENGINE');
  /* ================================================================= */
  await goto(`${BASE}/`);

  const head = await ev(`(() => {
    const meta = (sel) => { const n = document.querySelector(sel); return n ? n.content : null; };
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => { try { return JSON.parse(s.textContent); } catch (e) { return null; } });
    const biz = ld.filter(Boolean).flatMap((d) => d['@graph'] || [d])
      .find((n) => n && (n['@type'] === 'LocalBusiness' || (Array.isArray(n['@type']) && n['@type'].includes('LocalBusiness'))));
    const dialled = [...document.querySelectorAll('a[href^="tel:"], a[href*="wa.me/"]')]
      .map((a) => a.getAttribute('href').replace(/\\D/g, ''));
    return JSON.stringify({
      title: document.title,
      titleLen: document.title.length,
      desc: meta('meta[name="description"]'),
      descLen: (meta('meta[name="description"]') || '').length,
      canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      robots: meta('meta[name="robots"]'),
      ogTitle: (document.querySelector('meta[property="og:title"]') || {}).content || null,
      ogImage: (document.querySelector('meta[property="og:image"]') || {}).content || null,
      ogUrl: (document.querySelector('meta[property="og:url"]') || {}).content || null,
      twCard: meta('meta[name="twitter:card"]'),
      ldParsed: ld.every(Boolean),
      ldCount: ld.length,
      bizPhone: biz ? String(biz.telephone || '').replace(/\\D/g, '') : null,
      bizName: biz ? biz.name : null,
      bizAddr: biz && biz.address ? biz.address.streetAddress : null,
      bizUrl: biz ? biz.url : null,
      dialled: [...new Set(dialled)],
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
      headingOrder: (() => {
        const ls = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1]);
        const bad = [];
        for (let i = 1; i < ls.length; i++) if (ls[i] - ls[i - 1] > 1) bad.push('h' + ls[i - 1] + '→h' + ls[i]);
        return bad;
      })(),
    });})()`);
  const H = JSON.parse(head);

  check('seo', 'the page declares its language and direction',
    H.lang === 'ar' && H.dir === 'rtl', `lang=${H.lang} dir=${H.dir}`);
  check('seo', 'it has exactly one h1', H.h1.length === 1, H.h1.join(' | ') || 'none');
  check('seo', 'and no heading level is skipped',
    H.headingOrder.length === 0, H.headingOrder.join(', '));
  check('seo', 'the title is a usable length (15–70)',
    H.titleLen >= 15 && H.titleLen <= 70, `${H.titleLen} chars`);
  check('seo', 'the description is a usable length (70–170)',
    H.descLen >= 70 && H.descLen <= 170, `${H.descLen} chars`);
  check('seo', 'it names a canonical address', !!H.canonical, H.canonical || '—');
  check('seo', 'and nothing tells a crawler to stay away',
    !String(H.robots || '').toLowerCase().includes('noindex'), H.robots || 'no robots meta');
  check('seo', 'a social card has a title, an image and an address',
    !!(H.ogTitle && H.ogImage && H.ogUrl) && !!H.twCard);
  check('seo', 'the canonical and og:url are the same address',
    H.canonical === H.ogUrl, `${H.canonical} vs ${H.ogUrl}`);
  check('seo', 'every structured-data block parses',
    H.ldParsed && H.ldCount > 0, `${H.ldCount} block(s)`);

  /* The number a search engine publishes and the number the page dials must
     be the same number. They are edited in different places. */
  check('seo', 'the business described to search engines is this business',
    !!H.bizName && !!H.bizAddr, `${H.bizName} · ${H.bizAddr}`);
  check('seo', 'and the number it publishes is the number the page dials',
    H.dialled.length === 1 && H.bizPhone === H.dialled[0],
    `structured=${H.bizPhone} dialled=${H.dialled.join(', ')}`);

  /* ================================================================= */
  section('THE REQUEST FORM — FILLED IN AND SENT, NOT READ');
  /* ================================================================= */

  const formShape = await ev(`(() => {
    const f = document.getElementById('reqform');
    if (!f) return JSON.stringify({ missing: true });
    const hp = document.getElementById('req-website');
    const cs = hp ? getComputedStyle(hp) : null;
    const opts = [...document.querySelectorAll('#req-service option')]
      .map((o) => o.value).filter(Boolean);
    return JSON.stringify({
      missing: false,
      action: f.getAttribute('action'),
      novalidate: f.hasAttribute('novalidate'),
      honeypotHidden: !!hp && (cs.display === 'none' || cs.visibility === 'hidden'
        || hp.getBoundingClientRect().width < 2 || cs.opacity === '0'
        || hp.closest('[aria-hidden="true"]') !== null),
      honeypotFromAssistive: !!hp && (hp.getAttribute('tabindex') === '-1'
        || hp.closest('[aria-hidden="true"]') !== null),
      services: opts,
    });})()`);
  const F = JSON.parse(formShape);
  check('form', 'the page carries a request form', !F.missing);
  check('form', 'the honeypot is invisible to a person', F.honeypotHidden);
  check('form', 'and out of reach of a keyboard and a screen reader', F.honeypotFromAssistive);

  /* the services offered must be the services that exist */
  const live = await ev(`(async () => {
    const r = await fetch('/api/health'); return r.status; })()`);
  check('form', 'the API answers', live === 200, `status=${live}`);

  /* --- 1 · an empty form is refused, in the page, and sends nothing ---- */
  let sent = 0;
  await send('Network.setRequestInterception', {}).catch(() => {});
  await ev(`window.__posts = 0;
    (function(){ const f = window.fetch;
      window.fetch = function (u, o) {
        if (o && String(o.method).toUpperCase() === 'POST' && String(u).includes('/api/requests')) window.__posts++;
        return f.apply(this, arguments); }; })(); 1`);

  await ev(`document.getElementById('req-send').click(); 1`);
  await sleep(900);
  const empty = await ev(`(() => {
    const shown = [...document.querySelectorAll('[id$="-msg"]')]
      .filter((n) => n.textContent.trim() && !n.hidden && getComputedStyle(n).display !== 'none')
      .map((n) => n.id);
    return JSON.stringify({ shown, posts: window.__posts,
      focus: document.activeElement ? document.activeElement.id : null });})()`);
  const E = JSON.parse(empty);
  check('form', 'an empty form is refused in the page',
    E.shown.length > 0, E.shown.join(', ') || 'no message shown');
  check('form', 'and nothing is sent to the server',
    E.posts === 0, `${E.posts} request(s)`);
  check('form', 'and the first field needing attention takes focus',
    !!E.focus && E.focus.startsWith('req-'), E.focus || 'nothing focused');

  /* --- 2 · a bad number is named as a bad number ----------------------- */
  await ev(`(() => {
    document.getElementById('req-name').value = 'اختبار الفحص';
    document.getElementById('req-phone').value = '123';
    const s = document.getElementById('req-service'); s.selectedIndex = 1;
    document.getElementById('req-from').value = 'حي الياسمين';
    document.getElementById('req-to').value = 'مركز طبي';
    const d = new Date(Date.now() + 172800000).toISOString().slice(0, 10);
    document.getElementById('req-date').value = d;
    return 1; })()`);
  await ev(`document.getElementById('req-send').click(); 1`);
  await sleep(900);
  const badPhone = await ev(`(() => {
    const m = document.getElementById('req-phone-msg');
    return JSON.stringify({ text: m ? m.textContent.trim() : '', posts: window.__posts });})()`);
  const BP = JSON.parse(badPhone);
  check('form', 'a number that is not a number is named as the problem',
    BP.text.length > 0, BP.text.slice(0, 60));
  check('form', 'and still nothing is sent', BP.posts === 0, `${BP.posts} request(s)`);

  /* --- 3 · a real submission reaches the system ------------------------ */
  const phone = '05' + String(Math.floor(10000000 + Math.random() * 89999999));
  await ev(`document.getElementById('req-phone').value = '${phone}'; 1`);
  await ev(`document.getElementById('req-send').click(); 1`);
  await sleep(3000);
  const done = await ev(`(() => {
    const ok = document.getElementById('req-ok');
    const bad = document.getElementById('req-bad');
    const res = document.getElementById('req-result');
    const vis = (n) => !!n && !n.hidden && getComputedStyle(n).display !== 'none'
      && getComputedStyle(n).visibility !== 'hidden';
    /* innerText, not textContent: both alerts live in the DOM at all times and
       textContent reads straight through the hidden one, which made the first
       version of this check report the success and the failure at once. */
    return JSON.stringify({
      posts: window.__posts,
      okShown: vis(ok),
      badShown: vis(bad),
      ref: (document.getElementById('req-ok-id') || {}).textContent || '',
      visibleText: vis(ok) ? ok.innerText.replace(/\\s+/g, ' ').trim().slice(0, 120)
                : (vis(bad) ? bad.innerText.replace(/\\s+/g, ' ').trim().slice(0, 120) : ''),
    });})()`);
  const D = JSON.parse(done);
  check('form', 'a complete form is sent', D.posts === 1, `${D.posts} request(s)`);
  check('form', 'and the visitor is told it arrived', D.okShown, D.visibleText || 'nothing shown');
  check('form', 'and is not told the opposite at the same time',
    !D.badShown, D.badShown ? 'both the success and the failure are on screen' : '');
  check('form', 'and is given the reference to quote',
    /REQ-\d{4}-\d{4}/.test(D.ref), D.ref.trim() || 'no reference shown');

  check('form', 'no console error while all of that happened',
    consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | ').slice(0, 90));

  /* ================================================================= */
  section('THE PAGE A VISITOR REACHES BY MISTAKE');
  /* ================================================================= */
  await goto(`${BASE}/no-such-page`, 1500);
  const nf = await ev(`JSON.stringify({
    title: document.title,
    hasHome: !!document.querySelector('a[href="/"], a[href="index.html"], a[href="./"]'),
    text: document.body.innerText.replace(/\\s+/g,' ').slice(0, 80) })`);
  const NF = JSON.parse(nf);
  check('404', 'a wrong address still shows the brand, not a server default',
    NF.text.length > 10 && !/not found/i.test(NF.title || ''), NF.text.slice(0, 60));
  check('404', 'and offers a way back to the site', NF.hasHome);

  /* ---- clean up after itself ------------------------------------------
     The public form creates a real request, as it should. A gate that leaves
     one behind on every run is not repeatable, and the row would drift every
     count the reports produce. */
  const ref = (D.ref.match(/REQ-\d{4}-\d{4}/) || [])[0];
  if (ref) {
    const { execFileSync } = require('child_process');
    try {
      execFileSync('php', ['-r', `
        define("AUN_APP",1); define("AUN_ROOT", getcwd());
        require "app/Env.php"; Env::load(AUN_ROOT."/.env"); require "app/Db.php";
        $r = Db::all("SELECT id, customer_id FROM requests WHERE ref = ?", ["${ref}"]);
        foreach ($r as $x) {
          Db::run("DELETE FROM request_status_history WHERE request_id = ?", [$x["id"]]);
          Db::run("DELETE FROM request_notes WHERE request_id = ?", [$x["id"]]);
          Db::run("DELETE FROM requests WHERE id = ?", [$x["id"]]);
        }
        Db::run("DELETE FROM customers WHERE id NOT IN (SELECT customer_id FROM requests WHERE customer_id IS NOT NULL)", []);
      `], { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
      check('form', 'and the gate removed the request it created', true, ref);
    } catch (e) {
      check('form', 'and the gate removed the request it created', false, ref + ' — ' + String(e.message).slice(0, 60));
    }
  }

  /* ---- report ---- */
  console.log(lines.join('\n'));
  console.log('\n' + '='.repeat(78));
  console.log(`  ${pass} passed, ${fail} failed, ${pass + fail} total`);
  console.log('='.repeat(78));
  if (failed.length) { console.log('\nFailures:'); failed.forEach((f) => console.log('  - ' + f)); }
  chrome.kill();
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* the profile can linger */ }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
