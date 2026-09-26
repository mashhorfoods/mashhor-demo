// ============================================================================
// BACKEND / PAYMENTS — Stage 16B. The provider boundary, server side.
//
//   Customer → Booking → Server Payment Intent → Payment Provider →
//   Secure Webhook → Server Verification → Booking Payment Status → Confirmation
//
// Mirrors the booking-supplier adapter boundary the frontend already uses
// (assets/js/booking/adapters/index.js registerAdapter/adapterFor): the
// booking/customer domain never talks to a provider directly, only through
// the registry below, so swapping a real provider in touches only this
// file and its own module — never routes.mjs, never the booking schema.
//
// The single rule everything here exists to enforce: only a verified
// webhook event, processed through `handleWebhookEvent`, may ever set a
// payment's status to 'paid'. Nothing else in this file — not intent
// creation, not a route argument, not a client field — has that authority.
// ============================================================================
import { createHmac, timingSafeEqual } from 'node:crypto';
import { q, now } from './db.mjs';
import { HttpError, hex } from './http.mjs';
import { info, warn } from './logger.mjs';
import { audit, SYSTEM_ACTOR } from './staff.mjs';
import { enqueue } from './mailer.mjs';
import { config } from './config.mjs';
import { createFlightBooking } from './flights.mjs';
import { earnCommission } from './commissions.mjs';

/* ---- provider registry — one adapter per provider id, never referenced by name outside this file ---- */
const registry = new Map();
/** Provider contract, every method may throw:
      id                'dev' | a real provider's id ('stripe', 'paytabs', 'hyperpay', …)
      dev               true → this provider charges nothing; refused in production (see config.mjs)
      createIntent({ paymentId, bookingId, amount, currency, method }) → { providerReference, client }
        `client` is whatever client-facing data the frontend needs (redirect URL / client secret) — provider-shaped,
        opaque to this module, never inspected here.
      verifySignature(rawBody: Buffer, headers: object) → boolean
        Must use the provider's own official mechanism (raw body, provider secret, constant-time compare).
      normalizeEvent(rawBody: Buffer) → { providerEventId, type: 'succeeded'|'failed'|'cancelled', providerReference,
        amount, currency } — `amount`/`currency` are compared against our own stored record, never trusted alone. */
export function registerPaymentProvider(p) { registry.set(p.id, p); return p; }
export function paymentProviderFor(id) { return registry.get(id) ?? null; }

const nPayment = (r) => ({ id: r.id, bookingId: r.booking_id, customerId: r.customer_id, provider: r.provider, status: r.status, amount: r.amount, currency: r.currency, at: r.at, verifiedAt: r.verified_at ?? null, failureCode: r.failure_code ?? null });

/* ---- step 1: Customer → Booking → Server Payment Intent (§5, §6) ---------------------------------------------- */
/** The booking must already exist (created by /me/bookings/claim, always `unpaid`) and belong to this customer.
    Amount/currency come ONLY from the booking row this backend itself wrote — never from this call's arguments,
    which is why the caller passes no amount at all. Idempotent on `idempotencyKey`: a retried call with the same
    key returns the SAME payment row and provider reference instead of creating a second one. */
