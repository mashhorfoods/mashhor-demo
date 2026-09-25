/* ============================================================================
   SUPERVISOR / UI / SHELL — what every supervisor portal screen shares.
   Stage 13. A SEPARATE workspace from the customer account (assets/js/
   account/ui/shell.js): its own navigation, its own guard, its own error
   copy. The Travel & Tourism global header/footer still wrap every page (the
   supervisor is part of the Travel & Tourism brand, never a separate one).
   ========================================================================= */
import { el, qs, render, setPageHead } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { money, dateShort } from '../../core/format.js';
import { route } from '../../data/config.js';
import { icon } from '../../components/ui.js';
import { stateBlock, stateRegion, loadingBlock } from '../../components/states.js';
import { restoreSupervisorSession, SupervisorAuthError } from '../auth.js';
import { supervisorDataAdapter } from '../data.js';

export const slot = (name, root = document) => qs(`[data-portal="${name}"]`, root);
export const put = (name, nodes, root = document) => { const s = slot(name, root); if (s) render(s, nodes); return s; };
export const setHead = (key) => setPageHead({ title: t(key), description: t('page.supervisor.description') });
export const here = () => location.pathname + location.search;

export const devNotice = () => (supervisorDataAdapter()?.dev ? el('p', { class: 'c-note c-note--warning', role: 'note', dataset: { dev: 'true' } }, [icon('no-alert', { size: 'sm' }), el('span', { class: 'c-note__text' }, [el('strong', {}, `${t('svp.dev.title')}: `), t('svp.dev.text')])]) : null);

const NAV = [
  { id: 'dashboard', icon: 'no-dashboard', href: 'supervisor/dashboard/', labelAr: 'نظرة عامة', labelEn: 'Overview' },
  { id: 'customers', icon: 'no-customer', href: 'supervisor/customers/', labelAr: 'عملائي', labelEn: 'My customers' },
  { id: 'leads', icon: 'no-lead', href: 'supervisor/leads/', labelAr: 'العملاء المحتملون', labelEn: 'Leads' },
  { id: 'bookings', icon: 'no-ticket', href: 'supervisor/bookings/', labelAr: 'الحجوزات', labelEn: 'Bookings' },
  { id: 'revenue', icon: 'no-payment', href: 'supervisor/revenue/', labelAr: 'الإيرادات', labelEn: 'Revenue' },
  { id: 'performance', icon: 'no-chart', href: 'supervisor/performance/', labelAr: 'الأداء', labelEn: 'Performance' },
  { id: 'notifications', icon: 'no-notification', href: 'supervisor/notifications/', labelAr: 'الإشعارات', labelEn: 'Notifications' },
  { id: 'settings', icon: 'no-settings', href: 'supervisor/settings/', labelAr: 'الإعدادات', labelEn: 'Settings', divider: true },
  { id: 'sign-out', icon: 'no-logout', href: 'supervisor/sign-out/', labelAr: 'تسجيل الخروج', labelEn: 'Sign out' },
];
export function portalNav(current) {
  return el('nav', { class: 'c-acct-nav c-svp-nav', 'aria-label': t('svp.nav.label') }, [
    el('ul', { class: 'c-acct-nav__list', role: 'list' }, NAV.map((item) => el('li', {}, el('a', {
      class: 'c-acct-nav__link', href: route(item.href), dataset: { nav: item.id },
      ...(item.id === current ? { 'aria-current': 'page' } : {}),
    }, [icon(item.icon, { size: 'sm' }), el('span', {}, pick(item, 'label'))])))),
  ]);
}

/** The guest / expired state: sign in only — there is no supervisor sign-up. */
export function guardState(status, code = null) {
  const expired = status === 'expired';
  if (status === 'unavailable') return [
    el('h1', { class: 't-h1' }, t(code === 'notConfigured' ? 'svp.state.notConnected.title' : 'svp.guard.unavailableTitle')),
    stateBlock({ variant: 'warning', iconName: 'no-alert', headingLevel: 2, title: code === 'notConfigured' ? errorText('notConfigured') : t('svp.guard.unavailable'),
      actions: code === 'notConfigured' ? [{ label: t('notFound.home'), href: route('') }] : [{ id: 'retry', label: t('acct.retry'), variant: 'c-btn--primary', onClick: () => location.reload() }] }),
  ];
  return [
    el('h1', { class: 't-h1' }, t(expired ? 'svp.guard.expiredTitle' : 'svp.guard.title')),
    stateBlock({ variant: expired ? 'warning' : 'info', iconName: expired ? 'no-expired' : 'no-supervisor', headingLevel: 2, title: t(expired ? 'svp.guard.expired' : 'svp.guard.text'),
      actions: [{ label: t('svp.auth.signIn.action'), href: route('supervisor/sign-in/') + `?next=${encodeURIComponent(here())}`, variant: 'c-btn--primary', id: 'sign-in' }] }),
  ];
}

export const errorText = (code) => t(['unavailable', 'network', 'timeout', 'forbidden', 'notFound', 'rateLimited', 'notConfigured', 'invalid'].includes(code) ? `acct.err.${code}` : 'acct.err.failed');
export const errorState = (retry, code = null) => stateBlock({
  variant: code === 'notConfigured' ? 'warning' : 'error', iconName: code === 'notConfigured' ? 'no-info' : undefined, headingLevel: 2,
  title: t(code === 'notConfigured' ? 'svp.state.notConnected.title' : 'svp.state.error.title'), text: code ? errorText(code) : t('svp.state.error.text'),
  actions: code === 'notConfigured' || code === 'forbidden' ? [] : [{ id: 'retry', label: t('acct.retry'), variant: 'c-btn--primary', onClick: retry }],
});
export const notFoundState = (backHref, backLabel) => [el('h1', { class: 't-h1' }, t('svp.state.notFound.title')), stateBlock({ variant: 'empty', headingLevel: 2, title: t('svp.state.notFound.text'), actions: [{ label: backLabel, href: backHref, variant: 'c-btn--primary' }] })];

