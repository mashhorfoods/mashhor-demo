/* ============================================================================
   BOOKING / UI / TRAVELLERS — one form per traveller, one contact. Stage 11
   Forms come from booking/travellers.js (data); validation marks the field,
   moves focus to the first problem and says how many to fix. The number of
   forms is the number of travellers searched for — nothing else is possible.
   mountTravellers() → window.no.travellers
   ========================================================================= */

import { el, uid, qs } from '../../core/dom.js';
import { t, pick, getLocale } from '../../core/i18n.js';
import { icon, setButtonState } from '../../components/ui.js';
import { loadJourney, setTravellers, stepUrl, guard, update } from '../journey.js';
import { travellerSlots, travellerFields, CONTACT_FIELDS, validateTraveller, validateContact } from '../travellers.js';
import { totalTravellers } from '../pricing.js';
import { devNotice, progress, tripCard, recoveryState, put, setHead, isAr } from './shared.js';
import { isAuthenticated } from '../../account/auth.js';
import { customer } from '../../account/customer.js';

function field(f, prefix, value = '') {
  const id = `${prefix}-${f.id}`;
  const control = f.type === 'select'
    ? el('select', { class: 'c-field__control', id, name: f.id, required: f.required }, [el('option', { value: '' }, '—'), ...f.options.map((o) => el('option', { value: o.value, selected: o.value === value }, isAr() ? o.labelAr : o.labelEn))])
    : el('input', { class: 'c-field__control', id, name: f.id, type: f.type, value, required: f.required, autocomplete: f.autocomplete ?? 'off', ...(f.latin ? { dir: 'ltr', pattern: "[A-Za-z' -]+" } : {}), ...(f.document ? { dir: 'ltr', pattern: '[A-Za-z0-9]+' } : {}) });
  return el('div', { class: `c-field${f.id === 'passport' ? ' is-full' : ''}`, dataset: { field: f.id } }, [
    el('label', { class: 'c-field__label', for: id }, [t(f.label), f.required ? el('span', { class: 'c-field__required', 'aria-hidden': 'true' }, '*') : null]),
    control,
    (f.help || f.latin) ? el('p', { class: 'c-field__help', id: `${id}-help` }, t(f.help ?? 'bk.tr.latinHelp')) : null,
  ]);
}
const readForm = (form) => Object.fromEntries(new FormData(form));

