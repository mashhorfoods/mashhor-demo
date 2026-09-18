/* OPS / UI / SERVICES — the operational catalogue: which of the site's services are active/booking-enabled, their
   workflow type and supplier type, and (per service) the workflow steps and document requirements. Names/descriptions
   stay owned by the public services registry (assets/js/data/services.js) — this screen only manages the
   operational config layered on top, id-for-id, never a second name field. Stage 15 */
import { el, render } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon, toast } from '../../components/ui.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, notFoundBlock, actionForm, dataTable, block, rows } from './shell.js';

const columns = [
  { labelKey: 'ops.services.col.id', render: (s) => el('a', { class: 'c-svp-link', href: route(`admin/services/?id=${encodeURIComponent(s.id)}`) }, s.id) },
  { labelKey: 'ops.services.col.active', render: (s) => t(s.active ? 'ops.services.yes' : 'ops.services.no') },
  { labelKey: 'ops.services.col.bookingEnabled', render: (s) => t(s.bookingEnabled ? 'ops.services.yes' : 'ops.services.no') },
  { labelKey: 'ops.services.col.workflowType', render: (s) => s.workflowType || '—' },
  { labelKey: 'ops.services.col.supplierType', render: (s) => s.supplierType || '—' },
];

export function mountOpsServices({ root = document, params = new URLSearchParams(location.search) } = {}) {
  const id = params.get('id');
  if (id) return mountServiceDetail({ root, id });
  return mountOpsPortal({ root, id: 'services', head: 'page.ops.services', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'services' } });
    main.replaceChildren(pageTitle('ops.services.title', 'ops.services.text'), host);
    const region = loadRegion(host, () => opsData.services(), { paint: (items) => dataTable({ columns, rows: items, rowKey: (s) => s.id }) });
    await region.run();
    return { refresh: region.run };
  } });
}

function mountServiceDetail({ root, id }) {
  return mountOpsPortal({ root, id: 'services', head: 'page.ops.serviceDetail', paint: async ({ main, can }) => {
    const s = await opsData.service(id);
    if (!s) { render(main, notFoundBlock(route('admin/services/'), t('ops.services.title'))); return { service: null }; }
    const refresh = async () => render(main, await view());

    async function view(preloaded) {
      const fresh = preloaded ?? await opsData.service(id);
      const workflow = await opsData.serviceWorkflow(id);
      const docs = await opsData.serviceDocumentRequirements(id);
      const nodes = [
        el('p', {}, el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/services/') }, [icon('no-arrow-end', { size: 'xs', className: 'c-icon--start' }), el('span', {}, t('ops.services.title'))])),
        el('h1', { class: 't-h1' }, fresh.id),
        block(t('ops.services.detail.title'), rows([
          [t('ops.services.col.active'), t(fresh.active ? 'ops.services.yes' : 'ops.services.no')],
          [t('ops.services.col.bookingEnabled'), t(fresh.bookingEnabled ? 'ops.services.yes' : 'ops.services.no')],
          [t('ops.services.col.workflowType'), fresh.workflowType || '—'],
          [t('ops.services.col.supplierType'), fresh.supplierType || '—'],
          [t('ops.services.operationalRequirements'), fresh.operationalRequirements || '—'],
        ]), { id: 'ops-svc-details' }),
      ];

      if (can('service.manage')) {
        const active = el('input', { class: 'c-choice__input', type: 'checkbox', name: 'active', ...(fresh.active ? { checked: true } : {}) });
        const bookingEnabled = el('input', { class: 'c-choice__input', type: 'checkbox', name: 'bookingEnabled', ...(fresh.bookingEnabled ? { checked: true } : {}) });
        const workflowType = el('input', { id: 'ops-svc-workflowType', name: 'workflowType', class: 'c-field__control', type: 'text', value: fresh.workflowType ?? '' });
        const supplierType = el('input', { id: 'ops-svc-supplierType', name: 'supplierType', class: 'c-field__control', type: 'text', value: fresh.supplierType ?? '' });
        const requirements = el('textarea', { id: 'ops-svc-requirements', name: 'operationalRequirements', class: 'c-field__control', rows: 2 }, fresh.operationalRequirements ?? '');
        const form = actionForm({
          submitLabel: t('acct.set.save'),
          onSubmit: async (fd) => {
            await opsData.updateService(id, { active: !!fd.get('active'), bookingEnabled: !!fd.get('bookingEnabled'), workflowType: fd.get('workflowType') || null, supplierType: fd.get('supplierType') || null, operationalRequirements: fd.get('operationalRequirements') || null });
            toast({ title: t('acct.set.saved'), variant: 'success', duration: 3000 }); await refresh();
          },
          children: [
            el('label', { class: 'c-choice' }, [active, el('span', { class: 'c-choice__text' }, t('ops.services.col.active'))]),
            el('label', { class: 'c-choice' }, [bookingEnabled, el('span', { class: 'c-choice__text' }, t('ops.services.col.bookingEnabled'))]),
            el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: 'ops-svc-workflowType' }, t('ops.services.col.workflowType')), workflowType]),
            el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: 'ops-svc-supplierType' }, t('ops.services.col.supplierType')), supplierType]),
            el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: 'ops-svc-requirements' }, t('ops.services.operationalRequirements')), requirements]),
          ],
        });
        nodes.push(block(t('ops.services.edit.title'), form, { id: 'ops-svc-edit' }));
      }

      nodes.push(block(t('ops.services.workflow.title'), workflow.length
        ? el('ol', { class: 'c-svp-mini-list', role: 'list' }, workflow.map((step) => el('li', {}, `${step.order + 1}. ${pick(step, 'label')}`)))
        : el('p', { class: 't-body-sm t-muted' }, t('ops.services.workflow.empty')), { id: 'ops-svc-workflow' }));

      nodes.push(block(t('ops.services.documents.title'), docs.length
        ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, docs.map((d) => el('li', {}, `${d.docType} — ${t(d.required ? 'ops.services.documents.required' : 'ops.services.documents.optional')}`)))
        : el('p', { class: 't-body-sm t-muted' }, t('ops.services.documents.empty')), { id: 'ops-svc-documents' }));

      return nodes;
    }

    render(main, await view(s));
    return { service: s, refresh };
  } });
}
