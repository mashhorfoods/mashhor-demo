/* ============================================================================
   COMPONENTS / BOOKING — Stage 10.9. The booking entry.

   SELECT SERVICE → DEFINE NEED → CONTINUE, on one page:
     serviceSelector   eight service cards (the bookable SEARCH_VERTICALS)
     the search widget with its tab strip hidden, driven by the selector
     validate → loading → success (the context summary) | error
   Everything the customer typed becomes a booking context (core/booking.js)
   that Stage 11 consumes. Nothing here calls an API.
   mountBooking() → window.no.booking
   ========================================================================= */

import { el, qs, qsa, render } from '../core/dom.js';
import { t, pick, getLocale } from '../core/i18n.js';
import { dateShort } from '../core/format.js';
import { route, SEARCH_VERTICALS } from '../data/config.js';
import { HOME_PRIORITIES } from '../data/home.js';
import { liveChannels } from '../data/navigation.js';
import {
  buildContext, validate, saveContext, continueUrl, applyEntryParams, summariseTravellers, attributionFrom,
} from '../core/booking.js';
import { supervisorBySlug, supervisorUrl } from '../data/supervisors.js';
import { icon, setButtonState } from './ui.js';
import { searchWidget } from './search.js';
import { chooseModule } from './home.js';
import { stateRegion, stateBlock } from './states.js';

export const BOOKABLE = () => SEARCH_VERTICALS.filter((v) => !v.standalone);

/* ---------------------------------------------------------------------------
   SERVICE SELECTOR — a radio group of cards. §3
   ------------------------------------------------------------------------ */
export function serviceSelector({ verticals = BOOKABLE(), current = 'flights', onSelect } = {}) {
  const cards = verticals.map((v) => el('button', {
    type: 'button', class: 'c-card c-card--interactive c-pick', role: 'radio',
    'aria-checked': String(v.id === current), dataset: { vertical: v.id }, tabIndex: v.id === current ? 0 : -1,
    onclick: (event) => choose(event.currentTarget),
    onkeydown: (event) => {
      const i = cards.indexOf(event.currentTarget);
      const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
      const next = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[event.key];
      if (next == null) return;
      event.preventDefault();
      const target = cards[(i + next + cards.length) % cards.length];
      choose(target); target.focus();
    },
  }, [
    el('span', { class: 'c-pick__icon' }, icon(v.icon, { size: 'lg' })),
    el('span', { class: 'c-pick__title' }, t(v.label)),
    el('span', { class: 'c-pick__desc' }, t(v.descKey ?? `search.${v.id}.desc`)),
    el('span', { class: 'c-pick__check', 'aria-hidden': 'true' }, icon('no-check-circle', { size: 'sm' })),
  ]));
  const choose = (card) => {
    cards.forEach((c) => { c.setAttribute('aria-checked', String(c === card)); c.tabIndex = c === card ? 0 : -1; });
    onSelect?.(card.dataset.vertical);
  };
  const group = el('div', { class: 'c-pick-grid', role: 'radiogroup', 'aria-label': t('book.selector.label') }, cards);
  group.no = { select(id) { const c = cards.find((x) => x.dataset.vertical === id); if (c) choose(c); return !!c; } };
  return group;
}

/* ---------------------------------------------------------------------------
   SUMMARY — the review card shown on success. §9
   ------------------------------------------------------------------------ */
export function contextSummary(ctx, { onEdit = null, href = null } = {}) {
  const vertical = SEARCH_VERTICALS.find((v) => v.id === ctx.service);
  const isAr = getLocale() === 'ar';
  const cabin = vertical?.fields.find((f) => f.id === 'cabin')?.options.find((o) => o.value === ctx.cabin);
  const tripType = vertical?.fields.find((f) => f.id === 'tripType')?.options.find((o) => o.value === ctx.tripType);
  const row = (labelKey, value) => (value ? el('div', { class: 'c-summary__row' }, [el('dt', {}, t(labelKey)), el('dd', {}, value)]) : null);
  const routeText = ctx.tripType === 'multi'
    ? ctx.legs.map((l) => `${l.from} ← ${l.to}`).join(' · ')
    : [ctx.origin, ctx.destination].filter(Boolean).join(isAr ? ' ← ' : ' → ');
  const dates = ctx.tripType === 'multi'
    ? ctx.legs.map((l) => dateShort(l.date)).join(' · ')
    : [ctx.dates.depart || ctx.dates.checkin, ctx.dates.return || ctx.dates.checkout].filter(Boolean).map(dateShort).join(' – ');
  const priority = HOME_PRIORITIES.find((p) => p.sort === ctx.options.sort);

  return el('div', { class: 'c-summary', role: 'status' }, [
    el('div', { class: 'c-summary__head' }, [
      el('span', { class: 'c-summary__icon' }, icon('no-check-circle', { size: 'lg' })),
      el('div', {}, [
        el('h3', { class: 'c-summary__title' }, t('book.success.title')),
        el('p', { class: 't-body-sm t-muted' }, t('book.success.text')),
      ]),
    ]),
    el('dl', { class: 'c-summary__rows' }, [
      row('book.summary.service', vertical ? t(vertical.label) : ctx.service),
      row('book.summary.tripType', tripType ? (isAr ? tripType.labelAr : tripType.labelEn) : ''),
      row('book.summary.route', routeText),
      row('book.summary.dates', dates),
      row('book.summary.travellers', ['flights', 'hotels', 'packages', 'umrah', 'medical', 'transport'].includes(ctx.service) ? summariseTravellers(ctx.travellers) : ''),
      row('book.summary.cabin', cabin ? (isAr ? cabin.labelAr : cabin.labelEn) : ''),
      row('book.summary.priority', priority ? pick(priority, 'label') : ''),
      row('book.summary.offer', ctx.options.offer),
      row('book.summary.supervisor', ctx.attribution?.supervisor ? supervisorLabel(ctx.attribution.supervisor) : ''),
      row('book.summary.notes', ctx.options.notes),
    ]),
    el('div', { class: 'c-summary__actions' }, [
      el('a', { class: 'c-btn c-btn--primary c-btn--lg', href }, [el('span', {}, t('book.success.continue')), icon('no-arrow-end', { size: 'sm', flip: true })]),
      el('button', { type: 'button', class: 'c-btn c-btn--tertiary', onclick: onEdit }, t('book.success.edit')),
    ]),
  ]);
}

