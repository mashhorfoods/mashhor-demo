/* ============================================================================
   COMPONENTS / CARDS — data in, DOM out. §14 / §27

   Every renderer takes a plain object and returns a node. None of them fetch,
   none of them know about routing, none of them contain booking logic. That
   is what lets Stage 11–14 reuse them against a real API without a rewrite.
   §28 / §34
   ========================================================================= */

import { el, uid } from '../core/dom.js';
import { t, pick } from '../core/i18n.js';
import { money, duration, dateShort } from '../core/format.js';
import { route } from '../data/config.js';
import { SERVICE_REGISTRY } from '../data/services.js';
import { destinationById } from '../data/destinations.js';
import { OFFER_STATUSES, OFFER_CATEGORIES } from '../data/offers.js';
import { icon } from './ui.js';


/* ---------------------------------------------------------------------------
   SERVICE CARD — icon · title · description · CTA
   ------------------------------------------------------------------------ */
/**
 * @param {object} service   a registry record (data/services.js)
 * @param {object} [options]
 * @param {boolean} options.media   render the image slot (services page)
 * @param {object}  options.kind    SERVICE_KINDS entry → badge + CTA label
 * @param {string}  options.entry   href of the real CTA (the booking entry)
 * Without options it is the compact card the homepage and style guide use.
 */
export function serviceCard(service, { media = false, kind = null, entry = null } = {}) {
  const titleId = uid('svc');
  const rich = media || kind || entry;
  const soon = service.status === 'soon';
  const ctaLabel = service.ctaAr || service.ctaEn ? pick(service, 'cta') : (kind ? pick(kind, 'cta') : null);

  return el('article', { class: ['c-card c-card--interactive c-service-card', rich ? 'c-service-card--rich' : ''], 'aria-labelledby': titleId }, [
    media ? el('div', { class: 'c-card__media' }, mediaPlaceholder(service.image?.src, pick(service.image ?? {}, 'alt'))) : null,
    el('div', { class: 'c-card__body' }, [
      rich
        ? el('div', { class: 'c-service-card__head' }, [
            el('span', { class: 'c-service-card__icon' }, icon(service.icon, { size: 'lg' })),
            kind ? el('span', { class: `c-badge ${kind.badge} c-service-card__kind` }, [icon(kind.icon, { size: 'xs' }), el('span', {}, pick(kind, 'label'))]) : null,
          ])
        : el('span', { class: 'c-service-card__icon' }, icon(service.icon, { size: 'lg' })),
      el('h3', { class: 'c-card__title', id: titleId }, [
        el('a', { class: 'c-card__link', href: route(service.href) }, pick(service, 'title')),
      ]),
      el('p', { class: 'c-card__text' }, pick(service, 'desc')),
      soon ? el('span', { class: 'c-badge c-badge--warning c-service-card__soon' }, [icon('no-pending', { size: 'xs' }), el('span', {}, t('services.status.soon'))]) : null,
      rich
        ? el('div', { class: 'c-service-card__actions' }, [
            entry && !soon
              ? el('a', { class: 'c-btn c-btn--secondary-brand c-card__action', href: entry }, [
                  el('span', {}, ctaLabel ?? t('card.cta')), icon('no-arrow-end', { size: 'sm', flip: true })])
              : null,
            el('a', { class: 'c-service-card__details c-card__action', href: route(service.href) }, t('services.details')),
          ])
        : el('span', { class: 'c-service-card__cta', 'aria-hidden': 'true' }, [
            t('card.cta'),
            icon('no-arrow-end', { size: 'sm', flip: true }),
          ]),
    ]),
  ]);
}






/* ---------------------------------------------------------------------------
   DESTINATION CARD — image · name · descriptor · arrow. 10.4 §08
   The descriptor says what the place is FOR; there is no slot for a rank,
   a count or a price, so none can be invented.
   ------------------------------------------------------------------------ */
/**
 * @param {object} dest      a destinations-registry record (data/destinations.js)
 * @param {object} [options]
 * @param {boolean} options.country   show the country line
 * @param {boolean} options.services  show the relevant-service chips
 * @param {string}  options.entry     href of the "explore" CTA (the booking entry)
 * @param {boolean} options.large     the featured lead card
 * Without options it is the compact card the homepage uses.
 */
