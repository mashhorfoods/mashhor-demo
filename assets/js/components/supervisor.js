/* ============================================================================
   COMPONENTS / SUPERVISOR PROFILE — Stage 10.10. One template, every
   supervisor.

   mountSupervisor({ slug }) reads the registry record (data/supervisors.js)
   and draws the public profile into the [data-profile="…"] mount points.
   "Number One + a personal supervisor": the page is the Number One system
   with a person inside it — the brand's header, footer, cards and buttons,
   and only the personal FACTS the record carries. A field the record does
   not have is not rendered; nothing is invented to fill it.

   Every door on the page is attributed: `book/?…&supervisor=<slug>`, which
   the booking entry stores and carries in the booking context.

   States: skeleton → content; an unknown slug, an inactive supervisor, a
   record without optional details, and a load failure each have their own
   block with a way forward. Exposed as `window.no.supervisor` for QA.
   ========================================================================= */

import { el, qs, qsa, render, scrollTo as scrollIntoView, setPageHead } from '../core/dom.js';
import { t, pick } from '../core/i18n.js';
import { route } from '../data/config.js';
import { SERVICE_KINDS, serviceEntry } from '../data/services.js';
import { HOME_DESTINATIONS, HOME_OFFERS } from '../data/home.js';
import { destinationEntry } from '../data/destinations.js';
import { offerEntry } from '../data/offers.js';
import {
  SUPERVISOR_STATUSES, supervisorBySlug, supervisorServices, supervisorLanguages, supervisorSpecialties,
  supervisorChannels, supervisorHasDetails, supervisorUrl, supervisorEntry, supervisorContactUrl, attributed,
} from '../data/supervisors.js';
import { icon, toast, sectionHead } from './ui.js';
import { serviceCard, destinationCard, offerCard } from './cards.js';
import { stateRegion, stateBlock, notFoundState } from './states.js';
import { logo } from './brand.js';

/* ---------------------------------------------------------------------------
   RECORD HELPERS
   ------------------------------------------------------------------------ */
/** The display name: the record's, or the neutral role name. */
export const supervisorName = (sup) => pick(sup, 'name') || t('sup.name.fallback');
/** Absolute public URL of the profile, for the copy-link row. */
export const publicUrl = (sup) => new URL(route(supervisorUrl(sup)), window.location.href).href;

/* ---------------------------------------------------------------------------
   HERO — photo + copy. §3
   ------------------------------------------------------------------------ */
export function profileHero(sup, { onContact = null } = {}) {
  const name = supervisorName(sup);
  const status = SUPERVISOR_STATUSES[sup.status];
  const alt = pick(sup.image ?? {}, 'alt') || t('sup.photo.alt', name);
  const figure = el('figure', { class: 'c-profile__figure' }, [
    el('div', { class: 'c-profile__photo' }, sup.image?.src
      ? el('img', { src: sup.image.src, alt, width: 480, height: 480, loading: 'eager', decoding: 'async', fetchpriority: 'high' })
      : el('span', { role: 'img', 'aria-label': t('sup.photo.empty'), style: 'display:contents' }, icon('no-supervisor', { size: 'xl' }))),
    el('span', { class: 'c-profile__route', 'aria-hidden': 'true' }),
  ]);
  const copy = el('div', { class: 'c-profile__copy' }, [
    el('p', { class: 'c-profile__brand' }, [logo({ size: 'c-logo--sm', href: null }), el('span', { class: 't-overline' }, t('sup.brand'))]),
    el('h1', { class: 't-display c-profile__name', id: 'profile-title' }, name),
    pick(sup, 'title') ? el('p', { class: 'c-profile__title' }, pick(sup, 'title')) : null,
    status?.id === 'active'
      ? el('p', { class: 'c-profile__badges' }, el('span', { class: 'c-badge c-badge--success' }, [icon(status.icon, { size: 'xs' }), el('span', {}, pick(status, 'label'))]))
      : null,
    el('p', { class: 'c-hero__lead' }, pick(sup, 'bio') || t('sup.lead')),
    el('div', { class: 'c-profile__actions' }, [
      el('a', { class: 'c-btn c-btn--primary c-btn--lg', href: route(supervisorEntry(sup)), dataset: { profileAction: 'book' } }, t('sup.cta.book')),
      el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--lg', dataset: { profileAction: 'contact' }, onclick: onContact }, [icon('no-chat', { size: 'sm' }), el('span', {}, t('sup.cta.contact'))]),
    ]),
  ]);
  return el('div', { class: 'c-profile' }, [figure, copy]);
}

