#!/usr/bin/env node
/* =============================================================================
   Launch check — the live site, checked the way a visitor and a browser meet it.

   Run it after every upload:

     node tools/launch_check.mjs                          (https://zaokalyamamah.online)
     node tools/launch_check.mjs https://example.com      (another address)
     node tools/launch_check.mjs --send-test-lead         (also sends one real
                                                           test message through
                                                           the contact form)

   One line per check, ✓ or ✗, and for each ✗ what to do. Exit code 1 if any
   check fails. Nothing is changed on the server, except with --send-test-lead
   (one message named "Launch check", to delete from the admin page after).

   For a local server behind no proxy: --header "X-Forwarded-Proto: https"
   (the HTTPS rule accepts it, as it does behind Hostinger's proxy) and
   --skip-https. Needs Node 18+ (fetch), nothing else.
   ============================================================================= */
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const BASE = (args.find((a) => /^https?:\/\//.test(a)) || 'https://zaokalyamamah.online').replace(/\/$/, '');
const extra = {};
for (let i = 0; i < args.length; i++) if (args[i] === '--header') { const [k, ...v] = args[i + 1].split(':'); extra[k.trim()] = v.join(':').trim(); }
const SKIP_HTTPS = flag('--skip-https') || BASE.startsWith('http://');

let failed = 0;
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };
const bad = (name, fix, detail = '') => { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}\n      ← ${fix}`); };
const check = (cond, name, fix, detail) => (cond ? ok(name) : bad(name, fix, detail));
const section = (title) => console.log(`\n${title}`);

const get = async (url, init = {}) => {
  try {
    return await fetch(url.startsWith('http') ? url : BASE + url, { redirect: 'manual', ...init, headers: { 'Accept-Encoding': 'br, gzip', ...extra, ...(init.headers || {}) } });
  } catch (e) {
    return { status: 0, headers: new Headers(), text: async () => '', error: e };
  }
};
const where = (res) => (res.headers.get('location') || '').replace(BASE, '');
const sha = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
const inlineScripts = (html) => [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

console.log(`Launch check — ${BASE}`);

/* ---- 1. Reaching the site ------------------------------------------------- */
section('1. الوصول إلى الموقع — reaching the site');
const home = await get('/');
check(home.status === 200, 'the homepage opens (200)', 'تأكد أن الملفات رُفعت إلى public_html وأن النطاق يشير إلى الاستضافة.', `status ${home.status}${home.error ? ' ' + home.error.message : ''}`);
if (home.status !== 200) { console.log('\nThe homepage does not open; the other checks would only repeat that. Stopping here.'); process.exit(1); }
const homeHtml = await home.text();
if (!SKIP_HTTPS) {
  const http = await get(BASE.replace(/^https:/, 'http:') + '/');
  check(http.status === 301 && (http.headers.get('location') || '').startsWith('https://'), 'http:// is sent to https:// (301)',
    'فعّل شهادة SSL من hPanel (الأمان ← SSL)؛ قاعدة التحويل موجودة في .htaccess.', `status ${http.status} → ${http.headers.get('location') || '—'}`);
}

/* ---- 2. Every page in the sitemap ----------------------------------------- */
section('2. الصفحات — every page in the sitemap');
const robots = await get('/robots.txt');
const robotsText = robots.status === 200 ? await robots.text() : '';
check(/Sitemap:\s*https?:\/\/\S+\/sitemap\.xml/.test(robotsText) && /Disallow:\s*\/admin\//.test(robotsText), 'robots.txt names the sitemap and closes /admin/',
  'ارفع robots.txt من الحزمة كما هو.');
const sitemap = await get('/sitemap.xml');
const locs = sitemap.status === 200 ? [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]) : [];
check(locs.length >= 15, `sitemap.xml lists the pages (${locs.length})`, 'ارفع sitemap.xml من الحزمة.');
const pages = [];
for (const loc of locs) {
  const u = new URL(loc);
  const res = await get(u.pathname);
  const html = res.status === 200 ? await res.text() : '';
  pages.push({ path: u.pathname, res, html });
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  const problems = [];
  if (res.status !== 200) problems.push(`status ${res.status}`);
  if (canonical !== loc) problems.push(`canonical ${canonical || 'missing'}`);
  if (/<meta name="robots" content="[^"]*noindex/.test(html)) problems.push('noindex');
  if (!/<title>[^<]{10,}<\/title>/.test(html)) problems.push('no title');
  check(problems.length === 0, `${u.pathname}`, 'أعد رفع الحزمة كاملة من آخر تشغيل ناجح.', problems.join(', '));
}
const go = await get('/go');
const goHtml = go.status === 200 ? await go.text() : '';
check(go.status === 200 && /<meta name="robots" content="noindex/.test(goHtml), '/go opens and stays out of search (noindex)', 'ارفع go.html من الحزمة.', `status ${go.status}`);
pages.push({ path: '/go', res: go, html: goHtml });

/* ---- 3. Scripts allowed to run -------------------------------------------- */
section('3. السكربتات — every inline script is allowed by the security policy');
const csp = home.headers.get('content-security-policy') || '';
if (!csp) {
  bad('Content-Security-Policy is sent', 'ارفع .htaccess من الحزمة نفسها التي رفعت منها الصفحات (mod_headers مطلوب).');
} else {
  const missing = [];
  for (const { path, html } of pages) for (const body of inlineScripts(html)) if (!csp.includes(sha(body))) missing.push(path);
  check(missing.length === 0, 'the pages and .htaccess come from the same build (script hashes match)',
    'الصفحات و.htaccess من إصدارين مختلفين؛ ارفع الحزمة كاملة مرة واحدة، وإلا توقفت سكربتات الموقع بصمت.', [...new Set(missing)].join(', '));
}

/* ---- 4. Security and caching headers --------------------------------------- */
section('4. رؤوس الأمان والتخزين — security and caching headers');
const h = (name) => home.headers.get(name) || '';
const want = [
  ['strict-transport-security', /max-age=\d{7,}/, 'HSTS'],
  ['x-content-type-options', /nosniff/, 'nosniff'],
  ['referrer-policy', /strict-origin-when-cross-origin/, 'Referrer-Policy'],
  ['permissions-policy', /camera=\(\)/, 'Permissions-Policy'],
  ['cross-origin-opener-policy', /same-origin/, 'Cross-Origin-Opener-Policy'],
  ['x-frame-options', /SAMEORIGIN/i, 'X-Frame-Options'],
  ['content-security-policy', /frame-ancestors 'self'/, 'CSP frame-ancestors'],
];
for (const [name, re, label] of want) {
  if (name === 'strict-transport-security' && SKIP_HTTPS && !h(name)) continue;
  check(re.test(h(name)), label, 'ارفع .htaccess من الحزمة؛ إن بقي ناقصًا فاطلب من دعم Hostinger تفعيل mod_headers.', h(name) || 'missing');
}
check(/no-cache/.test(h('cache-control')), 'pages are always rechecked (Cache-Control: no-cache)', 'ارفع .htaccess من الحزمة؛ وإن استمر فأفرغ ذاكرة LiteSpeed Cache من hPanel.', h('cache-control') || 'missing');
const css = (homeHtml.match(/href="(\/assets\/site\.[a-f0-9]+\.css)"/) || [])[1];
const cssRes = css ? await get(css) : { status: 0, headers: new Headers() };
check(cssRes.status === 200, 'the stylesheet loads', 'أعد رفع مجلد assets كاملًا.', `${css || 'not found in the page'} → ${cssRes.status}`);
const maxAge = Number((cssRes.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 0);
check(maxAge >= 2592000 || /20\d\d/.test(cssRes.headers.get('expires') || ''), 'files are cached long (one year)', 'mod_expires غير مفعّل؛ اطلب من دعم Hostinger تفعيله (الموقع يعمل، لكنه أبطأ في الزيارة الثانية).', cssRes.headers.get('cache-control') || 'none');
check(/br|gzip/.test(cssRes.headers.get('content-encoding') || ''), 'text is compressed (brotli or gzip)', 'اطلب من دعم Hostinger تفعيل الضغط (mod_deflate أو brotli).', cssRes.headers.get('content-encoding') || 'none');

/* ---- 5. Everything the homepage asks for ----------------------------------- */
section('5. الملفات — everything the homepage asks for');
const assets = [...new Set([...homeHtml.matchAll(/(?:src|href)="(\/assets\/[^"#?]+)"/g)].map((m) => m[1]))];
const broken = [];
for (const a of assets) { const r = await get(a, { method: 'HEAD' }); if (r.status !== 200) broken.push(`${a} (${r.status})`); }
check(broken.length === 0, `all ${assets.length} files load`, 'أعد رفع مجلد assets كاملًا من الحزمة.', broken.slice(0, 5).join(', '));
const shareImage = (homeHtml.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
if (shareImage) {
  const r = await get(new URL(shareImage).pathname, { method: 'HEAD' });
  check(r.status === 200, 'the link-preview image loads', 'أعد رفع مجلد assets.', `${shareImage} → ${r.status}`);
}

/* ---- 6. Addresses ----------------------------------------------------------- */
section('6. العناوين — clean addresses, forwarding and the 404 page');
const redirects = [['/pricing.html', '/pricing'], ['/index.html', '/'], ['/work/', '/work'], ['/contact', '/#contact'], ['/portfolio', '/work'],
  ['/work/talk-about-sudan', '/work'], ['/prices', '/pricing'], ['/about-us', '/about']];
for (const [from, to] of redirects) {
  const r = await get(from);
  const dest = where(r).replace(/^https?:\/\/[^/]+/, '');
  check(r.status === 301 && dest === to, `${from} → ${to}`, 'mod_rewrite غير مفعّل أو .htaccess قديم؛ ارفع .htaccess من الحزمة.', `${r.status} → ${dest || '—'}`);
}
const lost = await get(`/launch-check-${Date.now()}`);
const lostHtml = lost.status === 404 ? await lost.text() : '';
check(lost.status === 404 && /c-notfound/.test(lostHtml), 'a missing address shows the 404 page, with status 404', 'ارفع 404.html و.htaccess (ErrorDocument 404).', `status ${lost.status}`);

/* ---- 7. What must stay closed -------------------------------------------------- */
section('7. ما يجب أن يبقى مغلقًا — what must stay closed');
for (const path of ['/_leads/leads.csv', '/_lib/storage.php', '/admin/config.php']) {
  const r = await get(path);
  const body = r.status === 200 ? await r.text() : '';
  check(r.status !== 200 || !/\$2y\$|received_at|<\?php/.test(body), `${path} reveals nothing`, 'ارفع ملفات .htaccess الموجودة داخل _leads و_lib وadmin من الحزمة.', `status ${r.status}`);
}

// The editing panel: open (it is useless without a GitHub token), under its
// own policy, and out of search.
{
  const r = await get('/cms/');
  const csp = r.headers.get('content-security-policy') || '';
  const page = r.status === 200 ? await r.text() : '';
  const script = (page.match(/src="(sveltia-cms-[\d.]+\.js)"/) || [])[1];
  const js = script ? await get(`/cms/${script}`) : { status: 0 };
  const config = await get('/cms/config.yml');
  check(r.status === 200 && js.status === 200 && config.status === 200, '/cms/ (the editing panel) is uploaded',
    'ارفع مجلد cms كاملًا من الحزمة، بما فيه ‎.htaccess.', `page ${r.status}, script ${js.status}, config ${config.status}`);
  check(/connect-src[^;]*api\.github\.com/.test(csp) && /script-src 'self';/.test(csp), '/cms/ has its own security policy (GitHub only)',
    'ارفع cms/.htaccess من الحزمة نفسها.', csp.slice(0, 120));
  check(/noindex/.test(r.headers.get('x-robots-tag') || ''), '/cms/ is kept out of search', 'ارفع cms/.htaccess من الحزمة نفسها.');
}

/* ---- 8. The contact form's server --------------------------------------------- */
section('8. نموذج التواصل — the server behind both forms (lead.php)');
const lg = await get('/lead.php');
const lgBody = await lg.text();
check(!/<\?php/.test(lgBody), 'PHP runs (lead.php is executed, not shown)', 'PHP غير مفعّل على هذا المسار؛ فعّله من hPanel ← PHP، ولا تترك الموقع هكذا: الكود ظاهر.');
check(lg.status === 405, 'lead.php accepts only form posts', 'تأكد أن lead.php رُفع من الحزمة وأن PHP 7.4+ مفعّل.', `GET → ${lg.status}`);
const invalid = await get('/lead.php', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ form: 'site', name: 'x', email: 'not-an-email', message: '' }).toString() });
check(invalid.status === 422, 'lead.php checks what it receives (a bad message is refused)', 'تأكد أن lead.php رُفع من الحزمة الأخيرة.', `status ${invalid.status}`);
if (flag('--send-test-lead')) {
  const sent = await get('/lead.php', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ form: 'site', name: 'Launch check — فحص الإطلاق', email: 'launch-check@example.com', message: 'A test message from tools/launch_check.mjs. Delete it from the admin page.', t_path: 'launch-check' }).toString() });
  const json = sent.status === 200 ? await sent.json().catch(() => ({})) : {};
  check(json.ok === true, 'a test message is held (stored or emailed)', 'الرسالة لم تُحفظ ولم تُرسل: تحقق من صلاحيات الكتابة (مجلد pixora-leads فوق public_html) ومن دالة mail() في hPanel.', `status ${sent.status}`);
  if (json.ok) console.log('      → تحقق الآن: وصلت رسالة "Launch check" إلى بريدك؟ وظهرت في /admin/؟ احذفها بعد التأكد (وافحص مجلد البريد المزعج).');
} else {
  console.log('  · (a real test message: run again with --send-test-lead)');
}

/* ---- Summary --------------------------------------------------------------------- */
console.log(`\n${failed ? '✗' : '✓'} ${passed} passed, ${failed} failed — ${failed ? 'انظر ← تحت كل ✗ لمعرفة ما يجب فعله.' : 'الموقع جاهز.'}`);
process.exit(failed ? 1 : 0);
