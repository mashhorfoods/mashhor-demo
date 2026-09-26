/* OPS / UI / SERVICES — the operational catalogue: which of the site's services are active/booking-enabled, their
   workflow type and supplier type, and (per service) the workflow steps and document requirements. Names/descriptions
   stay owned by the public services registry (assets/js/data/services.js) — this screen only manages the
   operational config layered on top, id-for-id, never a second name field. Stage 15 */
import { el, render } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon, toast } from '../../components/ui.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, notFoundState, actionForm, dataTable, block, rows, busyButton } from './shell.js';

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
    if (!s) { render(main, notFoundState(route('admin/services/'), t('ops.services.title'))); return { service: null }; }
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
        // A distinct, one-click action — not a checkbox buried in the general
        // edit form below — mirroring the supervisors screen's own
        // activate/deactivate control (ops/ui/supervisors.js), same
        // opsData.updateService() PATCH the old checkbox used.
        const activeNow = fresh.active;
        const toggle = busyButton(t(activeNow ? 'ops.services.deactivate' : 'ops.services.activate'), activeNow ? 'tertiary' : 'primary', async () => {
          await opsData.updateService(id, { active: !activeNow });
          toast({ title: t('ops.services.updated'), variant: 'success', duration: 3000 }); await refresh();
        });
        nodes.push(block(t('ops.services.manage.title'), toggle, { id: 'ops-svc-manage' }));

        const bookingEnabled = el('input', { class: 'c-choice__input', type: 'checkbox', name: 'bookingEnabled', ...(fresh.bookingEnabled ? { checked: true } : {}) });
        const workflowType = el('input', { id: 'ops-svc-workflowType', name: 'workflowType', class: 'c-field__control', type: 'text', value: fresh.workflowType ?? '' });
        const supplierType = el('input', { id: 'ops-svc-supplierType', name: 'supplierType', class: 'c-field__control', type: 'text', value: fresh.supplierType ?? '' });
        const requirements = el('textarea', { id: 'ops-svc-requirements', name: 'operationalRequirements', class: 'c-field__control', rows: 2 }, fresh.operationalRequirements ?? '');
        const form = actionForm({
          submitLabel: t('acct.set.save'),
          onSubmit: async (fd) => {
            await opsData.updateService(id, { bookingEnabled: !!fd.get('bookingEnabled'), workflowType: fd.get('workflowType') || null, supplierType: fd.get('supplierType') || null, operationalRequirements: fd.get('operationalRequirements') || null });
            toast({ title: t('acct.set.saved'), variant: 'success', duration: 3000 }); await refresh();
          },
          children: [
            el('label', { class: 'c-choice' }, [bookingEnabled, el('span', { class: 'c-choice__text' }, t('ops.services.col.bookingEnabled'))]),
            el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: 'ops-svc-workflowType' }, t('ops.services.col.workflowType')), workflowType]),
            el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: 'ops-svc-supplierType' }, t('ops.services.col.supplierType')), supplierType]),
            el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: 'ops-svc-requirements' }, t('ops.services.operationalRequirements')), requirements]),
          ],
        });
        nodes.push(block(t('ops.services.edit.title'), form, { id: 'ops-svc-edit' }));
      }

      // workflow.manage gates both editors below; the backend checks the same permission on every write.
      const editable = can('workflow.manage');
      nodes.push(block(t('ops.services.workflow.title'), editable
        ? workflowEditor(id, workflow, refresh)
        : workflow.length
          ? el('ol', { class: 'c-svp-mini-list', role: 'list' }, workflow.map((step) => el('li', {}, `${step.order + 1}. ${pick(step, 'label')}`)))
          : el('p', { class: 't-body-sm t-muted' }, t('ops.services.workflow.empty')), { id: 'ops-svc-workflow' }));

      nodes.push(block(t('ops.services.documents.title'), editable
        ? requirementsEditor(id, docs, refresh)
        : docs.length
          ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, docs.map((d) => el('li', {}, [el('bdi', { dir: 'ltr' }, d.docType), ` — ${t(d.required ? 'ops.services.documents.required' : 'ops.services.documents.optional')}`])))
          : el('p', { class: 't-body-sm t-muted' }, t('ops.services.documents.empty')), { id: 'ops-svc-documents' }));

      return nodes;
    }

    render(main, await view(s));
    return { service: s, refresh };
  } });
}

