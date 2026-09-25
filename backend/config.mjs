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

const environment = env.BACKEND_ENV || 'development';
// NODE_ENV=production with no BACKEND_ENV is a deployment that forgot to choose: it would otherwise start in
// development mode (any-origin CORS, a per-process signing secret, the dev payment provider). Refuse it.
if (!env.BACKEND_ENV && env.NODE_ENV === 'production') problems.push('BACKEND_ENV must be set explicitly when NODE_ENV=production (production | staging)');
if (!['development', 'staging', 'production'].includes(environment)) problems.push(`BACKEND_ENV must be development | staging | production (got ${environment})`);
const production = environment === 'production';

let signingSecret = env.BACKEND_SIGNING_SECRET ?? '';
if (!signingSecret) { if (production || environment === 'staging') problems.push('BACKEND_SIGNING_SECRET is required (32+ random characters)'); else signingSecret = randomBytes(32).toString('hex'); }
else if (signingSecret.length < 32) problems.push('BACKEND_SIGNING_SECRET must be at least 32 characters');

const allowedOrigins = list(env.BACKEND_ALLOWED_ORIGINS);
if (allowedOrigins.includes('*')) problems.push('BACKEND_ALLOWED_ORIGINS must list exact origins, never *');
// Staging is reachable from the internet too: with no list, CORS would echo any origin with credentials.
if (environment === 'staging' && !allowedOrigins.length) problems.push('BACKEND_ALLOWED_ORIGINS is required in staging');
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
// Stage 16D — real e-mail delivery. Implemented: 'none' (deliveries recorded, never claimed sent — the historical
// default) and 'smtp' (a real, dependency-free RFC 5321 client, backend/mailer.mjs). 'smtp' requires every one of
// its own settings below; anything else is refused the same way an unimplemented storage/payment/flight provider
// already is — never silently treated as connected.
const mailer = env.BACKEND_MAILER ?? 'none';
if (!['none', 'smtp'].includes(mailer)) problems.push(`BACKEND_MAILER=${mailer} is not implemented (none or smtp)`);
let smtp = null;
if (mailer === 'smtp') {
  const host = env.BACKEND_SMTP_HOST ?? ''; const port = num(env.BACKEND_SMTP_PORT, 587);
  const user = env.BACKEND_SMTP_USER ?? ''; const pass = env.BACKEND_SMTP_PASS ?? ''; const from = env.BACKEND_SMTP_FROM ?? '';
  if (!host) problems.push('BACKEND_SMTP_HOST is required when BACKEND_MAILER=smtp');
  if (!user || !pass) problems.push('BACKEND_SMTP_USER and BACKEND_SMTP_PASS are required when BACKEND_MAILER=smtp (the account this backend sends as)');
  if (!from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) problems.push('BACKEND_SMTP_FROM must be a real sender address when BACKEND_MAILER=smtp');
  smtp = { host, port, user, pass, from, secure: bool(env.BACKEND_SMTP_SECURE, port === 465) };
}

// Stage 16B — payment provider. Implemented: dev (charges nothing, clearly labelled to the customer). A real
// provider is a new backend/payments.mjs adapter (createIntent/verifySignature/normalizeEvent), not a config
// value this list accepts yet — production must never silently fall back to the dev stand-in.
const paymentProvider = env.BACKEND_PAYMENT_PROVIDER ?? 'dev';
if (!['dev'].includes(paymentProvider)) problems.push(`BACKEND_PAYMENT_PROVIDER=${paymentProvider} is not implemented (dev only)`);
if (production && paymentProvider === 'dev') problems.push('BACKEND_PAYMENT_PROVIDER cannot be dev in production — no real payment provider is connected yet (see docs/STAGE-16B-PAYMENT-INTEGRATION.md)');
let paymentDevSecret = env.BACKEND_PAYMENT_DEV_SECRET ?? '';
if (!paymentDevSecret) { if (environment === 'staging') problems.push('BACKEND_PAYMENT_DEV_SECRET is required in staging (32+ random characters)'); else paymentDevSecret = randomBytes(32).toString('hex'); }
else if (paymentDevSecret.length < 32) problems.push('BACKEND_PAYMENT_DEV_SECRET must be at least 32 characters');

