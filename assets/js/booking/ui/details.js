/* ============================================================================
   BOOKING / UI / DETAILS — the full product page for one offer. Stage 11
   Itinerary segment by segment, layovers, baggage, fare conditions, change
   and cancellation rules, what is included, the price breakdown, and the
   one red action: choose this flight. mountDetails() → window.no.details
   ========================================================================= */

import { el } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { money, time, duration, dateShort, dayOffset } from '../../core/format.js';
import { icon } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { loadJourney, selectOffer, stepUrl, guard } from '../journey.js';
import { breakdown } from '../pricing.js';
import { labelOffers } from '../rank.js';
import { legBlock } from './result-card.js';
import { devNotice, progress, tripCard, priceRows, recoveryState, put, setHead, carrierName, placeName, isAr } from './shared.js';

const legName = (o, i) => (o.tripType === 'return' ? t(i === 0 ? 'bk.card.outbound' : 'bk.card.inbound') : t('bk.card.leg', i + 1));

export function itinerary(o) {
  return o.legs.map((leg, i) => el('section', { class: 'l-stack l-stack--12', 'aria-label': legName(o, i) }, [
    el('h3', { class: 't-h4' }, `${legName(o, i)} · ${dateShort(leg.departAt)}`),
    legBlock(leg),
    ...leg.segments.flatMap((s, k) => [
      el('div', { class: 'c-segment' }, [
        el('div', { class: 'c-segment__head' }, [el('span', {}, `${t('bk.details.segment', k + 1)} · ${carrierName(s.carrier)} ${s.flightNumber}`), el('span', {}, `${t('bk.details.aircraft')}: ${s.aircraft ?? t('bk.details.aircraftUnknown')}`)]),
        el('div', { class: 'c-rules' }, [
          el('div', { class: 'c-rules__row' }, [el('dt', {}, `${time(s.departAt)} · ${placeName(s.from)}`), el('dd', {}, `${isAr() ? s.from.airportAr : s.from.airportEn} (${s.from.code})`)]),
          el('div', { class: 'c-rules__row' }, [el('dt', {}, [time(s.arriveAt), dayOffset(s.departAt, s.arriveAt) > 0 ? el('sup', { class: 'c-leg__next-day' }, `+${dayOffset(s.departAt, s.arriveAt)}`) : null, ` · ${placeName(s.to)}`]), el('dd', {}, `${isAr() ? s.to.airportAr : s.to.airportEn} (${s.to.code}) · ${duration(s.durationMinutes)}`)]),
        ]),
      ]),
      k < leg.segments.length - 1 ? el('p', { class: 'c-layover' }, [icon('no-pending', { size: 'sm' }), el('span', {}, t('bk.card.layover', placeName(s.to), duration(leg.stops[k]?.waitMinutes ?? 0)))]) : null,
    ]),
  ]));
}

export function fareRules(o) {
  const fee = (allowed, amount) => (!allowed ? t('bk.details.notAllowed') : amount ? t('bk.details.fee', money(amount, o.price.currency)) : t('bk.details.free'));
  return el('div', { class: 'l-stack l-stack--12' }, [
    el('p', { class: 't-body' }, pick(o.fare, 'label')),
    el('dl', { class: 'c-rules' }, [
      el('div', { class: 'c-rules__row' }, [el('dt', {}, t('bk.details.change')), el('dd', {}, fee(o.fare.changeable, o.fare.changeFee))]),
      el('div', { class: 'c-rules__row' }, [el('dt', {}, t('bk.details.cancel')), el('dd', {}, fee(o.fare.refundable, o.fare.cancelFee))]),
      el('div', { class: 'c-rules__row' }, [el('dt', {}, t('bk.details.baggage')), el('dd', {}, `${t('bk.details.checkedBag', o.baggage.checkedPieces, o.baggage.checkedKg)} · ${t('bk.details.cabinBag', o.baggage.cabinKg)}`)]),
    ]),
    el('h3', { class: 't-h4' }, t('bk.details.restrictions')),
    el('ul', { class: 'c-inclusions', role: 'list' }, (isAr() ? o.fare.rulesAr : o.fare.rulesEn).map((r) => el('li', {}, [icon('no-info', { size: 'sm' }), el('span', {}, r)]))),
  ]);
}

export function mountDetails({ root = document, params = new URLSearchParams(location.search) } = {}) {
  setHead('page.booking.details');
  const j = loadJourney();
  const blocked = guard('details', j);
  put('progress', progress('details'), root);
  if (blocked) { put('main', recoveryState(blocked), root); put('aside', null, root); return { blocked, offer: null }; }
  const id = params.get('id');
  const offer = j.search.results.find((o) => o.id === id) ?? null;
  put('notice', j.search.meta?.dev ? devNotice() : null, root);
  put('summary', tripCard({ journey: j, editHref: `${stepUrl('search')}`, showTotal: false }), root);
  if (!offer) {
    put('main', stateBlock({ variant: 'empty', title: t('bk.details.title'), text: t('bk.details.notFound'), actions: [{ label: t('bk.details.back'), href: stepUrl('search'), variant: 'c-btn--primary' }] }), root);
    return { offer: null };
  }
  const bd = breakdown(offer, j.context.travellers);
  const labels = labelOffers(j.search.results).get(offer.id) ?? [];
  const choose = () => { selectOffer(offer); location.assign(stepUrl('travellers')); };
  put('main', el('div', { class: 'l-stack l-stack--24' }, [
    el('div', { class: 'l-stack l-stack--8' }, [
      el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: stepUrl('search') }, [icon('no-arrow-end', { size: 'sm' }), el('span', {}, t('bk.details.back'))]),
      el('h1', { class: 't-h1', id: 'details-title' }, `${t('bk.details.title')} — ${carrierName(offer.carrier)}`),
      labels.length ? el('ul', { class: 'c-flight__labels c-flight__labels--why', 'aria-label': t('bk.card.why') }, labels.map((l) => el('li', { class: 'c-flight__why', dataset: { label: l.id } }, [icon('no-sparkle', { size: 'xs' }), el('span', {}, [el('strong', {}, `${t(`bk.label.${l.id}`)}: `), isAr() ? l.ruleAr : l.ruleEn])]))) : null,
    ]),
    el('section', { class: 'l-stack l-stack--16', 'aria-labelledby': 'itinerary-title' }, [el('h2', { class: 't-h3', id: 'itinerary-title' }, t('bk.details.itinerary')), ...itinerary(offer)]),
    el('section', { class: 'l-stack l-stack--12', 'aria-labelledby': 'fare-title' }, [el('h2', { class: 't-h3', id: 'fare-title' }, t('bk.details.fare')), fareRules(offer)]),
    el('section', { class: 'l-stack l-stack--12', 'aria-labelledby': 'included-title' }, [el('h2', { class: 't-h3', id: 'included-title' }, t('bk.details.included')),
      el('ul', { class: 'c-inclusions', role: 'list' }, offer.included.map((i) => el('li', {}, [icon('no-check', { size: 'sm' }), el('span', {}, pick(i))])))]),
    el('section', { class: 'c-review-block', 'aria-labelledby': 'price-title' }, [el('h2', { class: 'c-review-block__title', id: 'price-title' }, t('bk.details.price')), priceRows(bd)]),
    el('div', { class: 'c-journey__actions' }, [
      el('button', { type: 'button', class: 'c-btn c-btn--primary c-btn--lg', onclick: choose, dataset: { action: 'select' } }, t('bk.card.select')),
      el('a', { class: 'c-btn c-btn--secondary', href: stepUrl('search') }, t('bk.details.back')),
    ]),
  ]), root);
  return { offer, choose };
}
