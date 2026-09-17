/* ============================================================================
   ACCOUNT / UI / SHELL — what every account screen shares. Stage 12

   mountAccount() restores the session, blocks guests with a sign-in state
   that returns here afterwards, paints the account navigation and the
   support entry, and hands the screen its customer. Authorization itself
   lives in the adapters (customer.js): the shell only decides what to show.
   ========================================================================= */

import { el, qs, render, setPageHead } from '../../core/dom.js';
import { t, pick, getLocale } from '../../core/i18n.js';
import { money, dateShort } from '../../core/format.js';
import { route, STATUSES } from '../../data/config.js';
import { ACCOUNT_CUSTOMER, liveChannels } from '../../data/navigation.js';
import { serviceById } from '../../data/services.js';
import { supervisorBySlug } from '../../data/supervisors.js';
import { icon } from '../../components/ui.js';
import { stateBlock, stateRegion, loadingBlock } from '../../components/states.js';
import { restoreSession, signInHref, AuthError } from '../auth.js';
import { customerAdapter } from '../customer.js';

export const isAr = () => getLocale() === 'ar';
export const slot = (name, root = document) => qs(`[data-account="${name}"]`, root);
export const put = (name, nodes, root = document) => { const s = slot(name, root); if (s) render(s, nodes); return s; };
export const setHead = (key) => setPageHead({ title: t(key), description: t('page.account.description') });
export const here = () => location.pathname + location.search;

/** The development-data notice, shown while a development adapter is registered. */
export const devNotice = () => (customerAdapter()?.dev ? el('p', { class: 'c-note c-note--warning', role: 'note', dataset: { dev: 'true' } }, [icon('no-alert', { size: 'sm' }), el('span', { class: 'c-note__text' }, [el('strong', {}, `${t('acct.dev.title')}: `), t('acct.dev.text')])]) : null);

/** Account navigation: the customer menu, current item marked. */
export function accountNav(current) {
  return el('nav', { class: 'c-acct-nav', 'aria-label': t('acct.nav.label') }, [
    el('ul', { class: 'c-acct-nav__list', role: 'list' }, ACCOUNT_CUSTOMER.map((item) => el('li', {}, el('a', {
      class: 'c-acct-nav__link', href: route(item.href), dataset: { nav: item.id },
      ...(item.id === current ? { 'aria-current': 'page' } : {}),
    }, [icon(item.icon, { size: 'sm' }), el('span', {}, pick(item, 'label'))])))),
  ]);
}

/** The support entry every account screen carries: verified channels only, the supervisor when there is one. */
export function supportEntry(customer, { compact = false } = {}) {
  const sup = customer?.supervisorId ? supervisorBySlug(customer.supervisorId) : null;
  const channels = liveChannels();
  return el('aside', { class: 'c-acct-support', 'aria-labelledby': 'acct-support-title' }, [
    el('h2', { class: 'c-acct-support__title', id: 'acct-support-title' }, [icon('no-support', { size: 'sm' }), ' ', t('acct.support.title')]),
    compact ? null : el('p', { class: 't-body-sm t-muted' }, t('acct.support.text')),
    sup ? el('a', { class: 'c-acct-support__sup', href: route(`supervisor/${sup.slug}/`) }, [icon('no-supervisor', { size: 'sm' }), el('span', {}, [el('strong', {}, t('acct.support.supervisor')), el('br'), pick(sup, 'name') || t('sup.name.fallback')])]) : null,
    channels.length ? el('div', { class: 'c-acct-support__channels' }, channels.map((c) => el('a', { class: 'c-btn c-btn--secondary c-btn--sm', href: c.href, ...(c.external ? { target: '_blank', rel: 'noopener' } : {}) }, [icon(c.icon, { size: 'sm' }), el('span', {}, pick(c, 'label'))]))) : null,
    el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('account/support/') }, [el('span', {}, t('acct.support.open')), icon('no-arrow-end', { size: 'xs', flip: true })]),
  ]);
}

/** The guest / expired state: one action, back here afterwards. */
export function guardState(status, code = null) {
  const expired = status === 'expired';
  if (status === 'unavailable') return [
    el('h1', { class: 't-h1' }, t(code === 'notConfigured' ? 'acct.state.notConnected.title' : 'auth.guard.unavailableTitle')),
    stateBlock({ variant: 'warning', iconName: 'no-alert', headingLevel: 2, title: code === 'notConfigured' ? errorText('notConfigured') : t('auth.guard.unavailable'),
      actions: [...(code === 'notConfigured' ? [] : [{ id: 'retry', label: t('acct.retry'), variant: 'c-btn--primary', onClick: () => location.reload() }]), { id: 'support', label: t('acct.support.open'), href: route('account/support/'), ...(code === 'notConfigured' ? { variant: 'c-btn--primary' } : {}) }] }),
  ];
  return [
    el('h1', { class: 't-h1' }, t(expired ? 'auth.guard.expiredTitle' : 'auth.guard.title')),
    stateBlock({ variant: expired ? 'warning' : 'info', iconName: expired ? 'no-expired' : 'no-customer', headingLevel: 2, title: t(expired ? 'auth.guard.expired' : 'auth.guard.text'),
      actions: [{ label: t('auth.signIn.action'), href: signInHref(here()), variant: 'c-btn--primary', id: 'sign-in' }, { label: t('auth.signUp.action'), href: route('account/sign-up/') + `?next=${encodeURIComponent(here())}` }] }),
  ];
}