export function destinationCard(dest, { country = false, services = false, entry = null, large = false } = {}) {
  const titleId = uid('dest');
  const rich = country || services || entry;
  const href = route(dest.href ?? `destinations/${dest.slug}/`);
  const serviceChips = services && dest.services?.length
    ? el('ul', { class: 'c-dest__services', role: 'list', 'aria-label': t('dest.card.services') },
        dest.services.slice(0, 4).map((id) => SERVICE_REGISTRY.find((s) => s.id === id)).filter(Boolean).map((s) =>
          el('li', { class: 'c-dest__service' }, pick(s, 'title'))))
    : null;

  return el('article', { class: ['c-card c-card--interactive c-dest', rich ? 'c-dest--rich' : '', large ? 'c-dest--large' : ''], 'aria-labelledby': titleId }, [
    el('div', { class: 'c-card__media' }, mediaPlaceholder(dest.image?.src, pick(dest.image ?? {}, 'alt'))),
    el('div', { class: 'c-card__body' }, [
      country && (dest.countryAr || dest.countryEn)
        ? el('p', { class: 'c-dest__country' }, [icon('no-location', { size: 'xs' }), el('span', {}, pick(dest, 'country'))])
        : null,
      el('div', { class: 'c-dest__body' }, [
        el('div', {}, [
          el('h3', { class: 'c-dest__name', id: titleId }, [
            el('a', { class: 'c-card__link', href }, pick(dest, 'name')),
          ]),
          el('p', { class: 'c-dest__desc' }, pick(dest, 'desc')),
        ]),
        rich ? null : el('span', { class: 'c-dest__arrow', 'aria-hidden': 'true' }, icon('no-arrow-end', { size: 'md', flip: true })),
      ]),
      serviceChips,
      entry
        ? el('div', { class: 'c-dest__actions' }, [
            el('a', { class: 'c-btn c-btn--secondary-brand c-card__action', href: entry }, [el('span', {}, t('dest.card.cta')), icon('no-arrow-end', { size: 'sm', flip: true })]),
          ])
        : null,
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   OFFER CARD PARTS — 10.8 §8. Small, reusable, and the only place an offer's
   price, status or meta is drawn, so every surface agrees.
   ------------------------------------------------------------------------ */
/** Status/category badge: icon + word, never colour alone. */
export function offerBadge(status) {
  if (!status) return null;
  return el('span', { class: `c-badge ${status.badge ?? 'c-badge--outline'}` }, [icon(status.icon, { size: 'xs' }), el('span', {}, pick(status, 'label'))]);
}

/** Price when the record carries one; "request price" otherwise. Never a guess. */
export function priceBlock(offer, { large = false } = {}) {
  const price = offer.price?.amount != null ? offer.price : null;
  return el('div', { class: ['c-price', price ? '' : 'c-price--request', large ? 'c-price--large' : ''] }, price
    ? [
        el('span', { class: 'c-price__label' }, price.type === 'from' ? t('package.from') : t('offers.price.label')),
        el('span', { class: 'c-price__value' }, money(price.amount, price.currency)),
        price.basisAr || price.basisEn ? el('span', { class: 'c-price__basis' }, pick(price, 'basis')) : null,
      ]
    : [
        el('span', { class: 'c-price__label' }, t('offers.price.label')),
        el('span', { class: 'c-price__value' }, t('offers.price.request')),
        el('span', { class: 'c-price__basis' }, t('offers.price.requestHint')),
      ]);
}

/** Destination · duration · travel period — each only when known. */
export function offerMeta(offer, { destination = true, duration = true, period = true } = {}) {
  const dest = offer.destinationRecord ?? destinationById(offer.destination);
  const items = [
    destination && dest ? [icon('no-location', { size: 'xs' }), el('span', {}, `${pick(dest, 'name')}${dest.countryAr ? ` · ${pick(dest, 'country')}` : ''}`)] : null,
    duration ? [icon('no-calendar', { size: 'xs' }), el('span', {}, offer.duration?.nights != null ? t('package.nights', offer.duration.nights) : t('offers.duration.flexible'))] : null,
    period && offer.travelPeriod ? [icon('no-pending', { size: 'xs' }), el('span', {}, `${dateShort(offer.travelPeriod.from)} – ${dateShort(offer.travelPeriod.to)}`)] : null,
  ].filter(Boolean);
  return el('p', { class: 'c-offer__meta' }, items.map((i) => el('span', { class: 'c-offer__meta-item' }, i)));
}

/** A list of { ar, en, icon? } items with one icon. */
export function inclusionList(items, { iconName = 'no-check', muted = false, compact = false, grid = true } = {}) {
  return el('ul', { class: ['c-inclusions', grid ? 'c-inclusions--grid' : '', muted ? 'c-inclusions--muted' : '', compact ? 'c-inclusions--compact' : ''], role: 'list' },
    items.map((i) => el('li', { class: 'c-inclusions__item' }, [icon(i.icon ?? iconName, { size: 'sm' }), el('span', {}, pick(i))])));
}

/* ---------------------------------------------------------------------------
   OFFER CARD — image · badges · destination · title · text · meta ·
   key inclusions · price block · CTA. 10.4 §09 / 10.8 §2
   Price and validity rows render ONLY when the record carries a value.
   `large` is the featured form; `entry` the href of the CTA.
   ------------------------------------------------------------------------ */
export function offerCard(offer, { entry = null, large = false } = {}) {
  const titleId = uid('offer');
  const href = route(offer.href ?? `offers/${offer.slug ?? offer.id}/`);
  const status = offer.statusRecord ?? OFFER_STATUSES[offer.status] ?? null;
  const category = OFFER_CATEGORIES.find((c) => c.id === offer.category);
  const keyItems = offer.inclusions?.length
    ? offer.inclusions.slice(0, 3)
    : (offer.services ?? []).slice(0, 3).map((id) => SERVICE_REGISTRY.find((s) => s.id === id)).filter(Boolean).map((s) => ({ ar: s.titleAr, en: s.titleEn }));
  const ctaLabel = offer.status === 'ended' ? t('offers.cta.browse') : offer.bookingMode === 'online' ? t('offers.cta.book') : t('offers.cta.request');

  return el('article', { class: ['c-card c-card--interactive c-offer', large ? 'c-offer--large' : ''], 'aria-labelledby': titleId }, [
    el('div', { class: 'c-card__media' }, [
      mediaPlaceholder(offer.image?.src, pick(offer.image ?? {}, 'alt')),
      status || category ? el('div', { class: 'c-card__badges c-offer__badges' }, [offerBadge(status), category ? el('span', { class: 'c-badge c-badge--solid' }, pick(category, 'label')) : null]) : null,
    ]),
    el('div', { class: 'c-card__body' }, [
      el('h3', { class: 'c-card__title', id: titleId }, [el('a', { class: 'c-card__link', href }, pick(offer, 'title'))]),
      offerMeta(offer),
      el('p', { class: 'c-card__text' }, pick(offer, large ? 'desc' : 'short')),
      keyItems.length ? inclusionList(keyItems, { compact: true, grid: false }) : null,
      el('div', { class: 'c-offer__foot' }, [
        priceBlock(offer),
        entry ? el('a', { class: 'c-btn c-btn--secondary-brand c-card__action', href: entry }, [el('span', {}, ctaLabel), icon('no-arrow-end', { size: 'sm', flip: true })])
              : el('a', { class: 'c-service-card__details c-card__action', href }, t('offers.cta.explore')),
      ]),
    ]),
  ]);
}



/* ---------------------------------------------------------------------------
   MEDIA PLACEHOLDER
   Photography is a Stage 10.1 gap (§17): the brief requires real, human,
   authentic imagery, and every slot currently renders a generated, on-brand
   stand-in (assets/images/CREDITS.md explains why and how it gets replaced)
   rather than a real photograph. A slot with no image at all yet — the
   `src` is falsy — still falls back to this neutral box, reserving the
   exact aspect ratio so dropping either the stand-in or the real photograph
   in later shifts nothing. §30
   ------------------------------------------------------------------------ */
export function mediaPlaceholder(src, alt = '') {
  if (src) {
    return el('img', { src, alt, loading: 'lazy', decoding: 'async', class: 'u-img-cover' });
  }
  return el('div', {
    class: 'u-img-cover',
    role: 'img',
    'aria-label': alt || '',
    style: 'display:grid;place-items:center;background:var(--color-gray-100);color:var(--color-gray-400)',
  }, icon('no-tourism', { size: 'xl' }));
}
