/* ============================================================================
   COMPONENTS / SERVICE DETAIL — Stage 10.6. One template, every service.

   mountServiceDetail({ slug }) reads the merged record (registry + details)
   and draws the page into the [data-detail="…"] mount points. A section is
   rendered only when its content exists (§4): no empty visual sections.

   States (§18): the page paints a skeleton, then content; a slug the
   registry does not know renders the "unknown service" state with a way
   back; a service without detail content renders the hero and CTA from the
   registry plus a neutral note; a load failure renders the error state.
   Exposed as `window.no.detail` for QA.
   ========================================================================= */

import { el, qs, qsa, render } from '../core/dom.js';
import { t, pick, getLocale } from '../core/i18n.js';
import { route } from '../data/config.js';
import { liveChannels } from '../data/navigation.js';
import {
  SERVICE_REGISTRY, SERVICE_CATEGORIES, SERVICE_KINDS, serviceById, serviceEntry,
} from '../data/services.js';
import { SERVICE_DETAILS, SERVICE_BENEFITS } from '../data/service-details.js';
import { icon } from './ui.js';
import { serviceCard, mediaPlaceholder } from './cards.js';
import { stateRegion, stateBlock, skeletonService } from './states.js';
import { supportPanels, journeySteps } from './home.js';

/* ---------------------------------------------------------------------------
   RECORD — registry identity + page content, merged. Returns null for an
   unknown slug; a known service with no detail entry gets `detail: null`.
   ------------------------------------------------------------------------ */
export function getServiceDetail(slug) {
  const service = SERVICE_REGISTRY.find((s) => s.slug === slug || s.id === slug) ?? null;
  if (!service) return null;
  const category = SERVICE_CATEGORIES.find((c) => c.id === service.category) ?? null;
  return { ...service, category, kind: SERVICE_KINDS[service.kind], detail: SERVICE_DETAILS[service.id] ?? null };
}

/* ---------------------------------------------------------------------------
   CTA — one dominant action per page, decided by the record. §5 / §12
   ------------------------------------------------------------------------ */
export function primaryActionFor(record) {
  const type = record.detail?.primaryAction ?? (record.kind?.id === 'search' ? 'book' : 'request');
  const entry = route('') + serviceEntry(record);
  const expert = route('help/contact/');
  const map = {
    book:    { label: t('detail.cta.book'),    href: entry },
    request: { label: t('detail.cta.request'), href: entry },
    expert:  { label: t('detail.cta.expert'),  href: expert },
  };
  const primary = map[type] ?? map.request;
  // The secondary is the *other* door: a specialist for a self-serve action,
  // the request form for an expert-led one. Never a second red button.
  const secondary = type === 'expert'
    ? { label: t('detail.cta.request'), href: entry }
    : { label: t('detail.cta.expert'), href: expert };
  return { type, primary, secondary };
}

/* ---------------------------------------------------------------------------
   BREADCRUMB — home › services › category › service. §A
   ------------------------------------------------------------------------ */
export function breadcrumb(record) {
  const crumbs = [
    { label: t('detail.crumb.home'), href: route('') },
    { label: t('detail.crumb.services'), href: route('services/') },
    record.category ? { label: pick(record.category, 'label'), href: route('services/') } : null,
    { label: pick(record, 'title') },
  ].filter(Boolean);
  return el('nav', { class: 'c-breadcrumb', 'aria-label': t('detail.crumb.label') }, [
    el('ol', { class: 'c-breadcrumb__list' }, crumbs.flatMap((c, i) => [
      i ? el('li', { class: 'c-breadcrumb__sep', 'aria-hidden': 'true' }, icon('no-chevron-end', { size: 'xs', flip: true })) : null,
      el('li', {}, c.href
        ? el('a', { class: 'c-breadcrumb__link', href: c.href }, c.label)
        : el('span', { 'aria-current': 'page' }, c.label)),
    ])),
  ]);
}

/* ---------------------------------------------------------------------------
   HERO — the 10.4 composition with the service's own copy. §5 §6
   ------------------------------------------------------------------------ */