/* ---- Workflow and document-requirement editing (workflow.manage) ---------- */
/** A step key and a document type: lower-case letters, digits and underscores — the backend's own rule. */
const OPS_KEY = /^[a-z0-9_]{1,40}$/;
let uid = 0;

/** The ordered workflow as an editable list: rename (both labels), reorder, add and remove steps, then save the
    whole list at once — the backend replaces a service's workflow in one write, never step by step. */
function workflowEditor(serviceId, steps, refresh) {
  const list = el('ol', { class: 'c-wf-steps', role: 'list' });
  const empty = el('p', { class: 't-body-sm t-muted' }, t('ops.services.workflow.empty'));
  const input = (n, name, labelKey, value, attrs) => {
    const id = `ops-wf-${n}-${name}`;
    return el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: id }, t(labelKey)), el('input', { id, name, class: 'c-field__control', type: 'text', value: value ?? '', autocomplete: 'off', ...attrs })]);
  };
  const stepButton = (action, iconName) => el('button', { type: 'button', class: `c-btn c-btn--tertiary c-btn--sm c-wf-step__btn c-wf-step__btn--${action}`, dataset: { stepAction: action } }, icon(iconName, { size: 'sm' }));
  const stepRow = (step = {}) => {
    const n = ++uid;
    return el('li', { class: 'c-wf-step', dataset: { step: step.key ?? '' } }, el('fieldset', { class: 'c-wf-step__set' }, [
      el('legend', { class: 'c-wf-step__legend' }),
      el('div', { class: 'c-wf-step__fields' }, [
        input(n, 'key', 'ops.services.workflow.key', step.key, { dir: 'ltr', maxlength: 40, spellcheck: 'false' }),
        input(n, 'labelAr', 'ops.services.workflow.labelAr', step.labelAr, { dir: 'rtl', lang: 'ar', maxlength: 80 }),
        input(n, 'labelEn', 'ops.services.workflow.labelEn', step.labelEn, { dir: 'ltr', lang: 'en', maxlength: 80 }),
      ]),
      el('div', { class: 'c-wf-step__actions' }, [stepButton('up', 'no-chevron-down'), stepButton('down', 'no-chevron-down'), stepButton('remove', 'no-close')]),
    ]));
  };
  const renumber = () => {
    const items = [...list.children];
    empty.hidden = items.length > 0;
    items.forEach((li, i) => {
      const n = i + 1;
      li.querySelector('legend').textContent = t('ops.services.workflow.step', n);
      const button = (a) => li.querySelector(`[data-step-action="${a}"]`);
      button('up').setAttribute('aria-label', t('ops.services.workflow.up', n)); button('up').disabled = i === 0;
      button('down').setAttribute('aria-label', t('ops.services.workflow.down', n)); button('down').disabled = i === items.length - 1;
      button('remove').setAttribute('aria-label', t('ops.services.workflow.remove', n));
    });
  };
  const addButton = el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--sm', dataset: { action: 'add-step' } }, [icon('no-plus', { size: 'sm' }), el('span', {}, t('ops.services.workflow.add'))]);
  addButton.addEventListener('click', () => { const li = stepRow(); list.append(li); renumber(); li.querySelector('input').focus(); });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step-action]'); if (!b) return;
    const li = b.closest('li'); const action = b.dataset.stepAction;
    if (action === 'remove') { const next = li.nextElementSibling ?? li.previousElementSibling; li.remove(); renumber(); (next?.querySelector('input') ?? addButton).focus(); return; }
    if (action === 'up' && li.previousElementSibling) li.previousElementSibling.before(li);
    if (action === 'down' && li.nextElementSibling) li.nextElementSibling.after(li);
    renumber();
    // Moving the row drops focus; keep it on the same control, or its twin when this one just became disabled.
    (b.disabled ? li.querySelector(`[data-step-action="${action === 'up' ? 'down' : 'up'}"]`) : b).focus();
  });
  steps.forEach((s) => list.append(stepRow(s)));
  renumber();

  const form = actionForm({
    submitLabel: t('ops.services.workflow.save'),
    onSubmit: async () => {
      const items = [...list.children];
      const next = items.map((li) => ({ key: li.querySelector('[name=key]').value.trim(), labelAr: li.querySelector('[name=labelAr]').value.trim(), labelEn: li.querySelector('[name=labelEn]').value.trim() }));
      list.querySelectorAll('[aria-invalid]').forEach((c) => c.removeAttribute('aria-invalid'));
      const seen = new Set();
      next.forEach((s, i) => {
        const mark = (name) => items[i].querySelector(`[name=${name}]`).setAttribute('aria-invalid', 'true');
        if (!OPS_KEY.test(s.key) || seen.has(s.key)) mark('key');
        if (!s.labelAr) mark('labelAr');
        if (!s.labelEn) mark('labelEn');
        seen.add(s.key);
      });
      const invalid = list.querySelector('[aria-invalid]');
      if (invalid) { invalid.focus(); throw { displayMessage: t('ops.services.workflow.invalid') }; }
      await opsData.setServiceWorkflow(serviceId, next);
      toast({ title: t('ops.services.workflow.saved'), variant: 'success', duration: 3000 }); await refresh();
    },
    children: [el('p', { class: 't-body-sm t-muted' }, t('ops.services.workflow.help')), list, empty, el('div', {}, addButton)],
  });
  form.noValidate = true; form.dataset.form = 'workflow';
  return form;
}

