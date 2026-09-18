/* OPS / UI / PAYMENTS — Stage 14. Admin-wide payment records, read-only: what was recorded, for which booking and
   customer, when, at what state. No settlement, refund, payout or commission logic is performed or invented here
   — those stay explicit "pending business decision" configuration (§15, §28). */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { stateBlock } from '../../components/states.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, statusFilterSelect, dataTable, payBadge, amount, dateTime } from './shell.js';

const columns = [
  { labelKey: 'ops.payments.col.reference', render: (p) => el('bdi', { dir: 'ltr' }, p.reference || p.id) },
  { labelKey: 'ops.payments.col.customer', render: (p) => p.customerName || el('bdi', { dir: 'ltr' }, p.customerId) },
  { labelKey: 'ops.payments.col.booking', render: (p) => p.bookingId ? el('a', { class: 'c-svp-link', href: route(`admin/bookings/?id=${encodeURIComponent(p.bookingId)}`) }, el('bdi', { dir: 'ltr' }, p.bookingId)) : '—' },
  { labelKey: 'ops.payments.col.amount', render: (p) => amount(p.amount, p.currency) },
  { labelKey: 'ops.payments.col.status', render: (p) => payBadge(p.status) },
  { labelKey: 'ops.payments.col.date', render: (p) => dateTime(p.at) },
];

export function mountOpsPayments({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'payments', head: 'page.ops.payments', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'payments' } });
    const status = statusFilterSelect('ops.payments.filterLabel', ['paid', 'unpaid', 'failed', 'refunded'], 'acct.pay', () => region.run());
    main.replaceChildren(pageTitle('ops.payments.title', 'ops.payments.text'), el('div', { class: 'c-svp-filter' }, [status]), host);
    const region = loadRegion(host, async () => (await opsData.payments({ status: status.value || undefined, page: 1, pageSize: 50 })).items, {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-payment', headingLevel: 2, title: t('ops.payments.empty.title'), text: t('ops.payments.empty.text') }),
      paint: (items) => dataTable({ columns, rows: items, rowKey: (p) => p.id, emptyKey: 'ops.payments.empty.title' }),
    });
    await region.run();
    return { refresh: region.run };
  } });
}
