/* OPS / UI / DOCUMENTS — Stage 14. Admin-wide document browse: customer, booking, review status, no storage key or
   permanent URL is ever exposed here (that stays behind the existing signed-URL mechanism, one document at a time,
   on the booking detail screen's review flow) — this is a filterable list, not a file viewer (§16). */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { stateBlock } from '../../components/states.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, dataTable, dateTime } from './shell.js';

const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];
const columns = [
  { labelKey: 'ops.documents.col.type', render: (d) => d.type },
  { labelKey: 'ops.documents.col.customer', render: (d) => el('bdi', { dir: 'ltr' }, d.customerId) },
  { labelKey: 'ops.documents.col.booking', render: (d) => d.bookingId ? el('a', { class: 'c-svp-link', href: route(`admin/bookings/?id=${encodeURIComponent(d.bookingId)}`) }, el('bdi', { dir: 'ltr' }, d.bookingId)) : '—' },
  { labelKey: 'ops.documents.col.status', render: (d) => t(`ops.documents.reviewStatus.${d.reviewStatus}`) || d.reviewStatus },
  { labelKey: 'ops.documents.col.date', render: (d) => dateTime(d.createdAt) },
];

export function mountOpsDocuments({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'documents', head: 'page.ops.documents', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'documents' } });
    const status = el('select', { class: 'c-field__control c-svp-filter__select', 'aria-label': t('ops.documents.filterLabel') },
      [''].concat(REVIEW_STATUSES).map((s) => el('option', { value: s }, s ? t(`ops.documents.reviewStatus.${s}`) : t('ops.tasks.filterAll'))));
    status.addEventListener('change', () => region.run());
    main.replaceChildren(pageTitle('ops.documents.title', 'ops.documents.text'), el('div', { class: 'c-svp-filter' }, [status]), host);
    const region = loadRegion(host, async () => (await opsData.documentsAdmin({ reviewStatus: status.value || undefined, page: 1, pageSize: 50 })).items, {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-documents', headingLevel: 2, title: t('ops.documents.empty.title'), text: t('ops.documents.empty.text') }),
      paint: (items) => dataTable({ columns, rows: items, rowKey: (d) => d.id, emptyKey: 'ops.documents.empty.title' }),
    });
    await region.run();
    return { refresh: region.run };
  } });
}
