/* ============================================================================
   BOOKING / PAYMENT — the provider boundary. Stage 11

   The frontend never sees a card number: a real provider renders its own
   field (hosted fields / redirect) and hands back a token; this module only
   asks a provider to `pay()` and reports the outcome. No credentials live in
   the repository. Until a provider is configured, the DEVELOPMENT provider
   below lets the journey run end to end while saying so on screen: it
   charges nothing and its two "methods" simulate a success and a failure.

   Like every other development adapter it is registered only outside
   production. A production build with no client-side provider shows the
   "pay later" step instead (ui/payment.js): the booking is placed awaiting
   payment and a coordinator sends a secure payment link. No real
   client-side provider exists yet; the backend refuses its own dev
   provider in production too (backend/config.mjs).
   ========================================================================= */

import { isProduction } from '../data/env.js';

const providers = new Map();
export function registerPaymentProvider(p) { providers.set(p.id, p); return p; }
export function paymentProviders() { return [...providers.values()]; }

export const DEV_PAYMENT = isProduction() ? null : registerPaymentProvider({
  id: 'dev', dev: true, labelAr: 'وضع الدفع التجريبي', labelEn: 'Development payment mode',
  methods: [
    { id: 'dev-success', labelAr: 'محاكاة دفع ناجح', labelEn: 'Simulate a successful payment', hintAr: 'لا يُحصَّل أي مبلغ', hintEn: 'Nothing is charged' },
    { id: 'dev-failure', labelAr: 'محاكاة دفع مرفوض', labelEn: 'Simulate a declined payment', hintAr: 'لاختبار مسار الاسترداد', hintEn: 'Exercises the recovery path' },
  ],
  /** @returns {Promise<{ ok, transactionId?, reason? }>} */
  async pay({ amount, currency, method }) {
    await new Promise((r) => setTimeout(r, 1200));
    if (method === 'dev-failure') return { ok: false, reason: 'declined', messageAr: 'رفض المزوّد التجريبي عملية الدفع (محاكاة).', messageEn: 'The development provider declined the payment (simulated).' };
    return { ok: true, transactionId: `DEVPAY-${Date.now().toString(36).toUpperCase()}`, amount, currency, method };
  },
});
