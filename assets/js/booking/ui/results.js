/* ============================================================================
   BOOKING / UI / RESULTS — the search results screen. Stage 11

   Context (from the URL or the session) → search → offers, then: summary +
   edit, sort, filters (a panel from tablet up, a sheet on phones), the
   "help me choose" priorities with the reason on every card, compare (up
   to three), select. Every dynamic region has loading / empty / error /
   expired / unknown-place states with a next action. mountResults() →
   window.no.results
   ========================================================================= */

import { el, qs, qsa, render, lockScroll, scrollTo as scrollIntoView } from '../../core/dom.js';
import { t, pick, getLocale } from '../../core/i18n.js';
import { money, duration, time, dateShort } from '../../core/format.js';
import { route } from '../../data/config.js';
import { contextFromParams, contextToParams, loadContext, saveContext, attributionFrom, summariseTravellers } from '../../core/booking.js';
import { icon, initModals } from '../../components/ui.js';
import { stateRegion, stateBlock, skeletonCard } from '../../components/states.js';
import { runSearch, toSearchRequest } from '../search.js';
import { adapterFor } from '../adapters/index.js';
import { loadJourney, selectOffer, stepUrl, searchExpired, startSearch, setResults } from '../journey.js';
import { SORTS, PRIORITIES, EMPTY_FILTERS, TIME_SLOTS, sortOffers, applyFilters, facetsOf, labelOffers, activeFilterCount, totalDuration, totalStops } from '../rank.js';
import { totalTravellers } from '../pricing.js';
import { flightResultCard } from './result-card.js';
import { devNotice, progress, tripCard, recoveryState, put, slot, setHead, carrierName, isAr, placeName } from './shared.js';

const MAX_COMPARE = 3;

/** The context this page works from: a search URL wins, else the session. */
export function contextForPage(params = new URLSearchParams(location.search)) {
  const fromUrl = contextFromParams(params);
  if (!fromUrl) return loadContext();
  attributionFrom(params);
  // The same search reloaded (refresh, back) keeps the stored context, so fresh results are reused rather than fetched twice.
  const stored = loadContext();
  if (stored && contextToParams(stored).toString() === contextToParams(fromUrl).toString()) return stored;
  saveContext(fromUrl); return fromUrl;
}