/** The supervisor's display name for a slug (Stage 10.10), or the slug itself. */
const supervisorLabel = (slug) => { const sup = supervisorBySlug(slug); return sup ? (pick(sup, 'name') || t('sup.name.fallback')) : slug; };

/**
 * The attribution chip (Stage 10.10): who the customer is booking with.
 * Rendered only when the session carries an active supervisor.
 */
export function attributionChip(attribution) {
  const sup = attribution?.supervisor ? supervisorBySlug(attribution.supervisor) : null;
  if (!sup) return null;
  return el('p', { class: 'c-book__attribution', dataset: { supervisor: sup.slug } }, [
    icon('no-supervisor', { size: 'sm' }),
    el('span', {}, t('book.attribution', supervisorLabel(sup.slug))),
    el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route(supervisorUrl(sup)) }, t('book.attribution.profile')),
  ]);
}

/* ---------------------------------------------------------------------------
   TRUST + SUPPORT — concise, verified only. §13
   ------------------------------------------------------------------------ */
export function bookingTrust() {
  const items = ['book.trust.prices', 'book.trust.reliable', 'book.trust.human', 'book.trust.manage'];
  const channels = liveChannels();
  return el('aside', { class: 'c-book__aside', 'aria-label': t('book.trust.label') }, [
    el('ul', { class: 'c-trust-list c-trust-list--stack', role: 'list' }, items.map((k) =>
      el('li', { class: 'c-trust-item' }, [icon('no-check-circle', { size: 'sm' }), el('span', {}, t(k))]))),
    el('p', { class: 't-body-sm t-muted' }, t('book.support.text')),
    el('div', { class: 'l-cluster l-cluster--8' }, [
      ...channels.map((c) => el('a', { class: 'c-btn c-btn--secondary c-btn--sm', href: c.href, target: '_blank', rel: 'noopener' }, [icon(c.icon, { size: 'sm' }), el('span', {}, pick(c, 'label'))])),
      el('a', { class: 'c-btn c-btn--secondary', href: route('help/') }, [icon('no-support', { size: 'sm' }), el('span', {}, t('home.support.help'))]),
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   MOUNT
   @param {URLSearchParams} params      ?vertical=…&to=…&service=…&offer=…
   @param {function} prepare            async (ctx) → ctx; default persists it.
                                        Stage 11 plugs the engine in here.
   ------------------------------------------------------------------------ */
export function mountBooking({
  root = document,
  params = new URLSearchParams(),
  prepare = async (ctx) => { saveContext(ctx); return ctx; },
} = {}) {
  const mount = (name) => qs(`[data-booking="${name}"]`, root);
  const scrollTo = (id) => qs(`#${id}`, root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  let sort = '';
  let offer = '';
  let lastContext = null;
  // Stage 10.10 — stored on arrival from ?supervisor=…, or remembered for the session.
  const attribution = attributionFrom(params);
  render(mount('attribution'), attributionChip(attribution));

  // ---- The form, with the tab strip hidden: the selector drives it. §3 §8
  const widget = searchWidget({ tabs: false, onSubmit: (vertical, formData) => submit(vertical, formData) });
  const selector = serviceSelector({
    onSelect: (id) => { widget.no.select(id); region.content(widget); setStatus(''); syncCaption(id); },
  });
  render(mount('selector'), selector);

  // ---- Region: the form is the content; success swaps in the summary. §10
  const region = stateRegion(mount('form'), {
    loading: () => el('div', { class: 'c-search', 'aria-hidden': 'true' }, [el('div', { class: 'c-search__panel' }, [
      el('div', { class: 'c-search__fields' }, Array.from({ length: 4 }, () => el('div', { class: 'c-skeleton', style: 'block-size:var(--control-height)' }))),
      el('div', { class: 'c-skeleton', style: 'block-size:var(--control-height-lg);inline-size:12rem;margin-block-start:var(--space-24)' }),
    ])]),
    empty: () => stateBlock({ variant: 'empty', title: t('book.empty.title'), text: t('book.empty.text'), actions: [{ label: t('home.support.help'), href: route('help/'), variant: 'c-btn--primary' }] }),
    error: () => stateBlock({ variant: 'error', title: t('book.error.title'), text: t('book.error.text'), actions: [
      { label: t('action.retry'), variant: 'c-btn--primary', onClick: () => region.content(widget) },
      { label: t('action.help'), href: route('help/') },
    ] }),
  });
  const status = el('p', { class: 'c-book__status t-body-sm', role: 'status', 'aria-live': 'polite' });
  render(mount('status'), status);
  const setStatus = (text, tone = '') => { status.textContent = text; status.dataset.tone = tone; };
  const caption = mount('caption');
  const syncCaption = (id) => { const v = SEARCH_VERTICALS.find((x) => x.id === id); if (caption && v) caption.textContent = t(v.captionKey ?? `search.${id}.caption`); };

  // ---- Help me choose: a utility action that opens the priorities. §6
  const choose = chooseModule(HOME_PRIORITIES, { onGo: () => { helpPanel.hidden = true; helpToggle.setAttribute('aria-expanded', 'false'); widget.no.focus(); scrollTo('book-form'); } });
  const helpPanel = el('div', { class: 'c-book__help', id: 'book-help', hidden: true }, choose);
  const helpToggle = el('button', {
    type: 'button', class: 'c-btn c-btn--tertiary', 'aria-expanded': 'false', 'aria-controls': 'book-help',
    onclick: () => { const open = helpPanel.hidden; helpPanel.hidden = !open; helpToggle.setAttribute('aria-expanded', String(open)); if (open) helpPanel.querySelector('button')?.focus(); },
  }, [icon('no-sparkle', { size: 'sm' }), el('span', {}, t('book.help.cta'))]);
  render(mount('help'), [el('div', { class: 'c-book__help-row' }, [helpToggle, el('span', { class: 't-body-sm t-muted' }, t('book.help.text'))]), helpPanel]);

  render(mount('trust'), bookingTrust());

  // ---- Submit: validate → loading → prepare → success | error
  const submit = async (vertical, formData) => {
    widget.no.clearErrors();
    const ctx = buildContext(vertical, formData, { sort: choose.no.selected ?? sort, offer, supervisor: attribution?.supervisor ?? '', source: attribution?.source ?? '' });
    const errors = validate(vertical, ctx);
    if (errors.length) {
      // One message per control: rules that hit the same field read as one line.
      const merged = new Map();
      for (const e of errors) { const k = `${e.field}:${e.index ?? ''}`; merged.set(k, merged.has(k) ? { ...e, message: `${merged.get(k).message} ${e.message}` } : e); }
      let first = null;
      for (const e of merged.values()) { const c = widget.no.setError(e.field, e.message, e.index); first ??= c; }
      first?.focus();
      setStatus(t('book.status.fix', errors.length), 'error');
      return null;
    }
    const button = widget.no.submitButton();
    if (button) setButtonState(button, 'loading');
    setStatus(t('book.status.loading'));
    try {
      lastContext = await prepare(ctx);
      if (button) setButtonState(button, 'idle');
      setStatus('');
      region.content(contextSummary(lastContext, { href: continueUrl(lastContext), onEdit: () => { region.content(widget); widget.no.focus(); } }));
      scrollTo('book-form');
      return lastContext;
    } catch (error) {
      console.error('[no] booking could not be prepared', error);
      if (button) setButtonState(button, 'idle');
      setStatus(t('book.error.text'), 'error');
      region.error();
      return null;
    }
  };

  // ---- Arrival: open what the URL asks for
  region.content(widget);
  const applied = applyEntryParams(widget, params);
  const initial = applied?.vertical ?? 'flights';
  selector.no.select(initial);
  // A deep link came through a "book" door: the caret goes straight to the form.
  if (applied) widget.no.focus({ preventScroll: true });
  offer = applied?.offer ?? '';
  sort = applied?.sort ?? '';

  return {
    widget, selector, region, choose,
    get context() { return lastContext; },
    attribution,
    select: (id) => selector.no.select(id),
    submit: () => widget.no.form()?.requestSubmit(),
    setError: (name, msg, i) => widget.no.setError(name, msg, i),
  };
}
