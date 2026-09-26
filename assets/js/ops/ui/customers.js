/* OPS / UI / CUSTOMERS — Stage 14. Admin-wide customer list and one customer's unified operational view: account,
   assigned supervisor/attribution, bookings, documents, payments, notifications, audit history. Reassignment goes
   straight to the backend (customer.view + supervisor.manage, both server-checked) and preserves attribution
   history — this screen never invents or silently changes an attribution rule (§7, §9). */
import { el, render } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon, toast } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, notFoundState, actionForm, debouncedRun, emptyNote, dataTable, opsStatusBadge, payBadge, dateTime, amount, block, rows } from './shell.js';

const columns = [
  { labelKey: 'ops.customers.col.name', render: (c) => el('a', { class: 'c-svp-link', href: route(`admin/customers/?id=${encodeURIComponent(c.id)}`) }, c.name) },
  { labelKey: 'ops.customers.col.email', render: (c) => el('bdi', { dir: 'ltr' }, c.email) },
  { labelKey: 'ops.customers.col.supervisor', render: (c) => c.supervisorId || '—' },
  { labelKey: 'ops.customers.col.bookings', render: (c) => String(c.bookingsCount) },
  { labelKey: 'ops.customers.col.date', render: (c) => dateTime(c.createdAt) },
];

export function mountOpsCustomers({ root = document, params = new URLSearchParams(location.search) } = {}) {
  const id = params.get('id');
  if (id) return mountCustomerDetail({ root, id });
  return mountOpsPortal({ root, id: 'customers', head: 'page.ops.customers', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'customers' } });
    const search = el('input', { class: 'c-field__control c-svp-filter__select', type: 'search', placeholder: t('ops.customers.searchPlaceholder'), 'aria-label': t('ops.customers.searchPlaceholder') });
    debouncedRun(search, () => region.run());
    main.replaceChildren(pageTitle('ops.customers.title', 'ops.customers.text'), el('div', { class: 'c-svp-filter' }, [search]), host);
    const region = loadRegion(host, async () => (await opsData.customers({ search: search.value.trim() || undefined, page: 1, pageSize: 50 })).items, {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-customer', headingLevel: 2, title: t('ops.customers.empty.title'), text: t('ops.customers.empty.text') }),
      paint: (items) => dataTable({ columns, rows: items, rowKey: (c) => c.id, emptyKey: 'ops.customers.empty.title' }),
    });
    await region.run();
    return { refresh: region.run };
  } });
}

function mountCustomerDetail({ root, id }) {
  return mountOpsPortal({ root, id: 'customers', head: 'page.ops.customerDetail', paint: async ({ main, can }) => {
    const c = await opsData.customer(id);
    if (!c) { render(main, notFoundState(route('admin/customers/'), t('ops.customers.title'))); return { customer: null }; }
    const refresh = async () => render(main, await view());

    async function view(preloaded) {
      const fresh = preloaded ?? await opsData.customer(id);
      const nodes = [
        el('p', {}, el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/customers/') }, [icon('no-arrow-end', { size: 'xs', className: 'c-icon--start' }), el('span', {}, t('ops.customers.title'))])),
        el('div', { class: 'l-stack l-stack--4' }, [el('h1', { class: 't-h1' }, fresh.name), el('p', { class: 't-body t-muted' }, el('bdi', { dir: 'ltr' }, fresh.email))]),
        block(t('ops.customers.detail.title'), rows([
          [t('ops.customers.col.supervisor'), fresh.attribution?.supervisorId || '—'],
          [t('ops.customers.detail.source'), fresh.attribution?.source || '—'],
          [t('ops.customers.col.date'), dateTime(fresh.createdAt)],
        ]), { id: 'ops-cus-details' }),
      ];

      if (can('supervisor.manage') && can('attribution.view')) {
        const supervisorId = el('input', { name: 'supervisorId', class: 'c-field__control', type: 'text', dir: 'ltr', value: fresh.attribution?.supervisorId ?? '', 'aria-label': t('ops.customers.reassign.placeholder'), placeholder: t('ops.customers.reassign.placeholder') });
        const form = actionForm({
          submitLabel: t('ops.customers.reassign.action'),
          onSubmit: async (fd) => { await opsData.reassignCustomer(id, fd.get('supervisorId')?.trim() || null); toast({ title: t('ops.customers.reassign.done'), variant: 'success', duration: 3000 }); await refresh(); },
          children: [supervisorId],
        });
        nodes.push(block(t('ops.customers.reassign.title'), form, { id: 'ops-cus-reassign' }));
      }

      if (can('customer.view')) nodes.push(block(t('ops.customers.bookings.title'), fresh.bookings.length
        ? dataTable({ columns: [
            { labelKey: 'ops.bookings.col.id', render: (b) => el('bdi', { dir: 'ltr' }, b.id) },
            { labelKey: 'ops.bookings.col.service', render: (b) => b.service },
            { labelKey: 'ops.bookings.col.status', render: (b) => opsStatusBadge(b.opsStatus) },
            { labelKey: 'ops.bookings.col.payment', render: (b) => payBadge(b.paymentStatus) },
          ], rows: fresh.bookings, rowKey: (b) => b.id })
        : emptyNote('ops.table.empty'), { id: 'ops-cus-bookings' }));

      if (can('payment.view')) nodes.push(block(t('ops.customers.payments.title'), fresh.payments.length
        ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, fresh.payments.map((p) => el('li', {}, [el('span', {}, amount(p.amount, p.currency)), payBadge(p.status), el('span', { class: 't-body-sm t-muted' }, dateTime(p.at))])))
        : emptyNote('ops.table.empty'), { id: 'ops-cus-payments' }));

      if (can('document.view')) nodes.push(block(t('ops.customers.documents.title'), fresh.documents.length
        ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, fresh.documents.map((d) => el('li', {}, [el('span', {}, d.type), el('span', { class: 't-body-sm t-muted' }, d.reviewStatus)])))
        : emptyNote('ops.table.empty'), { id: 'ops-cus-documents' }));

      if (can('attribution.view')) nodes.push(block(t('ops.customers.attribution.title'), fresh.attributionHistory.length
        ? el('ol', { class: 'c-svp-mini-list', role: 'list' }, fresh.attributionHistory.map((h) => el('li', {}, [el('span', {}, `${h.previousSupervisorId ?? '—'} → ${h.supervisorId ?? '—'}`), el('span', { class: 't-body-sm t-muted' }, `${h.source} · ${dateTime(h.at)}`)])))
        : emptyNote('ops.table.empty'), { id: 'ops-cus-attribution' }));

      return nodes;
    }

    render(main, await view(c));
    return { customer: c, refresh };
  } });
}
