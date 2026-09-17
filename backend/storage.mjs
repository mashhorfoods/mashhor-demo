// ============================================================================
// BACKEND / STORAGE — private document storage and signed, expiring links.
//
// `local`: files live under BACKEND_STORAGE_DIR (outside any web root) under
// random keys, never their original names; they are served ONLY through
// /files/:id with a valid HMAC signature and an unexpired timestamp, and only
// while the document row is available (deletion or revocation ends access
// even for a link already issued). An S3-compatible bucket is the documented
// next implementation (same interface: put / get / remove); it is NOT
// implemented here — see docs/INTEGRATION.md. Upload scanning is an
// infrastructure step outside this repository (documented, not claimed).
// ============================================================================
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.mjs';
import { hex, HttpError } from './http.mjs';

const MAGIC = {
  'application/pdf': (b) => b.slice(0, 5).toString() === '%PDF-',
  'image/png': (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};
export const EXT = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };

/** Type by declaration AND by content; size by config; a name safe to keep as a title. */
export function validateUpload(part) {
  if (!part?.body?.length) throw new HttpError(422, 'invalid');
  if (part.body.length > config.upload.maxBytes) throw new HttpError(413, 'tooLarge');
  const type = part.contentType;
  if (!config.upload.types.includes(type) || !MAGIC[type]?.(part.body)) throw new HttpError(415, 'unsupported');
  return { type, size: part.body.length, safeName: sanitizeName(part.filename) };
}
// Path separators, shell/OS reserved characters and control characters are removed; the stored key never uses the name.
export const sanitizeName = (name) => String(name ?? '').split('').filter((ch) => ch.charCodeAt(0) >= 32 && !'\\/:*?"<>|'.includes(ch)).join('').replace(/\.{2,}/g, '.').replace(/^[.\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'document';

export const storage = {
  put(body, type) { mkdirSync(config.storageDir, { recursive: true }); const key = `${hex(16)}.${EXT[type] ?? 'bin'}`; writeFileSync(join(config.storageDir, key), body, { mode: 0o600 }); return key; },
  get(key) { if (!key || key.includes('/') || key.includes('..')) return null; const p = join(config.storageDir, key); return existsSync(p) ? readFileSync(p) : null; },
  remove(key) { try { if (key) unlinkSync(join(config.storageDir, key)); } catch { /* already gone */ } },
};

const sign = (id, exp) => createHmac('sha256', config.signingSecret).update(`${id}:${exp}`).digest('hex');
export function signedUrl(origin, docId, ttlMs = config.signedUrlTtlMs) { const exp = Date.now() + ttlMs; return { url: `${origin}/files/${docId}?exp=${exp}&sig=${sign(docId, exp)}`, expiresAt: new Date(exp).toISOString() }; }
export function verifySignature(docId, exp, sig) { const good = sign(docId, Number(exp)); const s = String(sig ?? ''); return s.length === good.length && timingSafeEqual(Buffer.from(s), Buffer.from(good)); }
