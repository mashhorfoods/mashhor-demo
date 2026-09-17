// `npm run test:backend` — the REAL backend under the browser integration suite.
// Starts backend/server.mjs on a free port with a temporary database, test
// controls on and test-scale rate limits, then runs tests/integration.mjs
// with BACKEND_ORIGIN pointing at it (the contract test server is not used;
// the suite serves the site itself). Exits 1 on any failure.
//
//   npm run test:backend                                          local backend started here
//   BACKEND_ORIGIN=https://staging-api.example SITE_PORT=4173 npm run test:backend
//        an already-running staging backend with BACKEND_TEST_CONTROLS=1 and
//        http://127.0.0.1:4173 in its BACKEND_ALLOWED_ORIGINS
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './env.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
let backend = null; let dir = null; let backendOrigin = process.env.BACKEND_ORIGIN;
if (!backendOrigin) {
  dir = mkdtempSync(join(tmpdir(), 'no-backend-')); const port = 8960 + Math.floor(Math.random() * 30);
  backend = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server.mjs'], { cwd: join(ROOT, 'backend'), stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, BACKEND_ENV: 'development', BACKEND_TEST_CONTROLS: '1', BACKEND_PORT: String(port), BACKEND_DATABASE_PATH: join(dir, 'db.sqlite'), BACKEND_STORAGE_DIR: join(dir, 'docs'), BACKEND_ALLOWED_ORIGINS: '', BACKEND_RATE_AUTH: '1000', BACKEND_RATE_API: '100000', BACKEND_RATE_UPLOAD: '1000' } });
  backendOrigin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(backendOrigin + '/health')).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 100)); }
}
const health = await fetch(backendOrigin + '/health').then((r) => r.json()).catch(() => null);
if (!health?.ok) { console.error(`real backend at ${backendOrigin} does not answer /health`); process.exit(1); }
if (!health.testControls) { console.error(`real backend at ${backendOrigin} has no test controls (BACKEND_TEST_CONTROLS=1 on a STAGING backend is required; production refuses them)`); process.exit(1); }
console.log(`real backend: ${backendOrigin} (${health.environment}, storage ${health.storage}, mailer ${health.mailer})`);
const status = await new Promise((resolve) => { const c = spawn(process.execPath, [join(ROOT, 'tests/integration.mjs')], { stdio: 'inherit', env: { ...process.env, BACKEND_ORIGIN: backendOrigin } }); c.on('close', resolve); });
if (backend) { backend.kill('SIGTERM'); await new Promise((r) => backend.on('close', r)); rmSync(dir, { recursive: true, force: true }); }
process.exit(status);
