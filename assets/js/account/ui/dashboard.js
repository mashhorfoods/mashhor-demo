/* ACCOUNT / UI / DASHBOARD — the overview: who, the next trip, the latest booking, quick actions, notifications. Stage 12 */
import { el } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { dateShort } from '../../core/format.js';
import { route } from '../../data/config.js';
import { icon } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { customer, nextTrip, latestBooking } from '../customer.js';
import { mountAccount, loadRegion, tripCard, bookingCard, block, unreadCount } from './shell.js';

const daysTo = (iso) => Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 86400000));

export function mountDashboard({ root = document } = {}) {
  return mountAccount({ root, id: 'account', head: 'page.account.title', paint: async ({ customer: me, main }) => {
    const tripHost = el('div', { dataset: { region: 'trip' } }); const bookingHost = el('div', { dataset: { region: 'booking' } }); const ntfHost = el('div', { dataset: { region: 'notifications' } });
    main.replaceChildren(
      el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('acct.dash.welcome', me.name)), el('p', { class: 't-body t-muted' }, t('acct.dash.text'))]),
      block(t('acct.dash.nextTrip'), tripHost, { id: 'dash-trip', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('trips/') }, t('acct.viewAll')) }),
      el('div', { class: 'c-acct-grid' }, [
        block(t('acct.dash.recentBooking'), bookingHost, { id: 'dash-booking', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('account/bookings/') }, t('acct.viewAll')) }),
        block(t('acct.dash.quick'), el('div', { class: 'c-acct-quick' }, [
          el('a', { class: 'c-btn c-btn--primary', href: route('book/') }, [icon('no-search', { size: 'sm' }), el('span', {}, t('acct.new'))]),
          el('a', { class: 'c-btn c-btn--secondary', href: route('account/documents/') }, [icon('no-documents', { size: 'sm' }), el('span', {}, t('acct.docs.title'))]),
          el('a', { class: 'c-btn c-btn--secondary', href: route('account/travellers/') }, [icon('no-users', { size: 'sm' }), el('span', {}, t('acct.trv.title'))]),
          el('a', { class: 'c-btn c-btn--secondary', href: route('account/support/') }, [icon('no-support', { size: 'sm' }), el('span', {}, t('acct.support.open'))]),
        ]), { id: 'dash-quick' }),
      ]),
      block(t('acct.dash.notifications'), ntfHost, { id: 'dash-ntf', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('account/notifications/') }, t('acct.viewAll')) }),
    );
    const trips = loadRegion(tripHost, () => customer.trips(), {
      paint: (list) => { const trip = nextTrip(list); return trip ? [el('p', { class: 't-body-sm t-muted c-acct-inline', dataset: { countdown: '' } }, trip.status === 'current' ? t('acct.tripStatus.current') : t('acct.dash.daysTo', daysTo(trip.startDate))), tripCard(trip, { large: true })]
        : stateBlock({ variant: 'empty', headingLevel: 3, title: t('acct.dash.noTrip.title'), text: t('acct.dash.noTrip.text'), actions: [{ label: t('acct.new'), href: route('book/'), variant: 'c-btn--primary' }] }); },
    });
    const bookings = loadRegion(bookingHost, () => customer.bookings(), {
      paint: (list) => { const b = latestBooking(list); return b ? bookingCard(b) : stateBlock({ variant: 'empty', headingLevel: 3, title: t('acct.bookings.empty.title'), text: t('acct.bookings.empty.text'), actions: [{ label: t('acct.new'), href: route('book/') }] }); },
    });
    const ntf = loadRegion(ntfHost, () => customer.notifications(), {
      paint: (list) => { const unread = unreadCount(list); const top = list.slice(0, 3); return [
        el('p', { class: 't-body-sm c-acct-inline', dataset: { unread } }, [icon('no-notification', { size: 'sm' }), t('acct.dash.unread', unread)]),
        top.length ? el('ul', { class: 'c-acct-ntf-list', role: 'list' }, top.map((n) => el('li', { class: `c-acct-ntf${n.read ? '' : ' c-acct-ntf--unread'}` }, [el('span', { class: 'c-acct-ntf__title' }, pick(n, 'title')), el('span', { class: 't-body-sm t-muted' }, dateShort(n.at))]))) : null,
      ]; },
    });
    await Promise.all([trips.run(), bookings.run(), ntf.run()]);
    return { regions: { trips, bookings, ntf } };
  } });
}
