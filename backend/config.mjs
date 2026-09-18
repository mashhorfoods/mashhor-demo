// ============================================================================
// BACKEND / CONFIG — every setting comes from the process environment
// (backend/.env.example lists them). Nothing here is public: this file runs on
// the server only. Production refuses an unsafe configuration at start-up.
// ============================================================================
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const env = process.env;
const bool = (v, d = false) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const num = (v, d) => (v == null || v === '' ? d : Number(v));
const list = (v) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const problems = [];

const environment = env.BACKEND_ENV ?? 'development';
if (!['development', 'staging', 'production'].includes(environment)) problems.push(`BACKEND_ENV must be development | staging | production (got ${environment})`);
const production = environment === 'production';

let signingSecret = env.BACKEND_SIGNING_SECRET ?? '';
if (!signingSecret) { if (production || environment === 'staging') problems.push('BACKEND_SIGNING_SECRET is required (32+ random characters)'); else signingSecret = randomBytes(32).toString('hex'); }
else if (signingSecret.length < 32) problems.push('BACKEND_SIGNING_SECRET must be at least 32 characters');

const allowedOrigins = list(env.BACKEND_ALLOWED_ORIGINS);
if (allowedOrigins.includes('*')) problems.push('BACKEND_ALLOWED_ORIGINS must list exact origins, never *');
if (production) { if (!allowedOrigins.length) problems.push('BACKEND_ALLOWED_ORIGINS is required in production'); allowedOrigins.forEach((o) => { if (!/^https:\/\//.test(o)) problems.push(`allowed origin must be https in production: ${o}`); }); }

const publicUrl = (env.BACKEND_PUBLIC_URL ?? '').replace(/\/+$/, '');
if (production && !/^https:\/\//.test(publicUrl)) problems.push('BACKEND_PUBLIC_URL must be the https origin this backend is served from');

const cookieSecure = bool(env.BACKEND_COOKIE_SECURE, production);
if (production && !cookieSecure) problems.push('BACKEND_COOKIE_SECURE must be 1 in production');
const cookieSameSite = env.BACKEND_COOKIE_SAMESITE ?? 'Lax';
if (!['Lax', 'Strict', 'None'].includes(cookieSameSite)) problems.push('BACKEND_COOKIE_SAMESITE must be Lax | Strict | None');
if (cookieSameSite === 'None' && !cookieSecure) problems.push('SameSite=None cookies must be Secure');

const testControls = bool(env.BACKEND_TEST_CONTROLS, false);
if (production && testControls) problems.push('BACKEND_TEST_CONTROLS cannot be enabled in production');

const storage = env.BACKEND_STORAGE ?? 'local';
if (!['local'].includes(storage)) problems.push(`BACKEND_STORAGE=${storage} is not implemented (local only; see docs/INTEGRATION.md for the S3 seam)`);
const storageDir = resolve(env.BACKEND_STORAGE_DIR ?? './data/documents');
const mailer = env.BACKEND_MAILER ?? 'none';
if (!['none'].includes(mailer)) problems.push(`BACKEND_MAILER=${mailer} is not implemented (none only: deliveries are recorded, never claimed sent)`);

// Stage 16B — payment provider. Implemented: dev (charges nothing, clearly labelled to the customer). A real
// provider is a new backend/payments.mjs adapter (createIntent/verifySignature/normalizeEvent), not a config
// value this list accepts yet — production must never silently fall back to the dev stand-in.
const paymentProvider = env.BACKEND_PAYMENT_PROVIDER ?? 'dev';
if (!['dev'].includes(paymentProvider)) problems.push(`BACKEND_PAYMENT_PROVIDER=${paymentProvider} is not implemented (dev only)`);
if (production && paymentProvider === 'dev') problems.push('BACKEND_PAYMENT_PROVIDER cannot be dev in production — no real payment provider is connected yet (see docs/STAGE-16B-PAYMENT-INTEGRATION.md)');
let paymentDevSecret = env.BACKEND_PAYMENT_DEV_SECRET ?? '';
if (!paymentDevSecret) { if (environment === 'staging') problems.push('BACKEND_PAYMENT_DEV_SECRET is required in staging (32+ random characters)'); else paymentDevSecret = randomBytes(32).toString('hex'); }
else if (paymentDevSecret.length < 32) problems.push('BACKEND_PAYMENT_DEV_SECRET must be at least 32 characters');

// Stage 13 — the ONE entry point reserved for the future Admin Dashboard (reassigning a customer's attribution, §27,
// §40). Disabled unless set; when set, it must be a real secret (32+ chars), whatever the environment, because it is
// a bearer credential over an admin-only action, not a public toggle.
const adminToken = env.BACKEND_ADMIN_TOKEN ?? '';
if (adminToken && adminToken.length < 32) problems.push('BACKEND_ADMIN_TOKEN must be at least 32 characters when set (it is a bearer credential, not a flag)');

export const config = Object.freeze({
  environment, production,
  host: env.BACKEND_HOST ?? '127.0.0.1', port: num(env.BACKEND_PORT, 8930),
  databasePath: resolve(env.BACKEND_DATABASE_PATH ?? './data/numberone.sqlite'),
  signingSecret, allowedOrigins, publicUrl,
  cookie: { secure: cookieSecure, sameSite: cookieSameSite, domain: env.BACKEND_COOKIE_DOMAIN || null },
  sessionTtlMs: num(env.BACKEND_SESSION_TTL_HOURS, 12) * 3600 * 1000,
  resetTtlMs: num(env.BACKEND_RESET_TTL_MINUTES, 30) * 60 * 1000,
  lockout: { attempts: num(env.BACKEND_LOCKOUT_ATTEMPTS, 10), windowMs: num(env.BACKEND_LOCKOUT_MINUTES, 15) * 60 * 1000 },
  passwordMinLength: num(env.BACKEND_PASSWORD_MIN_LENGTH, 8),
  storage, storageDir,
  upload: { maxBytes: num(env.BACKEND_UPLOAD_MAX_BYTES, 5 * 1024 * 1024), types: list(env.BACKEND_UPLOAD_TYPES ?? 'application/pdf,image/jpeg,image/png') },
  signedUrlTtlMs: num(env.BACKEND_SIGNED_URL_TTL_SECONDS, 300) * 1000,
  mailer, legalDir: resolve(env.BACKEND_LEGAL_DIR ?? './legal'),
  paymentProvider, paymentDevSecret,
  supervisors: list(env.BACKEND_SUPERVISORS ?? 'supervisor-1,supervisor-2,supervisor-3,supervisor-4,supervisor-5'),
  adminToken: adminToken || null,
  trustProxy: bool(env.BACKEND_TRUST_PROXY, false),
  testControls,
  rateLimits: { auth: { limit: num(env.BACKEND_RATE_AUTH, 10), windowMs: 60000 }, upload: { limit: num(env.BACKEND_RATE_UPLOAD, 20), windowMs: 60000 }, api: { limit: num(env.BACKEND_RATE_API, 300), windowMs: 60000 } },
  problems,
});

export function assertConfig() {
  if (config.problems.length) { console.error('Backend configuration refused:\n - ' + config.problems.join('\n - ')); process.exit(78); }
  return config;
}

if (process.argv[1]?.endsWith('config.mjs') && process.argv.includes('--check')) {
  assertConfig();
  console.log(`configuration ok (${config.environment}; origins: ${config.allowedOrigins.join(', ') || 'any (development)'}; storage: ${config.storage}; mailer: ${config.mailer}; test controls: ${config.testControls})`);
}
