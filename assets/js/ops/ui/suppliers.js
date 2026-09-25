/* OPS / UI / SUPPLIERS — the supplier/provider directory: id, name, type, services, status, integration status,
   supported operations, contact. Supplier state here is entirely separate from a booking's customer-facing status
   (§11) — a supplier record change never touches a booking directly; the booking↔supplier link lives on the
   booking's own detail screen (assets/js/ops/ui/bookings.js). No provider credentials ever appear here. Stage 15 */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { toast } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, actionForm, dataTable, block } from './shell.js';

const columns = [
  { labelKey: 'ops.suppliers.col.name', render: (s) => s.name },
  { labelKey: 'ops.suppliers.col.type', render: (s) => s.type },
  { labelKey: 'ops.suppliers.col.status', render: (s) => s.status },
  { labelKey: 'ops.suppliers.col.integration', render: (s) => s.integrationStatus },
  { labelKey: 'ops.suppliers.col.services', render: (s) => (s.services ?? []).join(', ') || '—' },
];

export function mountOpsSuppliers({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'suppliers', head: 'page.ops.suppliers', paint: async ({ main, can }) => {
    const host = el('div', { dataset: { region: 'suppliers' } });

    const createForm = can('supplier.manage') ? (() => {
      const name = el('input', { name: 'name', class: 'c-field__control', type: 'text', required: true, 'aria-label': t('ops.suppliers.create.name'), placeholder: t('ops.suppliers.create.name') });
      const type = el('input', { name: 'type', class: 'c-field__control', type: 'text', required: true, 'aria-label': t('ops.suppliers.create.type'), placeholder: t('ops.suppliers.create.type') });
      const services = el('input', { name: 'services', class: 'c-field__control', type: 'text', 'aria-label': t('ops.suppliers.create.services'), placeholder: t('ops.suppliers.create.services') });
      const form = actionForm({
        submitLabel: t('ops.suppliers.create.action'),
        onSubmit: async (fd, formEl) => {
          await opsData.createSupplier({ name: fd.get('name'), type: fd.get('type'), services: (fd.get('services') || '').split(',').map((s) => s.trim()).filter(Boolean) });
          formEl.reset(); toast({ title: t('ops.suppliers.created'), variant: 'success', duration: 3000 }); await region.run();
        },
        children: [name, type, services],
      });
      return block(t('ops.suppliers.create.title'), form, { id: 'ops-suppliers-create' });
    })() : null;

    main.replaceChildren(pageTitle('ops.suppliers.title', 'ops.suppliers.text'), createForm, host);
    const region = loadRegion(host, () => opsData.suppliers(), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-supervisor', headingLevel: 2, title: t('ops.suppliers.empty.title'), text: t('ops.suppliers.empty.text') }),
      paint: (items) => dataTable({ columns, rows: items, rowKey: (s) => s.id }),
    });
    await region.run();
    return { refresh: region.run };
  } });
}
