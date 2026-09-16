/* ============================================================================
   BOOKING / UI / EXTRAS — what the offer can add. Stage 11
   Included · optional · with its cost, per traveller where it applies; the
   total updates as choices change. Only what the adapter returns exists.
   ========================================================================= */

import { el } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { money } from '../../core/format.js';
import { stepper } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { loadJourney, setExtras, stepUrl, guard } from '../journey.js';
import { adapterFor } from '../adapters/index.js';
import { breakdown, totalTravellers } from '../pricing.js';
import { devNotice, progress, tripCard, priceRows, recoveryState, put, setHead } from './shared.js';

export async function mountExtras({ root = document } = {}) {
  setHead('page.booking.extras');
  const j = loadJourney();
  const blocked = guard('extras', j);
  put('progress', progress('extras'), root);
  if (blocked) { put('main', recoveryState(blocked), root); put('aside', null, root); return { blocked }; }
  put('notice', j.search?.meta?.dev ? devNotice() : null, root);
  const offer = j.selection.offer; const party = totalTravellers(j.context.travellers);
  const chosen = new Map((j.extras ?? []).map((e) => [e.id, e.qty]));
  const adapter = adapterFor(j.context.service);
  const catalogue = await adapter.extras(j.selection.searchId, offer.id).catch(() => offer.extras ?? []);
  const priceHost = el('div');
  const sync = () => {
    const list = catalogue.filter((e) => (chosen.get(e.id) ?? 0) > 0 || e.included).map((e) => ({ id: e.id, labelAr: e.labelAr, labelEn: e.labelEn, price: e.price, qty: e.included ? party : chosen.get(e.id), included: !!e.included }));
    setExtras(list);
    priceHost.replaceChildren(priceRows(breakdown(offer, j.context.travellers, list)));
    put('summary', tripCard({ journey: loadJourney(), editHref: stepUrl('search') }), root);
  };
  const rows = catalogue.map((e) => el('div', { class: 'c-extra', dataset: { extra: e.id } }, [
    el('div', {}, [
      el('p', { class: 'c-extra__label' }, pick(e, 'label')),
      el('p', { class: 'c-extra__meta' }, [
        e.included ? el('span', { class: 'c-badge c-badge--success' }, t('bk.extras.includedBadge')) : el('span', { class: 'c-badge c-badge--outline' }, t('bk.extras.optional')),
        el('span', {}, e.included ? t('bk.price.included') : `${money(e.price, e.currency)} ${e.perTraveller ? t('bk.extras.each') : ''}`),
      ]),
    ]),
    e.included ? null : stepper({ label: t('bk.extras.qty'), value: chosen.get(e.id) ?? 0, min: 0, max: (e.max ?? 1) * party, onChange: (v) => { chosen.set(e.id, v); sync(); } }),
  ]));
  put('main', el('div', { class: 'l-stack l-stack--24' }, [
    el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('bk.extras.title')), el('p', { class: 't-body t-muted' }, t('bk.extras.text'))]),
    catalogue.length ? el('div', { class: 'l-stack l-stack--12' }, rows) : stateBlock({ variant: 'info', title: t('bk.extras.title'), text: t('bk.extras.none'), actions: [{ label: t('bk.extras.continue'), href: stepUrl('review'), variant: 'c-btn--primary' }] }),
    el('section', { class: 'c-review-block', 'aria-labelledby': 'extras-price' }, [el('h2', { class: 'c-review-block__title', id: 'extras-price' }, t('bk.details.price')), priceHost]),
    el('div', { class: 'c-journey__actions' }, [
      el('a', { class: 'c-btn c-btn--primary c-btn--lg', href: stepUrl('review') }, t('bk.extras.continue')),
      el('a', { class: 'c-btn c-btn--secondary', href: stepUrl('travellers') }, t('bk.back')),
    ]),
  ]), root);
  sync();
  return { catalogue, chosen };
}
