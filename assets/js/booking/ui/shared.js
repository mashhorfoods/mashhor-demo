/* ============================================================================
   BOOKING / UI / SHARED — the parts every journey screen composes. Stage 11
   ========================================================================= */

import { el, qs, render, setPageHead } from '../../core/dom.js';
import { t, pick, getLocale } from '../../core/i18n.js';
import { money, dateShort, duration, time } from '../../core/format.js';
import { route, SEARCH_VERTICALS } from '../../data/config.js';
import { supervisorBySlug } from '../../data/supervisors.js';
import { icon } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { summariseTravellers } from '../../core/booking.js';
import { STEPS, stepUrl, loadJourney, attributionOf } from '../journey.js';
import { breakdown } from '../pricing.js';
import { totalDuration, totalStops } from '../rank.js';

export const isAr = () => getLocale() === 'ar';
export const placeName = (p) => (isAr() ? p.cityAr : p.cityEn);
export const carrierName = (c) => (isAr() ? c.nameAr : c.nameEn);

/** The visible "development data" notice — on every screen that shows supplier data. */
export function devNotice(kind = 'text') {
  return el('p', { class: 'c-note c-note--warning', role: 'note', dataset: { dev: 'true' } }, [
    icon('no-alert', { size: 'sm' }),
    el('span', { class: 'c-note__text' }, [el('strong', {}, `${t('bk.dev.title')}: `), t(kind === 'payment' ? 'bk.dev.payment' : 'bk.dev.text')]),
  ]);
}

/** Progress steps; `current` is a STEPS id. Request journeys skip details, extras and payment. */
export function progress(current, { mode = 'search' } = {}) {
  const steps = STEPS.filter((s) => mode === 'search' || !['details', 'extras', 'payment'].includes(s.id));
  const idx = steps.findIndex((s) => s.id === current);
  return el('ol', { class: 'c-steps', 'aria-label': t('bk.progress.label') }, steps.map((s, i) =>
    el('li', { class: 'c-steps__item', 'aria-label': t(s.label), dataset: { state: i < idx ? 'done' : i === idx ? 'current' : 'todo' }, ...(i === idx ? { 'aria-current': 'step' } : {}) }, [
      el('span', { class: 'c-steps__bar', 'aria-hidden': 'true' }),
      el('span', { class: 'c-steps__label' }, [i < idx ? icon('no-check', { size: 'xs' }) : null, el('span', {}, t(s.label))]),
    ])));
}

/** "KRT → JED" with the arrow that follows the reading direction. */
export function routeLine(legs) {
  const codes = legs.length ? [legs[0].from.code, ...legs.map((l) => l.to.code)] : [];
  if (legs.length === 2 && legs[1].to.code === legs[0].from.code) codes.length = 2;
  return el('bdi', { class: 'c-route', dir: 'ltr' }, codes.flatMap((c, i) => (i ? [icon('no-arrow-end', { size: 'xs' }), c] : [c])));
}
/* Origin, arrow, destination — each name isolated so Latin codes keep their
   place in an Arabic sentence, the arrow flipping with the reading direction. */
const pair = (from, to) => el('span', { class: 'c-route-pair' }, [el('bdi', {}, from), icon('no-arrow-end', { size: 'xs', flip: true }), el('bdi', {}, to)]);
const contextRoute = (ctx) => {
  if (ctx.tripType === 'multi') return el('span', { class: 'c-route-multi' }, (ctx.legs ?? []).flatMap((l, i) => (i ? [' · ', pair(l.from, l.to)] : [pair(l.from, l.to)])));
  if (!ctx.origin && !ctx.destination) return '';
  return ctx.origin && ctx.destination ? pair(ctx.origin, ctx.destination) : el('bdi', {}, ctx.origin || ctx.destination);
};
const contextDates = (ctx) => (ctx.tripType === 'multi' ? (ctx.legs ?? []).map((l) => dateShort(l.date)).join(' · ')
  : [ctx.dates?.depart || ctx.dates?.checkin, ctx.dates?.return || ctx.dates?.checkout].filter(Boolean).map(dateShort).join(' – '));

/**
 * The trip summary card (sticky on desktop): what was searched, what was
 * chosen, the running total, the supervisor when there is one.
 */
