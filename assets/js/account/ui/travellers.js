/* ACCOUNT / UI / TRAVELLERS — saved traveller profiles: list, add, edit, delete. Stage 12 */
import { el, render, uid, lockScroll, unlockScroll, trapFocus } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { dateShort } from '../../core/format.js';
import { icon, setButtonState, toast } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { travellerFields, validateTraveller, NATIONALITIES } from '../../booking/travellers.js';
import { customer } from '../customer.js';
import { mountAccount, loadRegion, pageTitle, isAr } from './shell.js';
import { specField, applyErrors, statusLine } from '../../core/portal-form.js';

const FIELDS = () => travellerFields('adult', 'flights');   // names, birth date, gender, nationality, passport, expiry — nothing more
export const maskPassport = (p) => (p ? `•••• ${String(p).slice(-3)}` : '');
const nationality = (code) => { const n = NATIONALITIES.find((x) => x.value === code); return n ? (isAr() ? n.labelAr : n.labelEn) : code; };

/** The add/edit dialog. Resolves with the saved record or null. */
export function travellerDialog(existing = null) {
  return new Promise((resolve) => {
    const prefix = uid('trv'); const fields = FIELDS();
    const form = el('form', { class: 'c-modal__form', method: 'dialog', novalidate: true, dataset: { form: 'traveller' } });
    const status = statusLine();
    const save = el('button', { type: 'submit', class: 'c-btn c-btn--primary' }, [el('span', { class: 'c-btn__label' }, t('acct.trv.save')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
    const dialog = el('dialog', { class: 'c-modal', 'aria-labelledby': `${prefix}-title`, dataset: { dialog: 'traveller' } }, form);
    render(form, [
      el('div', { class: 'c-modal__head' }, [el('h2', { class: 't-h3', id: `${prefix}-title` }, t(existing ? 'acct.trv.dialogTitle.edit' : 'acct.trv.dialogTitle.add')), el('button', { type: 'button', class: 'c-btn c-btn--utility', 'aria-label': t('acct.trv.cancel'), onclick: () => dialog.close('cancel') }, icon('no-close'))]),
      el('div', { class: 'c-modal__body' }, [el('div', { class: 'c-traveller__grid' }, fields.map((f) => specField(f, prefix, existing?.[f.id] ?? ''))), el('p', { class: 't-body-sm t-muted' }, t('acct.trv.privacy')), status]),
      el('div', { class: 'c-modal__foot' }, [el('button', { type: 'button', class: 'c-btn c-btn--secondary', onclick: () => dialog.close('cancel') }, t('acct.trv.cancel')), save]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const errors = validateTraveller('adult', values, fields, new Date().toISOString().slice(0, 10)).filter((x) => x.key !== 'bk.err.adultAge');
      if (applyErrors(form, Object.fromEntries(errors.map((er) => [er.field, t(er.key)])), status)) return;
      setButtonState(save, 'loading'); status.dataset.tone = ''; status.textContent = t('auth.status.saving');
      try { const rec = await customer.saveTraveller({ ...(existing ?? {}), ...values }); dialog.close('saved'); resolve(rec); }
      catch { setButtonState(save, 'idle'); status.dataset.tone = 'error'; status.textContent = t('acct.state.error.text'); }
    });
    dialog.addEventListener('close', () => { unlockScroll(); dialog.remove(); if (dialog.returnValue !== 'saved') resolve(null); });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close('cancel'); });
    document.body.append(dialog); dialog.showModal(); lockScroll(); const release = trapFocus(dialog); dialog.addEventListener('close', () => release?.());
    form.querySelector('.c-field__control')?.focus();
  });
}

const card = (tr, { onEdit, onDelete }) => el('article', { class: 'c-card c-acct-trv', dataset: { traveller: tr.id } }, [
  el('div', { class: 'c-acct-trv__avatar', 'aria-hidden': 'true' }, `${tr.firstName?.[0] ?? ''}${tr.lastName?.[0] ?? ''}`.toUpperCase()),
  el('div', { class: 'c-acct-trv__body' }, [
    el('h3', { class: 'c-acct-trv__name' }, el('bdi', {}, `${tr.firstName} ${tr.lastName}`)),
    el('p', { class: 't-body-sm t-muted' }, [dateShort(tr.dob), ' · ', nationality(tr.nationality), tr.passport ? [' · ', t('acct.trv.passportMasked'), ' ', el('bdi', { dir: 'ltr' }, maskPassport(tr.passport))] : null].flat()),
  ]),
  el('div', { class: 'c-acct-trv__actions' }, [
    el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--sm', dataset: { action: 'edit' }, onclick: onEdit }, t('acct.trv.edit')),
    el('button', { type: 'button', class: 'c-btn c-btn--tertiary c-btn--sm', dataset: { action: 'delete' }, onclick: onDelete }, t('acct.trv.delete')),
  ]),
]);

export function mountTravellers({ root = document } = {}) {
  return mountAccount({ root, id: 'travelers', head: 'page.account.travellers', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'travellers' } });
    const add = el('button', { type: 'button', class: 'c-btn c-btn--primary', dataset: { action: 'add' } }, [icon('no-plus', { size: 'sm' }), el('span', {}, t('acct.trv.add'))]);
    main.replaceChildren(el('div', { class: 'c-acct-trip__head' }, [pageTitle('acct.trv.title', 'acct.trv.text'), add]), host);
    const region = loadRegion(host, () => customer.travellers(), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-users', headingLevel: 2, title: t('acct.trv.empty.title'), text: t('acct.trv.empty.text'), actions: [{ id: 'add', label: t('acct.trv.add'), variant: 'c-btn--primary', onClick: () => add.click() }] }),
      paint: (list) => el('div', { class: 'c-acct-list' }, list.map((tr) => card(tr, {
        onEdit: async () => { const saved = await travellerDialog(tr); if (saved) { toast({ title: t('acct.trv.saved'), variant: 'success' }); region.run(); } },
        onDelete: async () => { if (!confirm(t('acct.trv.deleteConfirm'))) return; try { await customer.deleteTraveller(tr.id); toast({ title: t('acct.trv.deleted'), variant: 'success' }); region.run(); } catch { toast({ title: t('acct.state.error.title'), variant: 'error' }); } },
      }))),
    });
    add.addEventListener('click', async () => { const saved = await travellerDialog(); if (saved) { toast({ title: t('acct.trv.saved'), variant: 'success' }); region.run(); } });
    await region.run();
    return { refresh: region.run, add: () => add.click() };
  } });
}
