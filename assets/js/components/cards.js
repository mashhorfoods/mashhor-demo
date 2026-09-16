/* ============================================================================
   COMPONENTS / CARDS — data in, DOM out. §14 / §27

   Every renderer takes a plain object and returns a node. None of them fetch,
   none of them know about routing, none of them contain booking logic. That
   is what lets Stage 11–14 reuse them against a real API without a rewrite.
   §28 / §34
   ========================================================================= */

import { el, uid } from '../core/dom.js';
import { t, getLocale, pick } from '../core/i18n.js';
import { money, time, duration, dateShort, dayOffset } from '../core/format.js';
import { STATUSES, SERVICES, route } from '../data/config.js';
import { icon } from './ui.js';

/* ---------------------------------------------------------------------------
   STATUS — §20. Icon + word, always. There is no way to call this and get
   colour alone, which is the point.
   ------------------------------------------------------------------------ */
export function statusBadge(statusId) {
  const status = STATUSES[statusId];
  if (!status) return el('span', { class: 'c-status' }, statusId);

  return el('span', { class: 'c-status', dataset: { status: status.id } }, [
    icon(status.icon, { size: 'sm' }),
    el('span', {}, t(status.label)),
  ]);
}

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

export const serviceGrid = (services = SERVICES) =>
  el('div', { class: 'l-auto-grid', style: '--min-col:18rem' }, services.map(serviceCard));

/* ---------------------------------------------------------------------------
   FLIGHT CARD — §14
   Baggage, stops and fare rules sit on the card itself. §19 forbids hiding
   the terms a traveller needs in order to compare honestly.
   ------------------------------------------------------------------------ */
export function flightCard(flight) {
  const leg = flight.legs[0];
  const stopCount = leg.stops?.length ?? 0;
  const offset = dayOffset(leg.departAt, leg.arriveAt);
  const titleId = uid('flight');

  const routeLine = el('div', { class: 'c-leg__line' },
    // A stop is drawn on the path, not only written underneath it.
    leg.stops?.map((_, i) => el('span', {
      class: 'c-leg__stop',
      style: `inset-inline-start:${Math.round(((i + 1) / (stopCount + 1)) * 100)}%`,
    })) ?? []);

  const card = el('article', {
    class: 'c-card c-card--interactive',
    'aria-labelledby': titleId,
  }, [
    // "Help me choose" — the recommendation says WHY, never just "best". §18.5
    flight.recommended
      ? el('p', { class: 'c-recommend' }, [
          icon('no-sparkle', { size: 'sm' }),
          el('span', {}, `${t('flight.recommended')} — ${pick(flight.recommendedReason)}`),
        ])
      : null,

    el('div', { class: 'c-flight' }, [
      el('div', { class: 'c-flight__grid' }, [
        el('div', {}, [
          el('div', { class: 'c-flight__airline' }, [
            el('span', { class: 'c-flight__airline-logo', 'aria-hidden': 'true' }, flight.airline.code),
            el('div', {}, [
              el('p', { class: 'c-flight__airline-name', id: titleId }, pick(flight.airline, 'name')),
              el('p', { class: 'c-flight__flight-no u-data' }, flight.flightNumber),
            ]),
          ]),

          el('div', { class: 'c-leg', style: 'margin-block-start:var(--space-16)' }, [
            el('div', { class: 'c-leg__point' }, [
              el('p', { class: 'c-leg__time' }, time(leg.departAt)),
              el('p', { class: 'c-leg__code' }, leg.from.code),
              el('p', { class: 'c-leg__city' }, pick(leg.from, 'city')),
            ]),

            el('div', { class: 'c-leg__path' }, [
              el('p', { class: 'c-leg__duration' }, duration(leg.durationMinutes)),
              routeLine,
              el('p', {
                class: 'c-leg__stops',
                dataset: { direct: String(stopCount === 0) },
              }, stopCount === 0
                ? t('flight.direct')
                // The airport codes are Latin inside an Arabic sentence, so they
                // go in a <bdi>: without it the separator and the codes swap
                // sides and the line reads as nonsense. §06
                : [t('flight.stops', stopCount), ' · ',
                   el('bdi', { class: 'u-data' }, leg.stops.map((s) => s.code).join(', '))]),
            ]),

            el('div', { class: 'c-leg__point c-leg__point--end' }, [
              el('p', { class: 'c-leg__time' }, [
                time(leg.arriveAt),
                // A next-day arrival is the single most missed detail on a
                // ticket, so it is marked, not implied.
                offset > 0 ? el('sup', { class: 'c-leg__next-day' }, `+${offset}`) : null,
              ]),
              el('p', { class: 'c-leg__code' }, leg.to.code),
              el('p', { class: 'c-leg__city' }, pick(leg.to, 'city')),
            ]),
          ]),

          el('div', { class: 'c-flight__meta' }, [
            el('span', { class: 'c-flight__meta-item' }, [
              icon('no-baggage', { size: 'sm' }),
              el('span', {}, `${t('flight.baggage')} ${flight.baggage.checkedKg}kg + ${flight.baggage.cabinKg}kg`),
            ]),
            el('span', { class: 'c-flight__meta-item' }, [
              icon(flight.fare.refundable ? 'no-check-circle' : 'no-info', { size: 'sm' }),
              el('span', {}, pick(flight.fare, 'label')),
            ]),
            flight.seatsLeft != null && flight.seatsLeft <= 5
              ? el('span', { class: 'c-badge c-badge--warning' },
                  getLocale() === 'ar' ? `بقيت ${flight.seatsLeft} مقاعد` : `${flight.seatsLeft} seats left`)
              : null,
          ]),
        ]),

        el('div', { class: 'c-flight__price-rail' }, [
          el('div', {}, [
            el('p', { class: 't-price c-flight__price' }, money(flight.price.amount, flight.price.currency)),
            el('p', { class: 'c-flight__price-note' }, t('flight.perPerson')),
          ]),
          el('button', { class: 'c-btn c-btn--primary', type: 'button' }, [
            el('span', { class: 'c-btn__label' }, t('flight.select')),
            el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' }),
          ]),
        ]),
      ]),
    ]),
  ]);

  return card;
}