/* ---------------------------------------------------------------------------
   SECTIONS — each returns null when it has nothing to say.
   ------------------------------------------------------------------------ */
const chips = (items, iconOf = () => null) => el('ul', { class: 'c-facts__chips', role: 'list' }, items.map((i) =>
  el('li', {}, el('span', { class: 'c-badge c-badge--outline' }, [iconOf(i) ? icon(iconOf(i), { size: 'xs' }) : null, el('span', {}, pick(i, 'label'))]))));

/** About: languages, expertise, services and the public link — facts only. §4 */
export function aboutSection(sup) {
  const languages = supervisorLanguages(sup);
  const specialties = supervisorSpecialties(sup);
  const services = supervisorServices(sup);
  const row = (labelKey, iconName, body, full = false) => el('div', { class: `c-facts__row${full ? ' c-facts__row--full' : ''}` }, [
    el('dt', {}, [icon(iconName, { size: 'sm' }), el('span', {}, t(labelKey))]), el('dd', {}, body)]);

  const url = publicUrl(sup);
  const input = el('input', { class: 'c-field__control', type: 'text', readonly: true, value: url, 'aria-label': t('sup.about.url'), onfocus: (e) => e.currentTarget.select() });
  const copy = el('button', { type: 'button', class: 'c-btn c-btn--secondary', onclick: async () => {
    try { await navigator.clipboard.writeText(url); toast({ title: t('sup.about.copied'), variant: 'success', duration: 3000 }); }
    catch { input.focus(); input.select(); toast({ title: t('sup.about.copyFailed'), variant: 'warning', duration: 5000 }); }
  } }, [icon('no-documents', { size: 'sm' }), el('span', {}, t('sup.about.copy'))]);

  return [
    sectionHead({ id: 'about-title', overline: t('sup.about.overline'), title: t('sup.about.title') }),
    supervisorHasDetails(sup) ? null : stateBlock({ variant: 'info', iconName: 'no-info', title: t('sup.about.empty.title'), text: t('sup.about.empty.text'),
      actions: [{ label: t('sup.cta.book'), href: route(supervisorEntry(sup)), variant: 'c-btn--secondary-brand' }] }),
    el('dl', { class: 'c-facts' }, [
      languages.length ? row('sup.about.languages', 'no-language', chips(languages)) : null,
      specialties.length ? row('sup.about.specialties', 'no-sparkle', chips(specialties, (p) => p.icon)) : null,
      row('sup.about.services', 'no-booking', el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route(supervisorEntry(sup)), dataset: { profileLink: 'services' } }, t('sup.about.servicesCount', services.length))),
      row('sup.about.url', 'no-location', el('div', { class: 'c-facts__url' }, [input, copy]), true),
    ]),
  ];
}

/** Services: the existing service card, every action attributed. §5 */
export function servicesSection(sup) {
  const services = supervisorServices(sup);
  if (!services.length) return null;
  return [
    sectionHead({ id: 'services-title', overline: t('sup.services.overline'), title: t('sup.services.title', supervisorName(sup)), text: t('sup.services.text') }),
    el('div', { class: 'l-grid' }, services.map((s) =>
      el('div', { class: 'l-span-4@md l-span-4@lg' }, serviceCard(s, { kind: SERVICE_KINDS[s.kind], entry: route(attributed(serviceEntry(s), sup)) })))),
  ];
}

