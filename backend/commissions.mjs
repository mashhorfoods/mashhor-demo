// ============================================================================
// BACKEND / COMMISSIONS — Phase 6. A supervisor earns one commission row per
// paid booking attributed to them.
//
//   earn     called by payments.mjs inside the verified-webhook transaction,
//            the only code path that marks a booking paid. The amount is
//            the booking's stored amount × the rate in the Business Rules
//            Register (commission_model.rate); the rate used is kept on the
//            row, so changing the rule later never rewrites past earnings.
//            Idempotent: the unique index on commissions.booking_id (migration
//            012) makes a replayed or duplicate event a no-op.
//   reverse  called by staff.mjs when operations moves a booking to
//            cancelled/refunded; marks an earned commission 'reversed'.
//
// A register rule with no usable model (a null model, a non-percentage model
// or a missing rate) writes nothing: no rate is ever guessed here.
// ============================================================================
import { q, now, registerRule } from './db.mjs';
import { hex } from './http.mjs';

/** The rate currently configured, or null when the register holds no usable percentage rule. */
export function commissionRate() {
  const rule = registerRule('commission_model', { model: null });
  const rate = Number(rule.rate);
  return rule.model === 'percentage' && Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : null;
}

/** Writes the commission for a just-paid booking. Returns the row written, or null when nothing is owed. */
export function earnCommission(bookingId, at = now()) {
  const b = q.get('SELECT id, supervisor_id, amount, currency FROM bookings WHERE id = ?', bookingId);
  if (!b?.supervisor_id) return null;
  const rate = commissionRate(); if (rate === null) return null;
  const version = q.get("SELECT updated_at FROM business_config WHERE key = 'commission_model'")?.updated_at ?? null;
  const amount = Math.round(Number(b.amount || 0) * rate * 100) / 100;
  q.run('INSERT OR IGNORE INTO commissions (id, supervisor_id, booking_id, amount, currency, status, period, rule_version, rate, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    `com_${hex(6)}`, b.supervisor_id, b.id, amount, b.currency ?? 'USD', 'earned', at.slice(0, 7), version, rate, at);
  return q.get('SELECT * FROM commissions WHERE booking_id = ?', b.id);
}

/** Booking cancelled or refunded after payment: the commission it earned no longer stands. */
export function reverseCommission(bookingId, at = now()) {
  q.run("UPDATE commissions SET status = 'reversed', reversed_at = ? WHERE booking_id = ? AND status = 'earned'", at, bookingId);
}
