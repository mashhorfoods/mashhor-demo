/* ============================================================================
   BOOKING / UI / RESULT CARD — one flight offer. Stage 11

   Airline · flight numbers · every leg (time, route line with its stops,
   duration) · baggage · fare · labels earned (with the rule when a priority
   is set) · total for the party · per-adult · select / details / compare.
   ========================================================================= */

import { el, uid } from '../../core/dom.js';
import { t, getLocale, pick } from '../../core/i18n.js';
import { money, time, duration, dayOffset } from '../../core/format.js';
import { icon } from '../../components/ui.js';
import { totalTravellers } from '../pricing.js';
import { placeName, carrierName } from './shared.js';

const LABEL_ICON = { cheapest: 'no-price-tag', fastest: 'no-processing', fewestStops: 'no-flight', family: 'no-users', recommended: 'no-sparkle' };

export function legBlock(leg, { name = null } = {}) {
  const stops = leg.stops?.length ?? 0;
  const offset = dayOffset(leg.departAt, leg.arriveAt);
  return el('div', {}, [
    name ? el('p', { class: 'c-flight__legname' }, name) : null,
    el('div', { class: 'c-leg' }, [
      el('div', { class: 'c-leg__point' }, [el('p', { class: 'c-leg__time' }, time(leg.departAt)), el('p', { class: 'c-leg__code' }, leg.from.code), el('p', { class: 'c-leg__city' }, placeName(leg.from))]),
      el('div', { class: 'c-leg__path' }, [
        el('p', { class: 'c-leg__duration' }, duration(leg.durationMinutes)),
        el('div', { class: 'c-leg__line' }, leg.stops.map((_, i) => el('span', { class: 'c-leg__stop', style: `inset-inline-start:${Math.round(((i + 1) / (stops + 1)) * 100)}%` }))),
        el('p', { class: 'c-leg__stops', dataset: { direct: String(stops === 0) } }, stops === 0 ? t('flight.direct') : [t('flight.stops', stops), ' · ', el('bdi', { class: 'u-data' }, leg.stops.map((s) => s.code).join(', '))]),
      ]),
      el('div', { class: 'c-leg__point c-leg__point--end' }, [
        el('p', { class: 'c-leg__time' }, [time(leg.arriveAt), offset > 0 ? el('sup', { class: 'c-leg__next-day' }, `+${offset}`) : null]),
        el('p', { class: 'c-leg__code' }, leg.to.code), el('p', { class: 'c-leg__city' }, placeName(leg.to)),
      ]),
    ]),
  ]);
}

const legName = (offer, i) => (offer.tripType === 'return' ? t(i === 0 ? 'bk.card.outbound' : 'bk.card.inbound') : offer.tripType === 'multi' ? t('bk.card.leg', i + 1) : null);

/**
 * @param {object} o  the offer
 * @param {object} p  { labels, priority, party, compared, canCompare, onSelect, onCompare, detailsHref }
 */
export function flightResultCard(o, { labels = [], priority = null, party = 1, compared = false, canCompare = true, onSelect = null, onCompare = null, detailsHref = null, selected = false } = {}) {
  const titleId = uid('offer');
  const why = priority ? labels.find((l) => ({ price: 'cheapest', stops: 'fewestStops', duration: 'fastest', family: 'family' }[priority] === l.id)) : labels.find((l) => l.id === 'recommended');
  const cmpId = uid('cmp');
  return el('article', { class: `c-card c-flight${selected ? ' c-flight--selected' : ''}`, 'aria-labelledby': titleId, dataset: { offer: o.id, dev: String(!!o.provider?.dev) } }, [
    labels.length ? el('div', { class: 'c-flight__labels' }, labels.map((l) => el('span', { class: `c-badge ${l.id === 'recommended' || l.id === 'family' ? 'c-badge--brand' : 'c-badge--outline'}`, dataset: { label: l.id } }, [icon(LABEL_ICON[l.id], { size: 'xs' }), el('span', {}, t(`bk.label.${l.id}`))]))) : null,
    el('div', { class: 'c-flight__grid' }, [
      el('div', {}, [
        el('div', { class: 'c-flight__airline' }, [
          el('span', { class: 'c-flight__airline-logo', 'aria-hidden': 'true' }, o.carrier.code),
          el('div', {}, [el('p', { class: 'c-flight__airline-name', id: titleId }, carrierName(o.carrier)),
            el('p', { class: 'c-flight__flight-no u-data' }, o.legs.flatMap((l) => l.segments.map((s) => s.flightNumber)).join(' · '))]),
        ]),
        el('div', { class: 'l-stack l-stack--16', style: 'margin-block-start:var(--space-16)' }, o.legs.map((leg, i) => legBlock(leg, { name: legName(o, i) }))),
        el('div', { class: 'c-flight__meta' }, [
          el('span', { class: 'c-flight__meta-item' }, [icon('no-baggage', { size: 'sm' }), el('span', {}, `${t('flight.baggage')} ${o.baggage.checkedPieces}×${o.baggage.checkedKg}kg + ${o.baggage.cabinKg}kg`)]),
          el('span', { class: 'c-flight__meta-item' }, [icon(o.fare.refundable ? 'no-check-circle' : 'no-info', { size: 'sm' }), el('span', {}, pick(o.fare, 'label'))]),
          o.availability?.seatsLeft != null && o.availability.seatsLeft <= 4 ? el('span', { class: 'c-badge c-badge--warning' }, t('bk.card.seats', o.availability.seatsLeft)) : null,
        ]),
        why ? el('p', { class: 'c-flight__why' }, [icon('no-sparkle', { size: 'sm' }), el('span', {}, [el('strong', {}, `${t('bk.card.why')}: `), getLocale() === 'ar' ? why.ruleAr : why.ruleEn])]) : null,
      ]),
      el('div', { class: 'c-flight__price-rail' }, [
        el('div', {}, [
          el('p', { class: 't-price c-flight__price' }, money(o.price.total, o.price.currency)),
          el('p', { class: 'c-flight__price-note' }, `${t('bk.card.total', party)} · ${money(o.price.perTraveller.adult, o.price.currency)} ${t('bk.card.perAdult')}`),
        ]),
        el('div', { class: 'c-flight__actions' }, [
          el('button', { type: 'button', class: 'c-btn c-btn--primary', dataset: { action: 'select' }, onclick: () => onSelect?.(o) }, [el('span', { class: 'c-btn__label' }, t('bk.card.select')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]),
          detailsHref ? el('a', { class: 'c-btn c-btn--secondary c-btn--sm', href: detailsHref, dataset: { action: 'details' } }, t('bk.card.details')) : null,
        ]),
        onCompare ? el('label', { class: 'c-choice', for: cmpId }, [
          el('input', { class: 'c-choice__input', type: 'checkbox', id: cmpId, checked: compared, disabled: !compared && !canCompare, onchange: (e) => onCompare(o, e.currentTarget.checked) }),
          el('span', { class: 'c-choice__text' }, compared ? t('bk.card.compared') : t('bk.card.compare')),
        ]) : null,
      ]),
    ]),
  ]);
}