export function tripCard({ journey = loadJourney(), editHref = route('book/'), showTotal = true } = {}) {
  const ctx = journey.context; if (!ctx) return null;
  const offer = journey.selection?.offer ?? null;
  const price = journey.quote?.price ?? offer?.price ?? null;
  const bd = offer ? breakdown(offer, ctx.travellers, journey.extras, price) : null;
  const sup = attributionOf(journey); const supRec = sup ? supervisorBySlug(sup.supervisor) : null;
  const row = (k, v) => (v ? el('div', { class: 'c-tripcard__row' }, [el('dt', {}, t(k)), el('dd', {}, v)]) : null);
  const cabinOpt = SEARCH_VERTICALS.find((v) => v.id === 'flights')?.fields.find((f) => f.id === 'cabin')?.options.find((o) => o.value === ctx.cabin);
  return el('aside', { class: 'c-tripcard', 'aria-labelledby': 'tripcard-title' }, [
    el('h2', { class: 'c-tripcard__title', id: 'tripcard-title' }, [el('span', {}, t('bk.summary.title')),
      editHref ? el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: editHref }, t('bk.summary.edit')) : null]),
    el('dl', { class: 'c-tripcard__rows' }, [
      row('bk.summary.route', offer ? routeLine(offer.legs) : contextRoute(ctx)),
      row('bk.summary.dates', offer ? offer.legs.map((l) => dateShort(l.departAt)).join(' – ') : contextDates(ctx)),
      row('bk.summary.travellers', summariseTravellers(ctx.travellers ?? { adults: 1 })),
      row('bk.summary.cabin', cabinOpt ? (isAr() ? cabinOpt.labelAr : cabinOpt.labelEn) : ''),
      offer ? row('bk.summary.flight', `${carrierName(offer.carrier)} · ${offer.legs.map((l) => l.segments.map((s) => s.flightNumber).join(', ')).join(' / ')}`) : null,
      supRec ? row('bk.summary.supervisor', el('a', { href: route(`supervisor/${supRec.slug}/`) }, pick(supRec, 'name') || t('sup.name.fallback'))) : null,
    ]),
    showTotal && bd ? el('div', { class: 'c-tripcard__total' }, [el('span', {}, t('bk.summary.total')), el('span', { class: 't-price' }, money(bd.total, bd.currency))]) : null,
  ]);
}

/** The price breakdown rows — the same on details, review, payment and confirmation. */
export function priceRows(bd, { compact = false } = {}) {
  if (!bd) return null;
  const row = (label, amount, cls = '') => el('div', { class: `c-price-row ${cls}` }, [el('span', { class: 'c-price-row__label' }, label), el('span', { class: 'c-price-row__value' }, amount)]);
  return el('div', { class: 'c-price-rows' }, [
    ...bd.lines.map((l) => row(`${t('bk.price.fare', l.type, l.qty)} · ${money(l.unit, bd.currency)}`, money(l.amount, bd.currency))),
    row(t('bk.price.taxes'), money(bd.taxes, bd.currency)),
    row(t('bk.price.fees'), money(bd.fees, bd.currency)),
    ...(compact ? [] : bd.extras.map((e) => row(`${pick(e, 'label')} × ${e.qty}`, e.unit === 0 ? t('bk.price.included') : money(e.amount, bd.currency)))),
    compact && bd.extrasTotal ? row(t('bk.price.extras'), money(bd.extrasTotal, bd.currency)) : null,
    row(t('bk.price.total'), money(bd.total, bd.currency), 'c-price-row--total'),
  ]);
}

/** The recovery state a guarded step shows instead of its content. */
export function recoveryState({ reason, back }) {
  const hrefs = { book: route('book/'), search: stepUrl('search'), travellers: stepUrl('travellers'), review: stepUrl('review'), confirmation: stepUrl('confirmation') };
  return [
    el('h1', { class: 't-h1' }, t('bk.recover.title')),
    stateBlock({ variant: reason === 'expired' ? 'warning' : 'info', iconName: reason === 'expired' ? 'no-expired' : 'no-info', headingLevel: 2,
      title: t(`bk.recover.${reason}`),
      actions: [{ label: t(`bk.recover.${back}`), href: hrefs[back], variant: 'c-btn--primary' }, { label: t('bk.recover.book'), href: route('book/') }] }),
  ];
}

export const legSummary = (leg) => `${time(leg.departAt)} ${leg.from.code} → ${time(leg.arriveAt)} ${leg.to.code} · ${duration(leg.durationMinutes)} · ${leg.stops.length ? t('flight.stops', leg.stops.length) : t('flight.direct')}`;
export const offerTitle = (o) => `${carrierName(o.carrier)} · ${routeLine(o.legs).textContent} · ${duration(totalDuration(o))} · ${totalStops(o) ? t('flight.stops', totalStops(o)) : t('flight.direct')}`;

/** Every journey page sets its head the same way. */
export const setHead = (key) => setPageHead({ title: t(key), description: t(key.replace(/\.[^.]+$/, '.description')) });

/** Mount helper: draw content into [data-journey="…"] slots. */
export const slot = (name, root = document) => qs(`[data-journey="${name}"]`, root);
export const put = (name, nodes, root = document) => { const s = slot(name, root); if (s) render(s, nodes); return s; };