/** Trust: five statements, each true of the Number One journey. §7 */
export function trustSection() {
  const items = [
    ['no-shield', 'sup.trust.brand'], ['no-supervisor', 'sup.trust.pro'], ['no-chat', 'sup.trust.human'],
    ['no-booking', 'sup.trust.journey'], ['no-check-circle', 'sup.trust.choose'],
  ];
  return [
    sectionHead({ id: 'trust-title', overline: t('sup.trust.overline'), title: t('sup.trust.title'), text: t('sup.trust.text') }),
    el('ul', { class: 'c-trust-list c-trust-list--stack', role: 'list' }, items.map(([i, k]) =>
      el('li', { class: 'c-trust-item' }, [icon(i, { size: 'sm' }), el('span', {}, t(k))]))),
  ];
}

/** Contact: verified channels only, else request assistance. §8 */
export function contactSection(sup) {
  const channels = supervisorChannels(sup);
  const name = supervisorName(sup);
  return [
    sectionHead({ id: 'contact-title', overline: t('sup.contact.overline'), title: t('sup.contact.title', name), text: t('sup.contact.text') }),
    el('div', { class: 'c-contact' }, [
      channels.length
        ? el('div', { class: 'c-channels' }, channels.map((c) =>
            el('a', { class: 'c-channel', href: c.href, ...(c.external ? { target: '_blank', rel: 'noopener' } : {}), dataset: { channel: c.id } }, [
              el('span', { class: 'c-channel__icon' }, icon(c.icon, { size: 'md' })),
              el('span', {}, [el('span', { class: 'c-channel__label' }, pick(c, 'label')), el('span', { class: 'c-channel__meta' }, name)]),
            ])))
        : el('p', { class: 'c-note', role: 'note' }, [icon('no-info', { size: 'sm' }), el('span', { class: 'c-note__text' }, t('sup.contact.none'))]),
      el('div', { class: 'l-cluster l-cluster--12' }, [
        el('a', { class: 'c-btn c-btn--secondary-brand', href: route(supervisorContactUrl(sup)), dataset: { profileAction: 'request' } }, [icon('no-support', { size: 'sm' }), el('span', {}, t('sup.contact.request'))]),
      ]),
    ]),
  ];
}

/** Discovery: a few destinations and offers, every door attributed. §9 */
export function discoverySection(sup) {
  const destinations = HOME_DESTINATIONS.slice(0, 3);
  const offers = HOME_OFFERS.slice(0, 3);
  if (!destinations.length && !offers.length) return null;
  const row = (labelKey, href, cards) => cards.length ? el('div', { class: 'l-stack l-stack--16' }, [
    el('div', { class: 'c-discovery__head' }, [
      el('h3', { class: 't-h3' }, t(labelKey)),
      el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href }, t('sup.discovery.all')),
    ]),
    el('div', { class: 'l-grid' }, cards.map((c) => el('div', { class: 'l-span-4@md l-span-4@lg' }, c))),
  ]) : null;
  return [
    sectionHead({ id: 'discovery-title', overline: t('sup.discovery.overline'), title: t('sup.discovery.title'), text: t('sup.discovery.text') }),
    el('div', { class: 'c-discovery' }, [
      row('sup.discovery.destinations', route('destinations/'), destinations.map((d) => destinationCard(d, { country: true, entry: route(attributed(destinationEntry(d), sup)) }))),
      row('sup.discovery.offers', route('offers/'), offers.map((o) => offerCard(o, { entry: route(attributed(offerEntry(o), sup)) }))),
    ]),
  ];
}

