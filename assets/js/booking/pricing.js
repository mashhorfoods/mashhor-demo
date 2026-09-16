/* ============================================================================
   BOOKING / PRICING — the breakdown every screen shows. Stage 11

   Base per traveller type × count, taxes, fees, extras, total. Nothing is
   folded into another line: §17 says the customer sees every mandatory
   charge before paying.
   ========================================================================= */

export const TRAVELLER_TYPES = ['adult', 'child', 'infant'];

/** @returns {{ currency, lines: [{ key, type?, qty, unit, amount }], base, taxes, fees, extras, total }} */
export function breakdown(offer, travellers, extrasChosen = [], price = offer?.price) {
  if (!offer || !price) return null;
  const counts = { adult: travellers.adults ?? 0, child: travellers.children ?? 0, infant: travellers.infants ?? 0 };
  const lines = TRAVELLER_TYPES.filter((ty) => counts[ty] > 0).map((ty) => ({ key: 'fare', type: ty, qty: counts[ty], unit: price.perTraveller[ty], amount: price.perTraveller[ty] * counts[ty] }));
  const base = lines.reduce((s, l) => s + l.amount, 0);
  const extras = extrasChosen.map((e) => ({ key: 'extra', id: e.id, labelAr: e.labelAr, labelEn: e.labelEn, qty: e.qty, unit: e.included ? 0 : e.price, amount: e.included ? 0 : e.price * e.qty }));
  const extrasTotal = extras.reduce((s, l) => s + l.amount, 0);
  return { currency: price.currency, lines, base, taxes: price.taxes, fees: price.fees, extras, extrasTotal, total: base + price.taxes + price.fees + extrasTotal };
}
export const totalTravellers = (tr) => (tr?.adults ?? 0) + (tr?.children ?? 0) + (tr?.infants ?? 0);
