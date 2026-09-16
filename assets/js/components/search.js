/* ============================================================================
   COMPONENTS / SEARCH — §13

   One architecture for every vertical. A vertical is DATA (see
   data/config.js): it declares its fields, and this builds them. Flights,
   hotels, packages and visa all run through the same code path, so a fix to
   the date field fixes it everywhere, and "cruises" costs an object literal.

   Progressive disclosure is built in: a field marked `advanced: true` is
   rendered behind "more options" rather than shown on arrival. §13

   Stage 10.9 additions, all driven by field data:
     when:  { field, value | values }   the field shows only when another
                                         control holds that value (one-way
                                         hides the return date; multi-city
                                         shows the legs)
     legs   a repeatable from/to/date group for multi-city, min..max rows
     pax    now writes adults/children/infants as hidden inputs and reads a
            family-first summary ("2 adults · 1 child · 1 infant")
     widget.no.values() / setError() / clearErrors()   the validation seam
   ========================================================================= */

import { el, uid } from '../core/dom.js';
import { t, getLocale } from '../core/i18n.js';
import { SEARCH_VERTICALS } from '../data/config.js';
import { icon, stepper, initPopovers, initTabs } from './ui.js';
import { locationField } from '../booking/ui/location-field.js';

/* ---------------------------------------------------------------------------
   FIELD FACTORIES — one per field type declared by a vertical.
   ------------------------------------------------------------------------ */
/* A place is the airport / city combobox of Stage 11 (booking/ui/location-field.js):
   free text the customer can type, suggestions from the location registry, a
   hidden `<name>Code` beside it. A filter form (`plain`) keeps a plain input. */
const placeInput = (field, id, name = field.id) => (field.plain
  ? el('div', { class: 'c-field__wrap' }, [
      field.icon ? el('span', { class: 'c-field__addon c-field__addon--start' }, icon(field.icon, { size: 'sm' })) : null,
      el('input', { class: 'c-field__control', id, name, type: 'text', autocomplete: 'off', required: field.required,
                    placeholder: field.placeholder ? t(field.placeholder) : t('bk.loc.placeholder') }),
    ])
  : locationField({ id, name, iconName: field.icon, required: field.required, placeholder: field.placeholder ? t(field.placeholder) : null }));

