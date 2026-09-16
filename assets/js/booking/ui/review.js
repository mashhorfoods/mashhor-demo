/* ============================================================================
   BOOKING / UI / REVIEW — everything before money changes hands. Stage 11
   Trip · travellers · price (re-quoted here: a changed price or lost
   availability is shown, never swallowed) · contact · supervisor when
   attributed · edit links · terms · continue. A request journey ends here
   with "send request" instead of payment.
   ========================================================================= */

import { el } from '../../core/dom.js';
import { t, pick, getLocale } from '../../core/i18n.js';
import { money, dateShort } from '../../core/format.js';
import { route } from '../../data/config.js';
import { supervisorBySlug } from '../../data/supervisors.js';
import { icon, setButtonState } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { loadJourney, setQuote, setBooking, stepUrl, guard, attributionOf } from '../journey.js';
import { adapterFor } from '../adapters/index.js';
import { breakdown, totalTravellers } from '../pricing.js';
import { devNotice, progress, tripCard, priceRows, recoveryState, legSummary, put, setHead, carrierName, isAr } from './shared.js';

const block = (id, titleKey, editHref, body) => el('section', { class: 'c-review-block', 'aria-labelledby': id }, [
  el('div', { class: 'c-review-block__head' }, [el('h2', { class: 'c-review-block__title', id }, t(titleKey)), editHref ? el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: editHref }, t('bk.review.edit')) : null]),
  body,
]);

