/* ============================================================================
   COMPONENTS / OFFERS — Stage 10.8. The offers listing and the offer detail
   template.

   Builders take records from data/offers.js and return DOM. The card parts
   (offerBadge, priceBlock, offerMeta, inclusionList, offerCard) live in
   cards.js with the rest of the card system; this file composes pages.
   mountOffers() → window.no.offers · mountOfferDetail() → window.no.offer
   ========================================================================= */

import { el, qs, qsa, render, scrollTo as scrollIntoView, setPageHead } from '../core/dom.js';
import { t, pick, getLocale } from '../core/i18n.js';
import { route } from '../data/config.js';
import {
  OFFER_REGISTRY, OFFER_CATEGORIES, OFFER_STATUSES, DURATION_BUCKETS, OFFER_SORTS, OFFER_GUIDES,
  offerById, offerEntry, queryOffers, offersHave,
} from '../data/offers.js';
import { destinationById, DESTINATION_REGISTRY } from '../data/destinations.js';
import { SERVICE_REGISTRY, serviceById } from '../data/services.js';
import { liveChannels } from '../data/navigation.js';
import { icon, initModals, initAccordions, routeGraphic, sectionHead } from './ui.js';
import { offerCard, offerBadge, priceBlock, offerMeta, inclusionList, mediaPlaceholder } from './cards.js';
import { stateRegion, stateBlock, skeletonCard } from './states.js';
import { supportPanels, journeySteps } from './home.js';

const FILTER_KEYS = ['category', 'destination', 'service', 'duration', 'price', 'period', 'sort'];

/* ---------------------------------------------------------------------------
   HERO — the 10.4 composition with the listing's copy. §2
   ------------------------------------------------------------------------ */
export function offersHero({ onBrowse = null, onHelp = null } = {}) {
  const copy = el('div', { class: 'c-hero__copy' }, [
    el('p', { class: 't-overline' }, t('offers.hero.overline')),
    el('h1', { class: 't-display c-hero__title', id: 'offers-title' }, t('offers.hero.title')),
    el('p', { class: 'c-hero__lead' }, t('offers.hero.lead')),
    el('div', { class: 'l-cluster l-cluster--16' }, [
      el('button', { type: 'button', class: 'c-btn c-btn--primary c-btn--lg', onclick: onBrowse }, t('offers.hero.cta')),
      el('button', { type: 'button', class: 'c-btn c-btn--tertiary c-btn--lg', onclick: onHelp }, t('offers.help.cta')),
    ]),
  ]);
  const media = el('div', { class: 'c-hero__media', dataset: { mediaSlot: 'offers-hero' } }, [mediaPlaceholder(null, t('offers.hero.alt')), routeGraphic()]);
  return [copy, media];
}

/* ---------------------------------------------------------------------------
   CATEGORY CHIPS — data-driven, with counts. §2
   ------------------------------------------------------------------------ */
export function categoryChips({ onSelect, current = '' } = {}) {
  const entries = [{ id: '' }, ...OFFER_CATEGORIES];
  const chips = entries.map((c) => {
    const count = c.id ? OFFER_REGISTRY.filter((o) => o.categories.includes(c.id)).length : OFFER_REGISTRY.length;
    return el('button', {
      type: 'button', class: 'c-chip c-catnav__chip', dataset: { category: c.id }, 'aria-pressed': String(c.id === current),
      onclick: (event) => { chips.forEach((b) => b.setAttribute('aria-pressed', String(b === event.currentTarget))); onSelect?.(c.id); },
    }, [c.icon ? icon(c.icon, { size: 'sm' }) : null, el('span', {}, c.id ? pick(c, 'label') : t('offers.category.all')), el('span', { class: 'c-chip__count u-data' }, String(count))]);
  });
  return el('nav', { class: 'c-catnav c-catnav--inline', 'aria-label': t('offers.category.label') }, [el('div', { class: 'c-catnav__row', role: 'group' }, chips)]);
}

/* ---------------------------------------------------------------------------
   FILTER CONTROLS — one form; inline from tablet up, in a sheet on phones.
   Only filters the data can answer are rendered. §3
   ------------------------------------------------------------------------ */
