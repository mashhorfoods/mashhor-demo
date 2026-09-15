/* ============================================================================
   COMPONENTS / SEARCH — §13

   One architecture for every vertical. A vertical is DATA (see
   data/config.js): it declares its fields, and this builds them. Flights,
   hotels, packages and visa all run through the same code path, so a fix to
   the date field fixes it everywhere, and "cruises" costs an object literal.

   Progressive disclosure is built in: a field marked `advanced: true` is
   rendered behind "more options" rather than shown on arrival. §13
   ========================================================================= */

import { el, uid, qsa } from '../core/dom.js';
import { t, getLocale } from '../core/i18n.js';
import { SEARCH_VERTICALS } from '../data/config.js';
import { icon, stepper, initPopovers } from './ui.js';

/* ---------------------------------------------------------------------------
   FIELD FACTORIES — one per field type declared by a vertical.
   ------------------------------------------------------------------------ */
const FIELD_BUILDERS = {
  place: (field) => {
    const id = uid('f');
    return fieldShell(field, id, el('div', { class: 'c-field__wrap' }, [
      field.icon ? el('span', { class: 'c-field__addon c-field__addon--start' }, icon(field.icon, { size: 'sm' })) : null,
      el('input', {
        class: 'c-field__control', id, name: field.id, type: 'text',
        autocomplete: 'off', required: field.required,
        placeholder: getLocale() === 'ar' ? 'المدينة أو المطار' : 'City or airport',
        'aria-describedby': `${id}-help`,
      }),
    ]));
  },

  date: (field) => {
    const id = uid('f');
    return fieldShell(field, id, el('div', { class: 'c-field__wrap' }, [
      el('input', {
        class: 'c-field__control', id, name: field.id, type: 'date', required: field.required,
      }),
    ]));
  },

  select: (field) => {
    const id = uid('f');
    const isAr = getLocale() === 'ar';
    return fieldShell(field, id, el('select', { class: 'c-field__control', id, name: field.id },
      (field.options ?? []).map((option) =>
        el('option', { value: option.value }, isAr ? option.labelAr : option.labelEn))));
  },

  checkbox: (field) => {
    const id = uid('f');
    return el('div', { class: 'c-field' }, [
      el('label', { class: 'c-choice', for: id }, [
        el('input', { class: 'c-choice__input', type: 'checkbox', id, name: field.id }),
        el('span', { class: 'c-choice__text' }, t(field.label)),
      ]),
    ]);
  },

  /* The passenger / occupancy picker: a button that opens a popover of
     steppers, and reports one readable summary back onto the button. */
  pax: (field) => {
    const id = uid('pax');
    const panelId = `${id}-panel`;
    const counts = { adults: 1, children: 0, infants: 0 };

    const summary = el('span', {}, t('pax.summary', 1));

    const update = () => {
      const total = counts.adults + counts.children + counts.infants;
      summary.textContent = t('pax.summary', total);
    };

    const trigger = el('button', {
      type: 'button', class: 'c-field__control', id,
      'data-popover-trigger': '', 'aria-controls': panelId, 'aria-expanded': 'false',
      style: 'display:flex;align-items:center;gap:var(--space-8);text-align:start;cursor:pointer',
    }, [icon('no-users', { size: 'sm' }), summary]);

    const panel = el('div', { class: 'c-popover', id: panelId, hidden: true }, [
      stepper({ label: t('pax.adults'),   hint: t('pax.adults.hint'),   value: 1, min: 1, max: 9,
                onChange: (v) => { counts.adults = v; update(); } }),
      stepper({ label: t('pax.children'), hint: t('pax.children.hint'), value: 0, min: 0, max: 8,
                onChange: (v) => { counts.children = v; update(); } }),
      stepper({ label: t('pax.infants'),  hint: t('pax.infants.hint'),  value: 0, min: 0, max: 4,
                onChange: (v) => { counts.infants = v; update(); } }),
      el('div', { style: 'margin-block-start:var(--space-16);display:flex;justify-content:flex-end' }, [
        el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--sm', 'data-popover-close': '' }, t('pax.done')),
      ]),
    ]);

    return el('div', { class: 'c-field c-popover-host' }, [
      el('label', { class: 'c-field__label', for: id }, t(field.label)),
      trigger,
      panel,
    ]);
  },
};

