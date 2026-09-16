/* ============================================================================
   COMPONENTS / DESTINATIONS — Stage 10.7. The destinations page sections.

   Builders take records from data/destinations.js and return DOM.
   mountDestinations() wires the page and returns the region controllers,
   the search and the region filter — exposed as `window.no.destinations`.
   ========================================================================= */

import { el, qs, qsa, render } from '../core/dom.js';
import { t, pick } from '../core/i18n.js';
import { route } from '../data/config.js';
import {
  DESTINATION_REGISTRY, DESTINATION_REGIONS, TRAVEL_PURPOSES,
  destinationsIn, destinationsFor, featuredDestinations, regionsWithDestinations,
  destinationEntry, searchDestinations, destinationById,
} from '../data/destinations.js';
import { serviceById } from '../data/services.js';
import { icon } from './ui.js';
import { destinationCard, mediaPlaceholder } from './cards.js';
import { searchWidget } from './search.js';
import { stateRegion, stateBlock, skeletonCard } from './states.js';

const richCard = (d) => destinationCard(d, { country: true, services: true, entry: route(destinationEntry(d)) });

/* ---------------------------------------------------------------------------
   HERO — the 10.4 composition. §3
   ------------------------------------------------------------------------ */
export function destinationsHero({ onExplore = null, onHelp = null } = {}) {
  const copy = el('div', { class: 'c-hero__copy' }, [
    el('p', { class: 't-overline' }, t('dest.hero.overline')),
    el('h1', { class: 't-display c-hero__title', id: 'destinations-title' }, t('dest.hero.title')),
    el('p', { class: 'c-hero__lead' }, t('dest.hero.lead')),
    el('div', { class: 'l-cluster l-cluster--16' }, [
      el('button', { type: 'button', class: 'c-btn c-btn--primary c-btn--lg', onclick: onExplore }, t('dest.hero.cta')),
      el('button', { type: 'button', class: 'c-btn c-btn--tertiary c-btn--lg', onclick: onHelp }, t('dest.help.cta')),
    ]),
  ]);
  const media = el('div', { class: 'c-hero__media', dataset: { mediaSlot: 'destinations-hero' } }, [
    mediaPlaceholder(null, t('dest.hero.alt')),
    routeGraphic(),
  ]);
  return [copy, media];
}

function routeGraphic() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'c-hero__route'); svg.setAttribute('viewBox', '0 0 400 500');
  svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M 40 430 C 120 300, 90 200, 200 180 S 320 140, 356 60');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  const a = document.createElementNS(ns, 'circle'); a.setAttribute('cx', '40'); a.setAttribute('cy', '430'); a.setAttribute('r', '4');
  const m = document.createElementNS(ns, 'circle'); m.setAttribute('cx', '200'); m.setAttribute('cy', '180'); m.setAttribute('r', '3');
  const b = document.createElementNS(ns, 'circle'); b.setAttribute('cx', '356'); b.setAttribute('cy', '60'); b.setAttribute('r', '5');
  svg.append(path, a, m, b);
  return svg;
}

/* ---------------------------------------------------------------------------
   SEARCH — the shared search widget on its own vertical. §4
   Submitting filters the registry (today) and paints the results region.
   ------------------------------------------------------------------------ */
export function destinationSearch({ onSearch }) {
  return searchWidget({
    verticals: ['destinations'],
    onSubmit: (vertical, formData) => onSearch({
      q: formData.get('destination') ?? '', region: formData.get('region') ?? '', purpose: formData.get('purpose') ?? '',
      depart: formData.get('depart') ?? '',
    }),
  });
}

/* ---------------------------------------------------------------------------
   GRIDS — every card is destinationCard from the card system. §5 §6
   ------------------------------------------------------------------------ */
export const destinationDeck = (list) =>
  el('div', { class: 'l-grid' }, list.map((d) => el('div', { class: 'l-span-4@md l-span-4@lg' }, richCard(d))));

/** Six first, the rest behind one button — progressive disclosure. */
export function destinationGridDisclosed(list, { first = 6 } = {}) {
  const head = list.slice(0, first);
  const rest = list.slice(first);
  const grid = destinationDeck(head);
  const wrap = el('div', {}, [grid]);
  if (!rest.length) return wrap;
  const label = el('span', {}, t('dest.showAll', rest.length));
  const button = el('button', {
    type: 'button', class: 'c-btn c-btn--secondary', 'aria-expanded': 'false',
    onclick: () => {
      const open = button.getAttribute('aria-expanded') === 'true';
      render(grid, (open ? head : list).map((d) => el('div', { class: 'l-span-4@md l-span-4@lg' }, richCard(d))));
      button.setAttribute('aria-expanded', String(!open));
      label.textContent = open ? t('dest.showAll', rest.length) : t('dest.showLess');
    },
  }, [label, icon('no-chevron-down', { size: 'sm' })]);
  wrap.append(el('div', { class: 'c-disclose' }, button));
  return wrap;
}

