/* OPS / UI / LEADS — Stage 14. Admin-wide view of leads and attribution history, across every supervisor — the
   supervisor portal's own /supervisor/me/leads stays scoped to one supervisor's own session; this screen never
   changes an attribution rule, only shows what the existing (first-touch) rule already decided (§9). */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { stateBlock } from '../../components/states.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pagedRegion, pageTitle, dataTable, dateTime, block } from './shell.js';

const leadColumns = [
  { labelKey: 'ops.leads.col.name', render: (l) => l.name || '—' },
  { labelKey: 'ops.leads.col.supervisor', render: (l) => l.supervisorId || '—' },
  { labelKey: 'ops.leads.col.source', render: (l) => l.source },
  { labelKey: 'ops.leads.col.status', render: (l) => t(`ops.leads.status.${l.status}`) || l.status },
  { labelKey: 'ops.leads.col.date', render: (l) => dateTime(l.createdAt) },
];
const eventColumns = [
  { labelKey: 'ops.attribution.col.customer', render: (e) => el('bdi', { dir: 'ltr' }, e.customerId) },
  { labelKey: 'ops.attribution.col.from', render: (e) => e.previousSupervisorId || '—' },
  { labelKey: 'ops.attribution.col.to', render: (e) => e.supervisorId || '—' },
  { labelKey: 'ops.attribution.col.source', render: (e) => e.source },
  { labelKey: 'ops.attribution.col.date', render: (e) => dateTime(e.at) },
];

export function mountOpsLeads({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'leads', head: 'page.ops.leads', paint: async ({ main }) => {
    const leadsHost = el('div', { dataset: { region: 'leads' } });
    const eventsHost = el('div', { dataset: { region: 'attribution' } });
    main.replaceChildren(
      pageTitle('ops.leads.title', 'ops.leads.text'),
      block(t('ops.leads.list.title'), leadsHost, { id: 'ops-leads-list' }),
      block(t('ops.attribution.title'), eventsHost, { id: 'ops-leads-attribution' }),
    );
    const leads = pagedRegion(leadsHost, (q) => opsData.leads(q), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-lead', headingLevel: 2, title: t('ops.leads.empty.title'), text: t('ops.leads.empty.text') }),
      paint: (items) => dataTable({ columns: leadColumns, rows: items, rowKey: (l) => l.id, emptyKey: 'ops.leads.empty.title' }),
    });
    const events = pagedRegion(eventsHost, (q) => opsData.attributionEvents(q), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-info', headingLevel: 2, title: t('ops.attribution.empty.title') }),
      paint: (items) => dataTable({ columns: eventColumns, rows: items, rowKey: (e) => `${e.customerId}-${e.at}`, emptyKey: 'ops.attribution.empty.title' }),
    });
    await Promise.all([leads.run(), events.run()]);
    return { refresh: async () => { await leads.run(); await events.run(); } };
  } });
}
