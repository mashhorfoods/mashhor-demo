/* ============================================================================
   CORE / PORTAL UI — what the three portal shells share: the customer account
   (account/ui/shell.js), the supervisor portal (supervisor/ui/shell.js) and
   the operations portal (ops/ui/shell.js).

   The display pieces at the top are the same in every portal. The rest is
   built per portal by createPortalUi() from the portal's slot attribute,
   string prefix, auth error class and sign-in URL, so each portal keeps its
   own copy, its own error text and its own data hooks. The two staff portals
   also share their guard and mount (createStaffPortal); the customer account
   keeps its own, which carries the support entry and sign-up.
   ========================================================================= */
import { el, qs, render, setPageHead } from './dom.js';
import { t } from './i18n.js';
import { money, dateShort } from './format.js';
import { route } from '../data/config.js';
import { icon, toast, setButtonState } from '../components/ui.js';
import { stateBlock, stateRegion, loadingBlock } from '../components/states.js';

/* ---- Display pieces every portal shares ----------------------------------- */
export const here = () => location.pathname + location.search;
export const pageTitle = (titleKey, textKey) => el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t(titleKey)), textKey ? el('p', { class: 't-body t-muted' }, t(textKey)) : null]);
export const block = (title, body, { id = null, action = null } = {}) => el('section', { class: 'c-review-block', ...(id ? { id, 'aria-labelledby': `${id}-title` } : {}) }, [
  el('div', { class: 'c-review-block__head' }, [el('h2', { class: 'c-review-block__title', ...(id ? { id: `${id}-title` } : {}) }, title), action]), body,
]);
export const rows = (pairs) => el('dl', { class: 'c-tripcard__rows' }, pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => el('div', { class: 'c-tripcard__row' }, [el('dt', {}, k), el('dd', {}, v)])));
export const payBadge = (status) => el('span', { class: `c-badge c-badge--${{ paid: 'success', refunded: 'info', pending: 'warning', failed: 'error', unpaid: 'outline' }[status] ?? 'outline'}`, dataset: { pay: status } }, t(`acct.pay.${status}`));
export function bookingStatusBadge(status) {
  const tone = { confirmed: 'success', completed: 'success', cancelled: 'error', pending: 'warning', processing: 'info', failed: 'error', expired: 'warning' }[status] ?? 'outline';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { status } }, t(`acct.status.${status}`) || status);
}
/** A date for a table cell or a meta line; '—' when there is none. */
export const dateTime = (iso) => (iso ? dateShort(iso) : '—');
/** A signed staff-side amount in the page's money format ("−120 USD" for a refund). */
export const amount = (n, c) => `${n < 0 ? '−' : ''}${money(Math.abs(n), c)}`;
/** The revenue figures per currency: `byCurrency` when the backend sends it (several currencies are never summed),
    else the flat single-currency fields (older backends, the development stand-in). */
export const revenueGroups = (r) => (r.byCurrency?.length ? r.byCurrency : [{ currency: r.currency, gross: r.gross, completed: r.completed, pending: r.pending, cancelled: r.cancelled }]);
export const unreadCount = (notifications) => notifications.filter((n) => !n.read).length;

/** A metric card for the dashboards — a number, never a claim beyond what the backend sent. */
export function metricCard(labelKey, value, { icon: iconName = 'no-info', tone = null, sub = null } = {}) {
  return el('article', { class: `c-svp-metric${tone ? ` c-svp-metric--${tone}` : ''}` }, [
    el('span', { class: 'c-svp-metric__icon' }, icon(iconName, { size: 'md' })),
    el('div', {}, [el('p', { class: 'c-svp-metric__value' }, String(value)), el('p', { class: 'c-svp-metric__label' }, t(labelKey)), sub ? el('p', { class: 't-body-sm t-muted' }, sub) : null]),
  ]);
}

/**
 * A status `<select>` that saves on change: disabled while saving, a toast either way, and on failure the select
 * goes back to `current`. `statuses` are the values, `optionKey(s)` their string keys.
 */
