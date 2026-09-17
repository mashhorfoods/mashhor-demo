/* OPS / UI / AUDIT — the audit trail: every actor-attributed action recorded by the backend (§27), read-only here.
   Gated on audit.view; distinct from the scrubbed technical diagnostics table Stage 12.2 built. Stage 15 */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { stateBlock } from '../../components/states.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, dataTable, dateTime } from './shell.js';

const columns = [
  { labelKey: 'ops.audit.col.at', render: (a) => dateTime(a.at) },
  { labelKey: 'ops.audit.col.actor', render: (a) => `${a.actorId} (${a.actorRole})` },
  { labelKey: 'ops.audit.col.action', render: (a) => a.action },
  { labelKey: 'ops.audit.col.entity', render: (a) => `${a.entityType}${a.entityId ? ` · ${a.entityId}` : ''}` },
];

export function mountOpsAudit({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'audit', head: 'page.ops.audit', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'audit' } });
    main.replaceChildren(pageTitle('ops.audit.title', 'ops.audit.text'), host);
    const region = loadRegion(host, async () => (await opsData.audit({ page: 1, pageSize: 100 })).items, {
      empty: () => stateBlock({ variant: 'empty', headingLevel: 2, title: t('ops.audit.empty.title'), text: t('ops.audit.empty.text') }),
      paint: (items) => dataTable({ columns, rows: items.slice().reverse(), rowKey: (a) => a.id }),
    });
    await region.run();
    return { refresh: region.run };
  } });
}