export function ctaBand(sup) {
  return el('div', { class: 'c-cta-band__inner' }, [
    el('div', { class: 'l-stack l-stack--12' }, [
      el('h2', { class: 't-h1 c-cta-band__title', id: 'cta-title' }, t('sup.final.title', supervisorName(sup))),
      el('p', { class: 't-body-lg c-cta-band__text' }, t('sup.final.text')),
    ]),
    el('div', { class: 'c-cta-band__actions' }, [
      el('a', { class: 'c-btn c-btn--primary c-btn--lg', href: route(supervisorEntry(sup)) }, t('sup.cta.book')),
      el('a', { class: 'c-btn c-btn--inverse c-btn--lg', href: route(supervisorContactUrl(sup)) }, t('sup.contact.request')),
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   STATES — unknown slug, inactive, error. §12
   ------------------------------------------------------------------------ */
const unknownState = () => notFoundState({
  title: t('sup.unknown.title'), text: t('sup.unknown.text'),
  actions: [{ label: t('sup.cta.book'), href: route('book/'), variant: 'c-btn--primary' }, { label: t('detail.cta.expert'), href: route('help/contact/') }],
});
const inactiveState = () => stateBlock({
  variant: 'info', iconName: 'no-pending', title: t('sup.inactive.title'), text: t('sup.inactive.text'),
  actions: [{ label: t('sup.cta.book'), href: route('book/'), variant: 'c-btn--primary' }, { label: t('detail.cta.expert'), href: route('help/contact/') }],
});

const applyHead = (sup) => setPageHead({ title: `${supervisorName(sup)} — ${t('brand.name')}`, description: pick(sup, 'bio') || t('sup.lead') });

/* ---------------------------------------------------------------------------
   MOUNT
   ------------------------------------------------------------------------ */
export function mountSupervisor({
  slug,
  root = document,
  load = async (s) => supervisorBySlug(s),
} = {}) {
  const mount = (name) => qs(`[data-profile="${name}"]`, root);
  const sections = ['about', 'services', 'trust', 'contact', 'discovery', 'cta'];
  const region = stateRegion(mount('hero'), {
    loading: () => el('div', { class: 'c-profile', 'aria-hidden': 'true' }, [
      el('div', { class: 'c-profile__figure' }, el('div', { class: 'c-profile__photo c-skeleton', style: 'box-shadow:none' })),
      el('div', { class: 'l-stack' }, [
        el('div', { class: 'c-skeleton c-skeleton--text c-skeleton--line-sm' }),
        el('div', { class: 'c-skeleton c-skeleton--title' }),
        el('div', { class: 'c-skeleton c-skeleton--text c-skeleton--line-md' }),
        el('div', { class: 'c-skeleton', style: 'block-size:var(--control-height-lg);inline-size:10rem;margin-block-start:var(--space-16)' }),
      ]),
    ]),
    empty: unknownState,
    error: () => stateBlock({ variant: 'error', title: t('sup.error.title'), text: t('sup.error.text'), actions: [
      { label: t('action.retry'), variant: 'c-btn--primary', onClick: () => api.render() },
      { label: t('sup.cta.book'), href: route('book/') },
    ] }),
  });

  const showSection = (name, content) => {
    const section = mount(name);
    if (!section) return;
    const body = qs('[data-profile-body]', section) ?? section;
    if (content) { render(body, content); section.hidden = false; }
    else { render(body, []); section.hidden = true; }
  };
  const scrollTo = (id) => { const s = qs(`#${id}`, root); if (s) scrollIntoView(s, { focus: qs('a, button', s) }); };

  const paint = (sup) => {
    applyHead(sup);
    region.content(profileHero(sup, { onContact: () => scrollTo('contact') }));
    showSection('about', aboutSection(sup));
    showSection('services', servicesSection(sup));
    showSection('trust', trustSection());
    showSection('contact', contactSection(sup));
    showSection('discovery', discoverySection(sup));
    showSection('cta', ctaBand(sup));
    qsa('.c-bottom-nav__item', root).forEach((a) => a.removeAttribute('aria-current'));
  };

  const api = {
    region, current: null,
    async render(nextSlug = slug) {
      region.loading();
      sections.forEach((s) => showSection(s, null));
      let record;
      try { record = await load(nextSlug); }
      catch (error) {
        console.error('[no] supervisor profile failed to load', error);
        region.error();
        return null;
      }
      if (!record) { region.empty(); document.title = `${t('sup.unknown.title')} — ${t('brand.name')}`; return null; }
      if (record.status !== 'active') { region.content(inactiveState()); document.title = `${t('sup.inactive.title')} — ${t('brand.name')}`; api.current = record; return record; }
      api.current = record;
      paint(record);
      return record;
    },
    /** Draw any record through the template — QA and the future admin preview. */
    paint(record) { api.current = record; paint(record); return record; },
    scrollTo,
  };
  api.render();
  return api;
}
