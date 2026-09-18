// ============================================================================
// BACKEND / MAILER — Stage 16D. Customer/staff communication, made durable.
//
//   Business Event → Durable Outbox → Delivery Attempt → Provider → Result
//
// `enqueue()` is the ONE way anything in this backend asks for a message to
// go out; it always durably records the request before anything else
// happens, so a provider outage or a process restart can never lose the
// event — the row simply stays 'queued' until a delivery attempt runs.
// `deliverOutbox()` is that attempt: it never runs inside the caller's own
// request/transaction (§4's "never send critical notifications directly
// from the request transaction in a way that can lose the event"), and a
// failure there never touches the business operation that queued it.
//
// Provider registry mirrors backend/payments.mjs and backend/flights.mjs
// exactly. Implemented: 'none' (the historical default — records queued,
// never claims delivery) and 'smtp' (a real, dependency-free RFC 5321
// client — STARTTLS, AUTH LOGIN, correctly encodes non-ASCII subjects).
// Neither is ever silently substituted for the other: BACKEND_MAILER
// decides, and config.mjs refuses an unconfigured 'smtp' outright.
// ============================================================================
import { randomBytes } from 'node:crypto';
import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { q, now } from './db.mjs';
import { config } from './config.mjs';
import { info, warn } from './logger.mjs';

const hexid = (n = 8) => randomBytes(n).toString('hex');
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

/* ---- provider registry ---------------------------------------------------------------------------------------- */
const registry = new Map();
/** Provider contract: id, dev, async send({ to, subject, text }) → { providerMessageId } | throws. */
export function registerMailProvider(p) { registry.set(p.id, p); return p; }
export function mailProviderFor(id) { return registry.get(id) ?? null; }

/* ---- template rendering: substitutes {{var}} into an ALREADY-sanitised template body (staff.mjs's
   sanitizeTemplateBody strips tags at storage time, §7/§14) — payload values are escaped too, so a
   customer-controlled value (a name, a reason) can never reintroduce markup through a placeholder. ---- */
const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function renderTemplate(body, payload) {
  return String(body ?? '').replace(/\{\{(\w+)\}\}/g, (_, k) => (k in (payload ?? {}) ? escapeHtml(payload[k]) : ''));
}

/* ---- enqueue: durable, optionally idempotent (§5) -------------------------------------------------------------- */
/**
 * customerId/staffId resolve a recipient's e-mail at delivery time; `recipient` overrides that lookup for a
 * caller that already has the address in hand (e.g. a supervisor's). `idempotencyKey`, when given, makes a
 * duplicate business event (a webhook redelivery, a duplicate submission hitting the same code path twice) a
 * safe no-op: `INSERT OR IGNORE` on a UNIQUE column, exactly the pattern payments.mjs's payment_events already
 * uses. Callers that can occur more than once for the same entity (each is a genuinely new event) simply don't
 * pass one.
 */
export function enqueue({ customerId = null, staffId = null, bookingId = null, recipient = null, channel = 'email', template, eventType = null, payload = {}, idempotencyKey = null }) {
  const id = `msg_${hexid()}`; const t = now();
  const cols = 'id, customer_id, staff_id, booking_id, recipient, channel, template, event_type, payload_json, status, attempts, idempotency_key, created_at, updated_at';
  const vals = [id, customerId, staffId, bookingId, recipient, channel, template, eventType, JSON.stringify(payload), 'queued', 0, idempotencyKey, t, t];
  if (idempotencyKey) {
    const r = q.run(`INSERT OR IGNORE INTO outbox (${cols}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...vals);
    if (!r.changes) { info('mailer.duplicate', { template, idempotencyKey }); return { id: null, duplicate: true, delivered: false }; }
  } else {
    q.run(`INSERT INTO outbox (${cols}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...vals);
  }
  info('mailer.queued', { channel, template, delivery: config.mailer });
  return { id, delivered: false };
}

/* ---- delivery attempt runner (§4, §8, §9) ------------------------------------------------------------------------
   Never runs inside the request that queued the message — server.mjs calls this on its own interval, and tests
   trigger it on demand via /__test/deliver-outbox. A provider failure here NEVER touches the booking/payment/
   document row that triggered the notification; only the outbox row's own status changes. */
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [0, 30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000];   // indexed by attempt number, before the NEXT try

function resolveRecipient(row) {
  if (row.recipient) return row.recipient;
  if (row.customer_id) return q.get('SELECT email FROM customers WHERE id = ?', row.customer_id)?.email ?? null;
  if (row.staff_id) return q.get('SELECT email FROM staff WHERE id = ?', row.staff_id)?.email ?? null;
  return null;
}
function categorize(err) {
  const code = err?.code; const msg = String(err?.message ?? '');
  if (code === 'authFailed' || /auth/i.test(msg)) return 'authFailed';
  if (/timeout/i.test(msg)) return 'timeout';
  if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code)) return 'unreachable';
  if (/^SMTP 5\d\d/.test(msg)) return 'rejected';
  return 'unknown';
}

