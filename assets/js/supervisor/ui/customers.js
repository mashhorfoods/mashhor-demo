/* SUPERVISOR / UI / CUSTOMERS — the list (search) and one customer's detail (?id=). Stage 13
   Only customers currently attributed to this supervisor ever appear here — enforced by the backend, not by this
   screen (§13). A foreign id in the URL renders the same "not found" state as an unknown one. */
import { el, render } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { supervisorData } from '../data.js';
import { mountSupervisorPortal, loadRegion, pagedRegion, pageTitle, notFoundState, dataTable, bookingStatusBadge, dateTime, block } from './shell.js';

const columns = [
  { labelKey: 'svp.customers.col.name', render: (c) => el('a', { class: 'c-svp-link', href: route(`supervisor/customers/?id=${encodeURIComponent(c.id)}`) }, c.name || c.email) },
  { labelKey: 'svp.customers.col.contact', render: (c) => el('bdi', { dir: 'ltr' }, c.email) },
  { labelKey: 'svp.customers.col.bookings', render: (c) => String(c.bookingsCount ?? 0) },
  { labelKey: 'svp.customers.col.since', render: (c) => dateTime(c.attributionAt) },
  { labelKey: 'svp.customers.col.lastActivity', render: (c) => dateTime(c.lastActivityAt) },
];

export function mountSupervisorCustomers({ root = document, params = new URLSearchParams(location.search) } = {}) {
  const id = params.get('id');
  if (id) return mountCustomerDetail({ root, id });
  return mountSupervisorPortal({ root, id: 'customers', head: 'page.supervisor.customers', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'customers' } });
    const form = el('form', { class: 'c-svp-filter', role: 'search', onsubmit: (e) => { e.preventDefault(); run(); } }, [
      el('label', { class: 'u-sr-only', for: 'svp-cust-search' }, t('svp.customers.searchLabel')),
      el('input', { id: 'svp-cust-search', class: 'c-field__control', type: 'search', name: 'search', placeholder: t('svp.customers.searchPlaceholder') }),
      el('button', { type: 'submit', class: 'c-btn c-btn--secondary' }, [icon('no-search', { size: 'sm' }), el('span', {}, t('nav.search'))]),
    ]);
    main.replaceChildren(pageTitle('svp.customers.title', 'svp.customers.text'), form, host);
    const region = pagedRegion(host, (q) => supervisorData.customers(q), {
      filters: () => ({ search: form.elements.search.value.trim() }),
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-customer', headingLevel: 2, title: t('svp.customers.empty.title'), text: t('svp.customers.empty.text'), actions: [{ label: t('svp.dash.title'), href: route('supervisor/dashboard/'), variant: 'c-btn--primary' }] }),
      paint: (items) => dataTable({ columns, rows: items, rowKey: (c) => c.id, emptyKey: 'svp.customers.empty.title' }),
    });
    const run = region.run;
    await run();
    return { refresh: run };
  } });
}

function mountCustomerDetail({ root, id }) {
  return mountSupervisorPortal({ root, id: 'customers', head: 'page.supervisor.customerDetail', paint: async ({ main }) => {
    const c = await supervisorData.customer(id);
    if (!c) { render(main, notFoundState(route('supervisor/customers/'), t('svp.customers.title'))); return { customer: null }; }
    render(main, [
      el('p', {}, el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('supervisor/customers/') }, [icon('no-arrow-end', { size: 'xs', className: 'c-icon--start' }), el('span', {}, t('svp.customers.title'))])),
      el('h1', { class: 't-h1' }, c.name || c.email),
      el('div', { class: 'c-acct-grid' }, [
        block(t('svp.customers.detail.contact'), el('dl', { class: 'c-tripcard__rows' }, [
          el('div', { class: 'c-tripcard__row' }, [el('dt', {}, t('svp.customers.col.contact')), el('dd', {}, el('bdi', { dir: 'ltr' }, c.email))]),
          c.phone ? el('div', { class: 'c-tripcard__row' }, [el('dt', {}, t('svp.customers.detail.phone')), el('dd', {}, el('bdi', { dir: 'ltr' }, c.phone))]) : null,
          el('div', { class: 'c-tripcard__row' }, [el('dt', {}, t('svp.customers.col.since')), el('dd', {}, dateTime(c.attribution?.at))]),
        ].filter(Boolean)), { id: 'cust-contact' }),
        block(t('svp.customers.detail.history'), c.attributionHistory?.length
          ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, c.attributionHistory.map((h) => el('li', {}, `${dateTime(h.at)} · ${h.source} · ${h.supervisorId ?? '—'}`)))
          : el('p', { class: 't-body-sm t-muted' }, t('svp.table.empty')), { id: 'cust-history' }),
      ]),
      block(t('svp.customers.detail.bookings'), c.bookings?.length
        ? dataTable({ columns: [
            { labelKey: 'svp.bookings.col.id', render: (b) => el('bdi', { dir: 'ltr' }, b.id) },
            { labelKey: 'svp.bookings.col.service', render: (b) => b.service },
            { labelKey: 'svp.bookings.col.status', render: (b) => bookingStatusBadge(b.status) },
            { labelKey: 'svp.bookings.col.amount', render: (b) => (b.amount ? `${b.amount} ${b.currency}` : '—') },
          ], rows: c.bookings, rowKey: (b) => b.id })
        : el('p', { class: 't-body-sm t-muted' }, t('svp.table.empty')), { id: 'cust-bookings' }),
    ]);
    return { customer: c };
  } });
}