// Stage 16C — flight supplier. Implemented: dev (fictional carriers, clearly labelled, no real supplier
// credentials involved). A real supplier is a new backend/flights.mjs adapter (search/quote/book against the
// supplier's own API), not a config value this list accepts yet — production must never silently fall back to
// the dev stand-in, the same rule Stage 16B already applies to the payment provider.
const flightProvider = env.BACKEND_FLIGHT_PROVIDER ?? 'dev';
if (!['dev'].includes(flightProvider)) problems.push(`BACKEND_FLIGHT_PROVIDER=${flightProvider} is not implemented (dev only)`);
if (production && flightProvider === 'dev') problems.push('BACKEND_FLIGHT_PROVIDER cannot be dev in production — no real flight supplier is connected yet (see docs/STAGE-16C-FLIGHT-SUPPLIER-INTEGRATION.md)');

// Stage 13 — the ONE entry point reserved for the future Admin Dashboard (reassigning a customer's attribution, §27,
// §40). Disabled unless set; when set, it must be a real secret (32+ chars), whatever the environment, because it is
// a bearer credential over an admin-only action, not a public toggle.
const adminToken = env.BACKEND_ADMIN_TOKEN ?? '';
if (adminToken && adminToken.length < 32) problems.push('BACKEND_ADMIN_TOKEN must be at least 32 characters when set (it is a bearer credential, not a flag)');

export const config = Object.freeze({
  environment, production,
  host: env.BACKEND_HOST ?? '127.0.0.1', port: num(env.BACKEND_PORT, 8930),
  databasePath: resolve(env.BACKEND_DATABASE_PATH ?? './data/travel-demo.sqlite'),
  signingSecret, allowedOrigins, publicUrl,
  cookie: { secure: cookieSecure, sameSite: cookieSameSite, domain: env.BACKEND_COOKIE_DOMAIN || null },
  sessionTtlMs: num(env.BACKEND_SESSION_TTL_HOURS, 12) * 3600 * 1000,
  resetTtlMs: num(env.BACKEND_RESET_TTL_MINUTES, 30) * 60 * 1000,
  lockout: { attempts: num(env.BACKEND_LOCKOUT_ATTEMPTS, 10), windowMs: num(env.BACKEND_LOCKOUT_MINUTES, 15) * 60 * 1000 },
  passwordMinLength: num(env.BACKEND_PASSWORD_MIN_LENGTH, 8),
  storage, storageDir,
  upload: { maxBytes: num(env.BACKEND_UPLOAD_MAX_BYTES, 5 * 1024 * 1024), types: list(env.BACKEND_UPLOAD_TYPES ?? 'application/pdf,image/jpeg,image/png') },
  signedUrlTtlMs: num(env.BACKEND_SIGNED_URL_TTL_SECONDS, 300) * 1000,
  mailer, smtp, legalDir: resolve(env.BACKEND_LEGAL_DIR ?? './legal'),
  paymentProvider, paymentDevSecret,
  flightProvider,
  supervisors: list(env.BACKEND_SUPERVISORS ?? 'supervisor-1,supervisor-2,supervisor-3,supervisor-4,supervisor-5'),
  adminToken: adminToken || null,
  trustProxy: bool(env.BACKEND_TRUST_PROXY, false),
  testControls,
  rateLimits: { auth: { limit: num(env.BACKEND_RATE_AUTH, 10), windowMs: 60000 }, upload: { limit: num(env.BACKEND_RATE_UPLOAD, 20), windowMs: 60000 }, api: { limit: num(env.BACKEND_RATE_API, 300), windowMs: 60000 }, diagnostics: { limit: num(env.BACKEND_RATE_DIAGNOSTICS, 30), windowMs: 60000 } },
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