/**
 * @param {object} o
 * @param {string}   o.id      ACCOUNT_CUSTOMER item id (marks the nav)
 * @param {string}   o.head    page.* string key
 * @param {function} o.paint   async ({ customer, main }) → handle; renders into the main slot
 */
export async function mountAccount({ root = document, id, head, paint }) {
  setHead(head);
  const { status, customer, code } = await restoreSession();
  if (status !== 'customer') {
    put('notice', null, root); put('nav', null, root); put('main', guardState(status, code), root); put('support', null, root);
    document.documentElement.dataset.account = status;
    return { blocked: status, customer: null };
  }
  document.documentElement.dataset.account = 'customer';
  put('notice', devNotice(), root);
  put('nav', accountNav(id), root);
  put('support', supportEntry(customer), root);
  const main = slot('main', root);
  render(main, loadingBlock(t('acct.state.loading')));
  let handle = null;
  try {
    handle = await paint({ customer, main, root });
    main.append(supportEntry(customer));   // the phone/tablet copy, after the content (CSS hides one of the two)
  } catch (error) {
    if (error instanceof AuthError) { put('main', guardState('expired'), root); return { blocked: 'expired', customer: null }; }
    console.warn('[no] account screen failed', error?.code ?? error?.name);
    render(main, errorState(() => mountAccount({ root, id, head, paint }), error?.code ?? null));
  }
  return { customer, ...(handle ?? {}) };
}

/* ---- Shared pieces ------------------------------------------------------ */
/** A customer-safe message for a failure code (ApiError / AuthError); never the raw error. */
export const errorText = (code) => t(['unavailable', 'network', 'timeout', 'forbidden', 'notFound', 'rateLimited', 'notConfigured', 'invalid', 'tooLarge', 'unsupported', 'expired'].includes(code) ? `acct.err.${code}` : 'acct.err.failed');
export const errorState = (retry, code = null) => stateBlock({
  variant: code === 'notConfigured' ? 'warning' : 'error', iconName: code === 'notConfigured' ? 'no-info' : undefined, headingLevel: 2,
  title: t(code === 'notConfigured' ? 'acct.state.notConnected.title' : 'acct.state.error.title'), text: code ? `${errorText(code)} ${t('acct.err.support')}` : t('acct.state.error.text'),
  actions: [...(code === 'notConfigured' || code === 'forbidden' ? [] : [{ id: 'retry', label: t('acct.retry'), variant: 'c-btn--primary', onClick: retry }]), { id: 'support', label: t('acct.support.open'), href: route('account/support/'), ...(code === 'notConfigured' || code === 'forbidden' ? { variant: 'c-btn--primary' } : {}) }],
});
export const notFoundState = (backHref, backLabel) => [el('h1', { class: 't-h1' }, t('acct.state.notFound.title')), stateBlock({ variant: 'empty', headingLevel: 2, title: t('acct.state.notFound.text'), actions: [{ label: backLabel, href: backHref, variant: 'c-btn--primary' }] })];

/** A region that loads a customer call and paints its result; the screens compose these. */
export function loadRegion(host, load, { empty, paint, minHeight = '12rem' } = {}) {
  const region = stateRegion(host, { loading: () => loadingBlock(t('acct.state.loading')), minHeight });
  const run = async () => {
    region.loading();
    try {
      const data = await load();
      if (empty && (!data || (Array.isArray(data) && !data.length))) { region.content(empty()); return data; }
      region.content(paint(data)); return data;
    } catch (error) {
      if (error instanceof AuthError) { location.assign(signInHref(here())); return null; }
      console.warn('[no] account data failed', error?.code ?? error?.name); region.content(errorState(run, error?.code ?? null)); return null;
    }
  };
  return { region, run };
}