/**
 * @param {object} o
 * @param {string}   o.id      NAV item id (marks the nav)
 * @param {string}   o.head    page.* string key
 * @param {function} o.paint   async ({ supervisor, main }) → handle; renders into the main slot
 */
export async function mountSupervisorPortal({ root = document, id, head, paint }) {
  setHead(head);
  const { status, supervisor, code } = await restoreSupervisorSession();
  if (status !== 'supervisor') {
    put('notice', null, root); put('nav', null, root); put('main', guardState(status, code), root);
    document.documentElement.dataset.supervisorPortal = status;
    return { blocked: status, supervisor: null };
  }
  document.documentElement.dataset.supervisorPortal = 'supervisor';
  put('notice', devNotice(), root);
  put('nav', portalNav(id), root);
  const main = slot('main', root);
  render(main, loadingBlock(t('acct.state.loading')));
  let handle = null;
  try { handle = await paint({ supervisor, main, root }); }
  catch (error) {
    if (error instanceof SupervisorAuthError) { put('main', guardState('expired'), root); return { blocked: 'expired', supervisor: null }; }
    console.warn('[no] supervisor portal screen failed', error?.code ?? error?.name);
    render(main, errorState(() => mountSupervisorPortal({ root, id, head, paint }), error?.code ?? null));
  }
  return { supervisor, ...(handle ?? {}) };
}

/** A region that loads a supervisor data call and paints its result; screens compose these. */
export function loadRegion(host, load, { empty, paint, minHeight = '12rem' } = {}) {
  const region = stateRegion(host, { loading: () => loadingBlock(t('acct.state.loading')), minHeight });
  const run = async () => {
    region.loading();
    try {
      const data = await load();
      if (empty && (!data || (Array.isArray(data) && !data.length))) { region.content(empty()); return data; }
      region.content(paint(data)); return data;
    } catch (error) {
      if (error instanceof SupervisorAuthError) { location.assign(route('supervisor/sign-in/') + `?next=${encodeURIComponent(here())}`); return null; }
      console.warn('[no] supervisor data failed', error?.code ?? error?.name); region.content(errorState(run, error?.code ?? null)); return null;
    }
  };
  return { region, run };
}

/* ---- Shared display pieces ------------------------------------------------ */
export function bookingStatusBadge(status) {
  const tone = { confirmed: 'success', completed: 'success', cancelled: 'error', pending: 'warning', processing: 'info' }[status] ?? 'outline';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { status } }, t(`acct.status.${status}`) || status);
}
export const payBadge = (status) => el('span', { class: `c-badge c-badge--${{ paid: 'success', refunded: 'info', pending: 'warning', failed: 'error', unpaid: 'outline' }[status] ?? 'outline'}`, dataset: { pay: status } }, t(`acct.pay.${status}`));
export function leadStatusBadge(status) {
  const tone = { new: 'brand', contacted: 'info', in_progress: 'warning', converted: 'success', closed: 'outline' }[status] ?? 'outline';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { leadStatus: status } }, t(`svp.leads.status.${status}`));
}
export const amount = (n, c) => `${n < 0 ? '−' : ''}${money(Math.abs(n), c)}`;
export const pageTitle = (titleKey, textKey) => el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t(titleKey)), textKey ? el('p', { class: 't-body t-muted' }, t(textKey)) : null]);
export const block = (title, body, { id = null, action = null } = {}) => el('section', { class: 'c-review-block', ...(id ? { id, 'aria-labelledby': `${id}-title` } : {}) }, [
  el('div', { class: 'c-review-block__head' }, [el('h2', { class: 'c-review-block__title', ...(id ? { id: `${id}-title` } : {}) }, title), action]), body,
]);
export const dateTime = (iso) => dateShort(iso);
export const rows = (pairs) => el('dl', { class: 'c-tripcard__rows' }, pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => el('div', { class: 'c-tripcard__row' }, [el('dt', {}, k), el('dd', {}, v)])));

/** A metric card for the dashboard/performance/revenue screens — a number, never a claim beyond what the backend sent. */
export function metricCard(labelKey, value, { icon: iconName = 'no-info', tone = null, sub = null } = {}) {
  return el('article', { class: `c-svp-metric${tone ? ` c-svp-metric--${tone}` : ''}` }, [
    el('span', { class: 'c-svp-metric__icon' }, icon(iconName, { size: 'md' })),
    el('div', {}, [el('p', { class: 'c-svp-metric__value' }, String(value)), el('p', { class: 'c-svp-metric__label' }, t(labelKey)), sub ? el('p', { class: 't-body-sm t-muted' }, sub) : null]),
  ]);
}
/** A simple responsive table: a real <table> at wide widths, cards at narrow ones (CSS handles the switch, §31). */
export function dataTable({ columns, rows: dataRows, rowKey, emptyKey = 'svp.table.empty' }) {
  if (!dataRows.length) return el('p', { class: 't-body-sm t-muted' }, t(emptyKey));
  return el('div', { class: 'c-svp-table-wrap' }, el('table', { class: 'c-svp-table' }, [
    el('thead', {}, el('tr', {}, columns.map((c) => el('th', { scope: 'col' }, t(c.labelKey))))),
    el('tbody', {}, dataRows.map((row) => el('tr', { dataset: { row: rowKey(row) } }, columns.map((c) => el('td', { 'data-label': t(c.labelKey) }, c.render(row)))))),
  ]));
}