export function statusSelect({ statuses, current, optionKey, labelKey, save, doneKey, failKey, disabled = false, dataset = null }) {
  const select = el('select', { class: 'c-field__control c-field__control--sm', 'aria-label': t(labelKey), ...(dataset ? { dataset } : {}), ...(disabled ? { disabled: true } : {}) },
    statuses.map((s) => el('option', { value: s, ...(s === current ? { selected: true } : {}) }, t(optionKey(s)))));
  select.addEventListener('change', async () => {
    const next = select.value; select.disabled = true;
    try { await save(next); toast({ title: t(doneKey), variant: 'success', duration: 3000 }); }
    catch { toast({ title: t(failKey), variant: 'warning', duration: 5000 }); select.value = current; }
    select.disabled = false;
  });
  return select;
}

/** Rows per page in every staff-portal list (the backend caps a page at 100). */
export const PAGE_SIZE = 50;

const ERROR_CODES = ['unavailable', 'network', 'timeout', 'forbidden', 'notFound', 'rateLimited', 'notConfigured', 'invalid'];

/**
 * The per-portal pieces.
 * @param {object} o
 * @param {string}   o.attr        the slot attribute: 'portal' → [data-portal="main"]
 * @param {string}   o.page        page.* key segment for the description: 'ops' | 'supervisor' | 'account'
 * @param {string}   o.prefix      the portal's string prefix: 'ops' | 'svp' | 'acct'
 * @param {string}   o.label       the name in console warnings: 'ops' | 'supervisor' | 'account'
 * @param {function} o.isDev       true while a development data adapter is registered
 * @param {function} o.ErrorClass  the portal's auth error class (a lost session)
 * @param {function} o.signInHref  where a lost session goes, back here afterwards
 * @param {string[]} [o.errorCodes] codes with their own message beyond the common ones
 * @param {string}   [o.support]   a support route every error state offers (the customer account)
 * @param {function} [o.forbidden] what a region shows for a 'forbidden' answer (default: the error state)
 */
