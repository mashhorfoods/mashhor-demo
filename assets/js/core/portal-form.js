/* ============================================================================
   CORE / PORTAL FORM — one labelled form field, its error slot, and the way
   errors are shown, shared by every form in the three portals and the
   booking journey's traveller forms.

   A field is `.c-field[data-field=name]` holding a label, one
   `.c-field__control`, an optional `.c-field__help` and a hidden
   `.c-field__error[role=alert]`. An error marks the control aria-invalid and
   adds the error to its aria-describedby (after the help, which stays);
   clearing it takes both away again.
   ========================================================================= */
import { el, qs } from './dom.js';
import { t, pick } from './i18n.js';
import { icon } from '../components/ui.js';

/**
 * One labelled field with an error slot; `password` fields get a show/hide toggle, `options` makes it a select
 * (with an empty "—" first option). `attrs` adds any other attribute to the control (pattern, maxlength, …).
 */
export function field({ id, name, labelKey, type = 'text', autocomplete, help, required = true, value = '', dir = null, inputmode = null, options = null, className = '', attrs = {} }) {
  const describedBy = help ? `${id}-help` : null;
  const input = options
    ? el('select', { class: 'c-field__control', id, name, required, 'aria-describedby': describedBy, ...attrs }, [el('option', { value: '' }, '—'), ...options.map((o) => el('option', { value: o.value, selected: o.value === value }, pick(o, 'label')))])
    : el('input', { class: 'c-field__control', id, name, type, value, required, autocomplete, ...(dir ? { dir } : {}), ...(inputmode ? { inputmode } : {}), 'aria-describedby': describedBy, ...attrs });
  const toggle = type === 'password' ? el('button', { type: 'button', class: 'c-btn c-btn--tertiary c-btn--sm c-auth__toggle', 'aria-pressed': 'false', 'aria-controls': id, onclick: (e) => { const show = input.type === 'password'; input.type = show ? 'text' : 'password'; e.currentTarget.setAttribute('aria-pressed', String(show)); e.currentTarget.textContent = t(show ? 'auth.hide' : 'auth.show'); } }, t('auth.show')) : null;
  return el('div', { class: `c-field${className ? ` ${className}` : ''}`, dataset: { field: name } }, [
    el('label', { class: 'c-field__label', for: id }, [t(labelKey), required ? el('span', { class: 'c-field__required', 'aria-hidden': 'true' }, '*') : null]),
    toggle ? el('div', { class: 'c-auth__pw' }, [input, toggle]) : input,
    help ? el('p', { class: 'c-field__help', id: `${id}-help` }, t(help)) : null,
    el('p', { class: 'c-field__error', id: `${id}-err`, role: 'alert', hidden: true }),
  ]);
}

/**
 * A field from a booking field spec ({ id, type, label, required, options, latin, document, help, autocomplete }),
 * as booking/travellers.js defines them. `autofill` keeps the spec's autocomplete token (else 'off'); `patterns`
 * adds the Latin-letters / document-number input patterns.
 */
export const specField = (f, prefix, value = '', { autofill = false, patterns = false, className = '' } = {}) => field({
  id: `${prefix}-${f.id}`, name: f.id, labelKey: f.label, type: f.type, required: f.required, value, className,
  options: f.type === 'select' ? f.options : null,
  autocomplete: autofill ? (f.autocomplete ?? 'off') : 'off',
  dir: f.latin || f.document ? 'ltr' : null,
  help: f.help ?? (f.latin ? 'bk.tr.latinHelp' : null),
  attrs: patterns ? { pattern: f.latin ? "[A-Za-z' -]+" : f.document ? '[A-Za-z0-9]+' : null } : {},
});

/** Show (or with no message, clear) the error on field `name`; returns its control. */
export function setError(form, name, message) {
  const f = qs(`[data-field="${name}"]`, form); if (!f) return null;
  const c = qs('.c-field__control', f); const e = qs('.c-field__error', f);
  const others = (c.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id && id !== e.id);
  if (message) { f.dataset.state = 'error'; c.setAttribute('aria-invalid', 'true'); c.setAttribute('aria-describedby', [...others, e.id].join(' ')); e.hidden = false; e.replaceChildren(icon('no-alert', { size: 'sm' }), el('span', {}, message)); }
  else {
    delete f.dataset.state; c.removeAttribute('aria-invalid'); e.hidden = true; e.replaceChildren();
    if (others.length) c.setAttribute('aria-describedby', others.join(' ')); else c.removeAttribute('aria-describedby');
  }
  return c;
}
export const clearErrors = (form) => form.querySelectorAll('[data-field]').forEach((f) => setError(form, f.dataset.field, null));
/** Clear every error, show `errors` ({ name: message }), focus the first and say how many in `status`. True if any. */
export function applyErrors(form, errors, status) {
  clearErrors(form); let first = null;
  for (const [name, message] of Object.entries(errors)) { const c = setError(form, name, message); first ??= c; }
  first?.focus();
  if (status) { status.dataset.tone = 'error'; status.textContent = t('book.status.fix', Object.keys(errors).length); }
  return !!first;
}

/** The polite status line under a form. */
export const statusLine = () => el('p', { class: 'c-book__status t-body-sm', role: 'status', 'aria-live': 'polite' });
/** The full-width primary submit button of an auth form, with its loading spinner. */
export const submitButton = (labelKey) => el('button', { type: 'submit', class: 'c-btn c-btn--primary c-btn--lg c-btn--block' }, [el('span', { class: 'c-btn__label' }, t(labelKey)), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
