/* SUPERVISOR / UI / SETTINGS — only the fields the backend allows a supervisor to change themselves (§21): bio,
   phone, WhatsApp, city, and their password. Never slug, id, status, commission or role — those are not offered as
   fields here because the backend does not accept them on this route (PATCH /supervisor/me silently ignores
   anything else; there is nothing to disable in the UI because there is nothing to submit). Stage 13 */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { icon, toast, setButtonState } from '../../components/ui.js';
import { supervisorData } from '../data.js';
import { changeSupervisorPassword } from '../auth.js';
import { mountSupervisorPortal, pageTitle, block, errorText } from './shell.js';

const field = (label, input) => el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: input.id }, label), input]);

export function mountSupervisorSettings({ root = document } = {}) {
  return mountSupervisorPortal({ root, id: 'settings', head: 'page.supervisor.settings', paint: async ({ supervisor: s, main }) => {
    const bio = el('textarea', { id: 'svp-bio', class: 'c-field__control', rows: 3, maxlength: 600 }, s.bioAr ?? '');
    const phone = el('input', { id: 'svp-phone', class: 'c-field__control', type: 'tel', value: s.phone ?? '', dir: 'ltr' });
    const whatsapp = el('input', { id: 'svp-whatsapp', class: 'c-field__control', type: 'tel', value: s.whatsapp ?? '', dir: 'ltr' });
    const city = el('input', { id: 'svp-city', class: 'c-field__control', type: 'text', value: s.city ?? '' });
    const saveBtn = el('button', { type: 'submit', class: 'c-btn c-btn--primary' }, [el('span', { class: 'c-btn__label' }, t('acct.set.save')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
    const profileErr = el('p', { class: 'c-field__error', role: 'alert', hidden: true });
    const profileForm = el('form', { class: 'l-stack l-stack--16', onsubmit: async (e) => {
      e.preventDefault(); profileErr.hidden = true; setButtonState(saveBtn, 'loading');
      try { await supervisorData.updateProfile({ bioAr: bio.value, phone: phone.value, whatsapp: whatsapp.value, city: city.value }); toast({ title: t('acct.set.saved'), variant: 'success', duration: 3000 }); setButtonState(saveBtn, 'success'); }
      catch (error) { profileErr.hidden = false; profileErr.replaceChildren(icon('no-alert', { size: 'sm' }), el('span', {}, errorText(error?.code))); setButtonState(saveBtn, 'error'); }
      setTimeout(() => setButtonState(saveBtn, 'idle'), 1500);
    } }, [
      field(t('svp.settings.bio'), bio),
      field(t('svp.settings.phone'), phone),
      field(t('svp.settings.whatsapp'), whatsapp),
      field(t('svp.settings.city'), city),
      profileErr, saveBtn,
    ]);

    const current = el('input', { id: 'svp-pw-current', class: 'c-field__control', type: 'password', autocomplete: 'current-password', required: true });
    const next = el('input', { id: 'svp-pw-next', class: 'c-field__control', type: 'password', autocomplete: 'new-password', required: true });
    const pwBtn = el('button', { type: 'submit', class: 'c-btn c-btn--secondary' }, [el('span', { class: 'c-btn__label' }, t('acct.set.changePassword')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
    const pwErr = el('p', { class: 'c-field__error', role: 'alert', hidden: true });
    const pwForm = el('form', { class: 'l-stack l-stack--16', onsubmit: async (e) => {
      e.preventDefault(); pwErr.hidden = true; setButtonState(pwBtn, 'loading');
      try { await changeSupervisorPassword({ current: current.value, next: next.value }); current.value = ''; next.value = ''; toast({ title: t('acct.set.passwordChanged'), variant: 'success', duration: 3000 }); setButtonState(pwBtn, 'success'); }
      catch (error) { pwErr.hidden = false; pwErr.replaceChildren(icon('no-alert', { size: 'sm' }), el('span', {}, errorText(error?.code))); setButtonState(pwBtn, 'error'); }
      setTimeout(() => setButtonState(pwBtn, 'idle'), 1500);
    } }, [field(t('auth.field.passwordCurrent'), current), field(t('auth.field.passwordNew'), next), pwErr, pwBtn]);

    main.replaceChildren(
      pageTitle('svp.settings.title', 'svp.settings.text'),
      block(t('svp.settings.profile'), profileForm, { id: 'svp-settings-profile' }),
      block(t('acct.set.password'), pwForm, { id: 'svp-settings-password' }),
    );
    return { supervisor: s };
  } });
}
