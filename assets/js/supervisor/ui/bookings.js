/* SUPERVISOR / UI / BOOKINGS — the list and one booking's detail (?id=). Stage 13 */
import { el, render } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { supervisorData } from '../data.js';
import { mountSupervisorPortal, loadRegion, pageTitle, notFoundState, dataTable, bookingStatusBadge, payBadge, amount, dateTime, block, rows } from './shell.js';

const columns = [
  { labelKey: 'svp.bookings.col.id', render: (b) => el('a', { class: 'c-svp-link', href: route(`supervisor/bookings/?id=${encodeURIComponent(b.id)}`) }, el('bdi', { dir: 'ltr' }, b.id)) },
  { labelKey: 'svp.bookings.col.customer', render: (b) => b.customerName || '—' },
  { labelKey: 'svp.bookings.col.service', render: (b) => b.service },
  { labelKey: 'svp.bookings.col.status', render: (b) => bookingStatusBadge(b.status) },
  { labelKey: 'svp.bookings.col.amount', render: (b) => (b.amount ? amount(b.amount, b.currency) : '—') },
  { labelKey: 'svp.bookings.col.date', render: (b) => dateTime(b.createdAt) },
];
const STATUSES = ['', 'confirmed', 'pending', 'cancelled', 'completed'];

export function mountSupervisorBookings({ root = document, params = new URLSearchParams(location.search) } = {}) {
  const id = params.get('id');
  if (id) return mountBookingDetail({ root, id });
  return mountSupervisorPortal({ root, id: 'bookings', head: 'page.supervisor.bookings', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'bookings' } });
    const filter = el('select', { class: 'c-field__control c-svp-filter__select', 'aria-label': t('svp.bookings.filterLabel') },
      STATUSES.map((s) => el('option', { value: s }, s ? t(`acct.status.${s}`) : t('svp.bookings.filterAll'))));
    filter.addEventListener('change', () => region.run());
    main.replaceChildren(pageTitle('svp.bookings.title', 'svp.bookings.text'), el('div', { class: 'c-svp-filter' }, [filter]), host);
    const region = loadRegion(host, async () => (await supervisorData.bookings({ status: filter.value, page: 1, pageSize: 50 })).items, {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-ticket', headingLevel: 2, title: t('svp.bookings.empty.title'), text: t('svp.bookings.empty.text') }),
      paint: (items) => dataTable({ columns, rows: items, rowKey: (b) => b.id, emptyKey: 'svp.bookings.empty.title' }),
    });
    await region.run();
    return { refresh: region.run };
  } });
}

function mountBookingDetail({ root, id }) {
  return mountSupervisorPortal({ root, id: 'bookings', head: 'page.supervisor.bookingDetail', paint: async ({ main }) => {
    const b = await supervisorData.booking(id);
    if (!b) { render(main, notFoundState(route('supervisor/bookings/'), t('svp.bookings.title'))); return { booking: null }; }
    render(main, [
      el('p', {}, el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('supervisor/bookings/') }, [icon('no-arrow-end', { size: 'xs', className: 'c-icon--start' }), el('span', {}, t('svp.bookings.title'))])),
      el('div', { class: 'c-acct-trip__head' }, [
        el('div', { class: 'l-stack l-stack--4' }, [el('h1', { class: 't-h1' }, [icon('no-ticket', { size: 'lg' }), ' ', b.service]), el('p', { class: 't-body t-muted' }, [t('acct.reference'), ' ', el('bdi', { class: 'c-confirm__ref', dir: 'ltr' }, b.id)])]),
        el('div', { class: 'c-acct-booking__badges' }, [bookingStatusBadge(b.status), payBadge(b.paymentStatus)]),
      ]),
      block(t('svp.bookings.detail.title'), rows([
        [t('svp.bookings.col.customer'), b.customerName || '—'],
        [t('svp.bookings.col.date'), dateTime(b.createdAt)],
        [t('acct.total'), b.amount ? amount(b.amount, b.currency) : t('acct.pay.unpaid')],
      ]), { id: 'svp-bk-details' }),
    ]);
    return { booking: b };
  } });
}