export function createPortalUi({ attr, page, prefix, label, isDev, ErrorClass, signInHref, errorCodes = [], support = null, forbidden = null }) {
  const slot = (name, root = document) => qs(`[data-${attr}="${name}"]`, root);
  const put = (name, nodes, root = document) => { const s = slot(name, root); if (s) render(s, nodes); return s; };
  const setHead = (key) => setPageHead({ title: t(key), description: t(`page.${page}.description`) });
  const devNotice = () => (isDev() ? el('p', { class: 'c-note c-note--warning', role: 'note', dataset: { dev: 'true' } }, [icon('no-alert', { size: 'sm' }), el('span', { class: 'c-note__text' }, [el('strong', {}, `${t(`${prefix}.dev.title`)}: `), t(`${prefix}.dev.text`)])]) : null);

  /** A safe message for a failure code (ApiError / auth error); never the raw error. */
  const known = [...ERROR_CODES, ...errorCodes];
  const errorText = (code) => t(known.includes(code) ? `acct.err.${code}` : 'acct.err.failed');
  const errorState = (retry, code = null) => {
    const final = code === 'notConfigured' || code === 'forbidden';
    return stateBlock({
      variant: code === 'notConfigured' ? 'warning' : 'error', iconName: code === 'notConfigured' ? 'no-info' : undefined, headingLevel: 2,
      title: t(code === 'notConfigured' ? `${prefix}.state.notConnected.title` : `${prefix}.state.error.title`),
      text: code ? `${errorText(code)}${support ? ` ${t('acct.err.support')}` : ''}` : t(`${prefix}.state.error.text`),
      actions: [
        ...(final ? [] : [{ id: 'retry', label: t('acct.retry'), variant: 'c-btn--primary', onClick: retry }]),
        ...(support ? [{ id: 'support', label: t('acct.support.open'), href: route(support), ...(final ? { variant: 'c-btn--primary' } : {}) }] : []),
      ],
    });
  };
  const notFoundState = (backHref, backLabel) => [el('h1', { class: 't-h1' }, t(`${prefix}.state.notFound.title`)), stateBlock({ variant: 'empty', headingLevel: 2, title: t(`${prefix}.state.notFound.text`), actions: [{ label: backLabel, href: backHref, variant: 'c-btn--primary' }] })];

  /** A region that loads a data call and paints its result; the screens compose these. */
  function loadRegion(host, load, { empty, paint, minHeight = '12rem' } = {}) {
    const region = stateRegion(host, { loading: () => loadingBlock(t('acct.state.loading')), minHeight });
    const run = async () => {
      region.loading();
      try {
        const data = await load();
        if (empty && (!data || (Array.isArray(data) && !data.length))) { region.content(empty()); return data; }
        region.content(paint(data)); return data;
      } catch (error) {
        if (error instanceof ErrorClass) { location.assign(signInHref()); return null; }
        if (forbidden && error?.code === 'forbidden') { region.content(forbidden()); return null; }
        console.warn(`[no] ${label} data failed`, error?.code ?? error?.name); region.content(errorState(run, error?.code ?? null)); return null;
      }
    };
    return { region, run };
  }

  /**
   * A paged list region: page 1, then a "Load more" button that fetches the next page and appends its rows, under
   * a polite "Showing X of Y" line. The footer is hidden while there is nothing listed; the button is hidden once
   * the backend says there is no next page. `filters()` is read once per run (page 1) and the same snapshot goes
   * with every Load more, so a filter change re-runs from page 1 and Load more never mixes two filter states.
   * `fetchPage({ ...filters, page, pageSize })` answers the adapter's { items, total, nextPage }. `paint(items)` must
   * return one element — a dataTable (rows are appended to its <tbody>) or a list container (children appended).
   */
  function pagedRegion(host, fetchPage, { filters = () => ({}), empty, paint, pageSize = PAGE_SIZE, minHeight } = {}) {
    const listHost = el('div', { class: 'c-pager__list' });
    const status = el('p', { class: 'c-pager__status t-body-sm t-muted', role: 'status', 'aria-live': 'polite', tabindex: '-1', dataset: { pagerStatus: '' } });
    const more = el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--sm', dataset: { action: 'load-more' } }, [el('span', { class: 'c-btn__label' }, t('portal.pager.more')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
    const footer = el('div', { class: 'c-pager', hidden: true, dataset: { pager: '' } }, [status, more]);
    host.replaceChildren(listHost, footer);
    let shown = 0; let total = null; let next = null; let list = null; let generation = 0; let busy = false; let query = {};
    const sync = () => {
      footer.hidden = !shown;
      status.textContent = total == null ? t('portal.pager.shown', shown) : t('portal.pager.status', shown, total);
      more.hidden = !next;
    };
    const first = loadRegion(listHost, async () => {
      const gen = ++generation; shown = 0; next = null; footer.hidden = true; query = filters();
      const pg = await fetchPage({ ...query, page: 1, pageSize });
      if (gen === generation) { shown = pg.items.length; total = pg.total ?? null; next = pg.nextPage ?? null; }
      return pg.items;
    }, { empty, minHeight, paint: (items) => (list = paint(items)) });
    const run = async () => { const data = await first.run(); sync(); return data; };
    async function loadMore() {
      if (!next || busy) return;
      const gen = generation; busy = true; setButtonState(more, 'loading');
      try {
        const pg = await fetchPage({ ...query, page: next, pageSize });
        if (gen !== generation) return;
        const fresh = paint(pg.items);
        const target = list.querySelector('tbody') ?? list; const source = fresh.querySelector('tbody') ?? fresh;
        target.append(...source.children);
        shown += pg.items.length; total = pg.total ?? total; next = pg.nextPage ?? null;
      } catch (error) {
        if (error instanceof ErrorClass) { location.assign(signInHref()); return; }
        console.warn(`[no] ${label} next page failed`, error?.code ?? error?.name);
        toast({ title: t('portal.pager.failed'), variant: 'warning', duration: 5000 });
      } finally { busy = false; setButtonState(more, 'idle'); }
      sync();
      if (more.hidden) status.focus();
    }
    more.addEventListener('click', loadMore);
    return { region: first.region, run, loadMore };
  }

  /** A simple responsive table: a real <table> at wide widths, cards at narrow ones (CSS handles the switch, §31). */
  function dataTable({ columns, rows: dataRows, rowKey, emptyKey = `${prefix}.table.empty` }) {
    if (!dataRows.length) return el('p', { class: 't-body-sm t-muted' }, t(emptyKey));
    return el('div', { class: 'c-svp-table-wrap' }, el('table', { class: 'c-svp-table' }, [
      el('thead', {}, el('tr', {}, columns.map((c) => el('th', { scope: 'col' }, t(c.labelKey))))),
      el('tbody', {}, dataRows.map((row) => el('tr', { dataset: { row: rowKey(row) } }, columns.map((c) => el('td', { 'data-label': t(c.labelKey) }, c.render(row)))))),
    ]));
  }

  return { slot, put, setHead, devNotice, errorText, errorState, notFoundState, loadRegion, pagedRegion, dataTable };
}