export function createPaymentIntent({ bookingId, customerId, method, idempotencyKey }, providerId) {
  const provider = paymentProviderFor(providerId); if (!provider) throw new HttpError(503, 'unavailable', { reason: 'noPaymentProvider' });
  const booking = q.get('SELECT * FROM bookings WHERE id = ? AND customer_id = ?', bookingId, customerId);
  if (!booking) throw new HttpError(404, 'notFound');
  if (booking.payment_status === 'paid') throw new HttpError(409, 'conflict', { reason: 'alreadyPaid' });
  if (!(booking.amount > 0)) throw new HttpError(422, 'invalid', { reason: 'noPayableAmount' });   // request-only services (no live inventory) are never charged

  if (idempotencyKey) {
    const existing = q.get('SELECT * FROM payments WHERE idempotency_key = ?', idempotencyKey);
    if (existing) { if (existing.booking_id !== bookingId || existing.customer_id !== customerId) throw new HttpError(409, 'conflict', { reason: 'idempotencyKeyReused' }); return { payment: nPayment(existing), client: null }; }   // a replay returns the stored payment; no provider re-describes an intent
  }

  const id = `pay_${hex(6)}`; const t = now();
  const { providerReference, client } = provider.createIntent({ paymentId: id, bookingId, amount: booking.amount, currency: booking.currency, method });
  q.run('INSERT INTO payments (id, customer_id, booking_id, at, amount, currency, status, reference, method_ar, method_en, provider, provider_reference, idempotency_key, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, customerId, bookingId, t, booking.amount, booking.currency, 'pending', providerReference ?? '', '', '', providerId, providerReference ?? null, idempotencyKey ?? null, t);
  info('payment.intent.created', { paymentId: id, bookingId, provider: providerId, amount: booking.amount, currency: booking.currency });
  audit(SYSTEM_ACTOR, 'payment.created', 'payment', id, { bookingId, provider: providerId, amount: booking.amount, currency: booking.currency });
  return { payment: nPayment(q.get('SELECT * FROM payments WHERE id = ?', id)), client };
}

/* ---- step 2: Secure Webhook → Server Verification (§8–§10) ------------------------------------------------------ */
/** The ONLY code path that may mark a payment (and, transitively, its booking) paid. Verifies the provider's
    signature over the RAW body, is idempotent per (provider, providerEventId) — a redelivered event is recognised
    and safely ignored before it can touch anything twice — and cross-checks the event's amount/currency against
    what THIS backend already stored for that payment, rejecting any mismatch as a forged/corrupted event rather
    than trusting the webhook payload's amount as a second source of truth. */
export async function handleWebhookEvent(providerId, rawBody, headers) {
  const provider = paymentProviderFor(providerId);
  if (!provider) { warn('payment.webhook.unknownProvider', { provider: providerId }); throw new HttpError(404, 'notFound'); }
  if (!provider.verifySignature(rawBody, headers)) { warn('payment.webhook.invalidSignature', { provider: providerId }); throw new HttpError(401, 'invalid'); }

  let event; try { event = provider.normalizeEvent(rawBody); } catch { warn('payment.webhook.malformed', { provider: providerId }); throw new HttpError(400, 'invalid'); }
  if (!event?.providerEventId || !event?.providerReference || !event?.type) { warn('payment.webhook.malformed', { provider: providerId }); throw new HttpError(400, 'invalid'); }

  // Every database write for this event happens in ONE transaction, and the event is marked processed only as part
  // of it: a failure anywhere rolls the whole event back (including its payment_events row), so the provider's
  // retry is processed afresh instead of being dropped as a duplicate of a half-applied event. A row still at
  // 'received' (left by a crash before this was transactional) is reprocessed too; only processed/rejected events
  // are duplicates. The supplier call for a flights booking is async, so it runs after the commit.
  const t = now();
  const outcome = q.tx(() => {
    q.run('INSERT OR IGNORE INTO payment_events (provider, provider_event_id, event_type, received_at, status) VALUES (?,?,?,?,?)', providerId, event.providerEventId, event.type, t, 'received');
    const eventRow = q.get('SELECT * FROM payment_events WHERE provider = ? AND provider_event_id = ?', providerId, event.providerEventId);
    if (eventRow.status !== 'received') return { duplicate: true };   // already delivered once — safely ignored, nothing is touched a second time

    const reject = (reason) => { q.run('UPDATE payment_events SET status = ?, reason = ?, processed_at = ? WHERE id = ?', 'rejected', reason, now(), eventRow.id); audit(SYSTEM_ACTOR, 'payment.webhook.rejected', 'payment', event.providerReference, { provider: providerId, reason }); return { rejected: reason }; };

    const payment = q.get('SELECT * FROM payments WHERE provider = ? AND provider_reference = ?', providerId, event.providerReference);
    if (!payment) return reject('paymentNotFound');
    if (event.amount != null && Number(event.amount) !== Number(payment.amount)) return reject('amountMismatch');
    if (event.currency != null && event.currency !== payment.currency) return reject('currencyMismatch');
    if (['paid', 'refunded'].includes(payment.status)) return reject('paymentAlreadyFinal');   // a second, different event for an already-final payment is never applied

    const nextStatus = { succeeded: 'paid', failed: 'failed', cancelled: 'cancelled' }[event.type];
    if (!nextStatus) return reject('unknownEventType');

    q.run('UPDATE payments SET status = ?, verified_at = ?, failure_code = ?, updated_at = ? WHERE id = ?', nextStatus, nextStatus === 'paid' ? t : null, nextStatus === 'failed' ? (event.failureCode ?? 'declined') : null, t, payment.id);
    audit(SYSTEM_ACTOR, 'payment.status.changed', 'payment', payment.id, { provider: providerId, status: nextStatus });

    let flight = null;
    if (nextStatus === 'paid') {
      q.run("UPDATE bookings SET payment_status = 'paid' WHERE id = ?", payment.booking_id);
      q.run('INSERT INTO documents (id, customer_id, booking_id, trip_id, type, kind, status, size, content_type, deletable, issued_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        `doc_${hex(6)}`, payment.customer_id, payment.booking_id, q.get('SELECT trip_id FROM bookings WHERE id = ?', payment.booking_id)?.trip_id ?? null, 'receipt', 'issued', 'pending', null, null, 0, null, t);
      enqueue({ customerId: payment.customer_id, template: 'payment-successful', payload: { bookingId: payment.booking_id, amount: payment.amount, currency: payment.currency } });
      audit(SYSTEM_ACTOR, 'booking.paymentGate.passed', 'booking', payment.booking_id, { paymentId: payment.id });
      // Phase 6: the attributed supervisor's commission is earned here, in the same transaction — once per booking.
      const commission = earnCommission(payment.booking_id, t);
      if (commission) audit(SYSTEM_ACTOR, 'commission.earned', 'commission', commission.id, { bookingId: payment.booking_id, supervisorId: commission.supervisor_id });
      // Stage 16C §13: Revalidate → Payment → Supplier Booking → Confirmation — only for a flights booking claimed
      // against a server-issued offer, and only once per payment (this branch is reached once per event).
      const bkg = q.get('SELECT * FROM bookings WHERE id = ?', payment.booking_id);
      if (bkg?.service === 'flights' && bkg.flight_search_id && bkg.flight_offer_id) flight = { bookingId: bkg.id, customerId: bkg.customer_id, searchId: bkg.flight_search_id, offerId: bkg.flight_offer_id };
    } else if (nextStatus === 'failed') {
      enqueue({ customerId: payment.customer_id, template: 'payment-failed', payload: { bookingId: payment.booking_id } });
    }
    q.run('UPDATE payment_events SET status = ?, payment_id = ?, processed_at = ? WHERE id = ?', 'processed', payment.id, now(), eventRow.id);
    return { paymentId: payment.id, status: nextStatus, flight };
  });

  if (outcome.duplicate) { info('payment.webhook.duplicate', { provider: providerId, providerEventId: event.providerEventId }); return { duplicate: true }; }
  if (outcome.rejected) { warn('payment.webhook.rejected', { provider: providerId, providerEventId: event.providerEventId, reason: outcome.rejected }); return { rejected: outcome.rejected }; }
  // A supplier failure never unwinds the payment or reports a false ticketed confirmation — see flights.mjs recordFailure().
  if (outcome.flight) {
    try { await createFlightBooking(outcome.flight, config.flightProvider); }
    catch (e) { warn('flight.booking.orchestrationError', { bookingId: outcome.flight.bookingId }); }
  }
  info('payment.webhook.verified', { provider: providerId, paymentId: outcome.paymentId, status: outcome.status });
  return { payment: nPayment(q.get('SELECT * FROM payments WHERE id = ?', outcome.paymentId)) };
}

/** DEV-ONLY: stands in for "the real provider's own server calls our webhook a moment after the customer pays."
    Builds the exact signed event a real delivery would carry and feeds it through `handleWebhookEvent` — the SAME
    verification/idempotency code path a genuine external POST to /payments/webhook/dev would go through, just
    without an actual network hop, since there is no second real server to hop to in development. `method` is the
    dev provider's own method choice (dev-success/dev-failure) the customer made on the payment page — the SAME
    kind of input a real customer gives a real provider (which card, which button) — the FACT of success or
    failure still only becomes real once it comes back out through `handleWebhookEvent`'s verification. A real
    provider's webhook always arrives from that provider's own infrastructure, over the real
    /payments/webhook/:provider route, never through a call like this one. */
export async function simulateDevWebhook(paymentId, method) {
  const provider = paymentProviderFor('dev'); if (!provider?.signEvent) return null;
  const payment = q.get('SELECT * FROM payments WHERE id = ? AND provider = ?', paymentId, 'dev'); if (!payment || payment.status !== 'pending') return null;
  const type = method === 'dev-failure' ? 'failed' : 'succeeded';
  const { rawBody, headers } = provider.signEvent({ eventId: `evt_${hex(8)}`, type, providerReference: payment.provider_reference, amount: payment.amount, currency: payment.currency, failureCode: type === 'failed' ? 'declined' : null });
  return handleWebhookEvent('dev', rawBody, headers);
}

/* ---- the development provider: charges nothing, clearly labelled, refused in production (backend/config.mjs) ---- */
export function registerDevPaymentProvider(secret) {
  const sign = (buf) => createHmac('sha256', secret).update(buf).digest('hex');
  return registerPaymentProvider({
    id: 'dev', dev: true,
    createIntent({ paymentId, amount, currency, method }) {
      return { providerReference: `DEVPAY-${hex(6)}`, client: { dev: true, amount, currency, method } };
    },
    verifySignature(rawBody, headers) {
      const given = headers['x-dev-signature']; if (!given || typeof given !== 'string') return false;
      const expected = sign(rawBody); const a = Buffer.from(given, 'hex'); const b = Buffer.from(expected, 'hex');
      return a.length === b.length && timingSafeEqual(a, b);
    },
    normalizeEvent(rawBody) {
      const p = JSON.parse(rawBody.toString('utf8'));
      return { providerEventId: String(p.eventId), type: p.type, providerReference: String(p.providerReference), amount: p.amount, currency: p.currency, failureCode: p.failureCode ?? null };
    },
    /** Builds the exact signed body+header a real dev "provider" delivery would carry, for the one-request-only
        local dispatch in routes.mjs (never used once a real provider is configured — see registerPaymentProvider
        callers in server.mjs). Not part of the provider contract other adapters need to implement. */
    signEvent(body) { const raw = Buffer.from(JSON.stringify(body)); return { rawBody: raw, headers: { 'x-dev-signature': sign(raw), 'content-type': 'application/json' } }; },
  });
}