export function filterControls({ values = {}, onChange, onApply } = {}) {
  const isAr = getLocale() === 'ar';
  const select = (name, labelKey, options, blankKey) => {
    const id = `flt-${name}`;
    return el('div', { class: 'c-field c-filters__field' }, [
      el('label', { class: 'c-field__label', for: id }, t(labelKey)),
      el('select', { class: 'c-field__control', id, name, onchange: (e) => onChange?.(name, e.currentTarget.value) }, [
        blankKey ? el('option', { value: '' }, t(blankKey)) : null,
        ...options.map((o) => el('option', { value: o.value, selected: values[name] === o.value }, o.label)),
      ]),
    ]);
  };
  const destinations = DESTINATION_REGISTRY.filter((d) => OFFER_REGISTRY.some((o) => o.destination === d.id));
  const services = SERVICE_REGISTRY.filter((s) => OFFER_REGISTRY.some((o) => o.services.includes(s.id)));

  const form = el('form', { class: 'c-filters', novalidate: true, onsubmit: (e) => { e.preventDefault(); onApply?.(); } }, [
    select('destination', 'offers.filter.destination', destinations.map((d) => ({ value: d.id, label: pick(d, 'name') })), 'offers.filter.anyDestination'),
    select('service', 'offers.filter.service', services.map((s) => ({ value: s.id, label: pick(s, 'title') })), 'offers.filter.anyService'),
    offersHave('duration') ? select('duration', 'offers.filter.duration', DURATION_BUCKETS.map((b) => ({ value: b.id, label: pick(b, 'label') })), 'offers.filter.anyDuration') : null,
    offersHave('price') ? select('price', 'offers.filter.price', [
      { value: '0-500000', label: isAr ? 'حتى 500,000 ج.س' : 'Up to 500,000 SDG' },
      { value: '500000-1500000', label: isAr ? '500,000 – 1,500,000 ج.س' : '500,000 – 1,500,000 SDG' },
      { value: '1500000-', label: isAr ? 'أكثر من 1,500,000 ج.س' : 'Over 1,500,000 SDG' },
    ], 'offers.filter.anyPrice') : null,
    offersHave('period') ? select('period', 'offers.filter.period', monthOptions(), 'offers.filter.anyPeriod') : null,
    select('sort', 'offers.sort.label', OFFER_SORTS.map((s) => ({ value: s.id, label: pick(s, 'label') }))),
    el('div', { class: 'c-filters__actions' }, [
      el('button', { type: 'submit', class: 'c-btn c-btn--secondary-brand c-filters__apply' }, t('offers.filter.apply')),
      el('button', { type: 'button', class: 'c-btn c-btn--tertiary', onclick: () => { form.reset(); FILTER_KEYS.forEach((k) => onChange?.(k, k === 'sort' ? 'recommended' : '', { silent: true })); onApply?.(); } }, t('offers.filter.reset')),
    ]),
  ]);
  return form;
}
function monthOptions() {
  const now = new Date(); const out = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push({ value: d.toISOString().slice(0, 7), label: new Intl.DateTimeFormat(getLocale() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric' }).format(d) });
  }
  return out;
}

/** The phone sheet: a <dialog class="c-modal"> that hosts the filter form. */
export function filterSheet() {
  return el('dialog', { class: 'c-modal c-filters__sheet', id: 'offers-filters', 'aria-labelledby': 'offers-filters-title' }, [
    el('div', { class: 'c-modal__form' }, [
      el('div', { class: 'c-modal__head' }, [
        el('h2', { class: 't-h3', id: 'offers-filters-title' }, t('offers.filter.title')),
        el('button', { type: 'button', class: 'c-btn c-btn--utility', 'data-modal-close': '', 'aria-label': t('nav.close') }, icon('no-close', { size: 'md' })),
      ]),
      el('div', { class: 'c-modal__body', dataset: { filtersHost: '' } }),
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   DECK + FEATURED. §2 §8
   ------------------------------------------------------------------------ */
export const offerDeck = (list) =>
  el('div', { class: 'l-grid' }, list.map((o) => el('div', { class: 'l-span-4@md l-span-4@lg' }, offerCard(o, { entry: route(offerEntry(o)) }))));

export function featuredOfferCard(offer) {
  return offerCard(offer, { entry: route(offerEntry(offer)), large: true });
}

/* ---------------------------------------------------------------------------
   HELP ME CHOOSE — chips that apply a filter or a sort. §6
   ------------------------------------------------------------------------ */
export function offerGuides({ onPick } = {}) {
  return el('div', { class: 'c-choose__options' }, OFFER_GUIDES.map((g) => el('button', {
    type: 'button', class: 'c-chip', dataset: { guide: g.id }, onclick: () => onPick?.(g.apply),
  }, [icon(g.icon, { size: 'sm' }), el('span', {}, pick(g, 'label'))])));
}

/* ---------------------------------------------------------------------------
   MOUNT — listing. §9 states
   ------------------------------------------------------------------------ */
export function mountOffers({
  root = document,
  load = async () => OFFER_REGISTRY,
  query = async (q) => queryOffers(q),
  initial = {},
} = {}) {
  const mount = (name) => qs(`[data-offers="${name}"]`, root);
  const scrollTo = (id) => scrollIntoView(qs(`#${id}`, root));
  const values = { category: '', destination: '', service: '', duration: '', price: '', period: '', sort: 'recommended', ...initial };
  let data = [];

  render(mount('hero'), offersHero({ onBrowse: () => scrollTo('offers'), onHelp: () => scrollTo('help') }));

  // ---- Filters: one form, moved between the inline host and the phone sheet
  const form = filterControls({
    values,
    onChange: (name, value, { silent } = {}) => { values[name] = value; if (!silent && !sheet.open) apply(); },
    onApply: () => { if (sheet.open) sheet.close('apply'); apply(); },
  });
  const inlineHost = mount('filters');
  const sheet = filterSheet();
  root.body?.append(sheet) ?? document.body.append(sheet);
  const sheetHost = qs('[data-filters-host]', sheet);
  const phone = window.matchMedia('(max-width: 47.999em)');
  // One form, one home at a time: the inline host from tablet up, the sheet
  // on phones. Both hosts are cleared first so a re-mount (language change)
  // never leaves a second copy behind.
  const placeForm = () => { inlineHost.replaceChildren(); sheetHost.replaceChildren(); (phone.matches ? sheetHost : inlineHost).append(form); };
  placeForm();
  phone.addEventListener('change', placeForm);
  const openSheet = el('button', { type: 'button', class: 'c-btn c-btn--secondary c-filters__open', 'data-modal-open': 'offers-filters' }, [icon('no-filter', { size: 'sm' }), el('span', {}, t('offers.filter.title'))]);
  render(mount('filters-open'), openSheet);
  initModals(root);

  // ---- Categories
  render(mount('categories'), categoryChips({ current: values.category, onSelect: (id) => { values.category = id; apply(); } }));

  // ---- Grid + featured regions
  const regions = {
    grid: stateRegion(mount('grid'), {
      loading: () => el('div', { class: 'l-grid' }, Array.from({ length: 3 }, () => el('div', { class: 'l-span-4@md l-span-4@lg' }, skeletonCard()))),
      empty: () => stateBlock({ variant: 'empty', title: t('offers.empty.title'), text: t('offers.empty.text'), actions: [
        { label: t('offers.filter.reset'), variant: 'c-btn--primary', onClick: () => api.reset() },
        { label: t('offers.cta.expert'), href: route('help/contact/') },
      ] }),
    }),
    featured: stateRegion(mount('featured'), {
      loading: () => el('div', { class: 'c-featured' }, [el('div', { class: 'c-featured__lead' }, skeletonCard())]),
      empty: () => stateBlock({ variant: 'empty', title: t('offers.empty.title'), text: t('offers.empty.text'), actions: [{ label: t('offers.cta.expert'), href: route('help/contact/'), variant: 'c-btn--primary' }] }),
    }),
  };

  const count = qs('[data-offers-count]', root);
  const apply = async () => {
    regions.grid.loading();
    let list;
    try { list = await query({ ...values }); }
    catch (error) { console.error('[no] offers query failed', error); regions.grid.error(); return; }
    if (count) count.textContent = t('offers.count', list.length);
    qsa('.c-catnav__chip', mount('categories')).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.category === values.category)));
    list.length ? regions.grid.content(offerDeck(list)) : regions.grid.empty();
  };

  render(mount('help'), offerGuides({ onPick: (patch) => { Object.assign(values, patch); syncForm(); apply(); scrollTo('offers'); } }));
  const syncForm = () => { FILTER_KEYS.forEach((k) => { const f = form.elements[k]; if (f) f.value = values[k] ?? ''; }); };

  Object.values(regions).forEach((r) => r.loading());
  const hydrate = async () => {
    try { data = await load(); }
    catch (error) { console.error('[no] offers failed to load', error); Object.values(regions).forEach((r) => r.error()); return; }
    const featured = data.filter((o) => o.featured);
    featured.length ? regions.featured.content(el('div', { class: 'c-featured' }, [el('div', { class: 'c-featured__lead' }, featuredOfferCard(featured[0]))])) : regions.featured.empty();
    syncForm();
    await apply();
  };

  const api = {
    regions, values, form, sheet,
    apply, reload: hydrate, scrollTo,
    set(patch) { Object.assign(values, patch); syncForm(); return apply(); },
    reset() { FILTER_KEYS.forEach((k) => { values[k] = k === 'sort' ? 'recommended' : ''; }); syncForm(); return apply(); },
    destroy() { phone.removeEventListener('change', placeForm); form.remove(); sheet.remove(); },
  };
  hydrate();
  return api;
}

/* ===========================================================================
   OFFER DETAIL — one template, every offer. §4
   ======================================================================== */
export function getOffer(slug) {
  const offer = offerById(slug);
  if (!offer) return null;
  return { ...offer, destinationRecord: destinationById(offer.destination), statusRecord: OFFER_STATUSES[offer.status] ?? OFFER_STATUSES.request };
}

/** One dominant action, decided by the record. §4 §5 */
export function offerAction(record) {
  const entry = route(offerEntry(record));
  const expert = route('help/contact/');
  const browse = route('offers/');
  if (record.status === 'ended') return { type: 'browse', primary: { label: t('offers.cta.browse'), href: browse }, secondary: { label: t('offers.cta.expert'), href: expert } };
  if (record.status === 'soon') return { type: 'expert', primary: { label: t('offers.cta.expert'), href: expert }, secondary: { label: t('offers.cta.browse'), href: browse } };
  if (record.bookingMode === 'online') return { type: 'book', primary: { label: t('offers.cta.book'), href: entry }, secondary: { label: t('offers.cta.expert'), href: expert } };
  return { type: 'request', primary: { label: t('offers.cta.request'), href: entry }, secondary: { label: t('offers.cta.expert'), href: expert } };
}

export function offerBreadcrumb(record) {
  const category = OFFER_CATEGORIES.find((c) => c.id === record.category);
  const crumbs = [
    { label: t('detail.crumb.home'), href: route('') },
    { label: t('offers.crumb.offers'), href: route('offers/') },
    category ? { label: pick(category, 'label'), href: `${route('offers/')}?category=${category.id}` } : null,
    { label: pick(record, 'title') },
  ].filter(Boolean);
  return el('nav', { class: 'c-breadcrumb', 'aria-label': t('detail.crumb.label') }, [
    el('ol', { class: 'c-breadcrumb__list' }, crumbs.flatMap((c, i) => [
      i ? el('li', { class: 'c-breadcrumb__sep', 'aria-hidden': 'true' }, icon('no-chevron-end', { size: 'xs', flip: true })) : null,
      el('li', {}, c.href ? el('a', { class: 'c-breadcrumb__link', href: c.href }, c.label) : el('span', { 'aria-current': 'page' }, c.label)),
    ])),
  ]);
}

export function offerHero(record) {
  const cta = offerAction(record);
  const copy = el('div', { class: 'c-hero__copy' }, [
    offerBreadcrumb(record),
    el('div', { class: 'l-cluster l-cluster--8' }, [offerBadge(record.statusRecord), ...record.categories.slice(0, 2).map((id) => { const c = OFFER_CATEGORIES.find((x) => x.id === id); return c ? el('span', { class: 'c-badge c-badge--outline' }, pick(c, 'label')) : null; })]),
    el('h1', { class: 't-display c-hero__title', id: 'offer-title' }, pick(record, 'title')),
    offerMeta(record, { destination: true, duration: true }),
    el('p', { class: 'c-hero__lead' }, pick(record, 'short')),
    priceBlock(record, { large: true }),
    el('div', { class: 'l-cluster l-cluster--16' }, [
      el('a', { class: 'c-btn c-btn--primary c-btn--lg', href: cta.primary.href, dataset: { offerAction: cta.type } }, cta.primary.label),
      el('a', { class: 'c-btn c-btn--tertiary c-btn--lg', href: cta.secondary.href }, cta.secondary.label),
    ]),
  ]);
  const media = el('div', { class: 'c-hero__media', dataset: { mediaSlot: `offer-${record.id}` } }, [
    record.image?.src ? el('img', { src: record.image.src, alt: pick(record.image, 'alt'), class: 'u-img-cover', fetchpriority: 'high', decoding: 'async' }) : mediaPlaceholder(null, pick(record.image ?? {}, 'alt')),
    routeGraphic({ d: 'M 40 460 C 60 320, 180 300, 210 210 S 300 100, 356 60', start: [40, 460], end: [356, 60] }),
  ]);
  return [copy, media];
}

const list = (items, iconName, cls = '') => el('ul', { class: `c-detail__points ${cls}`, role: 'list' }, items.map((i) =>
  el('li', { class: 'c-detail__point' }, [icon(iconName, { size: 'sm' }), el('span', {}, pick(i))])));

export function overviewSection(record) {
  return [
    sectionHead({ id: 'overview-title', overline: t('detail.overview.overline'), title: t('offers.overview.title') }),
    el('div', { class: 'l-grid' }, [
      el('p', { class: 't-body-lg l-span-8@md l-span-7@lg c-detail__lead' }, pick(record, 'desc')),
      record.placeholder
        ? el('p', { class: 'c-note l-span-8@md l-span-5@lg', role: 'note' }, [icon('no-info', { size: 'sm' }), el('span', { class: 'c-note__text' }, t('offers.placeholder.note'))])
        : null,
    ]),
  ];
}
export function inclusionsSection(record) {
  if (record.inclusions?.length) return [sectionHead({ id: 'included-title', overline: t('offers.included.overline'), title: t('offers.included.title') }), inclusionList(record.inclusions, { iconName: 'no-check' })];
  // Not yet approved: show what the package is built around, and say so.
  const services = record.services.map(serviceById).filter(Boolean);
  if (!services.length) return null;
  return [
    sectionHead({ id: 'included-title', overline: t('offers.included.overline'), title: t('offers.builtAround.title') }),
    el('p', { class: 't-body t-muted', style: 'margin-block-end:var(--space-24)' }, t('offers.builtAround.text')),
    inclusionList(services.map((s) => ({ ar: s.titleAr, en: s.titleEn, icon: s.icon })), { iconName: 'no-check' }),
  ];
}
export function exclusionsSection(record) {
  if (!record.exclusions?.length) return null;
  return [sectionHead({ id: 'excluded-title', overline: t('offers.excluded.overline'), title: t('offers.excluded.title') }), inclusionList(record.exclusions, { iconName: 'no-minus', muted: true })];
}
export function itinerarySection(record) {
  if (!record.itinerary?.length) return null;
  return [sectionHead({ id: 'itinerary-title', overline: t('offers.itinerary.overline'), title: t('offers.itinerary.title') }),
    el('ol', { class: 'c-itinerary', role: 'list' }, record.itinerary.map((d, i) => el('li', { class: 'c-itinerary__day' }, [
      el('span', { class: 'c-itinerary__num', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
      el('div', { class: 'c-itinerary__body' }, [
        el('p', { class: 't-overline' }, pick(d, 'day')),
        el('h3', { class: 'c-itinerary__title' }, pick(d, 'title')),
        el('p', { class: 'c-itinerary__text' }, pick(d, 'text')),
      ]),
    ])))];
}
export function importantSection(record) {
  if (!record.important?.length) return null;
  return [sectionHead({ id: 'important-title', overline: t('offers.important.overline'), title: t('offers.important.title') }), list(record.important, 'no-info')];
}
function accordion(id, items, labelKey) {
  const node = el('div', { class: 'c-accordion', dataset: { accordion: '' } }, items.map((item, i) => el('div', { class: 'c-accordion__item' }, [
    el('button', { type: 'button', class: 'c-accordion__trigger', 'aria-expanded': i === 0 ? 'true' : 'false', id: `${id}-t${i}` }, [
      el('span', {}, item.q), icon('no-chevron-down', { size: 'sm', className: 'c-accordion__chevron' }),
    ]),
    el('div', { class: 'c-accordion__panel' }, el('div', { class: 'c-accordion__inner' }, el('div', { class: 'c-accordion__content' }, item.a))),
  ])));
  return node;   // show() runs initAccordions on the section once it is in the DOM
}
export function termsSection(record) {
  if (!record.terms?.length) return null;
  return [sectionHead({ id: 'terms-title', overline: t('offers.terms.overline'), title: t('offers.terms.title') }), list(record.terms, 'no-documents')];
}
export function faqSection(record) {
  if (!record.faq?.length) return null;
  return [sectionHead({ id: 'faq-title', overline: t('offers.faq.overline'), title: t('offers.faq.title') }), accordion('faq', record.faq.map((f) => ({ q: pick(f, 'q'), a: pick(f, 'a') })))];
}
export function flowSection(record) {
  const steps = record.bookingMode === 'online'
    ? ['offers.flow.book1', 'offers.flow.book2', 'offers.flow.book3', 'offers.flow.book4', 'offers.flow.book5']
    : ['offers.flow.req1', 'offers.flow.req2', 'offers.flow.req3', 'offers.flow.req4'];
  return [
    sectionHead({ id: 'flow-title', overline: t('offers.flow.overline'), title: t('offers.flow.title') }),
    journeySteps(steps.map((k) => ({ titleAr: t(k), titleEn: t(k), textAr: t(`${k}.text`), textEn: t(`${k}.text`) }))),
  ];
}
export function relatedSection(record) {
  const list = OFFER_REGISTRY.filter((o) => o.id !== record.id).slice(0, 3);
  if (!list.length) return null;
  return [sectionHead({ id: 'related-title', overline: t('offers.related.overline'), title: t('offers.related.title') }), offerDeck(list)];
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
  const cta = offerAction(record);
  return el('div', { class: 'c-cta-band__inner' }, [
    el('div', { class: 'l-stack l-stack--12' }, [
      el('h2', { class: 't-h1 c-cta-band__title', id: 'cta-title' }, t('offers.cta.title', pick(record, 'title'))),
      el('p', { class: 't-body-lg c-cta-band__text' }, t('offers.cta.text')),
    ]),
    el('div', { class: 'c-cta-band__actions' }, [
      el('a', { class: 'c-btn c-btn--primary c-btn--lg', href: cta.primary.href }, cta.primary.label),
      el('a', { class: 'c-btn c-btn--inverse c-btn--lg', href: cta.secondary.href }, cta.secondary.label),
    ]),
  ]);
}

const applyHead = (record) => setPageHead({ title: `${pick(record, 'title')} — ${t('brand.name')}`, description: pick(record, 'short') });

export function mountOfferDetail({ slug, root = document, load = async (s) => getOffer(s) } = {}) {
  const mount = (name) => qs(`[data-offer="${name}"]`, root);
  const sections = ['overview', 'included', 'excluded', 'itinerary', 'important', 'terms', 'faq', 'flow', 'related', 'support', 'cta'];
  const region = stateRegion(mount('hero'), {
    loading: () => el('div', { style: 'display:contents' }, [
      el('div', { class: 'l-stack' }, [el('div', { class: 'c-skeleton c-skeleton--text c-skeleton--line-sm' }), el('div', { class: 'c-skeleton c-skeleton--title' }), el('div', { class: 'c-skeleton c-skeleton--text c-skeleton--line-md' })]),
      el('div', { class: 'c-hero__media c-skeleton' }),
    ]),
    empty: () => stateBlock({ variant: 'empty', title: t('offers.unknown.title'), text: t('offers.unknown.text'), actions: [
      { label: t('offers.cta.browse'), href: route('offers/'), variant: 'c-btn--primary' },
      { label: t('offers.cta.expert'), href: route('help/contact/') },
    ] }),
  });
  const show = (name, content) => {
    const section = mount(name); if (!section) return;
    const body = qs('[data-offer-body]', section) ?? section;
    if (content) { render(body, content); section.hidden = false; initAccordions(section); }
    else { render(body, []); section.hidden = true; }
  };
  const paint = (record) => {
    applyHead(record);
    region.content(offerHero(record));
    // The header tracks this section for the transparent-over-hero surface
    // (header/hero update brief §04/§05); every other page never calls
    // trackHero and the header looks exactly as it always has.
    qs('.c-gh', document)?.no?.trackHero(qs('.c-hero', root));
    show('overview', overviewSection(record));
    show('included', inclusionsSection(record));
    show('excluded', exclusionsSection(record));
    show('itinerary', itinerarySection(record));
    show('important', importantSection(record));
    show('terms', termsSection(record));
    show('faq', faqSection(record));
    show('flow', flowSection(record));
    show('related', relatedSection(record));
    show('support', supportSection());
    show('cta', ctaBand(record));
  };
  const api = {
    region, current: null,
    async render(nextSlug = slug) {
      region.loading(); sections.forEach((s) => show(s, null));
      let record;
      try { record = await load(nextSlug); }
      catch (error) { console.error('[no] offer failed to load', error); region.error(); return null; }
      if (!record) { region.empty(); qs('.c-gh', document)?.no?.trackHero(null); document.title = `${t('offers.unknown.title')} — ${t('brand.name')}`; return null; }
      api.current = record; paint(record); return record;
    },
    reload() { return api.render(slug); },
  };
  api.render(slug);
  return api;
}
