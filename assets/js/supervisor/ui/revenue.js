/* SUPERVISOR / UI / REVENUE — this supervisor's own bookings only, a period filter, and their commissions. Stage 13, Phase 6
   Amounts come straight from the backend's own bookings/payments; nothing is computed in this untrusted frontend
   beyond simple display formatting (§17). Commissions are the backend's own rows (one per paid attributed booking,
   written at the Business Rules Register's rate, reversed on cancellation/refund); this screen only lists them. */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { stateBlock } from '../../components/states.js';
import { supervisorData } from '../data.js';
import { mountSupervisorPortal, loadRegion, pagedRegion, pageTitle, metricCard, amount, block, revenueGroups, periodSelect, dataTable, dateTime, commissionText, commissionStatusBadge } from './shell.js';

const commissionColumns = [
  { labelKey: 'svp.revenue.commissions.col.booking', render: (c) => el('bdi', { dir: 'ltr' }, c.bookingId) },
  { labelKey: 'svp.revenue.commissions.col.amount', render: (c) => (c.amount == null ? '—' : amount(c.amount, c.currency ?? 'USD')) },
  { labelKey: 'svp.revenue.commissions.col.status', render: (c) => commissionStatusBadge(c.status) },
  { labelKey: 'svp.revenue.commissions.col.date', render: (c) => dateTime(c.createdAt) },
];

export function mountSupervisorRevenue({ root = document } = {}) {
  return mountSupervisorPortal({ root, id: 'revenue', head: 'page.supervisor.revenue', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'revenue' } });
    const commissionsHost = el('div', { dataset: { region: 'commissions' } });
    const filter = periodSelect(() => region.run());
    main.replaceChildren(
      pageTitle('svp.revenue.title', 'svp.revenue.text'), el('div', { class: 'c-svp-filter' }, [filter]), host,
      block(t('svp.revenue.commission'), commissionsHost, { id: 'rev-commission' }),
    );
    const region = loadRegion(host, () => supervisorData.revenue({ period: filter.value || null }), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-payment', headingLevel: 2, title: t('svp.revenue.empty.title'), text: t('svp.revenue.empty.text') }),
      paint: (r) => (r.bookingsCount === 0 ? stateBlock({ variant: 'empty', iconName: 'no-payment', headingLevel: 2, title: t('svp.revenue.empty.title'), text: t('svp.revenue.empty.text') })
        // One set of figures per currency: bookings in different currencies are never summed into one number.
        : el('div', { class: 'l-stack l-stack--16' }, revenueGroups(r).map((g, _, all) => el('div', { class: 'l-stack l-stack--8', dataset: { currency: g.currency } }, [
          all.length > 1 ? el('h2', { class: 't-h4' }, g.currency) : null,
          el('div', { class: 'c-svp-metrics' }, [
            metricCard('svp.revenue.gross', amount(g.gross, g.currency), { icon: 'no-payment' }),
            metricCard('svp.revenue.completed', amount(g.completed, g.currency), { icon: 'no-check-circle', tone: 'success' }),
            metricCard('svp.revenue.pending', amount(g.pending, g.currency), { icon: 'no-pending', tone: 'warning' }),
            metricCard('svp.revenue.cancelled', amount(g.cancelled, g.currency), { icon: 'no-cancelled', tone: 'muted' }),
          ]),
        ])))),
    });
    // The commission rule and every commission row, independent of the period filter; the rows page like every list.
    const modelLine = el('p', { class: 't-body t-muted', hidden: true }); const rowsHost = el('div');
    commissionsHost.replaceChildren(el('div', { class: 'l-stack l-stack--12' }, [modelLine, rowsHost]));
    const commissions = pagedRegion(rowsHost, async (q) => {
      const page = await supervisorData.commissions(q);
      modelLine.dataset.commissionModel = page.model?.model ?? 'none'; modelLine.textContent = commissionText(page.model); modelLine.hidden = false;
      return page;
    }, {
      empty: () => el('p', { class: 't-body-sm t-muted' }, t('svp.revenue.commissions.empty')),
      paint: (items) => dataTable({ columns: commissionColumns, rows: items, rowKey: (c) => c.id, emptyKey: 'svp.revenue.commissions.empty' }),
    });
    await Promise.all([region.run(), commissions.run()]);
    return { refresh: async () => { await region.run(); await commissions.run(); } };
  } });
}
