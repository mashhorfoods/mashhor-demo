/* ACCOUNT / UI / BOOKINGS — the list and one booking (?id=). Stage 12 */
import { el, render } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { money, dateShort } from '../../core/format.js';
import { route } from '../../data/config.js';
import { icon } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { customer } from '../customer.js';
import { mountAccount, loadRegion, bookingCard, block, rows, pageTitle, notFoundState, statusBadge, payBadge, dateRange, serviceName, serviceIcon, supportEntry, amount } from './shell.js';

export function mountBookings({ root = document, params = new URLSearchParams(location.search) } = {}) {
  const id = params.get('id');
  if (id) return mountBooking({ root, id });
  return mountAccount({ root, id: 'bookings', head: 'page.account.bookings', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'bookings' } });
    main.replaceChildren(pageTitle('acct.bookings.title', 'acct.bookings.text'), host);
    const region = loadRegion(host, async () => { const [list, trips] = await Promise.all([customer.bookings(), customer.trips()]); return list.map((b) => ({ ...b, trip: trips.find((tr) => tr.id === b.tripId) ?? null })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }, {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-ticket', headingLevel: 2, title: t('acct.bookings.empty.title'), text: t('acct.bookings.empty.text'), actions: [{ label: t('acct.new'), href: route('book/'), variant: 'c-btn--primary' }] }),
      paint: (list) => el('div', { class: 'c-acct-list' }, list.map(bookingCard)),
    });
    await region.run();
    return { refresh: region.run };
  } });
}

export function mountBooking({ root = document, id }) {
  return mountAccount({ root, id: 'bookings', head: 'page.account.booking', paint: async ({ customer: me, main }) => {
    const b = await customer.booking(id);
    if (!b) { render(main, notFoundState(route('account/bookings/'), t('acct.bookings.title'))); return { booking: null }; }
    const d = b.detail ?? {};
    render(main, [
      el('p', {}, el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('account/bookings/') }, [icon('no-arrow-end', { size: 'xs', className: 'c-icon--start' }), el('span', {}, t('acct.bookings.title'))])),
      el('div', { class: 'c-acct-trip__head' }, [el('div', { class: 'l-stack l-stack--4' }, [el('h1', { class: 't-h1' }, [icon(serviceIcon(b.service), { size: 'lg' }), ' ', serviceName(b.service)]), el('p', { class: 't-body t-muted' }, [t('acct.reference'), ' ', el('bdi', { class: 'c-confirm__ref', dir: 'ltr', dataset: { reference: b.id } }, b.id)])]), el('div', { class: 'c-acct-booking__badges' }, [statusBadge(b.status), payBadge(b.paymentStatus)])]),
      el('div', { class: 'c-acct-grid' }, [
        block(t('acct.booking.title'), rows([
          [t('acct.trip'), b.trip ? el('a', { href: route(`trips/?id=${encodeURIComponent(b.trip.id)}`) }, pick(b.trip, 'title')) : null],
          d.route ? [t('acct.booking.route'), el('bdi', { dir: 'ltr' }, d.route)] : null,
          d.dates ? [t('acct.dates'), d.dates.map(dateShort).join(' · ')] : null,
          d.checkin ? [t('acct.dates'), `${dateRange(d.checkin, d.checkout)} · ${t('acct.booking.nights', d.nights)} · ${t('acct.booking.rooms', d.rooms)}`] : null,
          d.carrierAr ? [t('acct.booking.carrier'), pick(d, 'carrier')] : null, d.flights ? [t('acct.booking.flights'), el('bdi', { dir: 'ltr' }, d.flights)] : null, d.cabinAr ? [t('acct.booking.cabin'), pick(d, 'cabin')] : null,
          d.travellers ? [t('acct.travellers'), String(d.travellers)] : null,
          d.noteAr ? [t('acct.status'), pick(d, 'note')] : null,
          b.service === 'flights' ? [t('acct.booking.ticket'), t(b.ticketed ? 'acct.booking.ticketed' : 'acct.booking.ticketPending')] : null,
          [t('acct.booking.bookedOn'), dateShort(b.createdAt)],
          [t('acct.total'), b.amount ? money(b.amount, b.currency) : t('acct.pay.unpaid')],
          b.supervisorId ? [t('acct.supervisor'), el('a', { href: route(`supervisor/${b.supervisorId}/`) }, t('sup.name.fallback'))] : null,
        ].filter(Boolean)), { id: 'bk-details', action: b.trip ? el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route(`trips/?id=${encodeURIComponent(b.trip.id)}`) }, t('acct.booking.viewTrip')) : null }),
        el('div', { class: 'l-stack l-stack--16' }, [
          block(t('acct.trip.documents'), b.documents?.length ? el('ul', { class: 'c-acct-docs', role: 'list' }, b.documents.map((doc) => el('li', { class: 'c-acct-doc', dataset: { doc: doc.id } }, [icon('no-documents', { size: 'sm' }), el('span', { class: 'c-acct-doc__body' }, [el('strong', {}, t(`acct.docs.type.${doc.type}`)), el('span', { class: 't-body-sm t-muted' }, doc.status === 'available' ? dateShort(doc.issuedAt) : t('acct.docs.pending'))]), doc.status === 'available' ? el('a', { class: 'c-btn c-btn--secondary c-btn--sm', href: route(`account/documents/?id=${encodeURIComponent(doc.id)}`) }, t('acct.docs.view')) : null]))) : el('p', { class: 't-body-sm t-muted' }, t('acct.trip.noDocs')), { id: 'bk-docs' }),
          block(t('acct.trip.payments'), b.payments?.length ? rows(b.payments.map((p) => [dateShort(p.at), `${amount(p.amount, p.currency)} · ${t(`acct.pay.${p.status}`)}`])) : el('p', { class: 't-body-sm t-muted' }, t('acct.trip.noPayments')), { id: 'bk-pays' }),
          block(t('acct.trip.support'), supportEntry(me, { compact: true }), { id: 'bk-support' }),
        ]),
      ]),
    ]);
    return { booking: b };
  } });
}