export async function deliverOutbox({ limit = 20 } = {}) {
  const provider = mailProviderFor(config.mailer);
  if (!provider) return { attempted: 0, delivered: 0, failed: 0, retrying: 0 };   // 'none', or nothing registered — rows stay honestly 'queued'
  const t = now();
  const due = q.all("SELECT * FROM outbox WHERE status IN ('queued','retrying') AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at LIMIT ?", Date.now(), limit);
  let delivered = 0, failed = 0, retrying = 0;
  for (const row of due) {
    const to = resolveRecipient(row);
    if (!to) { q.run('UPDATE outbox SET status = ?, failure_category = ?, updated_at = ? WHERE id = ?', 'failed', 'noRecipient', t, row.id); failed++; continue; }
    const tmpl = q.get('SELECT * FROM notification_templates WHERE event = ? AND channel = ? AND active = 1', row.template, row.channel);
    if (!tmpl) { q.run('UPDATE outbox SET status = ?, failure_category = ?, updated_at = ? WHERE id = ?', 'failed', 'templateNotConfigured', t, row.id); failed++; continue; }   // never invents wording (§7/§27)
    const payload = J(row.payload_json, {}); const locale = payload.locale === 'en' ? 'en' : 'ar';
    const subject = renderTemplate(locale === 'en' ? (tmpl.subject_en ?? tmpl.subject_ar) : (tmpl.subject_ar ?? tmpl.subject_en), payload) || row.template;
    const text = renderTemplate(locale === 'en' ? tmpl.body_en : tmpl.body_ar, payload);
    const attempt = row.attempts + 1;
    q.run('UPDATE outbox SET status = ?, attempts = ?, updated_at = ? WHERE id = ?', 'processing', attempt, t, row.id);
    try {
      const result = await provider.send({ to, subject, text });
      q.run('UPDATE outbox SET status = ?, provider_message_id = ?, sent_at = ?, updated_at = ?, failure_category = NULL WHERE id = ?', 'delivered', result?.providerMessageId ?? null, now(), now(), row.id);
      info('mailer.delivered', { template: row.template, channel: row.channel, attempt });
      delivered++;
    } catch (error) {
      const category = categorize(error);
      if (attempt >= MAX_ATTEMPTS) {
        q.run('UPDATE outbox SET status = ?, failure_category = ?, updated_at = ? WHERE id = ?', 'failed', category, now(), row.id);
        warn('mailer.failed', { template: row.template, category, attempt }); failed++;
      } else {
        const nextAt = Date.now() + BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
        q.run('UPDATE outbox SET status = ?, failure_category = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?', 'retrying', category, nextAt, now(), row.id);
        warn('mailer.retrying', { template: row.template, category, attempt }); retrying++;
      }
    }
  }
  return { attempted: due.length, delivered, failed, retrying };
}

/* ---- the 'none' provider is deliberately NOT registered here: mailProviderFor('none') stays null, so
   deliverOutbox() no-ops and every row stays honestly 'queued' — exactly the pre-existing behaviour, unchanged. */

/* ---- real SMTP delivery (§10, §24) — no external dependency; the whole project has none. Supports implicit
   TLS (port 465) and STARTTLS (587/25), AUTH LOGIN, and RFC 2047 encoding for a non-ASCII (Arabic) subject.
   Credentials exist only in `cfg`, passed once at registration from backend/config.mjs — never logged, never
   part of any error message this module produces. ---- */
