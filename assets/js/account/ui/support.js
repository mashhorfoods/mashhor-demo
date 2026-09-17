/* ACCOUNT / UI / SUPPORT — verified channels, the supervisor, recent support replies. Nothing invented. Stage 12 */
import { el } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { dateShort } from '../../core/format.js';
import { route } from '../../data/config.js';
import { liveChannels } from '../../data/navigation.js';
import { supervisorBySlug } from '../../data/supervisors.js';
import { icon } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { customer } from '../customer.js';
import { mountAccount, loadRegion, block, pageTitle, rows } from './shell.js';

export function mountSupport({ root = document } = {}) {
  return mountAccount({ root, id: 'support', head: 'page.account.support', paint: async ({ customer: me, main }) => {
    const sup = me.supervisorId ? supervisorBySlug(me.supervisorId) : null; const channels = liveChannels();
    const recent = el('div', { dataset: { region: 'support-recent' } });
    main.replaceChildren(
      pageTitle('acct.support.title', 'acct.support.text'),
      el('div', { class: 'c-acct-grid' }, [
        block(t('acct.support.channels'), channels.length ? el('div', { class: 'c-acct-quick' }, channels.map((c) => el('a', { class: 'c-btn c-btn--secondary', href: c.href, ...(c.external ? { target: '_blank', rel: 'noopener' } : {}) }, [icon(c.icon, { size: 'sm' }), el('span', {}, pick(c, 'label'))])))
          : el('div', { class: 'l-stack l-stack--12' }, [el('p', { class: 't-body-sm t-muted', dataset: { channels: 'none' } }, t('acct.support.channelsSoon')), el('p', { class: 't-body-sm t-muted c-acct-inline' }, [icon('no-info', { size: 'sm' }), t('acct.support.reference')])]), { id: 'sup-channels' }),
        sup ? block(t('acct.support.supervisor'), el('div', { class: 'l-stack l-stack--12' }, [rows([[t('acct.supervisor'), el('a', { href: route(`supervisor/${sup.slug}/`) }, pick(sup, 'name') || t('sup.name.fallback'))]]), el('p', { class: 't-body-sm t-muted' }, t('acct.supervisor.locked'))]), { id: 'sup-supervisor' }) : null,
      ]),
      block(t('acct.support.recent'), recent, { id: 'sup-recent' }),
    );
    const region = loadRegion(recent, async () => (await customer.notifications()).filter((n) => n.kind === 'support'), {
      empty: () => stateBlock({ variant: 'empty', headingLevel: 3, title: t('acct.ntf.empty.title'), text: t('acct.ntf.empty.text'), actions: [{ label: t('acct.ntf.title'), href: route('account/notifications/') }] }),
      paint: (list) => el('ul', { class: 'c-acct-ntf-list', role: 'list' }, list.map((n) => el('li', { class: 'c-acct-ntf' }, [el('span', { class: 'c-acct-ntf__title' }, pick(n, 'title')), el('span', { class: 't-body-sm' }, pick(n, 'text')), el('span', { class: 't-body-sm t-muted' }, dateShort(n.at))]))),
    });
    await region.run();
    return { supervisor: sup?.slug ?? null, channels: channels.length };
  } });
}