export function mountResults({ root = document, params = new URLSearchParams(location.search), search = runSearch } = {}) {
  setHead('page.search.title');
  const ctx = contextForPage(params);
  const state = { offers: null, sort: 'recommended', priority: '', filters: { ...EMPTY_FILTERS }, compare: [], adapter: null, errors: [] };
  const api = { state, ctx, region: null, refresh, setSort, setPriority, setFilters, compare: toggleCompare, run };

  if (!ctx) {
    put('main', recoveryState({ reason: 'noContext', back: 'book' }), root);
    return api;
  }
  state.adapter = adapterFor(ctx.service);
  const editHref = `${route('book/')}?${contextToParams(ctx).toString()}`;
  put('progress', progress('search', { mode: state.adapter.mode }), root);
  put('notice', state.adapter.dev ? devNotice() : null, root);
  put('summary', tripCard({ journey: { context: ctx }, editHref, showTotal: false }), root);

  // ---- request-only services: no inventory, a request instead -------------
  if (state.adapter.mode === 'request') {
    put('main', el('div', { class: 'l-stack l-stack--16' }, [
      el('h1', { class: 't-h1' }, t('bk.request.heading')),
      stateBlock({ variant: 'info', iconName: 'no-supervisor', headingLevel: 2, title: t('bk.request.title'), text: t('bk.request.text'),
        actions: [{ label: t('bk.request.continue'), variant: 'c-btn--primary', onClick: async () => { await search(ctx); location.assign(stepUrl('travellers')); } }, { label: t('bk.summary.edit'), href: editHref }] }),
    ]), root);
    put('aside', null, root);
    return api;
  }

  // ---- results region -----------------------------------------------------
  const listHost = el('div', { class: 'c-results', 'aria-live': 'polite' });
  const region = stateRegion(listHost, {
    loading: () => el('div', { class: 'l-stack l-stack--16' }, [el('p', { class: 't-body t-muted', role: 'status' }, t('bk.results.searching')), ...Array.from({ length: 3 }, skeletonCard)]),
    empty: () => stateBlock({ variant: 'empty', title: t('bk.results.empty.title'), text: t('bk.results.empty.text'), actions: [{ label: t('bk.summary.edit'), href: editHref, variant: 'c-btn--primary' }, { label: t('detail.cta.expert'), href: route('help/contact/') }] }),
    error: () => stateBlock({ variant: 'error', title: t('bk.results.error.title'), text: t('bk.results.error.text'), actions: [{ label: t('action.retry'), variant: 'c-btn--primary', onClick: () => run() }, { label: t('bk.summary.edit'), href: editHref }] }),
  });
  api.region = region;
  const bar = el('div', { class: 'c-results-bar' });
  const priorityRow = el('div', { class: 'c-priority', role: 'group', 'aria-label': t('bk.choose.title') });
  const tray = el('div', { class: 'c-compare-tray', hidden: true, role: 'region', 'aria-label': t('bk.compare.title') });
  const dialog = el('dialog', { class: 'c-modal c-modal--wide', id: 'compare-dialog', 'aria-labelledby': 'compare-title' });
  const filtersHost = el('div', { class: 'c-filters-panel', role: 'group', 'aria-labelledby': 'filters-title' });
  const sheet = el('dialog', { class: 'c-modal c-filters-sheet', id: 'filters-sheet', 'aria-labelledby': 'filters-sheet-title' });
  const openFilters = el('button', { type: 'button', class: 'c-btn c-btn--secondary c-filters-open', 'aria-haspopup': 'dialog', 'aria-controls': 'filters-sheet', onclick: () => { if (!sheet.open) { sheet.showModal(); lockScroll(); } } }, [icon('no-filter', { size: 'sm' }), el('span', {}, t('bk.filters.open')), el('span', { class: 'c-badge c-badge--outline', dataset: { count: '' } }, t('bk.filters.active', 0))]);

  put('main', el('div', { class: 'l-stack l-stack--16' }, [
    el('h1', { class: 't-h1', id: 'results-title' }, t('bk.results.title')),
    el('div', { class: 'l-stack l-stack--8' }, [el('h2', { class: 't-h3', id: 'choose-title' }, t('bk.choose.title')), el('p', { class: 't-body-sm t-muted' }, t('bk.choose.text')), priorityRow]),
    bar, listHost, tray, dialog, sheet,
  ]), root);
  put('aside', el('div', { class: 'c-journey__aside--filters' }, filtersHost), root);

  // ---- priorities ---------------------------------------------------------
  const paintPriorities = () => render(priorityRow, [
    ...PRIORITIES.map((p) => el('button', { type: 'button', class: 'c-chip', 'aria-pressed': String(state.priority === p.id), dataset: { priority: p.id }, onclick: () => setPriority(state.priority === p.id ? '' : p.id) }, t(p.label))),
    state.priority ? el('button', { type: 'button', class: 'c-btn c-btn--tertiary c-btn--sm', onclick: () => setPriority('') }, t('bk.choose.clear')) : null,
  ]);
  function setPriority(id) { state.priority = id; if (id) state.sort = PRIORITIES.find((p) => p.id === id).sort; paintPriorities(); paintBar(); paintList(); }

  // ---- sort bar -----------------------------------------------------------
  const sortId = 'results-sort';
  function paintBar() {
    const visible = filtered();
    render(bar, [
      el('p', { class: 'c-results-bar__count', role: 'status' }, `${t('bk.results.count', visible.length)}${state.offers && visible.length !== state.offers.length ? ` · ${t('bk.results.count', state.offers.length)}` : ''}`),
      el('div', { class: 'l-cluster l-cluster--8' }, [
        openFilters,
        el('div', { class: 'c-results-bar__sort' }, [
          el('label', { class: 'c-field__label', for: sortId }, t('bk.sort.label')),
          el('select', { class: 'c-field__control', id: sortId, onchange: (e) => setSort(e.currentTarget.value) }, SORTS.map((s) => el('option', { value: s.id, selected: s.id === state.sort }, isAr() ? s.labelAr : s.labelEn))),
        ]),
      ]),
    ]);
    openFilters.querySelector('[data-count]').textContent = t('bk.filters.active', activeFilterCount(state.filters));
  }
  function setSort(id) { state.sort = id; if (!PRIORITIES.some((p) => p.sort === id && p.id === state.priority)) { state.priority = PRIORITIES.find((p) => p.sort === id)?.id ?? ''; paintPriorities(); } paintBar(); paintList(); }

  // ---- filters ------------------------------------------------------------
  function filtered() { return state.offers ? applyFilters(state.offers, state.filters) : []; }
  function setFilters(patch) { state.filters = { ...state.filters, ...patch }; paintFilters(); paintBar(); paintList(); }
  function paintFilters() {
    if (!state.offers) { render(filtersHost, []); return; }
    const f = facetsOf(state.offers); const cur = state.filters;
    const check = (group, value, label, checked) => { const id = `flt-${group}-${String(value).replace(/\W/g, '')}`; return el('label', { class: 'c-choice', for: id }, [
      el('input', { class: 'c-choice__input', type: 'checkbox', id, name: group, value: String(value), checked, onchange: (e) => { const list = new Set(cur[group]); e.currentTarget.checked ? list.add(value) : list.delete(value); setFilters({ [group]: [...list] }); } }),
      el('span', { class: 'c-choice__text' }, label)]); };
    const range = (id, labelKey, min, max, value, fmt, onInput) => el('div', { class: 'c-filters-panel__group' }, [
      el('label', { class: 'c-filters-panel__label', for: id }, t(labelKey)),
      el('input', { type: 'range', id, min, max, step: 1, value: value ?? max, class: 'c-range', oninput: (e) => onInput(Number(e.currentTarget.value)) }),
      el('output', { for: id }, fmt(value ?? max)),
    ]);
    render(filtersHost, [
      el('div', { class: 'c-filters-panel__head' }, [el('h2', { class: 't-h4', id: 'filters-title' }, t('bk.filters.title')), el('button', { type: 'button', class: 'c-btn c-btn--tertiary c-btn--sm', onclick: () => setFilters({ ...EMPTY_FILTERS }) }, t('bk.filters.reset'))]),
      f.price ? range('flt-price', 'bk.filters.price', f.price.min, f.price.max, cur.maxPrice, (v) => money(v, state.offers[0].price.currency), (v) => setFilters({ maxPrice: v >= f.price.max ? null : v })) : null,
      el('fieldset', { class: 'c-filters-panel__group' }, [el('legend', {}, t('bk.filters.stops')), ...f.stops.map((n) => check('stops', n, t(`bk.filters.stops.${n}`), cur.stops.includes(n)))]),
      el('fieldset', { class: 'c-filters-panel__group' }, [el('legend', {}, t('bk.filters.depart')), ...TIME_SLOTS.filter((s) => f.depart.includes(s.id)).map((s) => check('depart', s.id, isAr() ? s.labelAr : s.labelEn, cur.depart.includes(s.id)))]),
      el('fieldset', { class: 'c-filters-panel__group' }, [el('legend', {}, t('bk.filters.arrive')), ...TIME_SLOTS.filter((s) => f.arrive.includes(s.id)).map((s) => check('arrive', s.id, isAr() ? s.labelAr : s.labelEn, cur.arrive.includes(s.id)))]),
      f.duration ? range('flt-duration', 'bk.filters.duration', f.duration.min, f.duration.max, cur.maxDuration, (v) => duration(v), (v) => setFilters({ maxDuration: v >= f.duration.max ? null : v })) : null,
      el('fieldset', { class: 'c-filters-panel__group' }, [el('legend', {}, t('bk.filters.carrier')), ...f.carriers.map((c) => check('carriers', c.code, carrierName(c), cur.carriers.includes(c.code)))]),
      el('fieldset', { class: 'c-filters-panel__group' }, [el('legend', {}, t('bk.filters.baggage')), check('baggage', true, t('bk.filters.baggage'), cur.baggage)]),
      el('fieldset', { class: 'c-filters-panel__group' }, [el('legend', {}, t('bk.filters.airports')), ...f.airports.map((a) => check('airports', a.code, `${placeName(a)} (${a.code})`, cur.airports.includes(a.code)))]),
    ]);
    // the baggage check is a boolean, not a list
    const bag = filtersHost.querySelector('#flt-baggage-true'); if (bag) bag.onchange = (e) => setFilters({ baggage: e.currentTarget.checked });
  }
  // the same panel lives in the aside from tablet up and in the sheet on phones
  const mq = window.matchMedia('(min-width: 64em)');
  const placeFilters = () => {
    if (mq.matches) { const host = slot('aside', root)?.querySelector('.c-journey__aside--filters'); if (host && filtersHost.parentElement !== host) host.append(filtersHost); }
    else if (filtersHost.parentElement !== sheet.querySelector('.c-modal__body')) sheet.querySelector('.c-modal__body')?.append(filtersHost);
  };
  render(sheet, el('form', { method: 'dialog', class: 'c-modal__form' }, [
    el('div', { class: 'c-modal__head' }, [el('h2', { class: 't-h3', id: 'filters-sheet-title' }, t('bk.filters.title')), el('button', { type: 'button', class: 'c-btn c-btn--utility', 'aria-label': t('bk.compare.close'), 'data-modal-close': '' }, icon('no-close'))]),
    el('div', { class: 'c-modal__body' }),
    el('div', { class: 'c-modal__foot' }, [el('button', { type: 'submit', class: 'c-btn c-btn--primary c-btn--block' }, t('bk.filters.apply'))]),
  ]));
  mq.addEventListener('change', placeFilters);
  initModals(root);

  // ---- compare ------------------------------------------------------------
  function toggleCompare(offer, on) {
    if (on && state.compare.length >= MAX_COMPARE) { paintTray(t('bk.compare.max')); paintList(); return; }
    state.compare = on ? [...state.compare, offer.id] : state.compare.filter((id) => id !== offer.id);
    paintTray(); paintList();
  }
  function paintTray(note = '') {
    tray.hidden = state.compare.length === 0;
    render(tray, [
      el('span', {}, note || (state.compare.length < 2 ? t('bk.compare.hint') : t('bk.compare.open', state.compare.length))),
      el('div', { class: 'l-cluster l-cluster--8' }, [
        el('button', { type: 'button', class: 'c-btn c-btn--inverse c-btn--sm', onclick: () => { state.compare = []; paintTray(); paintList(); } }, t('bk.compare.clear')),
        el('button', { type: 'button', class: 'c-btn c-btn--primary c-btn--sm', disabled: state.compare.length < 2, onclick: openCompare }, t('bk.compare.open', state.compare.length)),
      ]),
    ]);
  }
  function openCompare() {
    const offers = state.compare.map((id) => state.offers.find((o) => o.id === id)).filter(Boolean);
    const rows = [
      ['bk.compare.price', (o) => money(o.price.total, o.price.currency)],
      ['bk.compare.duration', (o) => duration(totalDuration(o))],
      ['bk.compare.stops', (o) => (totalStops(o) ? t('flight.stops', totalStops(o)) : t('flight.direct'))],
      ['bk.compare.depart', (o) => `${time(o.legs[0].departAt)} · ${dateShort(o.legs[0].departAt)}`],
      ['bk.compare.arrive', (o) => `${time(o.legs[0].arriveAt)} · ${dateShort(o.legs[0].arriveAt)}`],
      ['bk.compare.baggage', (o) => `${o.baggage.checkedPieces}×${o.baggage.checkedKg}kg + ${o.baggage.cabinKg}kg`],
      ['bk.compare.fare', (o) => pick(o.fare, 'label')],
    ];
    render(dialog, el('div', { class: 'c-modal__form' }, [
      el('div', { class: 'c-modal__head' }, [el('h2', { class: 't-h3', id: 'compare-title' }, t('bk.compare.title')), el('button', { type: 'button', class: 'c-btn c-btn--utility', 'aria-label': t('bk.compare.close'), onclick: () => dialog.close() }, icon('no-close'))]),
      el('div', { class: 'c-modal__body' }, el('div', { class: 'c-compare-scroll' }, el('table', { class: 'c-compare-table' }, [
        el('thead', {}, el('tr', {}, [el('th', { scope: 'col' }, ''), ...offers.map((o) => el('th', { scope: 'col' }, `${carrierName(o.carrier)} · ${o.legs[0].segments[0].flightNumber}`))])),
        el('tbody', {}, [
          ...rows.map(([k, fn]) => el('tr', {}, [el('th', { scope: 'row' }, t(k)), ...offers.map((o) => el('td', {}, fn(o)))])),
          el('tr', {}, [el('th', { scope: 'row' }, ''), ...offers.map((o) => el('td', {}, el('button', { type: 'button', class: 'c-btn c-btn--primary c-btn--sm', dataset: { action: 'select' }, onclick: () => select(o) }, t('bk.card.select'))))]),
        ]),
      ]))),
    ]));
    dialog.showModal();
  }
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  // ---- list ---------------------------------------------------------------
  function paintList() {
    if (!state.offers) return;
    if (!state.offers.length) { region.empty(); return; }
    const visible = sortOffers(filtered(), state.sort);
    if (!visible.length) { region.content(stateBlock({ variant: 'empty', title: t('bk.results.filtered.title'), text: t('bk.results.filtered.text'), actions: [{ label: t('bk.results.resetFilters'), variant: 'c-btn--primary', onClick: () => setFilters({ ...EMPTY_FILTERS }) }] })); return; }
    const labels = labelOffers(state.offers);
    const party = totalTravellers(ctx.travellers);
    region.content(visible.map((o) => flightResultCard(o, {
      labels: labels.get(o.id) ?? [], priority: state.priority, party,
      compared: state.compare.includes(o.id), canCompare: state.compare.length < MAX_COMPARE,
      onSelect: select, onCompare: toggleCompare, detailsHref: `${stepUrl('details')}?id=${encodeURIComponent(o.id)}`,
    })));
  }
  function select(offer) { selectOffer(offer); location.assign(stepUrl('travellers')); }

  // ---- run the search (or reuse fresh results on the way back) -----------
  async function run({ force = false } = {}) {
    const j = loadJourney();
    const sameSearch = !!j.search?.results && !!j.context && j.search.request?.key === toSearchRequest(ctx).request?.key;
    if (!force && sameSearch && !searchExpired(j) && j.context.createdAt === ctx.createdAt && j.search.meta?.mode === 'search') {
      state.offers = j.search.results; state.adapter = adapterFor(ctx.service);
      paintFilters(); placeFilters(); paintPriorities(); paintBar(); paintTray(); paintList(); return state.offers;
    }
    region.loading(); render(bar, []); render(filtersHost, []); render(priorityRow, []);
    try {
      const { offers, errors } = await search(ctx);
      if (errors.length) {
        const bad = errors[0];
        region.content(stateBlock({ variant: 'warning', iconName: 'no-location', title: t('bk.results.unknownPlace.title'), text: t('bk.results.unknownPlace.text', bad.text || ''), actions: [{ label: t('bk.summary.edit'), href: editHref, variant: 'c-btn--primary' }] }));
        state.errors = errors; return null;
      }
      state.offers = offers; state.compare = []; state.filters = { ...EMPTY_FILTERS };
      paintFilters(); placeFilters(); paintPriorities(); paintBar(); paintTray(); paintList();
      return offers;
    } catch (error) {
      console.warn('[no] search failed', error);
      region.error(); return null;
    }
  }
  function refresh() { return run({ force: true }); }
  // an expired session shows the state instead of stale prices
  if (searchExpired(loadJourney()) && loadJourney().context?.createdAt === ctx.createdAt) {
    region.content(stateBlock({ variant: 'warning', iconName: 'no-expired', title: t('bk.results.expired.title'), text: t('bk.results.expired.text'), actions: [{ label: t('bk.results.searchAgain'), variant: 'c-btn--primary', onClick: () => refresh() }] }));
  } else run();
  return api;
}