/* ---------------------------------------------------------------------------
   REGION NAV — chips for the regions that contain something (+ all). §7
   ------------------------------------------------------------------------ */
export function regionNav({ onSelect, current, regions = DESTINATION_REGIONS } = {}) {
  // One chip per structural region, with its count. The full list already
  // lives in the section above, so there is no "all" here.
  const chips = regions.map((r) => {
    const count = destinationsIn(r.id).length;
    return el('button', {
      type: 'button', class: 'c-chip c-catnav__chip', dataset: { region: r.id }, 'aria-pressed': String(r.id === current),
      onclick: (event) => { chips.forEach((b) => b.setAttribute('aria-pressed', String(b === event.currentTarget))); onSelect?.(r.id); },
    }, [el('span', {}, pick(r, 'label')), el('span', { class: 'c-chip__count u-data' }, String(count))]);
  });
  return el('nav', { class: 'c-catnav c-catnav--inline', 'aria-label': t('dest.region.label') }, [
    el('div', { class: 'c-catnav__row', role: 'group' }, chips),
  ]);
}

/* ---------------------------------------------------------------------------
   FEATURED — one large card, up to two supporting; degrades by count. §8
   ------------------------------------------------------------------------ */
export function featuredBlock(list = featuredDestinations()) {
  if (!list.length) return null;
  const [lead, ...rest] = list;
  const support = rest.slice(0, 2);
  return el('div', { class: 'c-featured', dataset: { count: String(1 + support.length) } }, [
    el('div', { class: 'c-featured__lead' }, destinationCard(lead, { country: true, services: true, entry: route(destinationEntry(lead)), large: true })),
    support.length ? el('div', { class: 'c-featured__side' }, support.map(richCard)) : null,
  ]);
}

/* ---------------------------------------------------------------------------
   TRAVEL PURPOSE — tiles that run a purpose search. §9
   ------------------------------------------------------------------------ */
export function purposeTiles({ onPick } = {}) {
  return el('ul', { class: 'l-grid c-help', role: 'list' }, TRAVEL_PURPOSES.map((p) => {
    const count = destinationsFor(p.id).length;
    const service = serviceById(p.service);
    return el('li', { class: 'l-span-4@md l-span-4@lg' }, el('button', {
      type: 'button', class: 'c-help__option', dataset: { purpose: p.id }, onclick: () => onPick?.(p.id),
    }, [
      el('span', { class: 'c-help__icon' }, icon(p.icon, { size: 'lg' })),
      el('span', { class: 'c-help__label' }, pick(p, 'label')),
      el('span', { class: 'c-help__hint' }, [
        pick(p, 'hint'),
        ' · ',
        el('span', {}, t('dest.purpose.count', count)),
        service ? [' · ', el('span', {}, pick(service, 'title'))] : null,
      ]),
      el('span', { class: 'c-help__arrow', 'aria-hidden': 'true' }, icon('no-arrow-end', { size: 'sm', flip: true })),
    ]));
  }));
}

/* ---------------------------------------------------------------------------
   HELP ME CHOOSE — the entry point to the flow. §10
   ------------------------------------------------------------------------ */
