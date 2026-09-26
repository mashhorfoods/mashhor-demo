/* SUPERVISOR / UI / REVENUE — this supervisor's own bookings only, a period filter, and honest commission status. Stage 13
   Amounts come straight from the backend's own bookings/payments; nothing is computed in this untrusted frontend
   beyond simple display formatting (§17). Commission stays "pending configuration" until the business names a model. */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { stateBlock } from '../../components/states.js';
import { supervisorData } from '../data.js';
import { mountSupervisorPortal, loadRegion, pageTitle, metricCard, amount, block, revenueGroups, periodSelect } from './shell.js';

export function mountSupervisorRevenue({ root = document } = {}) {
  return mountSupervisorPortal({ root, id: 'revenue', head: 'page.supervisor.revenue', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'revenue' } });
    const filter = periodSelect(() => region.run());
    main.replaceChildren(pageTitle('svp.revenue.title', 'svp.revenue.text'), el('div', { class: 'c-svp-filter' }, [filter]), host);
    const region = loadRegion(host, () => supervisorData.revenue({ period: filter.value || null }), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-payment', headingLevel: 2, title: t('svp.revenue.empty.title'), text: t('svp.revenue.empty.text') }),
      paint: (r) => (r.bookingsCount === 0 ? stateBlock({ variant: 'empty', iconName: 'no-payment', headingLevel: 2, title: t('svp.revenue.empty.title'), text: t('svp.revenue.empty.text') }) : [
        // One set of figures per currency: bookings in different currencies are never summed into one number.
        ...revenueGroups(r).map((g, _, all) => el('div', { class: 'l-stack l-stack--8', dataset: { currency: g.currency } }, [
          all.length > 1 ? el('h2', { class: 't-h4' }, g.currency) : null,
          el('div', { class: 'c-svp-metrics' }, [
            metricCard('svp.revenue.gross', amount(g.gross, g.currency), { icon: 'no-payment' }),
            metricCard('svp.revenue.completed', amount(g.completed, g.currency), { icon: 'no-check-circle', tone: 'success' }),
            metricCard('svp.revenue.pending', amount(g.pending, g.currency), { icon: 'no-pending', tone: 'warning' }),
            metricCard('svp.revenue.cancelled', amount(g.cancelled, g.currency), { icon: 'no-cancelled', tone: 'muted' }),
          ]),
        ])),
        block(t('svp.revenue.commission'), el('p', { class: 't-body t-muted' }, t(r.commission.model ? 'svp.revenue.commissionSet' : 'svp.revenue.commissionPending')), { id: 'rev-commission' }),
      ]),
    });
    await region.run();
    return { refresh: region.run };
  } });
}
