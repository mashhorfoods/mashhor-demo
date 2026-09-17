// BACKEND / HTTP — request plumbing: JSON, cookies, CORS, bodies with limits, multipart, errors, rate limiting.
import { randomBytes } from 'node:crypto';
import { config } from './config.mjs';

export class HttpError extends Error { constructor(status, code, extra = {}) { super(code); this.status = status; this.code = code; this.extra = extra; } }
export const hex = (n = 16) => randomBytes(n).toString('hex');

export const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(body == null ? '' : JSON.stringify(body)); };
export const empty = (res, status = 204, headers = {}) => { res.writeHead(status, { 'Cache-Control': 'no-store', ...headers }); res.end(); };
export const fail = (res, status, code, headers = {}) => json(res, status, { error: { code } }, headers);

export const cookies = (req) => Object.fromEntries((req.headers.cookie ?? '').split(';').map((c) => c.trim()).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const attrs = (extra = '') => `Path=/; SameSite=${config.cookie.sameSite}${config.cookie.secure ? '; Secure' : ''}${config.cookie.domain ? `; Domain=${config.cookie.domain}` : ''}${extra}`;
export const setSessionCookies = (res, sid, csrf, maxAgeSeconds) => res.setHeader('Set-Cookie', [`no_session=${sid}; HttpOnly; ${attrs(`; Max-Age=${maxAgeSeconds}`)}`, `no_csrf=${csrf}; ${attrs(`; Max-Age=${maxAgeSeconds}`)}`]);
export const clearSessionCookies = (res) => res.setHeader('Set-Cookie', [`no_session=; HttpOnly; ${attrs('; Max-Age=0')}`, `no_csrf=; ${attrs('; Max-Age=0')}`]);
// Stage 13 — a SEPARATE cookie pair for the supervisor portal, distinct names so a customer session and a supervisor
// session can never be confused by either side reading the other's cookie, and so a browser holding both (e.g. QA)
// keeps them independent.
export const setSupervisorSessionCookies = (res, sid, csrf, maxAgeSeconds) => res.setHeader('Set-Cookie', [`no_supervisor_session=${sid}; HttpOnly; ${attrs(`; Max-Age=${maxAgeSeconds}`)}`, `no_supervisor_csrf=${csrf}; ${attrs(`; Max-Age=${maxAgeSeconds}`)}`]);
export const clearSupervisorSessionCookies = (res) => res.setHeader('Set-Cookie', [`no_supervisor_session=; HttpOnly; ${attrs('; Max-Age=0')}`, `no_supervisor_csrf=; ${attrs('; Max-Age=0')}`]);
// Stage 15 — a THIRD cookie pair for staff (Admin + Operations Staff share this one portal, distinguished by
// role/permissions, never by which cookie they hold).
export const setStaffSessionCookies = (res, sid, csrf, maxAgeSeconds) => res.setHeader('Set-Cookie', [`no_ops_session=${sid}; HttpOnly; ${attrs(`; Max-Age=${maxAgeSeconds}`)}`, `no_ops_csrf=${csrf}; ${attrs(`; Max-Age=${maxAgeSeconds}`)}`]);
export const clearStaffSessionCookies = (res) => res.setHeader('Set-Cookie', [`no_ops_session=; HttpOnly; ${attrs('; Max-Age=0')}`, `no_ops_csrf=; ${attrs('; Max-Age=0')}`]);

/** Exact-origin CORS with credentials; anything else gets no CORS headers at all. In development any origin is echoed. */
export function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = config.allowedOrigins.length ? config.allowedOrigins.includes(origin) : !config.production;
  if (!allowed) return false;
  res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-CSRF-Token'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS'); res.setHeader('Access-Control-Expose-Headers', 'Retry-After'); res.setHeader('Access-Control-Max-Age', '600');
  return true;
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    let over = false;
    req.on('data', (c) => { if (over) return; size += c.length; if (size > limit) { over = true; chunks.length = 0; reject(new HttpError(413, 'tooLarge')); req.resume(); return; } chunks.push(c); });   // the rest is discarded, the 413 still reaches the client
    req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', () => reject(new HttpError(400, 'invalid')));
  });
}
export async function readJson(req, limit = 256 * 1024) {
  const buf = await readBody(req, limit); if (!buf.length) return {};
  try { const v = JSON.parse(buf.toString('utf8')); return v && typeof v === 'object' ? v : {}; } catch { throw new HttpError(400, 'invalid'); }
}
/** Minimal multipart/form-data parser for small uploads (the size limit is enforced while reading). */
export function parseMultipart(buf, contentType) {
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/); if (!m) throw new HttpError(400, 'invalid');
  const boundary = Buffer.from(`--${m[1] ?? m[2]}`); const parts = {}; let pos = buf.indexOf(boundary);
  while (pos >= 0) {
    const start = pos + boundary.length; if (buf.slice(start, start + 2).toString() === '--') break;
    const headEnd = buf.indexOf('\r\n\r\n', start); if (headEnd < 0) break;
    const head = buf.slice(start + 2, headEnd).toString('latin1'); const next = buf.indexOf(boundary, headEnd);
    const body = buf.slice(headEnd + 4, next - 2);
    const name = head.match(/name="([^"]+)"/)?.[1]; const filename = head.match(/filename="([^"]*)"/)?.[1]; const type = head.match(/Content-Type:\s*([^\r\n]+)/i)?.[1];
    if (name) parts[name] = filename != null ? { filename, contentType: (type ?? 'application/octet-stream').trim().toLowerCase(), body } : body.toString('utf8');
    pos = next;
  }
  return parts;
}
export const clientIp = (req) => (config.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress ?? '');
export const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;

/** Fixed-window rate limiter per key; answers 429 with Retry-After without revealing the policy. */
const buckets = new Map();
export const resetRateLimits = () => buckets.clear();   // test controls only
export function rateLimit(key, { limit, windowMs }) {
  const t = Date.now(); let b = buckets.get(key);
  if (!b || t - b.start > windowMs) { b = { start: t, count: 0 }; buckets.set(key, b); }
  b.count += 1;
  if (buckets.size > 50000) { for (const [k, v] of buckets) if (t - v.start > windowMs) buckets.delete(k); }
  return b.count > limit ? Math.ceil((b.start + windowMs - t) / 1000) : 0;
}
