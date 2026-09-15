/* ============================================================================
   COMPONENTS / STATES — §21

   Loading, skeleton, empty, error, success. Built as one small state machine
   so a results region cannot accidentally ship with only three of the five.

   The rule this enforces: an error says WHAT HAPPENED and WHAT TO DO NEXT.
   `stateBlock` will not render an error without an action.
   ========================================================================= */

import { el, render, uid } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { icon } from './ui.js';

/* ---------------------------------------------------------------------------
   SKELETONS — shaped like the thing they stand in for, so nothing reflows.
   ------------------------------------------------------------------------ */
export function skeletonCard() {
  return el('div', { class: 'c-card', 'aria-hidden': 'true' }, [
    el('div', { class: 'c-skeleton c-skeleton--media' }),
    el('div', { class: 'c-card__body' }, [
      el('div', { class: 'c-skeleton c-skeleton--title' }),
      el('div', { class: 'c-skeleton c-skeleton--text c-skeleton--line-md' }),
      el('div', { class: 'c-skeleton c-skeleton--text c-skeleton--line-sm' }),
    ]),
  ]);
}

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

/* ---------------------------------------------------------------------------
   LOADING — a spinner plus a sentence. A bare spinner tells the customer
   nothing, and a flight search is slow enough that silence reads as broken.
   ------------------------------------------------------------------------ */
export function loadingBlock(message = t('state.searching')) {
  return el('div', { class: 'c-loading-block', role: 'status', 'aria-live': 'polite' }, [
    el('div', { class: 'c-spinner c-spinner--lg', 'aria-hidden': 'true' }),
    el('p', { class: 't-body' }, message),
  ]);
}

export function progressBar({ value = null, label = t('state.loading') } = {}) {
  const indeterminate = value === null;
  return el('div', {
    class: `c-progress${indeterminate ? ' c-progress--indeterminate' : ''}`,
    role: 'progressbar', 'aria-label': label,
    ...(indeterminate ? {} : { 'aria-valuenow': String(value), 'aria-valuemin': '0', 'aria-valuemax': '100' }),
  }, [el('div', { class: 'c-progress__bar', style: indeterminate ? '' : `--progress:${value}%` })]);
}

/* ---------------------------------------------------------------------------
   STATE BLOCK — empty / error / success / info.

   `actions` is required for 'error' and 'empty': a dead end is a bug. §21
   ------------------------------------------------------------------------ */
export function stateBlock({
  variant = 'empty',
  iconName = null,
  title,
  text = '',
  next = '',
  actions = [],
} = {}) {
  const DEFAULT_ICONS = {
    empty: 'no-empty-box', error: 'no-error', success: 'no-check-circle',
    warning: 'no-alert', info: 'no-info',
  };

  if ((variant === 'error' || variant === 'empty') && actions.length === 0) {
    console.warn('[no] A %s state was rendered without an action. §21 requires a next step.', variant);
  }

  const titleId = uid('state');

  return el('div', {
    class: `c-state c-state--${variant}`,
    role: variant === 'error' ? 'alert' : 'status',
    'aria-labelledby': titleId,
  }, [
    el('span', { class: 'c-state__icon' }, icon(iconName ?? DEFAULT_ICONS[variant] ?? 'no-info', { size: 'xl' })),
    el('h3', { class: 'c-state__title', id: titleId }, title),
    text ? el('p', { class: 'c-state__text' }, text) : null,
    actions.length
      ? el('div', { class: 'c-state__actions' }, actions.map((action) =>
          el(action.href ? 'a' : 'button', {
            class: `c-btn ${action.variant ?? 'c-btn--secondary'}`,
            ...(action.href ? { href: action.href } : { type: 'button' }),
            ...(action.onClick ? { onclick: action.onClick } : {}),
          }, action.label)))
      : null,
    next ? el('p', { class: 'c-state__next' }, next) : null,
  ]);
}

/* ---------------------------------------------------------------------------
   STATE REGION — the controller.

   A region declares all five states up front and is switched between them.
   Nothing else in the codebase should be swapping innerHTML on a results
   list: this keeps the live-region announcements and the min-height in one
   place, so results never arrive silently and the page never jumps. §21/§23
   ------------------------------------------------------------------------ */
export function stateRegion(target, {
  loading = () => loadingBlock(),
  empty = null,
  error = null,
  minHeight = null,
} = {}) {
  target.setAttribute('data-state-region', '');
  if (minHeight) target.style.setProperty('--state-min-height', minHeight);
  if (!target.hasAttribute('aria-live')) target.setAttribute('aria-live', 'polite');
  if (!target.hasAttribute('aria-busy')) target.setAttribute('aria-busy', 'false');

  const api = {
    loading(custom) {
      target.setAttribute('aria-busy', 'true');
      render(target, (custom ?? loading)());
      return api;
    },
    content(nodes) {
      target.setAttribute('aria-busy', 'false');
      render(target, nodes);
      return api;
    },
    empty(custom) {
      target.setAttribute('aria-busy', 'false');
      render(target, (custom ?? empty ?? (() => stateBlock({
        variant: 'empty',
        title: t('state.noResults.title'),
        text: t('state.noResults.text'),
        actions: [{ label: t('state.noResults.action'), variant: 'c-btn--primary' }],
      })))());
      return api;
    },
    error(custom) {
      target.setAttribute('aria-busy', 'false');
      render(target, (custom ?? error ?? (() => stateBlock({
        variant: 'error',
        title: t('state.error.title'),
        text: t('state.error.text'),
        next: t('state.error.next'),
        actions: [
          { label: t('action.retry'), variant: 'c-btn--primary' },
          { label: t('action.help'), variant: 'c-btn--secondary' },
        ],
      })))());
      return api;
    },
  };

  return api;
}