export function mountTravellers({ root = document } = {}) {
  setHead('page.booking.travellers');
  const j = loadJourney();
  const mode = j.context?.mode === 'request' ? 'request' : 'search';
  const blocked = guard('travellers', j);
  put('progress', progress('travellers', { mode }), root);
  if (blocked) { put('main', recoveryState(blocked), root); put('aside', null, root); return { blocked }; }
  put('notice', j.search?.meta?.dev ? devNotice() : null, root);
  put('summary', tripCard({ journey: j, editHref: mode === 'search' ? stepUrl('search') : null }), root);
  const slots = travellerSlots(j.context.travellers);
  const travelDate = j.selection?.offer?.legs?.[0]?.departAt?.slice(0, 10) ?? j.context.dates?.depart ?? '';
  // Typed values survive a language switch or a refresh before submit: a draft, kept beside the journey.
  const saved = j.travellers ?? j.draft?.travellers ?? {};
  const savedContact = j.contact ?? j.draft?.contact ?? null;
  const draft = () => update({ draft: { travellers: Object.fromEntries(forms.map((f) => [f.slot.id, readForm(f.form)])), contact: readForm(contactForm) } });
  const forms = slots.map((s) => {
    const fields = travellerFields(s.type, j.context.service, mode);
    const prefix = uid(s.id);
    const form = el('form', { class: 'c-traveller', novalidate: true, dataset: { traveller: s.id, type: s.type } }, [
      el('div', { class: 'c-traveller__head' }, [el('h2', { class: 'c-traveller__title' }, t(`bk.tr.${s.type}`, s.index)), el('span', { class: 'c-badge c-badge--outline' }, t(`bk.tr.${s.type}.hint`))]),
      el('div', { class: 'c-traveller__grid' }, fields.map((f) => field(f, prefix, saved[s.id]?.[f.id] ?? ''))),
    ]);
    return { slot: s, fields, form };
  });
  const contactPrefix = uid('contact');
  const contactForm = el('form', { class: 'c-traveller c-traveller--contact', novalidate: true, dataset: { contact: '' } }, [
    el('div', { class: 'c-traveller__head' }, [el('h2', { class: 'c-traveller__title' }, t('bk.contact.title'))]),
    el('p', { class: 't-body-sm t-muted' }, t('bk.contact.text')),
    el('div', { class: 'c-traveller__grid' }, CONTACT_FIELDS.map((f) => field(f, contactPrefix, savedContact?.[f.id] ?? ''))),
  ]);
  const status = el('p', { class: 'c-book__status t-body-sm', role: 'status', 'aria-live': 'polite' });
  const submit = el('button', { type: 'button', class: 'c-btn c-btn--primary c-btn--lg' }, [el('span', { class: 'c-btn__label' }, t(mode === 'search' ? 'bk.tr.continue' : 'bk.tr.continueReview')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);

  const mark = (form, fieldId, key) => {
    const control = form.querySelector(`[name="${fieldId}"]`); if (!control) return null;
    const host = control.closest('.c-field'); host.querySelector('.c-field__error')?.remove();
    const id = `${control.id}-error`;
    host.append(el('p', { class: 'c-field__error', id, role: 'alert' }, [icon('no-alert', { size: 'sm' }), el('span', {}, t(key))]));
    control.setAttribute('aria-invalid', 'true'); control.setAttribute('aria-describedby', id);
    return control;
  };
  const clearAll = () => root.querySelectorAll('.c-field__error').forEach((n) => n.remove()) || root.querySelectorAll('[aria-invalid]').forEach((n) => { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
  const validate = () => {
    clearAll(); let first = null; let count = 0;
    const travellers = {};
    for (const { slot, fields, form } of forms) {
      const values = readForm(form); travellers[slot.id] = { type: slot.type, ...values };
      for (const e of validateTraveller(slot.type, values, fields, travelDate)) { const c = mark(form, e.field, e.key); first ??= c; count++; }
    }
    const contact = readForm(contactForm);
    for (const e of validateContact(contact)) { const c = mark(contactForm, e.field, e.key); first ??= c; count++; }
    if (count) { status.textContent = t('bk.tr.fix', count); status.dataset.tone = 'error'; first?.focus(); return null; }
    status.textContent = ''; status.dataset.tone = '';
    return { travellers, contact };
  };
  submit.addEventListener('click', () => {
    const ok = validate(); if (!ok) return;
    setButtonState(submit, 'loading');
    setTravellers(ok.travellers, ok.contact);
    location.assign(stepUrl(mode === 'search' ? 'extras' : 'review'));
  });
  root.querySelectorAll('form').forEach((f) => f.addEventListener('submit', (e) => { e.preventDefault(); submit.click(); }));
  [...forms.map((f) => f.form), contactForm].forEach((f) => f.addEventListener('input', draft));

  // A signed-in customer picks a saved traveller to fill a form (Stage 12). Guests see nothing extra.
  if (isAuthenticated()) customer.travellers().then((saved) => {
    if (!saved.length) return;
    forms.forEach(({ form, fields }) => {
      const id = `${form.dataset.traveller}-pick`;
      const select = el('select', { class: 'c-field__control', id, dataset: { pick: 'traveller' }, onchange: (e) => {
        const tr = saved.find((x) => x.id === e.currentTarget.value); if (!tr) return;
        fields.forEach((f) => { const c = form.querySelector(`[name="${f.id}"]`); if (c && tr[f.id] != null) c.value = tr[f.id]; });
        draft();
      } }, [el('option', { value: '' }, t('acct.trv.pickHint')), ...saved.map((tr) => el('option', { value: tr.id }, `${tr.firstName} ${tr.lastName}`))]);
      form.querySelector('.c-traveller__head').after(el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: id }, t('acct.trv.pick')), select]));
    });
  }).catch(() => {});

  put('main', el('div', { class: 'l-stack l-stack--24' }, [
    el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('bk.tr.title')), el('p', { class: 't-body t-muted' }, `${t('bk.tr.text')} · ${t('bk.tr.count', totalTravellers(j.context.travellers))}`)]),
    ...forms.map((f) => f.form), contactForm, status,
    el('div', { class: 'c-journey__actions' }, [submit, el('a', { class: 'c-btn c-btn--secondary', href: stepUrl(mode === 'search' ? 'search' : 'search') }, t('bk.back'))]),
  ]), root);
  return { forms, validate, submit: () => submit.click(), slots };
}