export function helpBand() {
  return el('div', { class: 'c-choose c-choose--band' }, [
    el('div', { class: 'l-stack l-stack--12' }, [
      el('p', { class: 't-overline' }, t('home.choose.overline')),
      el('h2', { class: 't-h2', id: 'help-title' }, t('dest.help.title')),
      el('p', { class: 't-body t-muted' }, t('dest.help.text')),
    ]),
    el('div', { class: 'c-choose__foot' }, [
      el('a', { class: 'c-btn c-btn--secondary-brand c-btn--lg', href: route('services/') + '#help' }, [el('span', {}, t('dest.help.cta')), icon('no-arrow-end', { size: 'sm', flip: true })]),
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   MOUNT
   ------------------------------------------------------------------------ */
export function mountDestinations({
  root = document,
  load = async () => DESTINATION_REGISTRY,
  search = async (query) => searchDestinations(query),
} = {}) {
  const mount = (name) => qs(`[data-destinations="${name}"]`, root);
  const scrollTo = (id) => qs(`#${id}`, root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const emptyWith = (titleKey, textKey, actions) => () => stateBlock({ variant: 'empty', title: t(titleKey), text: t(textKey), actions });
  const grid3 = () => el('div', { class: 'l-grid' }, Array.from({ length: 3 }, () => el('div', { class: 'l-span-4@md l-span-4@lg' }, skeletonCard())));

  // ---- Search + results
  const regions = {};
  const resultsSection = mount('results');
  regions.results = stateRegion(qs('[data-destinations-body]', resultsSection), {
    loading: grid3,
    empty: emptyWith('dest.results.empty.title', 'dest.results.empty.text', [
      { label: t('dest.results.reset'), variant: 'c-btn--primary', onClick: () => api.resetSearch() },
      { label: t('dest.cta.expert'), href: route('help/contact/') },
    ]),
  });
  const runSearch = async (query) => {
    resultsSection.hidden = false;
    regions.results.loading();
    let list;
    try { list = await search(query); }
    catch (error) { console.error('[no] destination search failed', error); regions.results.error(); return; }
    const title = qs('[data-destinations-results-title]', resultsSection);
    if (title) title.textContent = t('dest.results.title', list.length);
    list.length ? regions.results.content(destinationDeck(list)) : regions.results.empty();
    scrollTo('results');
  };
  const widget = destinationSearch({ onSearch: runSearch });
  render(mount('search'), widget);

  // ---- Hero
  render(mount('hero'), destinationsHero({ onExplore: () => scrollTo('popular'), onHelp: () => scrollTo('help') }));

  // ---- Popular / all
  regions.popular = stateRegion(mount('popular'), {
    loading: grid3,
    empty: emptyWith('dest.empty.title', 'dest.empty.text', [{ label: t('dest.cta.expert'), href: route('help/contact/'), variant: 'c-btn--primary' }]),
  });

  // ---- By region — opens on the first region that contains something
  let currentRegion = regionsWithDestinations()[0]?.id ?? DESTINATION_REGIONS[0].id;
  regions.region = stateRegion(mount('region-grid'), {
    loading: grid3,
    empty: emptyWith('dest.region.empty.title', 'dest.region.empty.text', [
      { label: t('dest.region.all'), variant: 'c-btn--primary', onClick: () => api.scrollTo('popular') },
      { label: t('dest.cta.expert'), href: route('help/contact/') },
    ]),
  });
  const paintRegion = (list) => {
    const subset = list.filter((d) => d.region === currentRegion);
    subset.length ? regions.region.content(destinationDeck(subset)) : regions.region.empty();
  };

  // ---- Featured
  regions.featured = stateRegion(mount('featured'), {
    loading: () => el('div', { class: 'c-featured' }, [el('div', { class: 'c-featured__lead' }, skeletonCard()), el('div', { class: 'c-featured__side' }, [skeletonCard(), skeletonCard()])]),
    empty: emptyWith('dest.empty.title', 'dest.empty.text', [{ label: t('dest.cta.expert'), href: route('help/contact/'), variant: 'c-btn--primary' }]),
  });

  // ---- Purposes + help
  render(mount('purposes'), purposeTiles({ onPick: (purposeId) => api.searchPurpose(purposeId) }));
  render(mount('help'), helpBand());

  let data = [];
  Object.values(regions).forEach((r) => r.loading());
  resultsSection.hidden = true;

  const hydrate = async () => {
    try { data = await load(); }
    catch (error) {
      console.error('[no] destinations failed to load', error);
      ['popular', 'region', 'featured'].forEach((k) => regions[k].error());
      return;
    }
    data.length ? regions.popular.content(destinationGridDisclosed(data)) : regions.popular.empty();
    render(mount('region-nav'), regionNav({ onSelect: (id) => api.filterRegion(id), current: currentRegion }));
    paintRegion(data);
    const featured = data.filter((d) => d.featured);
    featured.length ? regions.featured.content(featuredBlock(featured)) : regions.featured.empty();
  };

  const api = {
    regions, widget,
    get region() { return currentRegion; },
    filterRegion(id) {
      currentRegion = id;
      qsa('.c-catnav__chip', mount('region-nav')).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.region === id)));
      paintRegion(data);
    },
    search: runSearch,
    searchPurpose(purposeId) {
      const select = widget.querySelector('select[name="purpose"]');
      if (select) select.value = purposeId;
      return runSearch({ purpose: purposeId });
    },
    resetSearch() {
      widget.querySelector('form')?.reset();
      resultsSection.hidden = true;
      scrollTo('search');
    },
    reload: hydrate,
    scrollTo,
  };
  hydrate();
  return api;
}
