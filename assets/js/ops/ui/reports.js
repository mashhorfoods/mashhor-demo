/* OPS / UI / REPORTS — Stage 14. Descriptive counts and distributions from the data that already exists: booking
   volume by status/service/payment, operations task/escalation distributions, supplier integration status, document
   review distribution, notification delivery status. Nothing ranked, scored or projected — no commission or
   profitability figure is computed here since no such rule/data exists yet (§18, §28). */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, block } from './shell.js';

const distList = (rows, keyLabel) => rows.length
  ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, rows.map((r) => el('li', {}, [el('span', {}, keyLabel(r)), el('span', { class: 't-body-sm t-muted' }, String(r.n))])))
  : el('p', { class: 't-body-sm t-muted' }, t('ops.table.empty'));

export function mountOpsReports({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'reports', head: 'page.ops.reports', paint: async ({ main }) => {
    const bookingsHost = el('div', { dataset: { region: 'reportBookings' } });
    const opsHost = el('div', { dataset: { region: 'reportOperations' } });
    const suppliersHost = el('div', { dataset: { region: 'reportSuppliers' } });
    const documentsHost = el('div', { dataset: { region: 'reportDocuments' } });
    const notificationsHost = el('div', { dataset: { region: 'reportNotifications' } });
    main.replaceChildren(
      pageTitle('ops.reports.title', 'ops.reports.text'),
      block(t('ops.reports.bookings.title'), bookingsHost, { id: 'ops-rep-bookings' }),
      block(t('ops.reports.operations.title'), opsHost, { id: 'ops-rep-operations' }),
      block(t('ops.reports.suppliers.title'), suppliersHost, { id: 'ops-rep-suppliers' }),
      block(t('ops.reports.documents.title'), documentsHost, { id: 'ops-rep-documents' }),
      block(t('ops.reports.notifications.title'), notificationsHost, { id: 'ops-rep-notifications' }),
    );

    const bookings = loadRegion(bookingsHost, () => opsData.reportBookings(), {
      paint: (d) => el('div', { class: 'l-stack l-stack--8' }, [
        el('p', {}, [t('ops.reports.total'), ': ', el('strong', {}, String(d.total))]),
        distList(d.byService, (r) => r.service), distList(d.byPaymentStatus, (r) => t(`acct.pay.${r.status}`) || r.status),
      ]),
    });
    const operations = loadRegion(opsHost, () => opsData.reportOperations(), {
      paint: (d) => el('div', { class: 'l-stack l-stack--8' }, [distList(d.tasksByStatus, (r) => t(`ops.task.status.${r.status}`) || r.status), distList(d.escalationsByStatus, (r) => t(`ops.escalation.status.${r.status}`) || r.status)]),
    });
    const suppliers = loadRegion(suppliersHost, () => opsData.reportSuppliers(), {
      paint: (d) => el('div', { class: 'l-stack l-stack--8' }, [el('p', {}, [t('ops.reports.total'), ': ', el('strong', {}, String(d.total))]), distList(d.byIntegrationStatus, (r) => r.status)]),
    });
    const documents = loadRegion(documentsHost, () => opsData.reportDocuments(), {
      paint: (d) => el('div', { class: 'l-stack l-stack--8' }, [el('p', {}, [t('ops.reports.total'), ': ', el('strong', {}, String(d.total))]), distList(d.byReviewStatus, (r) => t(`ops.documents.reviewStatus.${r.status}`) || r.status)]),
    });
    const notifications = loadRegion(notificationsHost, () => opsData.reportNotifications(), {
      paint: (d) => el('div', { class: 'l-stack l-stack--8' }, [el('p', {}, [t('ops.reports.total'), ': ', el('strong', {}, String(d.total))]), distList(d.byStatus, (r) => r.status)]),
    });
    await Promise.all([bookings.run(), operations.run(), suppliers.run(), documents.run(), notifications.run()]);
    return { refresh: async () => { await Promise.all([bookings.run(), operations.run(), suppliers.run(), documents.run(), notifications.run()]); } };
  } });
}