/* ---------------------------------------------------------------------------
   HOTEL CARD
   ------------------------------------------------------------------------ */
export function hotelCard(hotel) {
  const titleId = uid('hotel');

  const stars = el('span', {
    class: 'c-rating__stars',
    role: 'img',
    'aria-label': getLocale() === 'ar' ? `${hotel.stars} نجوم` : `${hotel.stars} stars`,
  }, Array.from({ length: hotel.stars }, () => icon('no-star', { size: 'xs', className: 'c-icon--solid' })));

  return el('article', { class: 'c-card c-card--interactive', 'aria-labelledby': titleId }, [
    el('div', { class: 'c-card__media' }, [
      mediaPlaceholder(hotel.image, pick(hotel.imageAlt)),
      hotel.freeCancellation
        ? el('div', { class: 'c-card__badges' }, el('span', { class: 'c-badge c-badge--success' },
            getLocale() === 'ar' ? 'إلغاء مجاني' : 'Free cancellation'))
        : null,
    ]),
    el('div', { class: 'c-card__body' }, [
      el('div', { class: 'l-cluster l-cluster--8' }, [stars, el('span', { class: 'c-rating__score' }, String(hotel.score))]),
      el('h3', { class: 'c-card__title', id: titleId }, [
        el('a', { class: 'c-card__link', href: route(`hotels/${hotel.id}/`) }, pick(hotel, 'name')),
      ]),
      el('p', { class: 'c-hotel__location' }, [
        icon('no-location', { size: 'sm' }),
        el('span', {}, [
          `${pick(hotel.location, 'area')}, ${pick(hotel.location, 'city')} · `,
          // "1.2 km" is a Latin run inside an Arabic sentence; without the
          // isolate it renders as "km 1.2". §06
          el('bdi', { class: 'u-data' }, `${hotel.location.distanceKm} km`),
        ]),
      ]),
      el('p', { class: 'c-card__text' }, [
        pick(hotel.room, 'name'),
        hotel.room.breakfast ? ` · ${getLocale() === 'ar' ? 'شامل الإفطار' : 'Breakfast included'}` : '',
      ].join('')),
    ]),
    el('div', { class: 'c-card__foot' }, [
      el('div', {}, [
        el('p', { class: 't-price' }, money(hotel.price.amount, hotel.price.currency)),
        el('p', { class: 't-caption' }, t('hotel.night')),
      ]),
      el('a', { class: 'c-btn c-btn--secondary c-btn--sm', href: route(`hotels/${hotel.id}/`) }, t('hotel.select')),
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   PACKAGE CARD
   ------------------------------------------------------------------------ */
export function packageCard(pkg) {
  const titleId = uid('pkg');

  return el('article', { class: 'c-card c-card--interactive', 'aria-labelledby': titleId }, [
    el('div', { class: 'c-card__media' }, [
      mediaPlaceholder(pkg.image, pick(pkg.imageAlt)),
      el('div', { class: 'c-card__badges' }, [
        el('span', { class: 'c-badge c-badge--solid' }, t('package.nights', pkg.nights)),
      ]),
    ]),
    el('div', { class: 'c-card__body' }, [
      el('p', { class: 't-overline' }, pick(pkg, 'destination')),
      el('h3', { class: 'c-card__title', id: titleId }, [
        el('a', { class: 'c-card__link', href: route(`packages/${pkg.id}/`) }, pick(pkg, 'title')),
      ]),
      el('ul', { class: 'c-package__includes', role: 'list' },
        pkg.includes.map((item) => el('li', { class: 'c-package__include' }, [
          icon('no-check', { size: 'sm' }),
          el('span', {}, pick(item)),
        ]))),
    ]),
    el('div', { class: 'c-card__foot' }, [
      el('div', {}, [
        el('p', { class: 't-caption' }, t('package.from')),
        el('p', { class: 't-price' }, money(pkg.price.amount, pkg.price.currency)),
        el('p', { class: 't-caption' }, pick(pkg.price.basis)),
      ]),
      el('a', { class: 'c-btn c-btn--primary c-btn--sm', href: route(`packages/${pkg.id}/`) }, t('package.view')),
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   DESTINATION CARD — image · name · descriptor · arrow. 10.4 §08
   The descriptor says what the place is FOR; there is no slot for a rank,
   a count or a price, so none can be invented.
   ------------------------------------------------------------------------ */
export function destinationCard(dest) {
  const titleId = uid('dest');
  return el('article', { class: 'c-card c-card--interactive c-dest', 'aria-labelledby': titleId }, [
    el('div', { class: 'c-card__media' }, mediaPlaceholder(dest.image?.src, pick(dest.image ?? {}, 'alt'))),
    el('div', { class: 'c-card__body' }, [
      el('div', { class: 'c-dest__body' }, [
        el('div', {}, [
          el('h3', { class: 'c-dest__name', id: titleId }, [
            el('a', { class: 'c-card__link', href: route(dest.href) }, pick(dest, 'name')),
          ]),
          el('p', { class: 'c-dest__desc' }, pick(dest, 'desc')),
        ]),
        el('span', { class: 'c-dest__arrow', 'aria-hidden': 'true' }, icon('no-arrow-end', { size: 'md', flip: true })),
      ]),
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   OFFER CARD — image · destination · title · text · [price] · [validity] · CTA
   10.4 §09. Price and validity rows render ONLY when the record carries a
   value. A card with neither is the honest state of an offer the business
   has not priced yet — not a defect to paper over.
   ------------------------------------------------------------------------ */
export function offerCard(offer) {
  const titleId = uid('offer');
  const href = route(offer.href ?? `offers/${offer.id}/`);
  const price = offer.price?.amount != null ? offer.price : null;
  const valid = offer.validUntil ? dateShort(offer.validUntil) : '';

  return el('article', { class: 'c-card c-card--interactive c-offer', 'aria-labelledby': titleId }, [
    el('div', { class: 'c-card__media' }, mediaPlaceholder(offer.image?.src, pick(offer.image ?? {}, 'alt'))),
    el('div', { class: 'c-card__body' }, [
      el('p', { class: 't-overline' }, pick(offer, 'destination')),
      el('h3', { class: 'c-card__title', id: titleId }, [
        el('a', { class: 'c-card__link', href }, pick(offer, 'title')),
      ]),
      offer.descAr || offer.descEn ? el('p', { class: 'c-card__text' }, pick(offer, 'desc')) : null,
      valid ? el('p', { class: 'c-offer__meta' }, [
        el('span', { class: 'c-offer__meta-item' }, [icon('no-calendar', { size: 'sm' }), el('span', {}, t('home.offers.validUntil', valid))]),
      ]) : null,
    ]),
    el('div', { class: 'c-card__foot' }, [
      price
        ? el('div', {}, [
            el('p', { class: 't-caption' }, price.from ? t('package.from') : ''),
            el('p', { class: 't-price' }, money(price.amount, price.currency)),
            price.basisAr || price.basisEn ? el('p', { class: 't-caption' }, pick(price, 'basis')) : null,
          ])
        : el('span', { class: 'c-service-card__cta', 'aria-hidden': 'true' }, [
            t('home.offers.cta'), icon('no-arrow-end', { size: 'sm', flip: true }),
          ]),
      price ? el('a', { class: 'c-btn c-btn--secondary-brand c-btn--sm', href }, t('home.offers.cta')) : null,
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   SUPERVISOR CARD — §29
   The Number One system, with a person inside it. No personal branding.
   ------------------------------------------------------------------------ */
export function supervisorCard(supervisor) {
  const titleId = uid('sup');
  const services = supervisor.services
    .map((id) => SERVICES.find((s) => s.id === id))
    .filter(Boolean);

  return el('article', { class: 'c-card c-supervisor', 'aria-labelledby': titleId }, [
    supervisor.photo
      ? el('img', { class: 'c-supervisor__photo', src: supervisor.photo, alt: '', loading: 'lazy', width: 88, height: 88 })
      : el('span', { class: 'c-supervisor__photo', 'aria-hidden': 'true',
                     style: 'display:grid;place-items:center;color:var(--color-gray-500)' },
          icon('no-customer', { size: 'xl' })),

    el('div', { class: 'l-stack l-stack--4', style: 'align-items:center' }, [
      el('h3', { class: 'c-supervisor__name', id: titleId }, pick(supervisor, 'name')),
      el('p', { class: 'c-supervisor__role' }, pick(supervisor, 'role')),
      supervisor.verified
        ? el('p', { class: 'c-supervisor__verified' }, [
            icon('no-shield', { size: 'sm' }),
            el('span', {}, t('supervisor.verified')),
          ])
        : null,
    ]),

    el('p', { class: 'c-card__text', style: 'text-align:center' }, pick(supervisor, 'bio')),

    el('ul', { class: 'c-supervisor__services', role: 'list' },
      services.map((s) => el('li', {}, el('span', { class: 'c-badge c-badge--outline' }, pick(s, 'title'))))),

    el('a', { class: 'c-btn c-btn--secondary-brand c-btn--sm', href: route(`supervisors/${supervisor.id}/`) }, [
      icon('no-chat', { size: 'sm' }),
      el('span', {}, t('supervisor.contact')),
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   TRIP CARD — Stage 12's shape, rendered with Stage 10.1 parts. §28
   Every trip shows its status AND its next step: §18.12 says the customer
   always knows what happens next.
   ------------------------------------------------------------------------ */
export function tripCard(trip) {
  const titleId = uid('trip');
  const nextStep = pick(trip, 'nextStep');

  return el('article', { class: 'c-card c-card--interactive', 'aria-labelledby': titleId }, [
    el('div', { class: 'c-card__body' }, [
      el('div', { class: 'c-trip__head' }, [
        el('div', {}, [
          el('p', { class: 'c-trip__ref u-data' }, trip.reference),
          el('h3', { class: 'c-trip__route', id: titleId }, [
            el('a', { class: 'c-card__link', href: route(`trips/${trip.id}/`) }, pick(trip, 'title')),
          ]),
        ]),
        statusBadge(trip.status),
      ]),

      el('div', { class: 'l-cluster l-cluster--16', style: 'margin-block-start:var(--space-8)' }, [
        el('span', { class: 'c-flight__meta-item' }, [icon('no-calendar', { size: 'sm' }), el('span', {}, dateShort(trip.departAt))]),
        el('span', { class: 'c-flight__meta-item' }, [icon('no-users', { size: 'sm' }), el('span', {}, t('pax.summary', trip.passengers))]),
        el('span', { class: 'c-flight__meta-item u-data' }, money(trip.total.amount, trip.total.currency)),
      ]),

      nextStep
        ? el('p', { class: 'c-note', style: 'margin-block-start:var(--space-16)' }, [
            icon('no-info', { size: 'sm' }),
            el('span', { class: 'c-note__text' }, nextStep),
          ])
        : null,
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   MEDIA PLACEHOLDER
   Photography is a Stage 10.1 gap (§17): the brief requires real, human,
   authentic imagery that does not exist in this repository yet. Rather than
   ship stock-looking filler, every media slot renders a neutral, on-brand
   placeholder that reserves the exact aspect ratio, so dropping the real
   photograph in later shifts nothing. §30
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
