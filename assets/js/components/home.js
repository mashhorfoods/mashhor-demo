/* ============================================================================
   COMPONENTS / HOME — Stage 10.4. The homepage sections.

   Each builder takes records (data/home.js) and returns DOM. None of them
   fetch, route or hold booking logic: the page hands them data and they
   draw it, which is what lets Stage 14 replace the static records with an
   API response and change nothing here. §20 of the 10.4 brief.

   mountHome() wires the sections into the page's mount points and returns
   the region controllers, so every dynamic area can be switched between
   loading / content / empty / error from one place (§15). The homepage
   exposes that handle as `window.no.home` for QA.
   ========================================================================= */

import { el, qs, render, scrollTo as scrollIntoView } from '../core/dom.js';
import { t, pick, getLocale } from '../core/i18n.js';
import { route } from '../data/config.js';
import { liveChannels } from '../data/navigation.js';
import {
  HOME_HERO, HOME_SERVICES, HOME_PRIORITIES,
  HOME_DESTINATIONS, HOME_OFFERS, HOME_SUPPORT,
} from '../data/home.js';
import { SUPERVISOR_REGISTRY } from '../data/supervisors.js';
import { icon, setButtonState, routeGraphic } from './ui.js';
import { buildContext, validate, saveContext, continueUrl, applyEntryParams } from '../core/booking.js';
import { serviceCard, destinationCard, offerCard, mediaPlaceholder } from './cards.js';
import { supervisorCard } from './supervisor.js';
import { searchWidget } from './search.js';
import { stateRegion, stateBlock, skeletonService, skeletonCard } from './states.js';
import { newsletterCard } from './newsletter.js';
import { providerGrid } from './providers.js';
import { imageSrc } from '../data/images.js';

/* ---------------------------------------------------------------------------
   HERO — copy, media slot, booking entry. §04
   ------------------------------------------------------------------------ */
export function heroCopy(hero = HOME_HERO) {
  return el('div', { class: 'c-hero__copy' }, [
    el('p', { class: 't-overline' }, pick(hero, 'overline')),
    el('h1', { class: 't-display c-hero__title', id: 'hero-title' }, pick(hero, 'title')),
    el('p', { class: 'c-hero__lead' }, pick(hero, 'lead')),
    el('div', { class: 'c-hero__actions' }, [
      // Not c-btn--primary: the site caps visible primaries at 3 (header,
      // search, final CTA) — this stays visually strong without competing.
      el('a', { class: 'c-btn c-btn--secondary-brand c-btn--sm', href: '#booking', dataset: { homeAction: 'hero-book' } }, t('home.hero.cta.primary')),
      el('a', { class: 'c-btn c-btn--inverse c-btn--sm', href: route('supervisors/') }, t('home.hero.cta.secondary')),
    ]),
    el('ul', { class: 'c-trust-list c-hero__trust', role: 'list' }, hero.trust.map((key) =>
      el('li', { class: 'c-trust-item' }, [icon('no-check-circle', { size: 'sm' }), el('span', {}, t(key))]))),
  ]);
}

/** The §16 route graphic: one dashed path from the near corner to a point. */

export function heroMedia(hero = HOME_HERO) {
  const media = el('div', {
    class: 'c-hero__media', dataset: { mediaSlot: 'hero' },
    style: hero.media.ratio ? `--hero-media-ratio:${hero.media.ratio}` : null,
  }, [
    hero.media.src
      ? el('img', { src: hero.media.src, alt: pick(hero.media, 'alt'), class: 'u-img-cover',
                    fetchpriority: 'high', decoding: 'async' })
      : mediaPlaceholder(null, pick(hero.media, 'alt')),
    routeGraphic({ d: 'M 40 460 C 120 380, 140 220, 250 170 S 340 90, 356 60', start: [40, 460], end: [356, 60] }),
  ]);
  return media;
}

/**
 * The booking entry. Submitting navigates to the Stage 11 search route with
 * the fields as a query string — the homepage never runs a search itself.
 * `priority` (from Help Me Choose) travels with it as `sort`.
 */