function makeLineReader(socket) {
  let buffer = ''; const pendingLines = []; let waiting = null; let failure = null;
  const push = (line) => { if (waiting) { const r = waiting; waiting = null; r(line); } else pendingLines.push(line); };
  socket.on('data', (chunk) => {
    buffer += chunk.toString('latin1');
    let idx;
    while ((idx = buffer.indexOf('\r\n')) >= 0) { push(buffer.slice(0, idx)); buffer = buffer.slice(idx + 2); }
  });
  const failAll = (err) => { failure = err; if (waiting) { const r = waiting; waiting = null; r(null); } };
  socket.on('error', failAll); socket.on('close', () => failAll(new Error('SMTP connection closed')));
  function nextLine() {
    if (failure) return Promise.reject(failure);
    if (pendingLines.length) return Promise.resolve(pendingLines.shift());
    return new Promise((resolve, reject) => { waiting = (line) => (failure ? reject(failure) : resolve(line)); });
  }
  async function readReply() {
    let code = null;
    for (;;) { const line = await nextLine(); const m = line.match(/^(\d{3})([ -])/); if (!m) continue; code = Number(m[1]); if (m[2] === ' ') break; }
    return code;
  }
  return { readReply };
}
const dotStuff = (s) => String(s ?? '').replace(/\r\n\./g, '\r\n..').replace(/^\./, '..');
const encodeHeaderValue = (s) => (/^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

async function sendViaSmtp(cfg, { to, subject, text }) {
  let socket = await new Promise((resolve, reject) => {
    const opts = { host: cfg.host, port: cfg.port, servername: cfg.host };
    const s = cfg.secure ? tlsConnect(opts) : netConnect(opts);
    const onErr = (e) => { s.removeAllListeners(); reject(e); };
    s.once('error', onErr);
    s.once(cfg.secure ? 'secureConnect' : 'connect', () => { s.removeListener('error', onErr); resolve(s); });
  });
  const timer = setTimeout(() => socket.destroy(new Error('SMTP timeout')), 20000);
  try {
    let reader = makeLineReader(socket);
    const expect = async (...codes) => { const c = await reader.readReply(); if (!codes.includes(c)) throw new Error(`SMTP ${c}`); return c; };
    await expect(220);
    socket.write('EHLO numberone.local\r\n'); await expect(250);
    if (!cfg.secure) {
      socket.write('STARTTLS\r\n'); await expect(220);
      const plain = socket;
      socket = await new Promise((resolve, reject) => {
        const s = tlsConnect({ socket: plain, host: cfg.host, servername: cfg.host });
        s.once('error', reject); s.once('secureConnect', () => resolve(s));
      });
      reader = makeLineReader(socket);
      socket.write('EHLO numberone.local\r\n'); await expect(250);
    }
    socket.write('AUTH LOGIN\r\n'); await expect(334);
    socket.write(Buffer.from(cfg.user).toString('base64') + '\r\n');
    try { await expect(334); } catch { throw Object.assign(new Error('authFailed'), { code: 'authFailed' }); }
    socket.write(Buffer.from(cfg.pass).toString('base64') + '\r\n');
    try { await expect(235); } catch { throw Object.assign(new Error('authFailed'), { code: 'authFailed' }); }
    socket.write(`MAIL FROM:<${cfg.from}>\r\n`); await expect(250);
    socket.write(`RCPT TO:<${to}>\r\n`); await expect(250, 251);
    socket.write('DATA\r\n'); await expect(354);
    const messageId = `<${hexid(12)}@${cfg.host}>`;
    const headers = [`From: ${cfg.from}`, `To: ${to}`, `Subject: ${encodeHeaderValue(subject)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: ${messageId}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit'];
    socket.write(headers.join('\r\n') + '\r\n\r\n' + dotStuff(text) + '\r\n.\r\n');
    await expect(250);
    socket.write('QUIT\r\n');
    return { providerMessageId: messageId };
  } finally {
    clearTimeout(timer);
    socket.end();
  }
}

export function registerSmtpProvider(cfg) {
  return registerMailProvider({ id: 'smtp', dev: false, async send(msg) { return sendViaSmtp(cfg, msg); } });
}
