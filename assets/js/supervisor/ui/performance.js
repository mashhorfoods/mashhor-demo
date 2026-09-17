/* SUPERVISOR / UI / PERFORMANCE — this supervisor's own numbers only, with a period filter. No cross-supervisor
   ranking is built (§19 — the business did not ask for one). Stage 13 */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { stateBlock } from '../../components/states.js';
import { supervisorData } from '../data.js';
import { mountSupervisorPortal, loadRegion, pageTitle, metricCard } from './shell.js';

const PERIODS = [['', 'svp.period.all'], ['today', 'svp.period.today'], ['week', 'svp.period.week'], ['month', 'svp.period.month']];
const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);

export function mountSupervisorPerformance({ root = document } = {}) {
  return mountSupervisorPortal({ root, id: 'performance', head: 'page.supervisor.performance', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'performance' } });
    const filter = el('select', { class: 'c-field__control c-svp-filter__select', 'aria-label': t('svp.period.label') }, PERIODS.map(([v, k]) => el('option', { value: v }, t(k))));
    filter.addEventListener('change', () => region.run());
    main.replaceChildren(pageTitle('svp.performance.title', 'svp.performance.text'), el('div', { class: 'c-svp-filter' }, [filter]), host);
    const region = loadRegion(host, () => supervisorData.performance({ period: filter.value || null }), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-chart', headingLevel: 2, title: t('svp.performance.empty.title'), text: t('svp.performance.empty.text') }),
      paint: (p) => (p.customers === 0 && p.bookings === 0 && p.leads === 0 ? stateBlock({ variant: 'empty', iconName: 'no-chart', headingLevel: 2, title: t('svp.performance.empty.title'), text: t('svp.performance.empty.text') }) : el('div', { class: 'c-svp-metrics' }, [
        metricCard('svp.metrics.customers', p.customers, { icon: 'no-customer' }),
        metricCard('svp.metrics.leads', p.leads, { icon: 'no-lead' }),
        metricCard('svp.performance.conversion', pct(p.conversionRate), { icon: 'no-chart', sub: t('svp.metrics.converted', p.leadsConverted) }),
        metricCard('svp.metrics.bookings', p.bookings, { icon: 'no-ticket' }),
        metricCard('svp.performance.confirmed', p.bookingsConfirmed, { icon: 'no-check-circle', tone: 'success' }),
        metricCard('svp.performance.cancelled', p.bookingsCancelled, { icon: 'no-cancelled', tone: 'muted' }),
      ])),
    });
    await region.run();
    return { refresh: region.run };
  } });
}