export function detailHero(record) {
  const cta = primaryActionFor(record);
  const copy = el('div', { class: 'c-hero__copy' }, [
    breadcrumb(record),
    el('p', { class: 't-overline' }, [
      record.category ? pick(record.category, 'label') : null,
      record.kind ? el('span', { class: `c-badge ${record.kind.badge} c-detail__kind` }, [icon(record.kind.icon, { size: 'xs' }), el('span', {}, pick(record.kind, 'label'))]) : null,
    ]),
    el('h1', { class: 't-display c-hero__title', id: 'service-title' }, pick(record, 'title')),
    el('p', { class: 'c-hero__lead' }, pick(record, 'desc')),
    el('div', { class: 'l-cluster l-cluster--16' }, [
      el('a', { class: 'c-btn c-btn--primary c-btn--lg', href: cta.primary.href, dataset: { detailAction: cta.type } }, cta.primary.label),
      el('a', { class: 'c-btn c-btn--tertiary c-btn--lg', href: cta.secondary.href }, cta.secondary.label),
    ]),
  ]);
  const media = el('div', { class: 'c-hero__media', dataset: { mediaSlot: `service-${record.id}` } }, [
    mediaPlaceholder(record.image?.src, pick(record.image ?? {}, 'alt')),
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
  path.setAttribute('d', 'M 40 450 C 90 330, 200 330, 240 220 S 330 110, 356 60');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  const a = document.createElementNS(ns, 'circle'); a.setAttribute('cx', '40'); a.setAttribute('cy', '450'); a.setAttribute('r', '4');
  const b = document.createElementNS(ns, 'circle'); b.setAttribute('cx', '356'); b.setAttribute('cy', '60'); b.setAttribute('r', '5');
  svg.append(path, a, b);
  return svg;
}

/* ---------------------------------------------------------------------------
   SECTIONS — each returns null when it has nothing to say. §4
   ------------------------------------------------------------------------ */
const head = (id, overlineKey, titleKey, textKey = null) => el('div', { class: 'l-section-head' }, [
  el('p', { class: 't-overline' }, t(overlineKey)),
  el('h2', { class: 't-h2 u-mark', id }, t(titleKey)),
  textKey ? el('p', { class: 't-body t-muted' }, t(textKey)) : null,
]);

export function overviewSection(record) {
  const d = record.detail;
  if (!d?.description) return null;
  return [
    el('div', { class: 'l-section-head' }, [
      el('p', { class: 't-overline' }, t('detail.overview.overline')),
      el('h2', { class: 't-h2 u-mark', id: 'overview-title' }, t('detail.overview.title', pick(record, 'title'))),
    ]),
    el('div', { class: 'l-grid' }, [
      el('p', { class: 't-body-lg l-span-8@md l-span-7@lg c-detail__lead' }, pick(d.description)),
      d.points?.length
        ? el('ul', { class: 'c-detail__points l-span-8@md l-span-5@lg', role: 'list' }, d.points.map((p) =>
            el('li', { class: 'c-detail__point' }, [icon('no-check-circle', { size: 'sm' }), el('span', {}, pick(p))])))
        : null,
    ]),
  ];
}

export function featuresSection(record) {
  const list = record.detail?.features;
  if (!list?.length) return null;
  return [
    head('features-title', 'detail.features.overline', 'detail.features.title'),
    el('div', { class: 'l-grid' }, list.map((f) =>
      el('div', { class: 'l-span-4@md l-span-3@lg' }, el('article', { class: 'c-card c-card--flat c-feature' }, [
        el('div', { class: 'c-card__body' }, [
          el('span', { class: 'c-service-card__icon' }, icon(f.icon, { size: 'lg' })),
          el('h3', { class: 'c-card__title' }, pick(f, 'title')),
          el('p', { class: 'c-card__text' }, pick(f, 'text')),
        ]),
      ])))),
  ];
}

export function benefitsSection(record) {
  const ids = record.detail?.benefits;
  if (!ids?.length) return null;
  const list = ids.map((id) => SERVICE_BENEFITS[id]).filter(Boolean);
  return [
    head('benefits-title', 'detail.benefits.overline', 'detail.benefits.title'),
    el('ul', { class: 'l-grid', role: 'list' }, list.map((b) =>
      el('li', { class: 'c-value l-span-4@md l-span-3@lg' }, [
        el('span', { class: 'c-value__icon' }, icon(b.icon, { size: 'lg' })),
        el('h3', { class: 'c-value__title' }, pick(b, 'title')),
        el('p', { class: 'c-value__text' }, pick(b, 'text')),
      ]))),
  ];
}

export function stepsSection(record) {
  const steps = record.detail?.steps;
  if (!steps?.length) return null;
  return [
    head('steps-title', 'detail.steps.overline', 'detail.steps.title'),
    journeySteps(steps),
  ];
}

export function requirementsSection(record) {
  const req = record.detail?.requirements;
  if (!req) return null;
  const items = req.items ?? [];
  return [
    head('requirements-title', 'detail.requirements.overline', 'detail.requirements.title', 'detail.requirements.text'),
    items.length
      ? el('ul', { class: 'c-req', role: 'list' }, items.map((i) =>
          el('li', { class: 'c-req__item' }, [icon(i.icon, { size: 'md' }), el('span', {}, pick(i, 'text'))])))
      : null,
    // Official rules are never listed here — they vary by destination and
    // nationality and are explained during the request. §11
    req.official || !items.length
      ? el('p', { class: 'c-note', role: 'note' }, [icon('no-info', { size: 'sm' }), el('span', { class: 'c-note__text' }, t('detail.requirements.official'))])
      : null,
  ];
}

export function relatedSection(record) {
  const ids = record.detail?.related?.length
    ? record.detail.related
    : SERVICE_REGISTRY.filter((s) => s.category === record.category?.id && s.id !== record.id).map((s) => s.id);
  const list = ids.map(serviceById).filter(Boolean).slice(0, 3);
  if (!list.length) return null;
  return [
    head('related-title', 'detail.related.overline', 'detail.related.title'),
    el('div', { class: 'l-grid' }, list.map((s) =>
      el('div', { class: 'l-span-4@md l-span-4@lg' }, serviceCard(s)))),
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
  const cta = primaryActionFor(record);
  return el('div', { class: 'c-cta-band__inner' }, [
    el('div', { class: 'l-stack l-stack--12' }, [
      el('h2', { class: 't-h1 c-cta-band__title', id: 'cta-title' }, t('detail.cta.title', pick(record, 'title'))),
      el('p', { class: 't-body-lg c-cta-band__text' }, t('detail.cta.text')),
    ]),
    el('div', { class: 'c-cta-band__actions' }, [
      el('a', { class: 'c-btn c-btn--primary c-btn--lg', href: cta.primary.href }, cta.primary.label),
      el('a', { class: 'c-btn c-btn--inverse c-btn--lg', href: cta.secondary.href }, cta.secondary.label),
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   STATES — unknown slug, missing content, unavailable. §18
   ------------------------------------------------------------------------ */
function unknownState() {
  return stateBlock({
    variant: 'empty', iconName: 'no-empty-box',
    title: t('detail.unknown.title'), text: t('detail.unknown.text'),
    actions: [
      { label: t('detail.crumb.services'), href: route('services/'), variant: 'c-btn--primary' },
      { label: t('detail.cta.expert'), href: route('help/contact/') },
    ],
  });
}

function missingContentNote() {
  return el('p', { class: 'c-note', role: 'note' }, [icon('no-info', { size: 'sm' }), el('span', { class: 'c-note__text' }, t('detail.missing.text'))]);
}

/* ---------------------------------------------------------------------------
   HEAD — title, description and canonical follow the service and the
   language, so each route is unique for search engines. §21
   ------------------------------------------------------------------------ */
function applyHead(record) {
  const brand = t('brand.name');
  document.title = `${pick(record, 'title')} — ${brand}`;
  qs('meta[name="description"]')?.setAttribute('content', pick(record, 'desc'));
  qs('meta[property="og:title"]')?.setAttribute('content', document.title);
  qs('meta[property="og:description"]')?.setAttribute('content', pick(record, 'desc'));
}

/* ---------------------------------------------------------------------------
   MOUNT
   ------------------------------------------------------------------------ */
export function mountServiceDetail({
  slug,
  root = document,
  load = async (s) => getServiceDetail(s),
} = {}) {
  const mount = (name) => qs(`[data-detail="${name}"]`, root);
  const sections = ['overview', 'features', 'benefits', 'steps', 'requirements', 'related', 'support', 'cta'];
  const region = stateRegion(mount('hero'), {
    loading: () => el('div', { class: 'c-hero__copy', style: 'display:contents' }, [
      el('div', { class: 'l-stack' }, [
        el('div', { class: 'c-skeleton c-skeleton--text c-skeleton--line-sm' }),
        el('div', { class: 'c-skeleton c-skeleton--title' }),
        el('div', { class: 'c-skeleton c-skeleton--text c-skeleton--line-md' }),
      ]),
      el('div', { class: 'c-hero__media c-skeleton' }),
    ]),
    empty: unknownState,
  });

  const showSection = (name, content) => {
    const section = mount(name);
    if (!section) return;
    const body = qs('[data-detail-body]', section) ?? section;
    if (content) { render(body, content); section.hidden = false; }
    else { render(body, []); section.hidden = true; }
  };

  const paint = (record) => {
    applyHead(record);
    region.content(detailHero(record));
    showSection('overview', overviewSection(record) ?? (record.detail ? null : missingContentNote()));
    showSection('features', featuresSection(record));
    showSection('benefits', benefitsSection(record));
    showSection('steps', stepsSection(record));
    showSection('requirements', requirementsSection(record));
    showSection('related', relatedSection(record));
    showSection('support', supportSection());
    showSection('cta', ctaBand(record));
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
        console.error('[no] service detail failed to load', error);
        region.error();
        return null;
      }
      if (!record) { region.empty(); document.title = `${t('detail.unknown.title')} — ${t('brand.name')}`; return null; }
      api.current = record;
      paint(record);
      return record;
    },
    reload() { return api.render(slug); },
    get locale() { return getLocale(); },
  };
  api.render(slug);
  return api;
}
