/* ============================================================================
   COMPONENTS / SERVICES — Stage 10.5. The services page sections.

   Builders take records from data/services.js and return DOM. The page
   hands them data; they draw it. mountServices() wires the sections into
   the page's mount points and returns the region controllers plus the
   category filter, exposed as `window.no.services` for QA. §12 / §7
   ========================================================================= */

import { el, qs, qsa, render } from '../core/dom.js';
import { t, pick } from '../core/i18n.js';
import { route } from '../data/config.js';
import {
  SERVICE_REGISTRY, SERVICE_CATEGORIES, SERVICE_KINDS, SERVICE_HELP_OPTIONS,
  serviceById, serviceEntry,
} from '../data/services.js';
import { icon } from './ui.js';
import { serviceCard, mediaPlaceholder } from './cards.js';
import { stateRegion, stateBlock, skeletonService } from './states.js';

/* ---------------------------------------------------------------------------
   HERO — reuses the homepage hero composition (.c-hero). §A
   ------------------------------------------------------------------------ */
export function servicesHero({ onStart = null } = {}) {
  const copy = el('div', { class: 'c-hero__copy' }, [
    el('p', { class: 't-overline' }, t('services.hero.overline')),
    el('h1', { class: 't-display c-hero__title', id: 'services-title' }, t('services.hero.title')),
    el('p', { class: 'c-hero__lead' }, t('services.hero.lead')),
    el('div', { class: 'l-cluster l-cluster--16' }, [
      el('a', { class: 'c-btn c-btn--primary c-btn--lg', href: route('book/'), onclick: onStart }, t('services.hero.cta')),
    ]),
  ]);
  const media = el('div', { class: 'c-hero__media', dataset: { mediaSlot: 'services-hero' } }, [
    mediaPlaceholder(null, t('services.hero.alt')),
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
  path.setAttribute('d', 'M 40 440 C 150 420, 120 250, 220 200 S 330 120, 356 60');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  const a = document.createElementNS(ns, 'circle'); a.setAttribute('cx', '40'); a.setAttribute('cy', '440'); a.setAttribute('r', '4');
  const b = document.createElementNS(ns, 'circle'); b.setAttribute('cx', '356'); b.setAttribute('cy', '60'); b.setAttribute('r', '5');
  svg.append(path, a, b);
  return svg;
}

/* ---------------------------------------------------------------------------
   CATEGORY NAVIGATION — "all" + one chip per category. §B
   Pressing a chip filters the groups and scrolls to the first visible one.
   ------------------------------------------------------------------------ */
export function categoryNav(categories = SERVICE_CATEGORIES, { onSelect = null, current = 'all' } = {}) {
  const entries = [{ id: 'all' }, ...categories];
  const chips = entries.map((c) => el('button', {
    type: 'button', class: 'c-chip c-catnav__chip', dataset: { category: c.id },
    'aria-pressed': String(c.id === current),
    onclick: (event) => {
      chips.forEach((b) => b.setAttribute('aria-pressed', String(b === event.currentTarget)));
      onSelect?.(c.id);
    },
  }, c.id === 'all' ? t('services.nav.all') : pick(c, 'label')));

  // The <nav> is a direct child of <main> (its mount point is display:contents)
  // so `position: sticky` has the whole page as its scrolling box.
  return el('nav', { class: 'c-catnav', 'aria-label': t('services.nav.label') }, [
    el('div', { class: 'l-container' }, el('div', { class: 'c-catnav__row', role: 'group' }, chips)),
  ]);
}

/* ---------------------------------------------------------------------------
   KIND LEGEND — what happens after you pick a service. §C / objective
   ------------------------------------------------------------------------ */
export function kindLegend(kinds = SERVICE_KINDS) {
  return el('ul', { class: 'c-kinds', role: 'list' }, Object.values(kinds).map((k) =>
    el('li', { class: 'c-kinds__item' }, [
      el('span', { class: `c-badge ${k.badge}` }, [icon(k.icon, { size: 'xs' }), el('span', {}, pick(k, 'label'))]),
      el('p', { class: 'c-kinds__text' }, pick(k, 'text')),
    ])));
}

/* ---------------------------------------------------------------------------
   SERVICE GROUP — category label · title · text · card grid. §D
   ------------------------------------------------------------------------ */
export function serviceGroupHead(category) {
  return el('div', { class: 'l-section-head' }, [
    el('p', { class: 't-overline' }, pick(category, 'label')),
    el('h2', { class: 't-h2 u-mark', id: `cat-${category.id}` }, pick(category, 'title')),
    el('p', { class: 't-body t-muted' }, pick(category, 'text')),
  ]);
}

export function serviceCardGrid(services) {
  return el('div', { class: 'l-grid' }, services.map((s) =>
    el('div', { class: 'l-span-4@md l-span-4@lg' }, serviceCard(s, {
      media: true, kind: SERVICE_KINDS[s.kind], entry: route(serviceEntry(s)),
    }))));
}

/* ---------------------------------------------------------------------------
   HELP ME CHOOSE — five options, each a real destination. §E
   ------------------------------------------------------------------------ */
export function helpOptions(options = SERVICE_HELP_OPTIONS, { onSection = null } = {}) {
  const resolve = (target) => {
    if (target.type === 'service') { const s = serviceById(target.id); return s ? route(serviceEntry(s)) : null; }
    return null;
  };
  return el('ul', { class: 'l-grid c-help', role: 'list' }, options.map((o) => {
    const href = resolve(o.target);
    const inner = [
      el('span', { class: 'c-help__icon' }, icon(o.icon, { size: 'lg' })),
      el('span', { class: 'c-help__label' }, pick(o, 'label')),
      el('span', { class: 'c-help__hint' }, pick(o, 'hint')),
      el('span', { class: 'c-help__arrow', 'aria-hidden': 'true' }, icon('no-arrow-end', { size: 'sm', flip: true })),
    ];
    const control = href
      ? el('a', { class: 'c-help__option', href }, inner)
      : el('button', { type: 'button', class: 'c-help__option', onclick: () => onSection?.(o.target.id) }, inner);
    return el('li', { class: 'l-span-4@md l-span-4@lg' }, control);
  }));
}

/* ---------------------------------------------------------------------------
   STICKY OFFSETS — the category nav sits under the header, and a group
   scrolled to must land below both. The header's height changes with its
   scroll state, so both are measured, not assumed. One observer for the
   page; re-mounting (a language change) re-points it.
   ------------------------------------------------------------------------ */
let stickyObserver = null;
function observeStickyOffsets(root) {
  const header = qs('.c-gh', root);
  const nav = qs('.c-catnav', root);
  if (!header || !nav) return;
  stickyObserver?.disconnect();
  const apply = () => {
    document.documentElement.style.setProperty('--sticky-offset', `${header.offsetHeight}px`);
    document.documentElement.style.setProperty('--catnav-height', `${nav.offsetHeight}px`);
  };
  stickyObserver = new ResizeObserver(apply);
  stickyObserver.observe(header);
  stickyObserver.observe(nav);
  apply();
}

/* ---------------------------------------------------------------------------
   MOUNT — wire the page and return the controllers. §7 states
   ------------------------------------------------------------------------ */
export function mountServices({
  root = document,
  load = async () => SERVICE_REGISTRY,
} = {}) {
  const mount = (name) => qs(`[data-services="${name}"]`, root);
  const scrollTo = (id) => qs(`#${id}`, root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  render(mount('hero'), servicesHero());
  render(mount('kinds'), kindLegend());
  render(mount('help'), helpOptions(SERVICE_HELP_OPTIONS, { onSection: scrollTo }));

  // ---- Groups: one region per category
  const regions = {};
  for (const category of SERVICE_CATEGORIES) {
    const section = mount(`group-${category.id}`);
    render(qs('[data-services-head]', section), serviceGroupHead(category));
    regions[category.id] = stateRegion(qs('[data-services-grid]', section), {
      loading: () => el('div', { class: 'l-grid' }, Array.from({ length: 3 }, () => el('div', { class: 'l-span-4@md l-span-4@lg' }, skeletonService()))),
      empty: () => stateBlock({
        variant: 'empty', title: t('services.empty.title'), text: t('services.empty.text'),
        actions: [{ label: t('services.empty.action'), variant: 'c-btn--primary', onClick: () => filter('all') }],
      }),
    });
  }

  // ---- Category filter
  let current = 'all';
  const filter = (id) => {
    current = id;
    for (const category of SERVICE_CATEGORIES) {
      mount(`group-${category.id}`).hidden = id !== 'all' && id !== category.id;
    }
    qsa('.c-catnav__chip', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.category === id)));
    scrollTo(id === 'all' ? 'services-groups' : `group-${id}`);
  };
  render(mount('nav'), categoryNav(SERVICE_CATEGORIES, { onSelect: filter, current }));
  observeStickyOffsets(root);

  Object.values(regions).forEach((r) => r.loading());
  const hydrate = async () => {
    let list;
    try { list = await load(); }
    catch (error) {
      console.error('[no] services failed to load', error);
      Object.values(regions).forEach((r) => r.error());
      return;
    }
    for (const category of SERVICE_CATEGORIES) {
      const items = list.filter((s) => s.category === category.id);
      items.length ? regions[category.id].content(serviceCardGrid(items)) : regions[category.id].empty();
    }
  };
  hydrate();

  return { regions, filter, reload: hydrate, get current() { return current; } };
}
