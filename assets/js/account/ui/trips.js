/* ACCOUNT / UI / TRIPS — the list with search and filter, and the unified trip view (?id=). Stage 12 */
import { el, render } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { money, dateShort } from '../../core/format.js';
import { route } from '../../data/config.js';
import { icon } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { customer, TRIP_ORDER } from '../customer.js';
import { mountAccount, loadRegion, tripCard, block, rows, pageTitle, notFoundState, statusBadge, payBadge, tripStatusBadge, dateRange, serviceName, serviceIcon, supportEntry } from './shell.js';

const FILTERS = ['all', 'upcoming', 'current', 'completed', 'cancelled'];
const matches = (trip, q) => !q || [trip.titleAr, trip.titleEn, trip.destination?.cityAr, trip.destination?.cityEn, trip.destination?.code, ...trip.bookingIds].join(' ').toLowerCase().includes(q.toLowerCase());
const sortTrips = (list) => [...list].sort((a, b) => (TRIP_ORDER[a.status] - TRIP_ORDER[b.status]) || String(a.startDate).localeCompare(String(b.startDate)) * (a.status === 'completed' || a.status === 'cancelled' ? -1 : 1));

export function mountTrips({ root = document, params = new URLSearchParams(location.search) } = {}) {
  const id = params.get('id');
  if (id) return mountTrip({ root, id });
  return mountAccount({ root, id: 'trips', head: 'page.account.trips', paint: async ({ main }) => {
    const state = { q: '', filter: 'all', trips: null };
    const listHost = el('div', { dataset: { region: 'trips' } });
    const count = el('p', { class: 't-body-sm t-muted', role: 'status', 'aria-live': 'polite' });
    const search = el('input', { class: 'c-field__control', type: 'search', id: 'trips-search', placeholder: t('acct.trips.search'), autocomplete: 'off', oninput: (e) => { state.q = e.currentTarget.value.trim(); paint(); } });
    const chips = el('div', { class: 'c-acct-filters', role: 'group', 'aria-label': t('acct.trips.filter') });
    const paintChips = () => render(chips, FILTERS.map((f) => el('button', { type: 'button', class: 'c-chip', 'aria-pressed': String(state.filter === f), dataset: { filter: f }, onclick: () => { state.filter = f; paintChips(); paint(); } }, f === 'all' ? t('acct.trips.all') : t(`acct.tripStatus.${f}`))));
    const paint = () => {
      if (!state.trips) return;
      const visible = sortTrips(state.trips.filter((tr) => (state.filter === 'all' || tr.status === state.filter) && matches(tr, state.q)));
      count.textContent = t('acct.trips.count', visible.length);
      render(listHost, visible.length ? el('div', { class: 'c-acct-list' }, visible.map((tr) => tripCard(tr)))
        : stateBlock({ variant: 'empty', headingLevel: 2, title: t('acct.trips.noMatch.title'), text: t('acct.trips.noMatch.text'), actions: [{ id: 'clear', label: t('acct.trips.clear'), variant: 'c-btn--primary', onClick: () => { state.q = ''; search.value = ''; state.filter = 'all'; paintChips(); paint(); } }] }));
    };
    const tools = el('div', { class: 'c-acct-tools', hidden: true }, [el('div', { class: 'c-field' }, [el('label', { class: 'u-visually-hidden', for: 'trips-search' }, t('acct.trips.search')), search]), chips, count]);
    main.replaceChildren(pageTitle('acct.trips.title', 'acct.trips.text'), tools, listHost);
    const region = loadRegion(listHost, () => customer.trips(), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-booking', headingLevel: 2, title: t('acct.trips.empty.title'), text: t('acct.trips.empty.text'), actions: [{ label: t('acct.new'), href: route('book/'), variant: 'c-btn--primary' }] }),
      paint: (list) => { state.trips = list; tools.hidden = list.length < 2 && !state.q; paintChips(); queueMicrotask(paint); return el('div'); },
    });
    await region.run();
    return { state, refresh: region.run, setFilter: (f) => { state.filter = f; paintChips(); paint(); }, setQuery: (q) => { state.q = q; search.value = q; paint(); } };
  } });
}

