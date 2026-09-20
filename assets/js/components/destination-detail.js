/* ============================================================================
   COMPONENTS / DESTINATION DETAIL — one template, every destination.

   Mirrors the offer detail template (offers.js): a single reusable page,
   painted from whatever the DESTINATION_REGISTRY record (data/destinations.js)
   actually carries. A section renders only when its data exists — nothing
   here invents a price, a schedule or a visa rule the registry doesn't have.

   mountDestinationDetail({ slug }) → window.no.destination for QA.
   ========================================================================= */

import { el, qs, render, setPageHead } from '../core/dom.js';
import { t, pick } from '../core/i18n.js';
import { route } from '../data/config.js';
import { liveChannels } from '../data/navigation.js';
import {
  DESTINATION_REGIONS, TRAVEL_PURPOSES, destinationById, destinationEntry,
} from '../data/destinations.js';
import { serviceById } from '../data/services.js';
import { OFFER_REGISTRY } from '../data/offers.js';
import { icon, sectionHead } from './ui.js';
import { serviceCard, mediaPlaceholder } from './cards.js';
import { offerDeck } from './offers.js';
import { stateRegion, notFoundState } from './states.js';
import { supportPanels } from './home.js';

/* ---------------------------------------------------------------------------
   RECORD — the registry entry, by id or slug. §19: DESTINATION_REGISTRY
   stays the single source of truth; this is a lookup, not a copy.
   ------------------------------------------------------------------------ */
export function getDestination(slug) {
  return destinationById(slug);
}

/** One dominant action (book), one human door (the travel coordinator). §14 */
export function destAction(record) {
  return {
    primary: { label: t('dest.cta.primary'), href: route(destinationEntry(record)) },
    secondary: { label: t('home.hero.cta.secondary'), href: route('supervisors/') },
  };
}

export function destBreadcrumb(record) {
  const crumbs = [
    { label: t('detail.crumb.home'), href: route('') },
    { label: t('dest.hero.overline'), href: route('destinations/') },
    { label: pick(record, 'name') },
  ];
  return el('nav', { class: 'c-breadcrumb', 'aria-label': t('detail.crumb.label') }, [
    el('ol', { class: 'c-breadcrumb__list' }, crumbs.flatMap((c, i) => [
      i ? el('li', { class: 'c-breadcrumb__sep', 'aria-hidden': 'true' }, icon('no-chevron-end', { size: 'xs', flip: true })) : null,
      el('li', {}, c.href ? el('a', { class: 'c-breadcrumb__link', href: c.href }, c.label) : el('span', { 'aria-current': 'page' }, c.label)),
    ])),
  ]);
}

/* ---------------------------------------------------------------------------
   HERO — full-bleed photo (12-header.css §14 tracks it for the transparent
   header; 14-home.css .c-hero--full/--photo draw it edge to edge). The
   build-routes.mjs shell puts .c-hero--photo .c-hero--full on the section
   itself; this only fills the copy/media slots.
   ------------------------------------------------------------------------ */
export function destHero(record) {
  const cta = destAction(record);
  const copy = el('div', { class: 'c-hero__copy' }, [
    destBreadcrumb(record),
    el('h1', { class: 't-display c-hero__title', id: 'dest-title' }, pick(record, 'name')),
    el('p', { class: 'c-hero__lead' }, pick(record, 'desc')),
    el('div', { class: 'l-cluster l-cluster--16' }, [
      el('a', { class: 'c-btn c-btn--primary c-btn--lg', href: cta.primary.href }, cta.primary.label),
      el('a', { class: 'c-btn c-btn--tertiary c-btn--lg', href: cta.secondary.href }, cta.secondary.label),
    ]),
  ]);
  const media = el('div', { class: 'c-hero__media', dataset: { mediaSlot: `dest-${record.id}` } }, [
    record.image?.src
      ? el('img', { src: record.image.src, alt: pick(record.image, 'alt'), class: 'u-img-cover', fetchpriority: 'high', decoding: 'async' })
      : mediaPlaceholder(null, pick(record.image ?? {}, 'alt')),
  ]);
  return [copy, media];
}

/* ---------------------------------------------------------------------------
   SECTIONS — each returns null (hidden by the shell) when it has nothing
   the registry actually says. §11/§4
   ------------------------------------------------------------------------ */
export function overviewSection(record) {
  const region = DESTINATION_REGIONS.find((r) => r.id === record.region);
  const place = [pick(record, 'country'), region ? pick(region, 'label') : null].filter(Boolean).join(' — ');
  const facts = [place ? { icon: 'no-location', text: place } : null].filter(Boolean);
  return [
    sectionHead({ id: 'overview-title', overline: t('detail.overview.overline'), title: t('dest.detail.overview.title', pick(record, 'name')) }),
    el('div', { class: 'l-grid' }, [
      el('p', { class: 't-body-lg l-span-8@md l-span-7@lg c-detail__lead' }, pick(record, 'desc')),
      facts.length
        ? el('ul', { class: 'c-detail__points l-span-8@md l-span-5@lg', role: 'list' }, facts.map((f) =>
            el('li', { class: 'c-detail__point' }, [icon(f.icon, { size: 'sm' }), el('span', {}, f.text)])))
        : null,
    ]),
  ];
}