/** The document requirements: each one's required flag and its removal apply at once; a new one is added below. */
function requirementsEditor(serviceId, docs, refresh) {
  const apply = async (write, doneKey) => {
    try { await write(); } catch (error) { toast({ title: t('ops.services.documents.failed'), variant: 'warning', duration: 5000 }); throw error; }
    toast({ title: t(doneKey), variant: 'success', duration: 3000 }); await refresh();
  };
  const row = (d) => {
    const required = el('input', { class: 'c-choice__input', type: 'checkbox', name: 'required', 'aria-label': t('ops.services.documents.requiredFor', d.docType), ...(d.required ? { checked: true } : {}) });
    required.addEventListener('change', async () => {
      required.disabled = true;
      try { await apply(() => opsData.updateServiceDocumentRequirement(serviceId, d.id, { required: required.checked }), 'ops.services.documents.updated'); }
      catch { required.checked = !required.checked; required.disabled = false; }
    });
    const remove = busyButton(t('ops.services.documents.remove', d.docType), 'tertiary', () => apply(() => opsData.removeServiceDocumentRequirement(serviceId, d.id), 'ops.services.documents.removed'));
    remove.dataset.action = 'remove-requirement';
    return el('li', { class: 'c-wf-req', dataset: { docReq: d.docType } }, [
      el('bdi', { class: 'c-wf-req__type', dir: 'ltr' }, d.docType),
      el('label', { class: 'c-choice' }, [required, el('span', { class: 'c-choice__text' }, t('ops.services.documents.requiredLabel'))]),
      remove,
    ]);
  };
  const docType = el('input', { id: 'ops-req-docType', name: 'docType', class: 'c-field__control', type: 'text', dir: 'ltr', maxlength: 40, autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'ops-req-docType-help' });
  const required = el('input', { id: 'ops-req-required', class: 'c-choice__input', type: 'checkbox', name: 'required', checked: true });
  const form = actionForm({
    submitLabel: t('ops.services.documents.add'),
    conflictMessage: t('ops.services.documents.conflict'),
    onSubmit: async (fd) => {
      const type = String(fd.get('docType') ?? '').trim();
      if (!OPS_KEY.test(type)) { docType.setAttribute('aria-invalid', 'true'); docType.focus(); throw { displayMessage: t('ops.services.documents.invalid') }; }
      docType.removeAttribute('aria-invalid');
      await opsData.addServiceDocumentRequirement(serviceId, { docType: type, required: !!fd.get('required') });
      toast({ title: t('ops.services.documents.added'), variant: 'success', duration: 3000 }); await refresh();
    },
    children: [
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: 'ops-req-docType' }, t('ops.services.documents.docType')), docType, el('p', { class: 'c-field__help', id: 'ops-req-docType-help' }, t('ops.services.documents.docTypeHelp'))]),
      el('label', { class: 'c-choice', for: 'ops-req-required' }, [required, el('span', { class: 'c-choice__text' }, t('ops.services.documents.requiredLabel'))]),
    ],
  });
  form.noValidate = true; form.dataset.form = 'doc-requirement';
  return el('div', { class: 'l-stack l-stack--12' }, [
    docs.length ? el('ul', { class: 'c-wf-reqs', role: 'list' }, docs.map(row)) : el('p', { class: 't-body-sm t-muted' }, t('ops.services.documents.empty')),
    form,
  ]);
}