export const serviceName = (id) => { const s = serviceById(id); return s ? pick(s, 'title') : (id ?? ''); };
export const serviceIcon = (id) => serviceById(id)?.icon ?? 'no-booking';
export function statusBadge(status) {
  const map = { received: { icon: 'no-pending', label: 'acct.status.received' } };
  const s = STATUSES[status] ?? map[status] ?? { icon: 'no-info', label: `status.${status}` };
  const tone = { confirmed: 'success', completed: 'success', cancelled: 'error', failed: 'error', expired: 'warning', processing: 'info', pending: 'warning', received: 'info' }[status] ?? 'neutral';
  return el('span', { class: `c-badge c-badge--${tone === 'neutral' ? 'outline' : tone}`, dataset: { status } }, [icon(s.icon, { size: 'xs' }), el('span', {}, t(s.label))]);
}
export const tripStatusBadge = (status) => el('span', { class: `c-badge c-badge--${{ current: 'success', upcoming: 'brand', completed: 'outline', cancelled: 'error' }[status] ?? 'outline'}`, dataset: { tripStatus: status } }, t(`acct.tripStatus.${status}`));
export const payBadge = (status) => el('span', { class: `c-badge c-badge--${{ paid: 'success', refunded: 'info', pending: 'warning', failed: 'error', unpaid: 'outline' }[status] ?? 'outline'}`, dataset: { pay: status } }, t(`acct.pay.${status}`));
export const dateRange = (a, b) => (a && b && a !== b ? `${dateShort(a)} – ${dateShort(b)}` : a ? dateShort(a) : '');
export const amount = (n, c) => money(Math.abs(n), c) + (n < 0 ? ` (${t('acct.pay.refunded')})` : '');
export const rows = (pairs) => el('dl', { class: 'c-tripcard__rows' }, pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => el('div', { class: 'c-tripcard__row' }, [el('dt', {}, k), el('dd', {}, v)])));
export const block = (title, body, { id = null, action = null } = {}) => el('section', { class: 'c-review-block', ...(id ? { id, 'aria-labelledby': `${id}-title` } : {}) }, [
  el('div', { class: 'c-review-block__head' }, [el('h2', { class: 'c-review-block__title', ...(id ? { id: `${id}-title` } : {}) }, title), action]), body,
]);
export const pageTitle = (titleKey, textKey) => el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t(titleKey)), textKey ? el('p', { class: 't-body t-muted' }, t(textKey)) : null]);

/** A trip card for lists and the dashboard. */
export function tripCard(trip, { large = false } = {}) {
  const next = { upcoming: trip.needsPayment ? 'pay' : 'docs', current: 'docs', completed: 'done', cancelled: 'cancelled' }[trip.status] ?? 'processing';
  return el('article', { class: `c-card c-acct-trip${large ? ' c-acct-trip--large' : ''}`, dataset: { trip: trip.id, tripStatus: trip.status } }, [
    el('div', { class: 'c-acct-trip__head' }, [
      el('div', {}, [el('h3', { class: 'c-acct-trip__title' }, el('a', { class: 'c-card__link', href: route(`trips/?id=${encodeURIComponent(trip.id)}`) }, pick(trip, 'title'))), el('p', { class: 't-body-sm t-muted' }, `${pick(trip.destination, 'city')}${trip.destination?.code ? ` (${trip.destination.code})` : ''}`)]),
      tripStatusBadge(trip.status),
    ]),
    el('dl', { class: 'c-acct-trip__meta' }, [
      el('div', {}, [el('dt', {}, t('acct.dates')), el('dd', {}, dateRange(trip.startDate, trip.endDate))]),
      el('div', {}, [el('dt', {}, t('acct.service')), el('dd', { class: 'c-acct-trip__services' }, trip.services.map((s) => el('span', { class: 'c-acct-trip__service' }, [icon(serviceIcon(s), { size: 'xs' }), serviceName(s)])))]),
      trip.travellers ? el('div', {}, [el('dt', {}, t('acct.travellers')), el('dd', {}, String(trip.travellers))]) : null,
    ]),
    el('div', { class: 'c-acct-trip__foot' }, [
      el('span', { class: 't-body-sm t-muted', dataset: { next } }, t(`acct.trips.next.${next}`)),
      el('span', { class: 'c-btn c-btn--tertiary c-btn--sm', 'aria-hidden': 'true' }, [el('span', {}, t('acct.trips.details')), icon('no-chevron-end', { size: 'xs', flip: true })]),
    ]),
  ]);
}

/** A booking row/card. */
export function bookingCard(b) {
  return el('article', { class: 'c-card c-acct-booking', dataset: { booking: b.id, status: b.status } }, [
    el('div', { class: 'c-acct-booking__icon' }, icon(serviceIcon(b.service), { size: 'lg' })),
    el('div', { class: 'c-acct-booking__body' }, [
      el('h3', { class: 'c-acct-booking__title' }, el('a', { class: 'c-card__link', href: route(`account/bookings/?id=${encodeURIComponent(b.id)}`) }, [serviceName(b.service), ' · ', el('bdi', { dir: 'ltr' }, b.id)])),
      el('p', { class: 't-body-sm t-muted' }, [b.trip ? pick(b.trip, 'title') : (b.detail?.route ? el('bdi', { dir: 'ltr' }, b.detail.route) : ''), ' · ', dateShort(b.createdAt)]),
      el('div', { class: 'c-acct-booking__badges' }, [statusBadge(b.status), payBadge(b.paymentStatus)]),
    ]),
    el('div', { class: 'c-acct-booking__amount' }, b.amount ? el('span', { class: 't-price' }, money(b.amount, b.currency)) : el('span', { class: 't-body-sm t-muted' }, t('acct.pay.unpaid'))),
  ]);
}
