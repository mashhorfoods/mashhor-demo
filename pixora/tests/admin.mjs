// End-to-end check of /admin/. Self-contained: copies the site to a temp
// folder, gives that copy a throwaway test password, starts PHP's built-in
// server on it, sends real requests through lead.php, then drives the admin.
//
//   node pixora/tests/admin.mjs        (CHROMIUM=/path/to/chrome if needed)
import { chromium } from 'playwright';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const work = mkdtempSync(path.join(tmpdir(), 'pixora-admin-'));
const site = path.join(work, 'site');
cpSync(path.join(here, '..', 'site'), site, { recursive: true });

const PASSWORD = `test-${Math.random().toString(36).slice(2)}-pw`;
const hash = execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', PASSWORD]).toString();
const configPath = path.join(site, 'admin', 'config.php');
const config = readFileSync(configPath, 'utf8');

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  — ${extra}` : ''}`);
  if (!ok) failures += 1;
};

const PORT = 8097;
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', site, path.join(here, 'router.php')], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

try {
  /* ---- 1. Before a password exists: setup screen, nothing saved ----------- */
  {
    const page = await browser.newPage();
    await page.goto(`${BASE}/admin/`);
    check(await page.locator('h1').textContent() === 'إعداد لوحة الطلبات', 'no password yet → setup screen');
    await page.fill('#pw', 'short');
    await page.fill('#pw2', 'short');
    await page.click('button[type=submit]');
    check(await page.locator('#pw').evaluate((el) => !el.validity.valid) || /10/.test(await page.content()), 'short password refused');
    await page.fill('#pw', 'a-long-enough-password');
    await page.fill('#pw2', 'a-long-enough-password');
    await page.click('button[type=submit]');
    const line = await page.locator('.a-code').textContent();
    check(/^const ADMIN_PASSWORD_HASH = '\$2y\$/.test(line), 'setup shows a config line with a bcrypt hash', line.slice(0, 40));
    check(readFileSync(configPath, 'utf8') === config, 'setup saves nothing on the server');
    await page.close();
  }

  // The owner pastes the line — simulated for the test copy only.
  writeFileSync(configPath, config.replace("const ADMIN_PASSWORD_HASH = '';", () => `const ADMIN_PASSWORD_HASH = '${hash}';`));
  if (!readFileSync(configPath, 'utf8').includes(hash)) throw new Error('test setup: hash not written');
  // PHP's opcache re-reads a changed file after revalidate_freq (2 s by default).
  await new Promise((r) => setTimeout(r, 3500));

  /* ---- 2. Some real requests through lead.php ----------------------------- */
  const post = (form) => fetch(`${BASE}/lead.php`, { method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams(form) });
  await post({ name: 'سارة', whatsapp: '+966501234567', location: 'الرياض', service: 'websites', note: 'متجر عطور',
    t_source: 'snapchat', t_campaign: 'launch-q4', t_path: 'portfolio>contact', t_device: 'mobile', t_ref: 'PX-ABCDE' });
  await post({ name: 'Omar', whatsapp: '+971501234567', location: 'دبي', service: 'social',
    t_source: 'instagram', t_campaign: 'launch-q4', t_path: 'contact', t_device: 'desktop', t_ref: 'PX-FGHJK' });
  await post({ name: '=HYPERLINK("x")', whatsapp: '+97455512345', location: 'الدوحة', service: 'branding', t_source: 'tiktok' });

  /* ---- 3. Sign in ------------------------------------------------------------ */
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/admin/`);
  const gateTitle = await page.locator('h1').textContent();
  check(gateTitle === 'لوحة الطلبات', 'password set → sign-in screen', gateTitle);
  let res = await fetch(`${BASE}/admin/`);
  check(!(await res.text()).includes('سارة'), 'no request data without signing in');

  await page.fill('#pw', 'wrong-password');
  await page.click('button[type=submit]');
  check(await page.locator('.a-error').textContent() === 'كلمة المرور غير صحيحة.', 'wrong password refused');

  await page.fill('#pw', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForSelector('.a-list');
  check(await page.locator('.a-lead').count() === 3, 'all three requests listed');
  check((await page.locator('.a-lead__name').first().textContent()).includes('HYPERLINK'), 'newest first; formula guard undone for display');
  check(await page.locator('.a-stat').first().locator('b').textContent() === '3', 'total count');
  const cookie = (await context.cookies()).find((c) => c.name === 'pixora_admin');
  check(cookie?.httpOnly && cookie?.sameSite === 'Strict', 'session cookie is HttpOnly + SameSite=Strict');

  /* ---- 4. Lead actions -------------------------------------------------------- */
  const sara = page.locator('.a-lead', { hasText: 'سارة' });
  const wa = await sara.locator('a', { hasText: 'رد على واتساب' }).getAttribute('href');
  check(wa.startsWith('https://wa.me/966501234567?text=') && decodeURIComponent(wa).includes('مرحبًا سارة') && decodeURIComponent(wa).includes('المواقع الإلكترونية'),
    'WhatsApp reply goes to the customer with a greeting');
  check((await sara.textContent()).includes('سناب شات') && (await sara.textContent()).includes('الأعمال ← التواصل') && (await sara.textContent()).includes('PX-ABCDE'),
    'source, path and reference shown');

  await sara.locator('textarea').fill('اتصلت بها — تنتظر عرض السعر');
  await sara.locator('button', { hasText: 'حفظ' }).click();
  await page.waitForSelector('.a-flash');
  await page.locator('.a-lead', { hasText: 'سارة' }).locator('select').selectOption('contacted'); // auto-saves via admin.js
  await page.waitForLoadState('load');
  await page.waitForTimeout(300);
  const saraNow = page.locator('.a-lead', { hasText: 'سارة' });
  check(await saraNow.locator('select').inputValue() === 'contacted', 'status saved (auto-submit on change)');
  check(await saraNow.locator('textarea').inputValue() === 'اتصلت بها — تنتظر عرض السعر', 'internal note saved');
  check(await page.locator('.a-stat--accent b').textContent() === '2', 'waiting count drops to 2');

  /* ---- 5. Filters, search, export ---------------------------------------------- */
  await page.goto(`${BASE}/admin/?source=instagram`);
  check(await page.locator('.a-lead').count() === 1 && (await page.locator('.a-lead__name').textContent()) === 'Omar', 'filter by source');
  await page.goto(`${BASE}/admin/?status=contacted`);
  check(await page.locator('.a-lead').count() === 1, 'filter by status');
  await page.goto(`${BASE}/admin/?q=${encodeURIComponent('الدوحة')}`);
  check(await page.locator('.a-lead').count() === 1, 'search by city');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=تصدير Excel')]);
  const csv = readFileSync(await download.path(), 'utf8');
  check(csv.startsWith('﻿') && csv.includes('الدوحة') && !csv.includes('سارة'), 'export follows the current filter, with BOM');
  check(csv.includes("'=HYPERLINK"), 'export guards formula cells');

  /* ---- 6. Protections --------------------------------------------------------- */
  const sid = cookie.value;
  res = await fetch(`${BASE}/admin/`, { method: 'POST', headers: { Cookie: `pixora_admin=${sid}` },
    body: new URLSearchParams({ action: 'update', id: '000000000000', status: 'won', csrf: 'forged' }) });
  check(res.status === 400, 'change without the CSRF token refused', String(res.status));
  res = await fetch(`${BASE}/admin/config.php`);
  check(!(await res.text()).includes('$2y$'), 'config.php never reveals the hash');

  await page.goto(`${BASE}/admin/`);
  await page.click('button:has-text("خروج")');
  check(await page.locator('#pw').count() === 1, 'sign out returns to the sign-in screen');
  await page.goto(`${BASE}/admin/?source=instagram`);
  check(!(await page.content()).includes('Omar'), 'signed out → no data');

  const fresh = await browser.newPage();
  await fresh.goto(`${BASE}/admin/`);
  for (let i = 0; i < 5; i += 1) {
    await fresh.fill('#pw', `nope-${i}`);
    await fresh.click('button[type=submit]');
  }
  await fresh.fill('#pw', PASSWORD);
  await fresh.click('button[type=submit]');
  check((await fresh.locator('.a-error').textContent()).includes('محاولات كثيرة'), 'lockout after repeated wrong passwords (even with the right one)');
  check(errors.length === 0, 'no script errors', errors.join('; '));
} finally {
  await browser.close();
  server.kill();
  rmSync(work, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
