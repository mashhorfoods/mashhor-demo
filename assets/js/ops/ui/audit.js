/* OPS / UI / AUDIT — the Command Center's Activity feed: every actor-attributed action recorded by the backend
   (§27), read-only here. WHO/WHAT/WHEN/RELATED ITEM, per the Command Center brief §9 — "related item" links only
   to entity types that already have an admin detail page (booking/supervisor/service/business rule); every other
   type just shows its record reference as plain text rather than a dead link. Gated on audit.view; distinct from
   the scrubbed technical diagnostics table Stage 12.2 built. Stage 15 */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { stateBlock } from '../../components/states.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pagedRegion, pageTitle, dataTable, dateTime } from './shell.js';

const RELATED_ROUTE = { booking: 'admin/bookings/', supervisor: 'admin/supervisors/', service: 'admin/services/', businessRule: 'admin/business-rules/' };
// Exported so the dashboard's compact "Recent activity" widget can render
// the same related-item link/plain-text logic without a second copy.
export const related = (a) => {
  const label = `${a.entityType}${a.entityId ? ` · ${a.entityId}` : ''}`;
  const base = RELATED_ROUTE[a.entityType];
  return base && a.entityId ? el('a', { class: 'c-svp-link', href: route(`${base}?id=${encodeURIComponent(a.entityId)}`) }, label) : label;
};
const columns = [
  { labelKey: 'ops.audit.col.at', render: (a) => dateTime(a.at) },
  { labelKey: 'ops.audit.col.actor', render: (a) => `${a.actorId} (${a.actorRole})` },
  { labelKey: 'ops.audit.col.action', render: (a) => a.action },
  { labelKey: 'ops.audit.col.related', render: related },
];

export function mountOpsAudit({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'audit', head: 'page.ops.audit', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'audit' } });
    main.replaceChildren(pageTitle('ops.audit.title', 'ops.audit.text'), host);
    const region = pagedRegion(host, (q) => opsData.audit(q), {
      empty: () => stateBlock({ variant: 'empty', headingLevel: 2, title: t('ops.audit.empty.title'), text: t('ops.audit.empty.text') }),
      paint: (items) => dataTable({ columns, rows: items, rowKey: (a) => a.id }),
    });
    await region.run();
    return { refresh: region.run };
  } });
}