export async function mountReview({ root = document } = {}) {
  setHead('page.booking.review');
  const j = loadJourney();
  const mode = j.context?.mode === 'request' ? 'request' : 'search';
  const blocked = guard('review', j);
  put('progress', progress('review', { mode }), root);
  if (blocked) { put('main', recoveryState(blocked), root); put('aside', null, root); return { blocked }; }
  put('notice', j.search?.meta?.dev ? devNotice() : null, root);
  put('summary', tripCard({ journey: j, editHref: mode === 'search' ? stepUrl('search') : null }), root);
  const ctx = j.context; const offer = j.selection?.offer ?? null;
  const travellers = Object.entries(j.travellers ?? {}).map(([id, v]) => ({ id, ...v }));
  const sup = attributionOf(j); const supRec = sup ? supervisorBySlug(sup.supervisor) : null;
  const priceHost = el('div', { class: 'l-stack l-stack--12' });
  const termsId = 'review-terms';
  const terms = el('label', { class: 'c-choice', for: termsId }, [el('input', { class: 'c-choice__input', type: 'checkbox', id: termsId, required: true }), el('span', { class: 'c-choice__text' }, t('bk.review.terms'))]);
  const termsErr = el('p', { class: 'c-field__error', role: 'alert', hidden: true }, [icon('no-alert', { size: 'sm' }), el('span', {}, t('bk.review.termsRequired'))]);
  const cta = el('button', { type: 'button', class: 'c-btn c-btn--primary c-btn--lg', disabled: mode === 'search' }, [el('span', { class: 'c-btn__label' }, t(mode === 'search' ? 'bk.review.continue' : 'bk.review.request')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);

  const proceed = async () => {
    if (!terms.querySelector('input').checked) { termsErr.hidden = false; terms.querySelector('input').focus(); return; }
    termsErr.hidden = true;
    if (mode === 'search') { location.assign(stepUrl('payment')); return; }
    setButtonState(cta, 'loading');
    try {
      const result = await adapterFor(ctx.service).book({ context: ctx, travellers: j.travellers, contact: j.contact, attribution: sup });
      setBooking({ ...result, at: new Date().toISOString(), payment: null, total: null });
      location.assign(stepUrl('confirmation'));
    } catch (error) {
      console.warn('[no] request failed', error); setButtonState(cta, 'idle');
      priceHost.replaceChildren(stateBlock({ variant: 'error', title: t('state.error.title'), text: t('state.error.text'), actions: [{ label: t('action.retry'), variant: 'c-btn--primary', onClick: proceed }] }));
    }
  };
  cta.addEventListener('click', proceed);

  put('main', el('div', { class: 'l-stack l-stack--24' }, [
    el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('bk.review.title')), el('p', { class: 't-body t-muted' }, t('bk.review.text'))]),
    block('rv-trip', 'bk.review.trip', mode === 'search' ? stepUrl('search') : `${route('book/')}`, offer
      ? el('ul', { class: 'c-inclusions', role: 'list' }, [el('li', {}, [icon('no-flight', { size: 'sm' }), el('span', {}, `${carrierName(offer.carrier)} · ${pick(offer.fare, 'label')}`)]), ...offer.legs.map((l) => el('li', {}, [icon('no-calendar', { size: 'sm' }), el('span', {}, `${dateShort(l.departAt)} · ${legSummary(l)}`)]))])
      : el('p', { class: 't-body' }, `${t(`search.${ctx.service}`)} · ${[ctx.origin, ctx.destination].filter(Boolean).join(isAr() ? ' ← ' : ' → ')} · ${[ctx.dates?.depart || ctx.dates?.checkin, ctx.dates?.return || ctx.dates?.checkout].filter(Boolean).map(dateShort).join(' – ')}`)),
    block('rv-tr', 'bk.review.travellers', stepUrl('travellers'), el('ul', { class: 'c-inclusions', role: 'list' }, travellers.map((tr) => el('li', {}, [icon('no-users', { size: 'sm' }), el('span', {}, `${t(`bk.tr.${tr.type}`, tr.id.split('-')[1])} — ${tr.firstName} ${tr.lastName}${tr.dob ? ` · ${dateShort(tr.dob)}` : ''}`)])))),
    mode === 'search' ? block('rv-price', 'bk.review.price', stepUrl('extras'), priceHost) : el('p', { class: 'c-note', role: 'note' }, [icon('no-info', { size: 'sm' }), el('span', { class: 'c-note__text' }, t('bk.review.requestNote'))]),
    block('rv-contact', 'bk.review.contact', stepUrl('travellers'), el('p', { class: 't-body' }, `${j.contact?.email ?? ''} · ${j.contact?.phone ?? ''}`)),
    supRec ? block('rv-sup', 'bk.review.supervisor', null, el('p', { class: 't-body' }, [icon('no-supervisor', { size: 'sm' }), ' ', t('bk.review.supervisorText', pick(supRec, 'name') || t('sup.name.fallback'))])) : null,
    el('div', { class: 'l-stack l-stack--8' }, [terms, termsErr]),
    el('div', { class: 'c-journey__actions' }, [cta, el('a', { class: 'c-btn c-btn--secondary', href: stepUrl(mode === 'search' ? 'extras' : 'travellers') }, t('bk.back'))]),
  ]), root);

  // ---- re-quote: the price the customer pays is the price the supplier confirms now
  if (mode === 'search') {
    priceHost.replaceChildren(el('p', { class: 't-body-sm t-muted', role: 'status' }, [icon('no-processing', { size: 'sm' }), ' ', t('bk.review.quoting')]));
    try {
      const q = await adapterFor(ctx.service).quote(j.selection.searchId, offer.id);
      if (q.unavailable) {
        priceHost.replaceChildren(stateBlock({ variant: 'warning', iconName: 'no-expired', title: t('bk.price.unavailable.title'), text: t('bk.price.unavailable.text'), actions: [{ label: t('bk.recover.search'), href: stepUrl('search'), variant: 'c-btn--primary' }] }));
        return { quote: q };
      }
      const bd = breakdown(offer, ctx.travellers, j.extras, q.price);
      setQuote({ price: q.price, changed: q.changed, previous: q.previous, total: bd.total, currency: bd.currency, at: Date.now() });
      priceHost.replaceChildren(
        q.changed ? el('div', { class: 'c-note c-note--warning', role: 'alert' }, [icon('no-alert', { size: 'sm' }), el('span', { class: 'c-note__text' }, [el('strong', {}, `${t('bk.price.changed.title')}: `), t('bk.price.changed.text', money(breakdown(offer, ctx.travellers, j.extras, q.previous).total, bd.currency), money(bd.total, bd.currency))])]) : null,
        priceRows(bd),
      );
      if (q.changed) cta.querySelector('.c-btn__label').textContent = t('bk.price.changed.accept');
      cta.disabled = false;
      put('summary', tripCard({ journey: loadJourney(), editHref: stepUrl('search') }), root);
      return { quote: q, bd };
    } catch (error) {
      console.warn('[no] quote failed', error);
      priceHost.replaceChildren(stateBlock({ variant: 'error', title: t('state.error.title'), text: t('state.error.text'), actions: [{ label: t('action.retry'), variant: 'c-btn--primary', onClick: () => location.reload() }] }));
      return { quote: null };
    }
  }
  return { mode };
}