export function travelSection(record) {
  const purposes = (record.purposes ?? []).map((id) => TRAVEL_PURPOSES.find((p) => p.id === id)).filter(Boolean);
  if (!purposes.length) return null;
  return [
    sectionHead({ id: 'travel-title', overline: t('dest.detail.travel.overline'), title: t('dest.detail.travel.title', pick(record, 'name')) }),
    el('ul', { class: 'c-detail__points', role: 'list' }, purposes.map((p) =>
      el('li', { class: 'c-detail__point' }, [icon(p.icon, { size: 'sm' }), el('span', {}, [pick(p, 'label'), ' — ', pick(p, 'hint')])]))),
  ];
}

/** Only the services this destination's record actually lists. §12 */
export function relatedServicesSection(record) {
  const list = (record.services ?? []).map(serviceById).filter(Boolean);
  if (!list.length) return null;
  return [
    sectionHead({ id: 'services-title', overline: t('dest.detail.services.overline'), title: t('dest.detail.services.title', pick(record, 'name')) }),
    el('div', { class: 'l-grid' }, list.map((s) => el('div', { class: 'l-span-4@md l-span-4@lg' }, serviceCard(s)))),
  ];
}

/** Only offers the registry actually associates with this destination. §13 */
export function relatedOffersSection(record) {
  const list = OFFER_REGISTRY.filter((o) => o.destination === record.id);
  if (!list.length) return null;
  return [
    sectionHead({ id: 'offers-title', overline: t('dest.detail.offers.overline'), title: t('dest.detail.offers.title', pick(record, 'name')) }),
    offerDeck(list),
  ];
}

export function supportSection() {
  return [
    el('div', { class: 'l-section-head' }, [
      el('p', { class: 't-overline' }, t('home.support.overline')),
      el('h2', { class: 't-h2', id: 'support-title' }, t('detail.support.title')),
      el('p', { class: 't-body-lg t-muted' }, t('detail.support.text')),
    ]),
    supportPanels(undefined, liveChannels()),
  ];
}

export function ctaBand(record) {
  const cta = destAction(record);
  return el('div', { class: 'c-cta-band__inner' }, [
    el('div', { class: 'l-stack l-stack--12' }, [
      el('h2', { class: 't-h1 c-cta-band__title', id: 'cta-title' }, t('dest.cta.title')),
      el('p', { class: 't-body-lg c-cta-band__text' }, t('dest.cta.text')),
    ]),
    el('div', { class: 'c-cta-band__actions' }, [
      el('a', { class: 'c-btn c-btn--primary c-btn--lg', href: cta.primary.href }, cta.primary.label),
      el('a', { class: 'c-btn c-btn--inverse c-btn--lg', href: cta.secondary.href }, cta.secondary.label),
    ]),
  ]);
}

const unknownState = () => notFoundState({
  title: t('dest.detail.unknown.title'), text: t('dest.detail.unknown.text'),
  actions: [
    { label: t('dest.hero.cta'), href: route('destinations/'), variant: 'c-btn--primary' },
    { label: t('dest.cta.expert'), href: route('help/contact/') },
  ],
});

const applyHead = (record) => setPageHead({ title: `${pick(record, 'name')} — ${t('brand.name')}`, description: pick(record, 'desc') });

/* ---------------------------------------------------------------------------
   MOUNT
   ------------------------------------------------------------------------ */
export function mountDestinationDetail({ slug, root = document, load = async (s) => getDestination(s) } = {}) {
  const mount = (name) => qs(`[data-dest="${name}"]`, root);
  const sections = ['overview', 'travel', 'services', 'offers', 'support', 'cta'];
  const region = stateRegion(mount('hero'), {
    loading: () => el('div', { style: 'display:contents' }, [
      el('div', { class: 'l-stack' }, [el('div', { class: 'c-skeleton c-skeleton--text c-skeleton--line-sm' }), el('div', { class: 'c-skeleton c-skeleton--title' }), el('div', { class: 'c-skeleton c-skeleton--text c-skeleton--line-md' })]),
      el('div', { class: 'c-hero__media c-skeleton' }),
    ]),
    empty: unknownState,
  });
  const show = (name, content) => {
    const section = mount(name); if (!section) return;
    const body = qs('[data-dest-body]', section) ?? section;
    if (content) { render(body, content); section.hidden = false; }
    else { render(body, []); section.hidden = true; }
  };
  const paint = (record) => {
    applyHead(record);
    region.content(destHero(record));
    // The header tracks this section itself (not the copy/media it just
    // received) so the transparent-over-hero state (12-header.css §14)
    // keys off the full 100vh section, not the two-column content inside it.
    qs('.c-gh', document)?.no?.trackHero(qs('.c-hero', root));
    show('overview', overviewSection(record));
    show('travel', travelSection(record));
    show('services', relatedServicesSection(record));
    show('offers', relatedOffersSection(record));
    show('support', supportSection());
    show('cta', ctaBand(record));
  };
  const api = {
    region, current: null,
    async render(nextSlug = slug) {
      region.loading(); sections.forEach((s) => show(s, null));
      let record;
      try { record = await load(nextSlug); }
      catch (error) { console.error('[no] destination failed to load', error); region.error(); return null; }
      if (!record) {
        region.empty();
        qs('.c-gh', document)?.no?.trackHero(null);
        document.title = `${t('dest.detail.unknown.title')} — ${t('brand.name')}`;
        return null;
      }
      api.current = record; paint(record); return record;
    },
    reload() { return api.render(slug); },
  };
  api.render(slug);
  return api;
}
