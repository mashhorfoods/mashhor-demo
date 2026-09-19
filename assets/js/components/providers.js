/* ============================================================================
   COMPONENTS / PROVIDERS — the airline-providers trust band.

   Static, always-available data (see data/providers.js) — no loading/empty/
   error states needed, unlike the homepage's API-backed regions.
   ========================================================================= */

import { el } from '../core/dom.js';
import { pick } from '../core/i18n.js';
import { AIRLINE_PROVIDERS } from '../data/providers.js';

export function providerCard(provider) {
  return el('div', { class: 'c-card c-provider-card' }, [
    provider.logo
      ? el('img', {
          src: provider.logo, alt: pick(provider, 'name'),
          class: 'c-provider-card__logo', loading: 'lazy', decoding: 'async',
        })
      : el('span', { class: 'c-provider-card__wordmark' }, pick(provider, 'name')),
  ]);
}

export function providerGrid(list = AIRLINE_PROVIDERS) {
  return el('div', { class: 'l-grid' }, list.map((provider) =>
    el('div', { class: 'l-span-4@md l-span-4@lg' }, providerCard(provider))));
}
