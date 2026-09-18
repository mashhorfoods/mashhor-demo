/* OPS / UI / BOOKINGS — the list and one booking's operational detail (?id=): lifecycle transition, operator
   assignment, supplier record, document review, customer/internal notes, status history, linked tasks. Stage 15
   The backend is the sole authority on every one of these: a control this screen shows but the staff member lacks
   permission for is disabled, and a call the backend rejects (invalid transition, unpaid gate, forbidden) surfaces
   the backend's own reason rather than a client-side guess. */
import { el, render } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon, toast } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { opsData, BOOKING_SUPPLIER_STATUSES } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, notFoundBlock, actionForm, emptyNote, busyButton, dataTable, bookingStatusBadge, opsStatusBadge, payBadge, supplierStatusBadge, taskStatusBadge, amount, dateTime, block, rows } from './shell.js';

const columns = [
  { labelKey: 'ops.bookings.col.id', render: (b) => el('a', { class: 'c-svp-link', href: route(`admin/bookings/?id=${encodeURIComponent(b.id)}`) }, el('bdi', { dir: 'ltr' }, b.id)) },
  { labelKey: 'ops.bookings.col.service', render: (b) => b.service },
  { labelKey: 'ops.bookings.col.status', render: (b) => opsStatusBadge(b.opsStatus) },
  { labelKey: 'ops.bookings.col.payment', render: (b) => payBadge(b.paymentStatus) },
  { labelKey: 'ops.bookings.col.amount', render: (b) => (b.amount ? amount(b.amount, b.currency) : '—') },
  { labelKey: 'ops.bookings.col.operator', render: (b) => b.assignedOperator || '—' },
  { labelKey: 'ops.bookings.col.date', render: (b) => dateTime(b.createdAt) },
];

export function mountOpsBookings({ root = document, params = new URLSearchParams(location.search) } = {}) {
  const id = params.get('id');
  if (id) return mountBookingDetail({ root, id });
  return mountOpsPortal({ root, id: 'bookings', head: 'page.ops.bookings', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'bookings' } });
    main.replaceChildren(pageTitle('ops.bookings.title', 'ops.bookings.text'), host);
    const region = loadRegion(host, async () => (await opsData.bookings({ page: 1, pageSize: 50 })).items, {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-ticket', headingLevel: 2, title: t('ops.bookings.empty.title'), text: t('ops.bookings.empty.text') }),
      paint: (items) => dataTable({ columns, rows: items, rowKey: (b) => b.id, emptyKey: 'ops.bookings.empty.title' }),
    });
    await region.run();
    return { refresh: region.run };
  } });
}

