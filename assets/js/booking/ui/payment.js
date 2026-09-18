/* ============================================================================
   BOOKING / UI / PAYMENT — review → pay → processing → success | failure.
   Stage 11. No card field lives here: a provider brings its own (hosted
   fields, redirect) and this page only asks it to pay and reports. The
   development provider says so on screen and charges nothing.
   ========================================================================= */

import { el, render } from '../../core/dom.js';
import { route } from '../../data/config.js';
import { t } from '../../core/i18n.js';
import { money } from '../../core/format.js';
import { icon, setButtonState } from '../../components/ui.js';
import { stateBlock, loadingBlock } from '../../components/states.js';
import { loadJourney, setPayment, setBooking, stepUrl, guard, attributionOf } from '../journey.js';
import { adapterFor } from '../adapters/index.js';
import { paymentProviders } from '../payment.js';
import { devNotice, progress, tripCard, priceRows, recoveryState, put, setHead, isAr } from './shared.js';
import { breakdown } from '../pricing.js';

export function mountPayment({ root = document } = {}) {
  setHead('page.booking.payment');
  const j = loadJourney();
  const blocked = guard('payment', j);
  put('progress', progress('payment'), root);
  if (blocked) { put('main', recoveryState(blocked), root); put('aside', null, root); return { blocked }; }
  const provider = paymentProviders()[0] ?? null;
  put('notice', el('div', { class: 'l-stack l-stack--8' }, [j.search?.meta?.dev ? devNotice() : null, provider?.dev ? devNotice('payment') : null]), root);
  put('summary', tripCard({ journey: j, editHref: stepUrl('review') }), root);
  const ctx = j.context; const offer = j.selection.offer;
  const bd = breakdown(offer, ctx.travellers, j.extras, j.quote.price);
  const attempts = (j.payment?.attempts ?? 0);
  const state = { status: 'idle', attempt: attempts, method: j.payment?.method ?? provider?.methods?.[0]?.id ?? '' };
  const main = el('div', { class: 'l-stack l-stack--24' });
  const status = el('p', { class: 'c-book__status t-body', role: 'status', 'aria-live': 'assertive' });
  const api = { state, pay, get status() { return state.status; } };

  function methodForm() {
    if (!provider) return stateBlock({ variant: 'info', title: t('bk.pay.method'), text: t('bk.pay.noProvider'), actions: [{ label: t('bk.pay.backReview'), href: stepUrl('review'), variant: 'c-btn--primary' }] });
    return el('fieldset', { class: 'c-pay-method' }, [
      el('legend', { class: 'c-review-block__title' }, `${t('bk.pay.method')} · ${isAr() ? provider.labelAr : provider.labelEn}`),
      ...provider.methods.map((m) => el('label', { class: 'c-choice', for: `pm-${m.id}` }, [
        el('input', { class: 'c-choice__input', type: 'radio', name: 'method', id: `pm-${m.id}`, value: m.id, checked: state.method === m.id, onchange: () => { state.method = m.id; } }),
        el('span', { class: 'c-choice__text' }, [el('strong', {}, isAr() ? m.labelAr : m.labelEn), el('span', { class: 'c-choice__desc', style: 'display:block;font-size:var(--text-caption);color:var(--color-text-secondary)' }, isAr() ? m.hintAr : m.hintEn)]),
      ])),
      el('p', { class: 't-body-sm t-muted' }, [icon('no-shield', { size: 'sm' }), ' ', t('bk.pay.secure')]),
    ]);
  }
  const payBtn = el('button', { type: 'button', class: 'c-btn c-btn--primary c-btn--lg', dataset: { action: 'pay' }, onclick: () => pay() }, [el('span', { class: 'c-btn__label' }, t('bk.pay.pay', money(bd.total, bd.currency))), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);

  function paintIdle() {
    state.status = 'idle'; setButtonState(payBtn, 'idle'); status.textContent = '';
    render(main, [
      el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('bk.pay.title')), el('p', { class: 't-body t-muted' }, t('bk.pay.text'))]),
      el('div', { class: 'c-pay-amount' }, [el('span', {}, t('bk.pay.amount')), el('span', { class: 't-price' }, money(bd.total, bd.currency))]),
      el('section', { class: 'c-review-block', 'aria-label': t('bk.details.price') }, priceRows(bd, { compact: true })),
      el('section', { class: 'c-review-block' }, methodForm()),
      status,
      el('div', { class: 'c-journey__actions' }, [payBtn, el('a', { class: 'c-btn c-btn--secondary', href: stepUrl('review') }, t('bk.pay.backReview'))]),
    ]);
  }
  function paintFailed(reason) {
    state.status = 'failed';
    render(main, [
      el('h1', { class: 't-h1' }, t('bk.pay.title')),
      stateBlock({ variant: 'error', iconName: 'no-error', title: t('bk.pay.failed.title'), text: `${t('bk.pay.failed.text')} ${reason ? `(${reason})` : ''} · ${t('bk.pay.attempt', state.attempt)}`,
        actions: [{ id: 'retry', label: t('bk.pay.retry'), variant: 'c-btn--primary', onClick: () => pay() }, { id: 'change-method', label: t('bk.pay.changeMethod'), onClick: () => { state.status = 'idle'; paintIdle(); main.querySelector('input[name=method]')?.focus(); } }, { label: t('bk.pay.backReview'), href: stepUrl('review') }] }),
    ]);
  }
  async function pay(method = state.method) {
    if (!provider || state.status === 'processing') return null;
    const retrying = state.status === 'failed';
    state.status = 'processing'; state.attempt += 1; state.method = method;
    setPayment({ status: 'processing', method, attempts: state.attempt, at: new Date().toISOString() });
    // A retry from the failure screen shows the processing state at once; the idle screen keeps its form and loads its button.
    if (retrying) render(main, [el('h1', { class: 't-h1' }, t('bk.pay.title')), loadingBlock(t('bk.pay.processing'))]);
    setButtonState(payBtn, 'loading'); status.textContent = t('bk.pay.processing'); status.dataset.tone = '';
    main.querySelectorAll('input, a.c-btn').forEach((n) => { n.disabled = true; n.setAttribute?.('aria-disabled', 'true'); });
    try {
      const result = await provider.pay({ amount: bd.total, currency: bd.currency, method });
      if (!result.ok) {
        setPayment({ status: 'failed', method, attempts: state.attempt, reason: result.reason, at: new Date().toISOString() });
        paintFailed(isAr() ? result.messageAr : result.messageEn); return result;
      }
      setPayment({ status: 'paid', method, attempts: state.attempt, transactionId: result.transactionId, amount: bd.total, currency: bd.currency, at: new Date().toISOString() });
      status.textContent = t('bk.pay.booking');
      try {
        const booking = await adapterFor(ctx.service).book({ context: ctx, offer, travellers: j.travellers, contact: j.contact, extras: j.extras, total: bd.total, currency: bd.currency, attribution: attributionOf(j), payment: { transactionId: result.transactionId } });
        setBooking({ ...booking, at: new Date().toISOString(), total: bd.total, currency: bd.currency, payment: 'paid' });
        state.status = 'booked';
        location.assign(stepUrl('confirmation'));
        return booking;
      } catch (error) {
        console.warn('[no] booking failed after payment', error);
        state.status = 'bookFailed';
        render(main, [el('h1', { class: 't-h1' }, t('bk.pay.title')), stateBlock({ variant: 'warning', iconName: 'no-alert', title: t('bk.pay.bookFailed.title'), text: t('bk.pay.bookFailed.text'), actions: [{ label: t('action.help'), href: route('account/support/'), variant: 'c-btn--primary' }, { label: t('bk.pay.backReview'), href: stepUrl('review') }] })]);
        return null;
      }
    } catch (error) {
      console.warn('[no] payment provider error', error);
      setPayment({ status: 'failed', method, attempts: state.attempt, reason: 'error', at: new Date().toISOString() });
      paintFailed(''); return null;
    }
  }
  put('main', main, root);
  if (j.payment?.status === 'failed') paintFailed(''); else paintIdle();
  return api;
}