export function heroSearch({ onSubmit = null, getPriority = () => null, getOffer = () => '' } = {}) {
  const widget = searchWidget({
    onSubmit: (vertical, formData, form) => {
      // The same context, rules and messages as the booking entry (core/booking.js). §12
      widget.no.clearErrors();
      const ctx = buildContext(vertical, formData, { sort: getPriority() ?? '', offer: getOffer() ?? '' });
      const errors = validate(vertical, ctx);
      if (errors.length) {
        let first = null;
        for (const e of errors) { const c = widget.no.setError(e.field, e.message, e.index); first ??= c; }
        first?.focus();
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      if (button) setButtonState(button, 'loading');
      const params = contextParams(ctx);
      if (onSubmit?.(vertical, params, ctx) === false) {
        if (button) setButtonState(button, 'idle');
        return;
      }
      saveContext(ctx);
      window.location.assign(continueUrl(ctx));
    },
  });
  return widget;
}
const contextParams = (ctx) => new URL(continueUrl(ctx), location.href).searchParams;

/* ---------------------------------------------------------------------------
   SERVICES — the card grid with progressive disclosure. §05
   `featured` records show first; the rest sit behind one button.
   ------------------------------------------------------------------------ */
export function servicesGrid(services = HOME_SERVICES, { expanded = false } = {}) {
  const featured = services.filter((s) => s.featured);
  const rest = services.filter((s) => !s.featured);
  const hasMore = rest.length > 0;

  const grid = el('div', { class: 'l-auto-grid', style: '--min-col:16rem' },
    (expanded || !hasMore ? services : featured).map(serviceCard));

  const wrap = el('div', {}, [grid]);
  if (!hasMore) return wrap;

  const label = el('span', {}, expanded ? t('home.services.showLess') : t('home.services.showAll', rest.length));
  const button = el('button', {
    type: 'button', class: 'c-btn c-btn--secondary', 'aria-expanded': String(expanded),
    onclick: () => {
      const open = button.getAttribute('aria-expanded') === 'true';
      render(grid, (open ? featured : services).map(serviceCard));
      button.setAttribute('aria-expanded', String(!open));
      label.textContent = open ? t('home.services.showAll', rest.length) : t('home.services.showLess');
      if (open) grid.querySelector('a')?.focus();
    },
  }, [label, icon('no-chevron-down', { size: 'sm' })]);
  wrap.append(el('div', { class: 'c-disclose' }, button));
  return wrap;
}

/* ---------------------------------------------------------------------------
   HELP ME CHOOSE — priorities as pressable chips. §07
   Returns the node and a getter for the selected sort key, which the
   search carries into Stage 11.
   ------------------------------------------------------------------------ */
export function chooseModule(priorities = HOME_PRIORITIES, { onGo = null, initial = null } = {}) {
  let selected = initial;
  const status = el('p', { class: 'c-choose__selected', 'aria-live': 'polite' });

  const paintStatus = () => {
    const item = priorities.find((p) => p.sort === selected);
    status.textContent = item ? t('home.choose.selected', pick(item, 'label')) : t('home.choose.none');
    go.disabled = !item;
  };

  const chips = priorities.map((p) => el('button', {
    type: 'button', class: 'c-chip c-choose__option', 'aria-pressed': String(p.sort === selected),
    dataset: { sort: p.sort },
    onclick: (event) => {
      const chip = event.currentTarget;
      const pressed = chip.getAttribute('aria-pressed') === 'true';
      chips.forEach((c) => c.setAttribute('aria-pressed', 'false'));
      selected = pressed ? null : p.sort;
      if (!pressed) chip.setAttribute('aria-pressed', 'true');
      paintStatus();
    },
  }, [
    el('span', { class: 'c-choose__label' }, [icon(p.icon, { size: 'sm' }), el('span', {}, pick(p, 'label'))]),
    el('span', { class: 'c-choose__hint' }, pick(p, 'hint')),
  ]));

  const go = el('button', {
    type: 'button', class: 'c-btn c-btn--secondary-brand',
    onclick: () => onGo?.(selected),
  }, [el('span', {}, t('home.choose.cta')), icon('no-arrow-end', { size: 'sm', flip: true })]);

  const node = el('div', { class: 'c-choose' }, [
    el('div', { class: 'l-stack l-stack--12' }, [
      el('p', { class: 't-overline' }, t('home.choose.overline')),
      el('h2', { class: 't-h2', id: 'choose-title' }, t('home.choose.title')),
      el('p', { class: 't-body t-muted' }, t('home.choose.text')),
    ]),
    el('div', { class: 'l-stack l-stack--24' }, [
      el('div', { class: 'c-choose__options', role: 'group', 'aria-labelledby': 'choose-title' }, chips),
      el('div', { class: 'c-choose__foot' }, [go, status]),
    ]),
  ]);
  paintStatus();
  node.no = { get selected() { return selected; } };
  return node;
}

/* ---------------------------------------------------------------------------
   DESTINATIONS / OFFERS — card decks. §08 §09
   ------------------------------------------------------------------------ */
export const destinationGrid = (list = HOME_DESTINATIONS) =>
  el('div', { class: 'l-grid' }, list.map((d) =>
    el('div', { class: 'l-span-4@md l-span-4@lg' }, destinationCard(d))));

export const offerGrid = (list = HOME_OFFERS) =>
  el('div', { class: 'l-grid' }, list.map((o) =>
    el('div', { class: 'l-span-4@md l-span-4@lg' }, offerCard(o))));

/* ---------------------------------------------------------------------------
   OUR TEAM — the Number One Travel Coordinators. §07.5. Reuses the same
   supervisorCard the /supervisors/ directory draws: one component, two
   listings, no duplicate template.
   ------------------------------------------------------------------------ */
export const teamGrid = (list = SUPERVISOR_REGISTRY.filter((s) => s.status === 'active')) =>
  el('div', { class: 'l-grid' }, list.map((s) =>
    el('div', { class: 'l-span-4@md l-span-4@lg' }, supervisorCard(s))));

/* ---------------------------------------------------------------------------
   THE NUMBERED JOURNEY — shared by offers and service-detail pages, each
   with their own steps. §10
   ------------------------------------------------------------------------ */
export function journeySteps(steps) {
  // As many desktop columns as there are steps (three to five), so a
  // five-step journey never strands its last step on a second row.
  return el('ol', { class: 'c-journey', role: 'list', style: `--journey-cols:${Math.min(Math.max(steps.length, 3), 5)}` }, steps.map((s, i) =>
    el('li', { class: 'c-journey__step' }, [
      el('span', { class: 'c-journey__num', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
      el('h3', { class: 'c-journey__title' }, pick(s, 'title')),
      el('p', { class: 'c-journey__text' }, pick(s, 'text')),
    ])));
}

/* ---------------------------------------------------------------------------
   HUMAN SUPPORT — digital + human. §11
   Channels come from navigation.js and appear only when the business has
   supplied them; until then the panel points at the help centre.
   ------------------------------------------------------------------------ */
export function supportPanels(support = HOME_SUPPORT, channels = liveChannels()) {
  const list = (items) => el('ul', { class: 'c-support__list', role: 'list' }, items.map((i) =>
    el('li', { class: 'c-support__item' }, [icon('no-check', { size: 'sm' }), el('span', {}, pick(i, 'text'))])));

  const channelLinks = channels.length
    ? el('div', { class: 'c-support__channels' }, channels.map((c) =>
        el('a', { class: 'c-btn c-btn--secondary', href: c.href, target: '_blank', rel: 'noopener' }, [
          icon(c.icon, { size: 'sm' }), el('span', {}, pick(c, 'label')),
        ])))
    : el('div', { class: 'c-support__channels' }, [
        el('p', { class: 't-body-sm t-muted c-support__note' }, t('home.support.channelsSoon')),
        el('a', { class: 'c-btn c-btn--secondary', href: route('help/') }, [
          icon('no-support', { size: 'sm' }), el('span', {}, t('home.support.help')),
        ]),
      ]);

  return el('div', { class: 'c-support' }, [
    el('section', { class: 'c-support__panel', 'aria-labelledby': 'support-digital' }, [
      el('h3', { class: 'c-support__title', id: 'support-digital' }, [icon('no-booking', { size: 'md' }), el('span', {}, t('home.support.digital'))]),
      list(support.digital),
    ]),
    el('span', { class: 'c-support__plus', 'aria-hidden': 'true' }, '+'),
    el('section', { class: 'c-support__panel c-support__panel--human', 'aria-labelledby': 'support-human' }, [
      el('h3', { class: 'c-support__title', id: 'support-human' }, [icon('no-supervisor', { size: 'md' }), el('span', {}, t('home.support.human'))]),
      list(support.human),
      channelLinks,
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   MOUNT — wire every section into the page and return the controllers.
   Each dynamic region is a stateRegion so the page can show loading, empty
   and error states from one API. Data arrives through `load`, which today
   resolves the static records and tomorrow calls the API. §15
   ------------------------------------------------------------------------ */
export function mountHome({
  root = document,
  load = async () => ({
    services: HOME_SERVICES, destinations: HOME_DESTINATIONS, offers: HOME_OFFERS,
    team: SUPERVISOR_REGISTRY.filter((s) => s.status === 'active'),
    support: HOME_SUPPORT, channels: liveChannels(),
  }),
  onSearchSubmit = null,
} = {}) {
  const mount = (name) => qs(`[data-home="${name}"]`, root);
  const isAr = () => getLocale() === 'ar';

  // ---- Hero
  const choose = chooseModule(HOME_PRIORITIES, {
    onGo: () => { search.no.select('flights'); scrollToSearch(); },
  });
  const search = heroSearch({ onSubmit: onSearchSubmit, getPriority: () => choose.no.selected, getOffer: () => offerSlug });
  let offerSlug = '';
  const scrollToSearch = () => scrollIntoView(qs('#booking', root), { focus: () => search.no.focus({ preventScroll: true }) });

  render(mount('hero-copy'), heroCopy());
  render(mount('hero-media'), heroMedia());
  render(mount('search'), search);
  render(mount('choose'), choose);
  render(mount('providers'), providerGrid());
  render(mount('newsletter'), newsletterCard({
    image: { src: imageSrc('destinations/cairo'), altAr: 'القاهرة، مصر', altEn: 'Cairo, Egypt' },
  }));

  // ---- Dynamic regions — every one owns all five states. §15
  const emptyState = (key, action) => () => stateBlock({
    variant: 'empty',
    title: t(`home.${key}.empty.title`),
    text: t(`home.${key}.empty.text`),
    actions: [action],
  });

  const regions = {
    services: stateRegion(mount('services'), {
      loading: () => el('div', { class: 'l-auto-grid', style: '--min-col:16rem' }, Array.from({ length: 6 }, skeletonService)),
      empty: emptyState('services', { label: t('home.cta.secondary'), href: route('help/contact/'), variant: 'c-btn--primary' }),
    }),
    destinations: stateRegion(mount('destinations'), {
      loading: () => el('div', { class: 'l-grid' }, Array.from({ length: 3 }, () => el('div', { class: 'l-span-4@md l-span-4@lg' }, skeletonCard()))),
      empty: emptyState('destinations', { label: t('home.destinations.empty.action'), variant: 'c-btn--primary', onClick: scrollToSearch }),
    }),
    offers: stateRegion(mount('offers'), {
      loading: () => el('div', { class: 'l-grid' }, Array.from({ length: 3 }, () => el('div', { class: 'l-span-4@md l-span-4@lg' }, skeletonCard()))),
      empty: emptyState('offers', { label: t('home.offers.empty.action'), href: route('help/contact/'), variant: 'c-btn--primary' }),
    }),
    team: stateRegion(mount('team'), {
      loading: () => el('div', { class: 'l-grid' }, Array.from({ length: 3 }, () => el('div', { class: 'l-span-4@md l-span-4@lg' }, skeletonCard()))),
      empty: emptyState('team', { label: t('sup.cta.book'), href: route('book/'), variant: 'c-btn--primary' }),
    }),
    support: stateRegion(mount('support'), {
      loading: () => el('div', { class: 'c-support' }, [skeletonService(), el('span'), skeletonService()]),
      empty: () => stateBlock({
        variant: 'info', title: t('home.support.title'), text: t('home.support.channelsSoon'),
        actions: [{ label: t('home.support.help'), href: route('help/') }],
      }),
    }),
  };

  Object.values(regions).forEach((r) => r.loading());

  const hydrate = async () => {
    let data;
    try {
      data = await load();
    } catch (error) {
      console.error('[no] homepage data failed to load', error);
      Object.values(regions).forEach((r) => r.error());
      return;
    }
    const fill = (region, list, draw) => (list?.length ? region.content(draw(list)) : region.empty());
    fill(regions.services, data.services, (list) => servicesGrid(list));
    fill(regions.destinations, data.destinations, destinationGrid);
    fill(regions.offers, data.offers, offerGrid);
    fill(regions.team, data.team, teamGrid);
    if (data.support) regions.support.content(supportPanels(data.support, data.channels ?? liveChannels()));
    else regions.support.empty();
  };
  hydrate();

  // ---- Hero CTA: re-enters the booking flow from the top of the page.
  // Assigned, not addEventListener'd: mountHome runs again on every language
  // change and the button is static markup, so a listener would accumulate.
  const heroBook = qs('[data-home-action="hero-book"]', root);
  if (heroBook) heroBook.onclick = (event) => {
    event.preventDefault();
    search.no.select('flights');
    scrollToSearch();
  };

  return {
    regions, search, choose, scrollToSearch, reload: hydrate,
    /** Open the widget on what a URL asks for (?vertical=…&to=…&offer=…). */
    applyParams(params) { const applied = applyEntryParams(search, params); offerSlug = applied?.offer ?? ''; return applied; },
    get locale() { return isAr() ? 'ar' : 'en'; },
  };
}