function mountBookingDetail({ root, id }) {
  return mountOpsPortal({ root, id: 'bookings', head: 'page.ops.bookingDetail', paint: async ({ main, can }) => {
    const b = await opsData.booking(id);
    if (!b) { render(main, notFoundBlock(route('admin/bookings/'), t('ops.bookings.title'))); return { booking: null }; }
    const refresh = async () => render(main, await view());

    async function view(preloaded) {
      const fresh = preloaded ?? await opsData.booking(id);
      const nodes = [
        el('p', {}, el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/bookings/') }, [icon('no-arrow-end', { size: 'xs', className: 'c-icon--start' }), el('span', {}, t('ops.bookings.title'))])),
        el('div', { class: 'c-acct-trip__head' }, [
          el('div', { class: 'l-stack l-stack--4' }, [el('h1', { class: 't-h1' }, fresh.service), el('p', { class: 't-body t-muted' }, [t('acct.reference'), ' ', el('bdi', { class: 'c-confirm__ref', dir: 'ltr' }, fresh.id)])]),
          el('div', { class: 'c-acct-booking__badges' }, [opsStatusBadge(fresh.opsStatus), bookingStatusBadge(fresh.status), payBadge(fresh.paymentStatus)]),
        ]),
        block(t('ops.bookings.detail.title'), rows([
          [t('ops.bookings.col.customer'), fresh.customerId || '—'],
          [t('ops.bookings.col.date'), dateTime(fresh.createdAt)],
          [t('acct.total'), fresh.amount ? amount(fresh.amount, fresh.currency) : t('acct.pay.unpaid')],
          [t('ops.bookings.col.operator'), fresh.assignedOperator || '—'],
        ]), { id: 'ops-bk-details' }),
      ];

      if (can('booking.status.change')) {
        const select = el('select', { name: 'status', class: 'c-field__control', required: true, 'aria-label': t('ops.bookings.transition.title') }, fresh.allowedTransitions.length
          ? fresh.allowedTransitions.map((s) => el('option', { value: s }, t(`ops.lifecycle.${s}`)))
          : [el('option', { value: '', disabled: true, selected: true }, t('ops.bookings.noTransitions'))]);
        const reason = el('input', { name: 'reason', class: 'c-field__control', type: 'text', 'aria-label': t('ops.bookings.transitionReason'), placeholder: t('ops.bookings.transitionReason') });
        nodes.push(block(t('ops.bookings.transition.title'), actionForm({
          submitLabel: t('ops.bookings.transition.action'), disabled: !fresh.allowedTransitions.length,
          onSubmit: async (fd) => { await opsData.transitionBooking(id, fd.get('status'), fd.get('reason') || null); toast({ title: t('ops.bookings.transition.done'), variant: 'success', duration: 3000 }); await refresh(); },
          children: [select, reason], conflictMessage: t('ops.bookings.paymentGate'),
        }), { id: 'ops-bk-transition' }));
      }

      if (can('booking.assign')) {
        const staffId = el('input', { name: 'staffId', class: 'c-field__control', type: 'text', dir: 'ltr', value: fresh.assignedOperator ?? '', 'aria-label': t('ops.bookings.assign.placeholder'), placeholder: t('ops.bookings.assign.placeholder') });
        nodes.push(block(t('ops.bookings.assign.title'), actionForm({
          submitLabel: t('ops.bookings.assign.action'), disabled: false,
          onSubmit: async (fd) => { await opsData.assignBooking(id, fd.get('staffId') || null); toast({ title: t('ops.bookings.assign.done'), variant: 'success', duration: 3000 }); await refresh(); },
          children: [staffId], conflictMessage: t('ops.bookings.paymentGate'),
        }), { id: 'ops-bk-assign' }));
      }

      if (can('supplier.manage')) {
        const sup = fresh.supplier;
        const status = el('select', { name: 'status', class: 'c-field__control', 'aria-label': t('ops.escalations.statusLabel') }, BOOKING_SUPPLIER_STATUSES.map((s) => el('option', { value: s, ...(s === sup?.status ? { selected: true } : {}) }, t(`ops.supplierStatus.${s}`))));
        const reference = el('input', { name: 'supplierReference', class: 'c-field__control', type: 'text', dir: 'ltr', value: sup?.supplierReference ?? '', 'aria-label': t('ops.bookings.supplier.reference'), placeholder: t('ops.bookings.supplier.reference') });
        const ticket = el('input', { name: 'ticketNumber', class: 'c-field__control', type: 'text', dir: 'ltr', value: sup?.ticketNumber ?? '', 'aria-label': t('ops.bookings.supplier.ticket'), placeholder: t('ops.bookings.supplier.ticket') });
        nodes.push(block(t('ops.bookings.supplier.title'), [
          sup ? el('p', {}, [t('ops.bookings.supplier.current'), ' ', supplierStatusBadge(sup.status)]) : emptyNote('ops.bookings.supplier.none'),
          actionForm({
            submitLabel: t('ops.bookings.supplier.action'), disabled: false,
            onSubmit: async (fd) => {
              const patch = { status: fd.get('status'), supplierReference: fd.get('supplierReference') || null, ticketNumber: fd.get('ticketNumber') || null };
              if (sup) await opsData.updateBookingSupplier(id, patch); else await opsData.assignSupplierToBooking(id, null);
              toast({ title: t('ops.bookings.supplier.done'), variant: 'success', duration: 3000 }); await refresh();
            },
            children: [status, reference, ticket], conflictMessage: t('ops.bookings.paymentGate'),
          }),
        ], { id: 'ops-bk-supplier' }));
      }

      if (can('document.review')) {
        nodes.push(block(t('ops.bookings.documents.title'), fresh.documents.length
          ? el('div', { class: 'l-stack l-stack--8' }, fresh.documents.map((d) => el('div', { class: 'c-svp-lead', dataset: { document: d.id } }, [
              el('div', {}, [el('p', {}, d.type), el('p', { class: 't-body-sm t-muted' }, `${t('ops.bookings.documents.status')}: ${d.reviewStatus}`)]),
              d.reviewStatus === 'pending' ? el('div', { class: 'l-cluster l-cluster--8' }, [
                busyButton(t('ops.bookings.documents.approve'), 'primary', () => opsData.reviewDocument(d.id, 'approved', null).then(refresh)),
                busyButton(t('ops.bookings.documents.reject'), 'tertiary', () => { const reason = prompt(t('ops.bookings.documents.rejectPrompt')); if (reason == null) return Promise.resolve(); return opsData.reviewDocument(d.id, 'rejected', reason).then(refresh); }),
              ]) : el('p', { class: 't-body-sm t-muted' }, d.rejectionReason || '—'),
            ])))
          : emptyNote('ops.table.empty'), { id: 'ops-bk-documents' }));
      }

      const noteList = (list, emptyKey) => list.length
        ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, list.map((n) => el('li', {}, [el('p', {}, n.body), el('p', { class: 't-body-sm t-muted' }, dateTime(n.createdAt))])))
        : emptyNote(emptyKey);
      const noteForm = (type) => actionForm({
        submitLabel: t('ops.bookings.notes.add'), disabled: false,
        onSubmit: async (fd) => { const body = fd.get('body'); if (!body?.trim()) return; await opsData.addBookingNote(id, type, body.trim()); await refresh(); },
        children: [el('textarea', { name: 'body', class: 'c-field__control', rows: 2, required: true, 'aria-label': t('ops.bookings.notes.add') })],
        conflictMessage: t('ops.bookings.paymentGate'),
      });
      if (can('booking.view')) nodes.push(block(t('ops.bookings.notes.customer'), [noteList(fresh.notesCustomer, 'ops.bookings.notes.emptyCustomer'), can('booking.manage') ? noteForm('customer') : null], { id: 'ops-bk-notes-customer' }));
      if (can('booking.manage')) nodes.push(block(t('ops.bookings.notes.internal'), [noteList(fresh.notesInternal, 'ops.bookings.notes.emptyInternal'), noteForm('internal')], { id: 'ops-bk-notes-internal' }));

      nodes.push(block(t('ops.bookings.history.title'), fresh.history.length
        ? el('ol', { class: 'c-svp-mini-list', role: 'list' }, fresh.history.slice().reverse().map((h) => el('li', {}, [el('span', {}, `${h.previousStatus ?? '—'} → ${t(`ops.lifecycle.${h.newStatus}`)}`), el('span', { class: 't-body-sm t-muted' }, `${h.actor} · ${dateTime(h.at)}`)])))
        : emptyNote('ops.table.empty'), { id: 'ops-bk-history' }));

      if (can('task.view')) nodes.push(block(t('ops.bookings.tasks.title'), fresh.tasks.length
        ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, fresh.tasks.map((task) => el('li', {}, [el('span', {}, task.type), taskStatusBadge(task.status)])))
        : emptyNote('ops.table.empty'), { id: 'ops-bk-tasks' }));

      return nodes;
    }

    render(main, await view(b));
    return { booking: b, refresh };
  } });
}