const FIELD_BUILDERS = {
  place: (field) => { const id = uid('f'); return fieldShell(field, id, placeInput(field, id)); },

  date: (field) => {
    const id = uid('f');
    return fieldShell(field, id, el('div', { class: 'c-field__wrap' }, [
      el('input', { class: 'c-field__control', id, name: field.id, type: 'date', required: field.required }),
    ]));
  },

  select: (field) => {
    const id = uid('f');
    const isAr = getLocale() === 'ar';
    return fieldShell(field, id, el('select', { class: 'c-field__control', id, name: field.id }, [
      // `blank` adds an "any" first option, for filters where nothing is required.
      field.blank ? el('option', { value: '' }, t(field.blank)) : null,
      ...(field.options ?? []).map((option) =>
        el('option', { value: option.value, selected: option.value === field.value }, isAr ? option.labelAr : option.labelEn)),
    ]));
  },

  /* Segmented control — a radio group that reads as one bar (trip type). */
  segmented: (field) => {
    const name = uid('seg');
    const isAr = getLocale() === 'ar';
    return el('fieldset', { class: 'c-field c-segmented-field' }, [
      el('legend', { class: 'c-field__label' }, t(field.label)),
      el('div', { class: 'c-segmented' }, (field.options ?? []).map((option, i) => {
        const id = `${name}-${i}`;
        return el('label', { class: 'c-segmented__option', for: id }, [
          el('input', { class: 'c-segmented__input', type: 'radio', id, name: field.id,
                        value: option.value, checked: option.value === field.value }),
          el('span', { class: 'c-segmented__label' }, isAr ? option.labelAr : option.labelEn),
        ]);
      })),
    ]);
  },

  textarea: (field) => {
    const id = uid('f');
    return fieldShell(field, id, el('textarea', {
      class: 'c-field__control', id, name: field.id, rows: 3, required: field.required,
      placeholder: getLocale() === 'ar' ? 'أخبرنا بما تحتاجه باختصار' : 'Tell us briefly what you need',
    }));
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

  /* Multi-city legs: from / to / date rows, min..max, add and remove. */
  legs: (field) => {
    const min = field.min ?? 2;
    const max = field.max ?? 4;
    const rows = el('div', { class: 'c-legs__rows' });
    const count = () => rows.children.length;

    const addRow = () => {
      const n = count() + 1;
      const fromId = uid('leg'); const toId = uid('leg'); const dateId = uid('leg');
      const row = el('div', { class: 'c-legs__row', dataset: { leg: String(n) } }, [
        el('p', { class: 'c-legs__num t-overline' }, t('search.legN', n)),
        fieldShell({ id: 'legFrom', label: 'search.from', icon: 'no-flight', required: true }, fromId, placeInput({ icon: 'no-flight', required: true }, fromId, 'legFrom')),
        fieldShell({ id: 'legTo', label: 'search.to', icon: 'no-location', required: true }, toId, placeInput({ icon: 'no-location', required: true }, toId, 'legTo')),
        fieldShell({ id: 'legDate', label: 'search.depart', required: true }, dateId, el('div', { class: 'c-field__wrap' }, [
          el('input', { class: 'c-field__control', id: dateId, name: 'legDate', type: 'date', required: true })])),
        n > min ? el('button', { type: 'button', class: 'c-btn c-btn--utility c-legs__remove', 'aria-label': t('search.removeLeg', n),
          onclick: () => { row.remove(); renumber(); sync(); } }, icon('no-close', { size: 'sm' })) : null,
      ]);
      rows.append(row);
    };
    const renumber = () => Array.from(rows.children).forEach((row, i) => { row.dataset.leg = String(i + 1); row.querySelector('.c-legs__num').textContent = t('search.legN', i + 1); });
    const add = el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--sm c-legs__add', onclick: () => { addRow(); sync(); } }, [icon('no-plus', { size: 'sm' }), el('span', {}, t('search.addLeg'))]);
    const sync = () => { add.disabled = count() >= max; };
    for (let i = 0; i < min; i++) addRow();
    sync();
    return el('div', { class: 'c-field c-legs is-full' }, [rows, add]);
  },

  /* The passenger / occupancy picker: a button that opens a popover of
     steppers, reports a family-first summary onto the button, and writes
     the counts as hidden inputs so the form carries them. */
  pax: (field) => {
    const id = uid('pax');
    const panelId = `${id}-panel`;
    const counts = { adults: 1, children: 0, infants: 0 };
    const hidden = Object.fromEntries(Object.keys(counts).map((k) => [k, el('input', { type: 'hidden', name: k, value: String(counts[k]) })]));
    const summary = el('span', {});
    const note = el('p', { class: 'c-field__help c-pax__note', role: 'status' });

    const update = () => {
      const parts = [];
      if (counts.adults) parts.push(t('pax.count.adults', counts.adults));
      if (counts.children) parts.push(t('pax.count.children', counts.children));
      if (counts.infants) parts.push(t('pax.count.infants', counts.infants));
      summary.textContent = parts.join(' · ');
      Object.keys(counts).forEach((k) => { hidden[k].value = String(counts[k]); });
      const total = counts.adults + counts.children + counts.infants;
      note.textContent = counts.infants > counts.adults ? t('book.err.infants') : total >= 9 ? t('pax.maxNote') : '';
      trigger.dispatchEvent(new CustomEvent('no:paxchange', { bubbles: true, detail: { ...counts } }));
    };

    const trigger = el('button', {
      type: 'button', class: 'c-field__control c-pax__trigger', id,
      'data-popover-trigger': '', 'aria-controls': panelId, 'aria-expanded': 'false',
    }, [icon('no-users', { size: 'sm' }), summary]);

    const panel = el('div', { class: 'c-popover', id: panelId, hidden: true }, [
      stepper({ label: t('pax.adults'),   hint: t('pax.adults.hint'),   value: 1, min: 1, max: 9, onChange: (v) => { counts.adults = v; update(); } }),
      stepper({ label: t('pax.children'), hint: t('pax.children.hint'), value: 0, min: 0, max: 8, onChange: (v) => { counts.children = v; update(); } }),
      stepper({ label: t('pax.infants'),  hint: t('pax.infants.hint'),  value: 0, min: 0, max: 4, onChange: (v) => { counts.infants = v; update(); } }),
      note,
      el('div', { style: 'margin-block-start:var(--space-16);display:flex;justify-content:flex-end' }, [
        el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--sm', 'data-popover-close': '' }, t('pax.done')),
      ]),
    ]);
    update();

    return el('div', { class: 'c-field c-popover-host', dataset: { field: field.id } }, [
      el('label', { class: 'c-field__label', for: id }, t(field.label)),
      trigger,
      ...Object.values(hidden),
      panel,
    ]);
  },
};

/** The label + control + help/error scaffold every field shares. §12 */
function fieldShell(field, id, control) {
  return el('div', { class: 'c-field', dataset: { field: field.id } }, [
    el('label', { class: 'c-field__label', for: id }, [
      t(field.label),
      field.required
        ? el('span', { class: 'c-field__required', 'aria-hidden': 'true' }, '*')
        : (field.markOptional === false ? null : el('span', { class: 'c-field__optional' }, getLocale() === 'ar' ? '(اختياري)' : '(optional)')),
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
    // A filter form (vertical.filters) has nothing required, so "(optional)"
    // on every label would be noise.
    const node = builder(vertical.filters ? { ...field, markOptional: false } : field);
    if (field.full) node.classList.add('is-full');
    if (field.when) node.dataset.when = JSON.stringify(field.when);
    return node;
  };

  const fieldsWrap = el('div', { class: 'c-search__fields', style: `--search-cols:${vertical.columns ?? 4}` }, basic.map(build));

  const advancedId = uid('adv');
  const advancedBlock = advanced.length ? el('div', { class: 'c-search__advanced', id: advancedId, dataset: { collapsed: 'true' } }, [
    el('div', { class: 'c-search__advanced-inner' }, [
      el('div', { class: 'c-search__fields', style: 'padding-block-start:var(--space-16)' }, advanced.map(build)),
    ]),
  ]) : null;

  const toggleLabel = el('span', {}, t('search.more'));
  const toggle = advanced.length ? el('button', {
    type: 'button', class: 'c-btn c-btn--tertiary c-btn--sm c-search__more',
    'aria-expanded': 'false', 'aria-controls': advancedId,
    onclick: (event) => {
      const button = event.currentTarget;
      const open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!open));
      advancedBlock.dataset.collapsed = String(open);
      toggleLabel.textContent = open ? t('search.more') : t('search.less');
    },
  }, [toggleLabel, icon('no-chevron-down', { size: 'sm' })]) : null;

  const submitIcon = vertical.submitIcon ?? (vertical.submit ? 'no-arrow-end' : 'no-search');
  return el('div', { class: 'c-search__panel' }, [
    fieldsWrap,
    toggle,
    advancedBlock,
    el('div', { class: 'c-search__submit' }, [
      // A vertical may ask for a quieter submit (a filter beside a page's own
      // primary action) — data, not a special case.
      el('button', { type: 'submit', class: `c-btn ${vertical.submitVariant ? `c-btn--${vertical.submitVariant}` : 'c-btn--primary'} c-btn--lg c-btn--block@sm` }, [
        icon(submitIcon, { size: 'sm', className: 'c-btn__icon', flip: submitIcon === 'no-arrow-end' }),
        el('span', { class: 'c-btn__label' }, t(vertical.submit ?? 'search.submit')),
        el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' }),
      ]),
    ]),
  ]);
}

/** `when` conditions: show a field only while another control holds a value.
    Hidden fields are disabled too, so FormData never carries stale values. */
function applyConditions(form) {
  const conditional = Array.from(form.querySelectorAll('[data-when]'));
  if (!conditional.length) return;
  const evaluate = () => {
    for (const node of conditional) {
      const when = JSON.parse(node.dataset.when);
      const control = form.querySelector(`[name="${when.field}"]:checked, select[name="${when.field}"], input[name="${when.field}"]:not([type=radio])`);
      const current = control?.value ?? '';
      const wanted = when.values ?? [when.value];
      const show = wanted.includes(current);
      node.hidden = !show;
      node.querySelectorAll('input, select, textarea, button').forEach((c) => { c.disabled = !show; });
    }
  };
  form.addEventListener('change', evaluate);
  evaluate();
}

/* ---------------------------------------------------------------------------
   SEARCH — the public builder.
   @param {object} options
   @param {string[]} options.verticals  ids to include, in order
   @param {function} options.onSubmit   receives (verticalId, FormData, form)
   @param {boolean}  options.tabs       false hides the tab strip (a page may
                                        drive selection with its own selector)
   Returns the widget; `widget.no.select(id)` switches vertical,
   `widget.no.focus()` puts the caret in the first field of the active one,
   `widget.no.values()` reads the active form, `setError` / `clearErrors`
   mark fields. §13
   ------------------------------------------------------------------------ */
export function searchWidget({ verticals = null, onSubmit = null, tabs: showTabs = true } = {}) {
  const list = (verticals
    ? verticals.map((id) => SEARCH_VERTICALS.find((v) => v.id === id)).filter(Boolean)
    : SEARCH_VERTICALS.filter((v) => !v.standalone));

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
      'aria-labelledby': tabId, hidden: !selected, novalidate: true,
      dataset: { vertical: vertical.id },
      onsubmit: (event) => {
        event.preventDefault();
        onSubmit?.(vertical.id, new FormData(event.currentTarget), event.currentTarget);
      },
    }, verticalPanel(vertical));
    applyConditions(panel);
    panels.push(panel);
  });

  // One vertical needs no tab strip; a page may also hide it and drive
  // selection itself (the tabs stay in the DOM, hidden, for initTabs).
  const widget = el('div', { class: 'c-search', dataset: { tabs: '' } }, [
    el('div', { class: 'c-search__tabs', role: 'tablist', 'aria-label': t('nav.search'), hidden: list.length < 2 || !showTabs }, tabs),
    ...panels,
  ]);

  // The tabs and popovers live inside what we just built, so wire them now —
  // synchronously, because a caller may select a tab in the same tick (the
  // deep links do). boot() also sweeps the document once, but a widget
  // rebuilt after a locale change would otherwise have dead tabs; both
  // inits are idempotent.
  initTabs(widget);
  initPopovers(widget);

  const activeForm = () => panels.find((p) => !p.hidden) ?? null;
  const errorId = (control) => `${control.id || (control.id = uid('f'))}-error`;

  widget.no = {
    select(id) {
      const tab = tabs.find((b) => b.dataset.tabId === id);
      if (!tab) return false;
      tab.click();   // one code path for selection: initTabs' own handler
      return true;
    },
    focus({ preventScroll = false } = {}) {
      activeForm()?.querySelector('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus({ preventScroll });
    },
    current() { return tabs.find((b) => b.getAttribute('aria-selected') === 'true')?.dataset.tabId ?? null; },
    form: activeForm,
    values() { const f = activeForm(); return f ? new FormData(f) : new FormData(); },
    /** Mark one control invalid with a message tied to it for assistive tech. */
    setError(name, message, index = null) {
      const form = activeForm(); if (!form) return null;
      let control = name === 'pax'
        ? form.querySelector('.c-pax__trigger')
        : (index != null ? form.querySelectorAll(`[name="${name}"]`)[index] : form.querySelector(`[name="${name}"]:not([type=hidden])`));
      if (!control) return null;
      const host = control.closest('.c-field') ?? control.parentElement;
      host.querySelector('.c-field__error')?.remove();
      const id = errorId(control);
      host.append(el('p', { class: 'c-field__error', id, role: 'alert' }, [icon('no-alert', { size: 'sm' }), el('span', {}, message)]));
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', id);
      return control;
    },
    clearErrors() {
      const form = activeForm(); if (!form) return;
      form.querySelectorAll('.c-field__error').forEach((n) => n.remove());
      form.querySelectorAll('[aria-invalid]').forEach((n) => { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
    },
    submitButton() { return activeForm()?.querySelector('button[type="submit"]') ?? null; },
  };

  return widget;
}