/* ---- One trip: everything that belongs to it ---------------------------- */
function bookingBlock(b) {
  const d = b.detail ?? {};
  const body = rows([
    [t('acct.reference'), el('bdi', { dir: 'ltr' }, b.id)],
    [t('acct.status'), statusBadge(b.status)], [t('acct.paymentStatus'), payBadge(b.paymentStatus)],
    d.route ? [t('acct.booking.route'), el('bdi', { dir: 'ltr' }, d.route)] : null,
    d.dates ? [t('acct.dates'), d.dates.map(dateShort).join(' · ')] : null,
    d.checkin ? [t('acct.dates'), `${dateRange(d.checkin, d.checkout)} · ${t('acct.booking.nights', d.nights)} · ${t('acct.booking.rooms', d.rooms)}`] : null,
    d.carrierAr ? [t('acct.booking.carrier'), `${pick(d, 'carrier')} · ${d.flights}`] : null,
    d.travellers ? [t('acct.travellers'), String(d.travellers)] : null,
    d.noteAr ? [t('acct.status'), pick(d, 'note')] : null,
    b.amount ? [t('acct.total'), money(b.amount, b.currency)] : null,
  ].filter(Boolean));
  return el('section', { class: 'c-review-block c-acct-service', dataset: { booking: b.id, service: b.service } }, [
    el('div', { class: 'c-review-block__head' }, [el('h3', { class: 'c-review-block__title' }, [icon(serviceIcon(b.service), { size: 'sm' }), ' ', serviceName(b.service)]), el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route(`account/bookings/?id=${encodeURIComponent(b.id)}`) }, t('acct.trip.bookingOpen'))]),
    body,
  ]);
}
export function mountTrip({ root = document, id }) {
  return mountAccount({ root, id: 'trips', head: 'page.account.trip', paint: async ({ customer: me, main }) => {
    const trip = await customer.trip(id);
    if (!trip) { render(main, notFoundState(route('trips/'), t('acct.trips.title'))); return { trip: null }; }
    const docs = trip.documents ?? []; const pays = trip.payments ?? [];
    render(main, [
      el('p', {}, el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('trips/') }, [icon('no-arrow-end', { size: 'xs', className: 'c-icon--start' }), el('span', {}, t('acct.trips.title'))])),
      el('div', { class: 'c-acct-trip__head' }, [el('div', { class: 'l-stack l-stack--4' }, [el('h1', { class: 't-h1' }, pick(trip, 'title')), el('p', { class: 't-body t-muted' }, `${pick(trip.destination, 'city')}${pick(trip.destination, 'country') ? ` · ${pick(trip.destination, 'country')}` : ''} · ${dateRange(trip.startDate, trip.endDate)}`)]), tripStatusBadge(trip.status)]),
      el('div', { class: 'c-acct-grid' }, [
        block(t('acct.trip.services'), el('div', { class: 'l-stack l-stack--12', dataset: { region: 'services' } }, trip.bookings.map(bookingBlock)), { id: 'trip-services' }),
        el('div', { class: 'l-stack l-stack--16' }, [
          block(t('acct.trip.documents'), docs.length ? el('ul', { class: 'c-acct-docs', role: 'list' }, docs.map((d) => el('li', { class: 'c-acct-doc', dataset: { doc: d.id, docStatus: d.status } }, [icon('no-documents', { size: 'sm' }), el('span', { class: 'c-acct-doc__body' }, [el('strong', {}, t(`acct.docs.type.${d.type}`)), el('span', { class: 't-body-sm t-muted' }, d.status === 'available' ? `${t('acct.docs.available')} · ${dateShort(d.issuedAt)}` : t('acct.docs.pending'))]), d.status === 'available' ? el('a', { class: 'c-btn c-btn--secondary c-btn--sm', href: route(`account/documents/?id=${encodeURIComponent(d.id)}`) }, t('acct.docs.view')) : null]))) : el('p', { class: 't-body-sm t-muted' }, t('acct.trip.noDocs')), { id: 'trip-docs', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('account/documents/') }, t('acct.viewAll')) }),
          block(t('acct.trip.payments'), pays.length ? rows(pays.map((p) => [dateShort(p.at), `${money(Math.abs(p.amount), p.currency)} · ${t(`acct.pay.${p.status}`)}`])) : el('p', { class: 't-body-sm t-muted' }, t('acct.trip.noPayments')), { id: 'trip-pays', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('account/payments/') }, t('acct.viewAll')) }),
          trip.supervisorId ? rows([[t('acct.supervisor'), el('a', { href: route(`supervisor/${trip.supervisorId}/`) }, t('sup.name.fallback'))]]) : null,
          block(t('acct.trip.support'), supportEntry(me, { compact: true }), { id: 'trip-support' }),
        ]),
      ]),
    ]);
    return { trip };
  } });
}
