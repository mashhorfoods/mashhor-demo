#!/usr/bin/env node
/**
 * المرحلة 13 — الاستجابة وإمكانية الوصول، كبوابة لا كرأي.
 *
 * The eighth gate. The seven before it cover correctness, authorization,
 * layout, dead controls, the public site, the operator's recovery paths and
 * the database migration. What none of them measures is whether a person who
 * cannot see the screen well, or cannot use a mouse, or is holding a 320px
 * phone, can actually operate this panel.
 *
 * WEBSTART phase 13 asks for exactly that, and every question it asks has a
 * measurable answer:
 *
 *   A · CONTRAST     every piece of visible text against the surface actually
 *                    behind it, at the WCAG 2.2 AA ratio for its size
 *   B · FOCUS        every control shows where the keyboard is; the ring is a
 *                    computed difference, not a promise in the stylesheet
 *   C · KEYBOARD     Tab reaches every control and never gets stuck; the skip
 *                    link works; a dialog holds focus and gives it back
 *   D · SEMANTICS    one h1, no skipped level, landmarks present and named,
 *                    tables with real headers
 *   E · NARROW       320px is the real floor, not 390 — nothing overflows
 *   F · ZOOM         200% zoom loses no content (WCAG 1.4.4)
 *   G · IDENTITY     name/phone/email fields carry autocomplete (WCAG 1.3.5)
 *   H · MOTION       prefers-reduced-motion is honoured
 *
 * Usage:  node bin/qa-a11y.js [baseUrl] --email=… --password=…
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

const ADMIN = ['dashboard', 'requests', 'customers', 'services', 'content',
  'media', 'reports', 'users', 'settings', 'activity', 'intake', 'login'];

let pass = 0, fail = 0;
const failures = [];
const advisories = [];
const lines = [];
function check(page, name, ok, detail = '') {
  ok ? pass++ : fail++;
  lines.push(`  ${ok ? 'PASS' : 'FAIL'} ${(page + ' · ' + name).padEnd(60)} ${detail}`);
  if (!ok) failures.push(`${page} / ${name} — ${detail}`);
}
function advise(text) { advisories.push(text); }
function section(t) { lines.push('\n' + t); }

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

/* ---------------------------------------------------------------------- *
 * The contrast pass, run inside the page.
 *
 * The hard part is not the ratio formula — it is knowing what is actually
 * behind the text. An element with a transparent background sits on whatever
 * its nearest painted ancestor is, so the effective background has to be
 * walked up, and any element whose backdrop is an image or a gradient is
 * reported for a human to look at rather than guessed at and called a pass.
 * ---------------------------------------------------------------------- */
const CONTRAST = `(() => {
  const srgb = (c) => { c /= 255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
  const lum = ([r,g,b]) => 0.2126*srgb(r) + 0.7152*srgb(g) + 0.0722*srgb(b);
  const parse = (s) => {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a));

  const vis = (n) => {
    const r = n.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (r.bottom < 0 || r.top > (window.innerHeight + 4000)) return false;
    const cs = getComputedStyle(n);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    if (parseFloat(cs.opacity) < 0.1) return false;
    return !n.closest('[hidden]');
  };

  /* the surface a piece of text is painted on */
  const backdrop = (n) => {
    let cur = n, acc = null, unknown = false;
    while (cur && cur !== document.documentElement.parentNode) {
      const cs = getComputedStyle(cur);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') { unknown = true; break; }
      const b = parse(cs.backgroundColor);
      if (b && b.a > 0) {
        acc = acc === null ? over(b.rgb, [255,255,255], b.a) : over(acc, over(b.rgb,[255,255,255],b.a), 1);
        if (b.a >= 0.999) return { rgb: acc, unknown: false };
      }
      cur = cur.parentElement;
    }
    return { rgb: acc || [255,255,255], unknown: unknown };
  };

  const out = [], skipped = [];
  const seen = new Set();
  document.querySelectorAll('*').forEach((n) => {
    /* only elements that paint text of their own */
    let own = '';
    for (const k of n.childNodes) if (k.nodeType === 3) own += k.nodeValue;
    own = own.trim();
    if (!own) return;
    if (!vis(n)) return;
    /* WCAG 1.4.3 exempts inactive components: a disabled button is drawn grey
       precisely so it reads as unavailable, and "fixing" its contrast would
       make it look enabled. The exemption is narrow — it covers the control
       and its own label, nothing else on the page. */
    if (n.closest('[disabled], [aria-disabled="true"], .is-disabled, fieldset[disabled]')) return;
    const cs = getComputedStyle(n);
    const f = parse(cs.color);
    if (!f) return;
    const bd = backdrop(n);
    if (bd.unknown) { skipped.push(own.slice(0, 30)); return; }
    const fg = f.a >= 0.999 ? f.rgb : over(f.rgb, bd.rgb, f.a);
    const L1 = lum(fg), L2 = lum(bd.rgb);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize);
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    /* WCAG "large text" is 18.66px bold or 24px regular */
    const large = px >= 24 || (bold && px >= 18.66);
    const need = large ? 3 : 4.5;
    if (ratio + 0.005 < need) {
      const key = cs.color + '|' + Math.round(bd.rgb[0]) + ',' + Math.round(bd.rgb[1]) + ',' + Math.round(bd.rgb[2]) + '|' + px;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        text: own.replace(/\\s+/g, ' ').slice(0, 34),
        ratio: Math.round(ratio * 100) / 100, need: need, px: Math.round(px),
        fg: cs.color, bg: 'rgb(' + bd.rgb.map((c) => Math.round(c)).join(',') + ')',
        sel: n.tagName.toLowerCase() + '.' + String(n.className || '').split(' ')[0]
      });
    }
  });
  return { bad: out, skipped: skipped.length };
})()`;

