/* ============================================================================
   PREVIEW / SKELETONS

   The flight-result skeleton and the list helper the guide demonstrates.
   Only the style guide imports this; no customer page loads it. Stage 10.12
   ========================================================================= */

import { el } from '../core/dom.js';
import { skeletonCard } from '../components/states.js';

export function skeletonFlight() {
  return el('div', { class: 'c-card', 'aria-hidden': 'true' }, [
    el('div', { class: 'c-flight' }, [
      el('div', { class: 'l-cluster l-cluster--16' }, [
        el('div', { class: 'c-skeleton c-skeleton--circle', style: 'inline-size:36px;block-size:36px' }),
        el('div', { style: 'flex:1' }, [
          el('div', { class: 'c-skeleton c-skeleton--text c-skeleton--line-sm' }),
        ]),
      ]),
      el('div', { style: 'margin-block-start:var(--space-24);display:grid;grid-template-columns:1fr 2fr 1fr;gap:var(--space-16)' }, [
        el('div', { class: 'c-skeleton', style: 'block-size:2.5rem' }),
        el('div', { class: 'c-skeleton', style: 'block-size:2.5rem' }),
        el('div', { class: 'c-skeleton', style: 'block-size:2.5rem' }),
      ]),
    ]),
  ]);
}

export const skeletonList = (count = 3, factory = skeletonCard) =>
  el('div', { class: 'l-stack l-stack--16' }, Array.from({ length: count }, factory));