/** The label + control + help/error scaffold every field shares. §12 */
function fieldShell(field, id, control) {
  return el('div', { class: 'c-field' }, [
    el('label', { class: 'c-field__label', for: id }, [
      t(field.label),
      field.required
        ? el('span', { class: 'c-field__required', 'aria-hidden': 'true' }, '*')
        : el('span', { class: 'c-field__optional' }, getLocale() === 'ar' ? '(اختياري)' : '(optional)'),
    ]),
    control,
  ]);
}

/* ---------------------------------------------------------------------------
   PANEL — the fields of one vertical.
   ------------------------------------------------------------------------ */
function verticalPanel(vertical) {
  const basic = vertical.fields.filter((f) => !f.advanced);
  const advanced = vertical.fields.filter((f) => f.advanced);

  const build = (field) => {
    const builder = FIELD_BUILDERS[field.type];
    if (!builder) return null;
    const node = builder(field);
    if (field.full) node.classList.add('is-full');
    return node;
  };

  const fieldsWrap = el('div', {
    class: 'c-search__fields',
    style: `--search-cols:${vertical.columns ?? 4}`,
  }, basic.map(build));

  const advancedId = uid('adv');
  const advancedBlock = advanced.length ? el('div', {
    class: 'c-search__advanced', id: advancedId, dataset: { collapsed: 'true' },
  }, [
    el('div', { class: 'c-search__advanced-inner' }, [
      el('div', { class: 'c-search__fields', style: 'padding-block-start:var(--space-16)' }, advanced.map(build)),
    ]),
  ]) : null;

  const toggleLabel = el('span', {}, t('search.more'));
  const toggle = advanced.length ? el('button', {
    type: 'button',
    class: 'c-btn c-btn--tertiary c-btn--sm c-search__more',
    'aria-expanded': 'false', 'aria-controls': advancedId,
    onclick: (event) => {
      const button = event.currentTarget;
      const open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!open));
      advancedBlock.dataset.collapsed = String(open);
      toggleLabel.textContent = open ? t('search.more') : t('search.less');
    },
  }, [toggleLabel, icon('no-chevron-down', { size: 'sm' })]) : null;

  return el('div', { class: 'c-search__panel' }, [
    fieldsWrap,
    toggle,
    advancedBlock,
    el('div', { class: 'c-search__submit' }, [
      el('button', { type: 'submit', class: 'c-btn c-btn--primary c-btn--lg c-btn--block@sm' }, [
        icon('no-search', { size: 'sm', className: 'c-btn__icon' }),
        el('span', { class: 'c-btn__label' }, t('search.submit')),
        el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' }),
      ]),
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   SEARCH — the public builder.
   @param {object} options
   @param {string[]} options.verticals  ids to include, in order
   @param {function} options.onSubmit   receives (verticalId, FormData)
   ------------------------------------------------------------------------ */
export function searchWidget({ verticals = null, onSubmit = null } = {}) {
  const list = (verticals
    ? verticals.map((id) => SEARCH_VERTICALS.find((v) => v.id === id)).filter(Boolean)
    : SEARCH_VERTICALS);

  const groupId = uid('search');
  const tabs = [];
  const panels = [];

  list.forEach((vertical, index) => {
    const tabId = `${groupId}-tab-${vertical.id}`;
    const panelId = `${groupId}-panel-${vertical.id}`;
    const selected = index === 0;

    tabs.push(el('button', {
      type: 'button', class: 'c-search__tab', role: 'tab', id: tabId,
      'aria-selected': String(selected), 'aria-controls': panelId,
      dataset: { tabId: vertical.id },
    }, [icon(vertical.icon, { size: 'sm' }), el('span', {}, t(vertical.label))]));

    const panel = el('form', {
      class: 'c-search__form', role: 'tabpanel', id: panelId,
      'aria-labelledby': tabId, hidden: !selected,
      novalidate: true,
      onsubmit: (event) => {
        event.preventDefault();
        onSubmit?.(vertical.id, new FormData(event.currentTarget));
      },
    }, verticalPanel(vertical));

    panels.push(panel);
  });

  const widget = el('div', { class: 'c-search', dataset: { tabs: '' } }, [
    el('div', { class: 'c-search__tabs', role: 'tablist', 'aria-label': t('nav.search') }, tabs),
    ...panels,
  ]);

  // The popovers live inside the panels we just built, so wire them now.
  queueMicrotask(() => initPopovers(widget));

  return widget;
}
