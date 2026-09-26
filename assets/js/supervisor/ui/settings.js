/* SUPERVISOR / UI / SETTINGS — the supervisor's own profile, read from supervisorData.profile() (GET /supervisor/me),
   and the fields the backend lets a supervisor change themselves (§21): Arabic and English bio, phone, WhatsApp, city,
   and their password. Name, sign-in email and languages are shown read-only: the administration manages them. Never
   slug, id, status, commission or role — the backend does not accept them on this route (PATCH /supervisor/me ignores
   anything else), so they are not offered as fields. Stage 13, Phase 6 */
import { el } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { icon, toast, setButtonState } from '../../components/ui.js';
import { field } from '../../core/portal-form.js';
import { supervisorData } from '../data.js';
import { changeSupervisorPassword } from '../auth.js';
import { mountSupervisorPortal, loadRegion, pageTitle, block, rows, errorText } from './shell.js';

const textarea = (id, labelKey, value) => el('div', { class: 'c-field', dataset: { field: id } }, [
  el('label', { class: 'c-field__label', for: id }, t(labelKey)),
  el('textarea', { id, class: 'c-field__control', rows: 3, maxlength: 600 }, value ?? ''),
]);
const control = (wrap) => wrap.querySelector('.c-field__control');
const langName = (code) => (['ar', 'en'].includes(code) ? t(`svp.settings.lang.${code}`) : String(code).toUpperCase());

/** Name, sign-in email and languages: what the supervisor sees but the administration changes. */
const accountView = (s) => el('div', { class: 'l-stack l-stack--8' }, [
  rows([
    [t('svp.settings.name'), pick(s, 'name') || '—'],
    [t('svp.settings.email'), s.email ? el('bdi', { dir: 'ltr' }, s.email) : '—'],
    [t('svp.settings.languages'), s.languages?.length ? s.languages.map(langName).join(t('svp.settings.listSep')) : '—'],
  ]),
  el('p', { class: 't-body-sm t-muted' }, t('svp.settings.readonly')),
]);

function profileForm(s, onSaved) {
  const bioAr = textarea('svp-bio', 'svp.settings.bio', s.bioAr);
  const bioEn = textarea('svp-bio-en', 'svp.settings.bioEn', s.bioEn);
  const phone = field({ id: 'svp-phone', name: 'phone', labelKey: 'svp.settings.phone', type: 'tel', value: s.phone ?? '', dir: 'ltr', required: false, autocomplete: 'tel' });
  const whatsapp = field({ id: 'svp-whatsapp', name: 'whatsapp', labelKey: 'svp.settings.whatsapp', type: 'tel', value: s.whatsapp ?? '', dir: 'ltr', required: false });
  const city = field({ id: 'svp-city', name: 'city', labelKey: 'svp.settings.city', value: s.city ?? '', required: false, autocomplete: 'address-level2' });
  const saveBtn = el('button', { type: 'submit', class: 'c-btn c-btn--primary' }, [el('span', { class: 'c-btn__label' }, t('acct.set.save')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
  const err = el('p', { class: 'c-field__error', role: 'alert', hidden: true });
  return el('form', { class: 'l-stack l-stack--16', onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true; setButtonState(saveBtn, 'loading');
    try {
      const saved = await supervisorData.updateProfile({ bioAr: control(bioAr).value, bioEn: control(bioEn).value, phone: control(phone).value, whatsapp: control(whatsapp).value, city: control(city).value });
      toast({ title: t('acct.set.saved'), variant: 'success', duration: 3000 }); setButtonState(saveBtn, 'success'); onSaved?.(saved);
    } catch (error) { err.hidden = false; err.replaceChildren(icon('no-alert', { size: 'sm' }), el('span', {}, errorText(error?.code))); setButtonState(saveBtn, 'error'); }
    setTimeout(() => setButtonState(saveBtn, 'idle'), 1500);
  } }, [bioAr, bioEn, phone, whatsapp, city, err, saveBtn]);
}

function passwordForm() {
  const current = el('input', { id: 'svp-pw-current', class: 'c-field__control', type: 'password', autocomplete: 'current-password', required: true });
  const next = el('input', { id: 'svp-pw-next', class: 'c-field__control', type: 'password', autocomplete: 'new-password', required: true });
  const label = (input, key) => el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: input.id }, t(key)), input]);
  const pwBtn = el('button', { type: 'submit', class: 'c-btn c-btn--secondary' }, [el('span', { class: 'c-btn__label' }, t('acct.set.changePassword')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
  const pwErr = el('p', { class: 'c-field__error', role: 'alert', hidden: true });
  return el('form', { class: 'l-stack l-stack--16', onsubmit: async (e) => {
    e.preventDefault(); pwErr.hidden = true; setButtonState(pwBtn, 'loading');
    try { await changeSupervisorPassword({ current: current.value, next: next.value }); current.value = ''; next.value = ''; toast({ title: t('acct.set.passwordChanged'), variant: 'success', duration: 3000 }); setButtonState(pwBtn, 'success'); }
    catch (error) { pwErr.hidden = false; pwErr.replaceChildren(icon('no-alert', { size: 'sm' }), el('span', {}, errorText(error?.code))); setButtonState(pwBtn, 'error'); }
    setTimeout(() => setButtonState(pwBtn, 'idle'), 1500);
  } }, [label(current, 'auth.field.passwordCurrent'), label(next, 'auth.field.passwordNew'), pwErr, pwBtn]);
}

export function mountSupervisorSettings({ root = document } = {}) {
  return mountSupervisorPortal({ root, id: 'settings', head: 'page.supervisor.settings', paint: async ({ main }) => {
    const accountHost = el('div', { dataset: { region: 'account' } });
    const profileHost = el('div', { dataset: { region: 'profile' } });
    main.replaceChildren(
      pageTitle('svp.settings.title', 'svp.settings.text'),
      block(t('svp.settings.account'), accountHost, { id: 'svp-settings-account' }),
      block(t('svp.settings.profile'), profileHost, { id: 'svp-settings-profile' }),
      block(t('acct.set.password'), passwordForm(), { id: 'svp-settings-password' }),
    );
    // One read of the profile paints both the read-only account details and the editable form.
    const region = loadRegion(profileHost, () => supervisorData.profile(), {
      paint: (s) => { accountHost.replaceChildren(accountView(s)); return profileForm(s, (saved) => saved && accountHost.replaceChildren(accountView(saved))); },
    });
    const supervisor = await region.run();
    return { supervisor, refresh: region.run };
  } });
}