/**
 * A staff portal (supervisor, operations): the shared pieces above plus its guard and its mount.
 * @param {object} o                 everything createPortalUi takes except signInHref, plus:
 * @param {string}   o.area          the portal's route prefix: 'admin/' | 'supervisor/'
 * @param {string}   o.entity        the signed-in status and the paint argument's name: 'staff' | 'supervisor'
 * @param {string}   o.datasetKey    the <html> data attribute that carries the guard state
 * @param {function} o.restore       the portal's restore-session function
 * @param {function} o.nav           (currentId, entity) → the portal navigation
 * @param {string}   o.homeLabelKey  the "not connected" state's way out
 * @param {string}   o.guardIcon     the guest state's icon
 * @param {function} [o.paintExtras] (entity) → extra arguments for every screen's paint
 * @param {function} [o.forbiddenMain] what the main slot shows when a whole screen answers 'forbidden'
 */
export function createStaffPortal({ area, entity, datasetKey, restore, nav, homeLabelKey, guardIcon, paintExtras = () => ({}), forbiddenMain = null, ...ui }) {
  const signInHref = () => route(`${area}sign-in/`) + `?next=${encodeURIComponent(here())}`;
  const portal = createPortalUi({ ...ui, signInHref });
  const { prefix, label, ErrorClass } = ui;
  const { put, slot, devNotice, errorText, errorState, setHead } = portal;

  /** The guest / expired state: sign in only — there is no staff sign-up. */
  function guardState(status, code = null) {
    const expired = status === 'expired';
    if (status === 'unavailable') return [
      el('h1', { class: 't-h1' }, t(code === 'notConfigured' ? `${prefix}.state.notConnected.title` : `${prefix}.guard.unavailableTitle`)),
      stateBlock({ variant: 'warning', iconName: 'no-alert', headingLevel: 2, title: code === 'notConfigured' ? errorText('notConfigured') : t(`${prefix}.guard.unavailable`),
        actions: code === 'notConfigured' ? [{ label: t(homeLabelKey), href: route('') }] : [{ id: 'retry', label: t('acct.retry'), variant: 'c-btn--primary', onClick: () => location.reload() }] }),
    ];
    return [
      el('h1', { class: 't-h1' }, t(expired ? `${prefix}.guard.expiredTitle` : `${prefix}.guard.title`)),
      stateBlock({ variant: expired ? 'warning' : 'info', iconName: expired ? 'no-expired' : guardIcon, headingLevel: 2, title: t(expired ? `${prefix}.guard.expired` : `${prefix}.guard.text`),
        actions: [{ label: t(`${prefix}.auth.signIn.action`), href: signInHref(), variant: 'c-btn--primary', id: 'sign-in' }] }),
    ];
  }

  /**
   * @param {object} o
   * @param {string}   o.id      nav item id (marks the nav)
   * @param {string}   o.head    page.* string key
   * @param {function} o.paint   async ({ [entity], main, root, ...paintExtras }) → handle; renders into the main slot
   */
  async function mount({ root = document, id, head, paint }) {
    setHead(head);
    const session = await restore();
    const { status, code } = session; const who = session[entity];
    if (status !== entity) {
      put('notice', null, root); put('nav', null, root); put('main', guardState(status, code), root);
      document.documentElement.dataset[datasetKey] = status;
      return { blocked: status, [entity]: null };
    }
    document.documentElement.dataset[datasetKey] = entity;
    put('notice', devNotice(), root);
    put('nav', nav(id, who), root);
    const main = slot('main', root);
    render(main, loadingBlock(t('acct.state.loading')));
    let handle = null;
    try { handle = await paint({ [entity]: who, main, root, ...paintExtras(who) }); }
    catch (error) {
      if (error instanceof ErrorClass) { put('main', guardState('expired'), root); return { blocked: 'expired', [entity]: null }; }
      if (forbiddenMain && error?.code === 'forbidden') { render(main, forbiddenMain()); return { blocked: 'forbidden', [entity]: who }; }
      console.warn(`[no] ${label} portal screen failed`, error?.code ?? error?.name);
      render(main, errorState(() => mount({ root, id, head, paint }), error?.code ?? null));
    }
    return { [entity]: who, ...(handle ?? {}) };
  }

  return { ...portal, guardState, mount };
}
