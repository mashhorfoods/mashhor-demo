#!/usr/bin/env node
// ============================================================================
// DEPLOY — the production deployment process, in order, refusing to continue
// on any failed check. Nothing here contains a secret: every value comes from
// the environment of the deploy job (see .env.example and backend/.env.example).
//
//   node tools/deploy.mjs --plan            print the steps for this configuration
//   node tools/deploy.mjs                   run them
//
// Steps
//   1. validate the public configuration variables (tools/write-env.mjs rules)
//   2. write assets/js/data/env.js WITHOUT any "verified" marks
//   3. backend: configuration check (backend/config.mjs --check) and migrations
//      — when BACKEND_DEPLOY=local; otherwise the backend is deployed by its own
//      pipeline (container image from backend/Dockerfile) and only checked here
//   4. storage / identity / notification delivery / legal documents: the backend
//      configuration check covers what is configured; what is not configured is
//      reported as NOT CONNECTED (never mocked)
//   5. smoke test the deployed backend from the outside (tools/smoke.mjs)
//   6. integration test: STAGING_BACKEND_ORIGIN (a staging backend with test
//      controls on) under tests/integration.mjs — the real-backend acceptance run
//   7. only now rewrite env.js with INTEGRATIONS_VERIFIED so installed.js reads
//      CONNECTED; then publish the static files (git push / Pages / your CDN)
// ============================================================================
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const env = process.env; const plan = process.argv.includes('--plan');
const ROOT = new URL('../', import.meta.url).pathname;
const run = (label, cmd, args, extra = {}) => new Promise((resolve) => {
  console.log(`\n▶ ${label}`); if (plan) { console.log(`  ${cmd} ${args.join(' ')}`); return resolve(0); }
  const c = spawn(cmd, args, { stdio: 'inherit', cwd: extra.cwd ?? ROOT, env: { ...env, ...(extra.env ?? {}) } }); c.on('close', resolve);
});
const stop = (why) => { console.error(`\n✗ deployment stopped: ${why}`); process.exit(1); };

const required = ['NO_ENVIRONMENT', 'AUTH_PROVIDER', 'API_BASE_URL', 'SITE_URL'];
const missing = required.filter((k) => !env[k]); if (missing.length && !plan) stop(`missing ${missing.join(', ')}`);
if (env.NO_ENVIRONMENT === 'production' && env.AUTH_PROVIDER !== 'session-api') stop('production requires AUTH_PROVIDER=session-api');
if (env.NO_ENVIRONMENT === 'production' && !/^https:\/\//.test(env.API_BASE_URL ?? '')) stop('production requires an https API_BASE_URL');

console.log(`Deploying ${env.NO_ENVIRONMENT ?? '?'}: site ${env.SITE_URL ?? '?'} → backend ${env.API_BASE_URL ?? '?'}`);
if ((await run('1–2. public configuration (no verified marks yet)', process.execPath, ['tools/write-env.mjs'], { env: { INTEGRATIONS_VERIFIED: '' } })) !== 0) stop('public configuration refused');
if (env.BACKEND_DEPLOY === 'local') {
  if ((await run('3a. backend configuration check', process.execPath, ['--no-warnings=ExperimentalWarning', 'config.mjs', '--check'], { cwd: `${ROOT}backend` })) !== 0) stop('backend configuration refused');
  if ((await run('3b. database migrations', process.execPath, ['--no-warnings=ExperimentalWarning', 'migrate.mjs'], { cwd: `${ROOT}backend` })) !== 0) stop('migrations failed');
} else console.log('\n▶ 3. backend deployed by its own pipeline (backend/Dockerfile); checked in steps 5–6');
console.log('\n▶ 4. services: storage=' + (env.BACKEND_STORAGE ?? 'local') + ', mailer=' + (env.BACKEND_MAILER ?? 'none — NOT CONNECTED') + ', identity=backend-managed (hosted provider NOT CONNECTED), legal=' + (env.LEGAL_DOCUMENT_CONFIG ?? '{"source":null} — NOT CONNECTED'));
if ((await run('5. smoke test of the deployed backend', process.execPath, ['tools/smoke.mjs'])) !== 0) stop('smoke test failed');
if (!env.STAGING_BACKEND_ORIGIN && !plan) stop('STAGING_BACKEND_ORIGIN (a backend with BACKEND_TEST_CONTROLS=1) is required for the acceptance run');
if ((await run('6. real-backend acceptance (tests/integration.mjs)', process.execPath, ['tests/run-backend.mjs'], { env: { BACKEND_ORIGIN: env.STAGING_BACKEND_ORIGIN ?? '', SITE_PORT: env.SITE_PORT ?? '4173' } })) !== 0) stop('acceptance suite failed');
const verified = ['session-api', 'api-customer', ...(env.LEGAL_DOCUMENT_CONFIG && !/"source":\s*null/.test(env.LEGAL_DOCUMENT_CONFIG) ? ['legal'] : [])];
if ((await run('7. public configuration with verified marks', process.execPath, ['tools/write-env.mjs', '--verified-by-deploy'], { env: { INTEGRATIONS_VERIFIED: JSON.stringify({ at: new Date().toISOString().slice(0, 10), backend: env.API_BASE_URL, adapters: verified }) } })) !== 0) stop('final configuration refused');
if (!plan) console.log('\n' + readFileSync(`${ROOT}assets/js/data/env.js`, 'utf8').split('\n').slice(0, 3).join('\n'));
console.log(plan ? '\n(plan only — nothing was run or written)' : '\n✓ checks passed. Publish the static files now (the generated env.js is part of the build output, not of the repository).');