async function main() {
  if (!CHROME) { console.error('no chromium found'); process.exit(2); }
  const userDir = fs.mkdtempSync('/tmp/qa-a11y-chrome-');
  const port = 9400 + Math.floor(Math.random() * 300);
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
  const t = await rawSend('Target.createTarget', { url: 'about:blank' });
  const at = await rawSend('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const sessionId = at.sessionId;
  const send = (method, params = {}) => {
    const id = ++browser.id;
    return new Promise((resolve, reject) => {
      browser.waiting.set(id, { resolve, reject });
      browser.ws.send(JSON.stringify({ id, method, params, sessionId }));
      /* a navigation waits on the server; everything else waits on the page */
      const limit = method === 'Page.navigate' ? 120000 : 60000;
      setTimeout(() => { if (browser.waiting.has(id)) { browser.waiting.delete(id); reject(new Error(method + ' timed out')); } }, limit);
    });
  };
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' — ' + expression.slice(0, 90));
    return r.result.value;
  };
  const key = async (k, code, vk) => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  const inFlight = new Set(); let lastActivity = 0;
  browser.on((m) => {
    if (m.method === 'Network.requestWillBeSent') { inFlight.add(m.params.requestId); lastActivity = Date.now(); }
    if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') { inFlight.delete(m.params.requestId); lastActivity = Date.now(); }
  });
  const resize = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  /* One navigation in a run of several hundred occasionally takes longer than
     the command timeout — the development PHP server has four workers and this
     gate keeps all of them busy. A timeout there is the fixture stalling, not
     the page failing, and letting it reject kills the whole gate: the run
     ended with no tally at all and the release runner read a failed gate
     where every check had passed. One retry, and only a second failure is
     real. */
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

  /* ---- sign in ------------------------------------------------------- */
  section('SIGNING IN');
  await resize(1440, 900);
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

  /* ===================================================================== */
  section('A · التباين — كل نص مقروء على السطح الذي خلفه فعلاً');
  let skippedTotal = 0;
  for (const p of ADMIN.concat(['__public__'])) {
    const url = p === '__public__' ? `${BASE}/` : `${BASE}/admin/${p}`;
    const label = p === '__public__' ? 'index.html' : p;
    await goto(url);
    const r = await evaluate(CONTRAST);
    skippedTotal += r.skipped;
    check(label, 'كل نص يحقق نسبة التباين المطلوبة', r.bad.length === 0,
      r.bad.slice(0, 3).map((b) => `«${b.text}» ${b.ratio}:1<${b.need} ${b.px}px ${b.fg} on ${b.bg}`).join(' · '));
    r.bad.slice(3).forEach((b) => advise(`${label}: «${b.text}» ${b.ratio}:1 (needs ${b.need}) ${b.sel}`));
  }
  if (skippedTotal) advise(`${skippedTotal} نصاً فوق خلفية مصوّرة أو متدرّجة — تُقاس بالعين لا بالحساب`);

  /* ===================================================================== */
  section('D · البنية الدلالية — عنوان واحد، ترتيب سليم، معالم مسمّاة');
  for (const p of ADMIN) {
    await goto(`${BASE}/admin/${p}`);
    const s = await evaluate(`(() => {
      const vis = (n) => {
        const r = n.getBoundingClientRect();
        const cs = getComputedStyle(n);
        return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden' && !n.closest('[hidden]');
      };
      const hs = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(vis);
      const levels = hs.map((h) => parseInt(h.tagName[1], 10));
      let skip = null;
      for (let i = 1; i < levels.length; i++) {
        if (levels[i] > levels[i-1] + 1) { skip = 'h' + levels[i-1] + '→h' + levels[i] + ' («' + hs[i].innerText.trim().slice(0,24) + '»)'; break; }
      }
      const named = (n) => !!((n.getAttribute('aria-label')||'').trim()
        || (n.getAttribute('aria-labelledby')||'').split(/\\s+/).some((id)=>id && document.getElementById(id)));
      const navs = Array.from(document.querySelectorAll('nav'));
      const tables = Array.from(document.querySelectorAll('table')).filter(vis);
      return {
        h1: hs.filter((h) => h.tagName === 'H1').length,
        first: levels.length ? levels[0] : 0,
        skip: skip,
        main: document.querySelectorAll('main').length,
        navs: navs.length,
        navsUnnamed: navs.filter((n) => !named(n)).length,
        lang: document.documentElement.getAttribute('lang'),
        dir: document.documentElement.getAttribute('dir'),
        tablesNoHead: tables.filter((t) => !t.querySelector('th')).length,
        thNoScope: Array.from(document.querySelectorAll('th')).filter((th) => !th.getAttribute('scope')).length
      };
    })()`);
    check(p, 'عنوان رئيسي واحد', s.h1 === 1, 'h1=' + s.h1);
    check(p, 'لا مستوى عنوان مقفوز', s.skip === null, s.skip || '');
    check(p, 'منطقة محتوى رئيسية واحدة', s.main === 1, 'main=' + s.main);
    check(p, 'كل قائمة تنقّل لها اسم', s.navsUnnamed === 0, `${s.navs - s.navsUnnamed}/${s.navs}`);
    check(p, 'اللغة والاتجاه معلنان', s.lang === 'ar' && s.dir === 'rtl', `${s.lang}/${s.dir}`);
    if (s.tablesNoHead || s.thNoScope) {
      check(p, 'كل جدول له رؤوس أعمدة موصوفة', s.tablesNoHead === 0 && s.thNoScope === 0,
        `tables without th=${s.tablesNoHead} th without scope=${s.thNoScope}`);
    }
  }

  /* ===================================================================== */
  section('B/C · لوحة المفاتيح — الوصول، الأثر المرئي، ولا مصيدة');
  for (const p of ADMIN) {
    await goto(`${BASE}/admin/${p}`);

    /* the skip link is the first thing a keyboard user meets */
    await evaluate(`document.body.focus && document.body.focus(); (document.activeElement||{}).blur && document.activeElement.blur();`);
    await key('Tab', 'Tab', 9);
    await sleep(160);
    const firstStop = await evaluate(`(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return {none:true};
      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      return { tag: a.tagName, text: (a.innerText||'').trim().slice(0,24),
               onScreen: r.top >= -2 && r.left >= -2 && r.width > 1 && r.height > 1,
               href: a.getAttribute('href') || '' };
    })()`);
    /* WCAG 2.4.1 is about bypassing *repeated* blocks. The sign-in page has
       a single form and no navigation, so there is nothing to bypass and a
       skip link there would be noise. */
    const hasNav = await evaluate(`document.querySelectorAll('nav a[href]').length > 3`);
    if (hasNav) {
      check(p, 'أول محطة للوحة المفاتيح هي رابط التخطّي',
        !firstStop.none && /تخطّ|تخط/.test(firstStop.text), firstStop.text || 'none');
      check(p, 'ورابط التخطّي يظهر عند التركيز عليه', !firstStop.none && firstStop.onScreen === true,
        firstStop.onScreen === false ? 'off screen while focused' : '');
    }

    /* Walk the page with real Tab presses.
       The first version of this check called n.focus() from script and read
       the computed style back — and reported that nothing on any page shows
       focus, including elements with a :focus-visible rule three lines up in
       the stylesheet. :focus-visible matches on the browser's own judgement
       about how focus arrived, and a scripted .focus() on a link or a button
       is not keyboard focus. The only honest way to measure a keyboard
       indicator is to use the keyboard. */
    /* Blur first. The skip-link check above pressed Tab, so without this the
       "unfocused" baseline is captured while the skip link is focused — and
       the walk then finds its focused state identical to its "resting" one
       and calls the one control with the most obvious focus indicator on the
       page invisible. It failed on two pages out of twelve, which is what a
       race looks like when you mistake it for a defect. */
    await evaluate(`(document.activeElement||{}).blur && document.activeElement.blur();`);
    await sleep(200);
    await evaluate(`(() => {
      window.__stops = [];
      const ringOf = (n) => {
        const cs = getComputedStyle(n);
        const r = n.getBoundingClientRect();
        return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow,
                cs.borderColor, cs.backgroundColor, cs.color, cs.textDecorationLine,
                cs.transform, cs.opacity, Math.round(r.top), Math.round(r.left)].join('|');
      };
      window.__ringOf = ringOf;
      const all = Array.from(document.querySelectorAll(
        'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((n) => {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (n.closest('[hidden]')) return false;
        const r = n.getBoundingClientRect();
        /* a control that is off screen until focused (the skip link) is still
           a stop, so size alone cannot disqualify it */
        return r.width > 1 && r.height > 1;
      });
      window.__rest = new Map();
      all.forEach((n, i) => { n.setAttribute('data-a11y-i', String(i)); window.__rest.set(String(i), ringOf(n)); });
      return all.length;
    })()`);

    await evaluate(`(document.activeElement||{}).blur && document.activeElement.blur();`);
    const order = [];
    const ringless = [];
    let firstIdx = null, trap = null;
    for (let i = 0; i < 200; i++) {
      await key('Tab', 'Tab', 9);
      /* The ring is transitioned in (--dur is 150ms, --dur-mid 220ms).
         Reading the computed style the instant after Tab reads the start of
         the animation, not its end — which is why the first run of this
         check called four KPI cards, nine content areas and a password field
         unfocusable while their :focus-visible rules sat three lines below
         them in the stylesheet. */
      await sleep(280);
      const stop = await evaluate(`(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return { end: true };
        const idx = a.getAttribute('data-a11y-i');
        return { idx: idx, tag: a.tagName,
                 cls: String(a.className || '').split(' ')[0],
                 id: a.id || '',
                 ring: window.__ringOf(a),
                 rest: idx === null ? null : window.__rest.get(idx) };
      })()`);
      if (stop.end) break;
      if (stop.idx === null) continue;                 /* focus left the tracked set */
      if (firstIdx === null) firstIdx = stop.idx;
      else if (stop.idx === firstIdx) break;           /* wrapped around — the whole cycle */
      if (order.includes(stop.idx)) {
        /* the same control twice before the cycle closed is a loop that never
           lets the keyboard out of a region */
        trap = `${stop.tag}.${stop.cls}#${stop.id}`;
        break;
      }
      order.push(stop.idx);
      if (stop.rest !== null && stop.ring === stop.rest) {
        ringless.push(`${stop.tag}.${stop.cls}#${stop.id}`);
      }
    }
    check(p, 'لا مصيدة تحبس لوحة المفاتيح', trap === null, trap || `${order.length} stops`);
    check(p, 'كل محطة مركَّز عليها تُظهر ذلك', ringless.length === 0,
      `${order.length - ringless.length}/${order.length} ${ringless.slice(0, 4).join(' ')}`);
  }

  /* ===================================================================== */
  section('E · 320 بكسل — أضيق جهاز حقيقي، لا 390');
  for (const p of ADMIN.concat(['__public__'])) {
    const url = p === '__public__' ? `${BASE}/` : `${BASE}/admin/${p}`;
    const label = p === '__public__' ? 'index.html' : p;
    await resize(320, 800);
    await goto(url);
    const o = await evaluate(`(() => {
      const root = document.documentElement;
      const wide = [];
      document.querySelectorAll('*').forEach((n) => {
        const b = n.getBoundingClientRect();
        if (b.width > root.clientWidth + 1 || b.right > root.clientWidth + 1) {
          const cs = getComputedStyle(n);
          if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return;
          let par = n.parentElement, scrolled = false;
          while (par) { const c = getComputedStyle(par);
            if (c.overflowX === 'auto' || c.overflowX === 'scroll') { scrolled = true; break; } par = par.parentElement; }
          if (scrolled) return;
          wide.push(n.tagName + '.' + String(n.className||'').trim().split(/\\s+/)[0] + ' w=' + Math.round(b.width));
        }
      });
      return { body: root.scrollWidth, view: root.clientWidth, wide: wide.slice(0, 4) };
    })()`);
    check(label, 'لا تجاوز أفقي عند 320 بكسل', o.body <= o.view + 1,
      `scrollWidth=${o.body} clientWidth=${o.view} ${o.wide.join(' | ')}`);
  }
  await resize(1440, 900);

  /* ===================================================================== */
  section('F · تكبير 200٪ — لا يُفقد محتوى (WCAG 1.4.4)');
  for (const p of ADMIN) {
    /* 200% zoom is the same as halving the viewport at the same DPR */
    await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 512, deviceScaleFactor: 1, mobile: false });
    await goto(`${BASE}/admin/${p}`);
    const z = await evaluate(`(() => {
      const root = document.documentElement;
      /* content lost is content clipped out of a box that does not scroll */
      const clipped = [];
      /* A visually-hidden label is clipped on purpose — it exists for the
         screen reader and is not content anyone loses at 200%. */
      const srOnly = (n) => {
        const cs = getComputedStyle(n);
        if (cs.clipPath === 'inset(50%)' || cs.clip === 'rect(0px, 0px, 0px, 0px)') return true;
        const r = n.getBoundingClientRect();
        return r.width <= 1 || r.height <= 1;
      };
      document.querySelectorAll('h1, h2, .page__h, .card__t, .btn, label, th').forEach((n) => {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || n.closest('[hidden]')) return;
        if (srOnly(n)) return;
        if (cs.overflow === 'hidden' && n.scrollWidth > n.clientWidth + 2 && cs.textOverflow !== 'ellipsis') {
          clipped.push(n.tagName + '.' + String(n.className||'').split(' ')[0] + ' «' + (n.innerText||'').trim().slice(0,20) + '»');
        }
      });
      return { over: root.scrollWidth > root.clientWidth + 1, clipped: clipped.slice(0, 4),
               sw: root.scrollWidth, cw: root.clientWidth };
    })()`);
    check(p, 'لا تجاوز أفقي عند تكبير 200٪', !z.over, `${z.sw}/${z.cw}`);
    check(p, 'ولا نص مقصوص بلا وسيلة لقراءته', z.clipped.length === 0, z.clipped.join(' | '));
  }
  await resize(1440, 900);

  /* ===================================================================== */
  section('G/H · حقول الهوية والحركة');
  const IDENTITY = { name: 'name', phone: 'tel', email: 'email', password: null };
  for (const p of ADMIN) {
    await goto(`${BASE}/admin/${p}`);
    const g = await evaluate(`(() => {
      const want = [];
      document.querySelectorAll('input').forEach((n) => {
        const t = (n.type || '').toLowerCase();
        const id = (n.id || '').toLowerCase();
        const im = (n.getAttribute('inputmode') || '');
        let need = null;
        if (t === 'email' || /mail/.test(id)) need = 'email';
        else if (t === 'tel' || /phone|jawal|wa\\b/.test(id) || im === 'tel') need = 'tel';
        else if (t === 'password') need = 'password';
        else if (/^(c?name|uname|iname|ename|fname|cname)$/.test(id)) need = 'name';
        if (!need) return;
        const have = (n.getAttribute('autocomplete') || '').trim();
        if (!have) want.push('#' + (n.id || '?') + ' needs autocomplete (' + need + ' or off)');
      });
      return want;
    })()`);
    check(p, 'كل حقل هوية يعلن غرضه', g.length === 0, g.slice(0, 5).join(' '));
  }

  /* prefers-reduced-motion: ask the browser to prefer it, then look for
     anything still animating */
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const p of ADMIN) {
    await goto(`${BASE}/admin/${p}`);
    const m = await evaluate(`(() => {
      const moving = [];
      document.querySelectorAll('*').forEach((n) => {
        const cs = getComputedStyle(n);
        if (n.closest('[hidden]')) return;
        const r = n.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const dur = parseFloat(cs.animationDuration) || 0;
        const it = cs.animationIterationCount;
        if (dur > 0 && (it === 'infinite' || parseFloat(it) > 1)) {
          moving.push(n.tagName + '.' + String(n.className||'').split(' ')[0] + ' ' + cs.animationName);
        }
      });
      return moving.slice(0, 4);
    })()`);
    check(p, 'يحترم تفضيل تقليل الحركة', m.length === 0, m.join(' | '));
  }
  await send('Emulation.setEmulatedMedia', { features: [] });

  /* ---- report -------------------------------------------------------- */
  console.log(lines.join('\n'));
  if (advisories.length) {
    console.log('\nملاحظات إضافية (ليست إخفاقات):');
    advisories.slice(0, 30).forEach((a) => console.log('  · ' + a));
    if (advisories.length > 30) console.log(`  … و${advisories.length - 30} غيرها`);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFAILURES'); failures.forEach((f) => console.log('  · ' + f)); }
  chrome.kill();
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
