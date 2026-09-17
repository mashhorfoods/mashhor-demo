/* ACCOUNT / UI / SETTINGS — profile, language, password, session. Stage 12 */
import { el, render, uid } from '../../core/dom.js';
import { dateShort } from '../../core/format.js';
import { t, getLocale, setLocale } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon, setButtonState, toast } from '../../components/ui.js';
import { supervisorBySlug } from '../../data/supervisors.js';
import { setSession } from '../../components/session.js';
import { customer } from '../customer.js';
import { changePassword, authProvider } from '../auth.js';
import { mountAccount, block, pageTitle, rows, isAr } from './shell.js';
import { field, applyErrors, clearErrors, setError } from './auth-screens.js';

const PHONE = /^\+?[0-9 ()-]{7,20}$/;

export function mountSettings({ root = document } = {}) {
  return mountAccount({ root, id: 'settings', head: 'page.account.settings', paint: async ({ customer: me, main }) => {
    const p = uid('st');
    const status = el('p', { class: 'c-book__status t-body-sm', role: 'status', 'aria-live': 'polite' });
    const save = el('button', { type: 'submit', class: 'c-btn c-btn--primary' }, [el('span', { class: 'c-btn__label' }, t('acct.set.save')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
    const lang = el('select', { class: 'c-field__control', id: `${p}-locale`, name: 'locale' }, [el('option', { value: 'ar', selected: me.locale === 'ar' }, 'العربية'), el('option', { value: 'en', selected: me.locale === 'en' }, 'English')]);
    const profile = el('form', { class: 'l-stack l-stack--16', novalidate: true, dataset: { form: 'profile' } }, [
      field({ id: `${p}-name`, name: 'name', labelKey: 'auth.field.name', autocomplete: 'name', value: me.name }),
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: `${p}-email` }, t('auth.field.email')), el('input', { class: 'c-field__control', id: `${p}-email`, type: 'email', value: me.email, readonly: true, dir: 'ltr', 'aria-describedby': `${p}-email-help` }), el('p', { class: 'c-field__help', id: `${p}-email-help` }, t('acct.set.emailLocked'))]),
      field({ id: `${p}-phone`, name: 'phone', labelKey: 'auth.field.phone', type: 'tel', autocomplete: 'tel', dir: 'ltr', inputmode: 'tel', required: false, value: me.phone ?? '', help: 'auth.field.phone.help' }),
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: `${p}-locale` }, t('auth.field.language')), lang]),
      el('div', { class: 'c-field' }, [el('span', { class: 'c-field__label' }, t('acct.set.image')), el('p', { class: 't-body-sm t-muted' }, me.image ? '' : t('acct.set.imageNone'))]),
      status, el('div', {}, save),
    ]);
    profile.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(profile)); const errors = {};
      if (!v.name?.trim()) errors.name = t('auth.err.required');
      if (v.phone && !PHONE.test(v.phone)) errors.phone = t('auth.err.phone');
      if (applyErrors(profile, errors, status)) return;
      setButtonState(save, 'loading'); status.dataset.tone = ''; status.textContent = t('auth.status.saving');
      try {
        const updated = await customer.updateProfile({ name: v.name, phone: v.phone, locale: v.locale });
        setSession({ name: updated.name }); status.textContent = t('acct.set.saved'); toast({ title: t('acct.set.saved'), variant: 'success' });
        if (v.locale !== getLocale()) await setLocale(v.locale);
      } catch { status.dataset.tone = 'error'; status.textContent = t('acct.state.error.text'); }
      setButtonState(save, 'idle');
    });

    const pwStatus = el('p', { class: 'c-book__status t-body-sm', role: 'status', 'aria-live': 'polite' });
    const pwSave = el('button', { type: 'submit', class: 'c-btn c-btn--secondary' }, [el('span', { class: 'c-btn__label' }, t('acct.set.changePassword')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
    const pw = el('form', { class: 'l-stack l-stack--16', novalidate: true, dataset: { form: 'password' } }, [
      field({ id: `${p}-current`, name: 'current', labelKey: 'auth.field.passwordCurrent', type: 'password', autocomplete: 'current-password', dir: 'ltr', required: false }),
      field({ id: `${p}-next`, name: 'next', labelKey: 'auth.field.passwordNew', type: 'password', autocomplete: 'new-password', dir: 'ltr', help: 'auth.field.password.help' }),
      field({ id: `${p}-confirm`, name: 'confirm', labelKey: 'auth.field.passwordConfirm', type: 'password', autocomplete: 'new-password', dir: 'ltr' }),
      pwStatus, el('div', {}, pwSave),
    ]);
    pw.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(pw)); const errors = {};
      if (!v.next) errors.next = t('auth.err.required'); else if (v.next.length < 8) errors.next = t('auth.err.password');
      if (v.confirm !== v.next) errors.confirm = t('auth.err.confirm');
      if (applyErrors(pw, errors, pwStatus)) return;
      setButtonState(pwSave, 'loading'); pwStatus.dataset.tone = ''; pwStatus.textContent = t('auth.status.saving');
      try { await changePassword({ current: v.current, next: v.next }); pw.reset(); pwStatus.textContent = t('acct.set.passwordChanged'); toast({ title: t('acct.set.passwordChanged'), variant: 'success' }); }
      catch (error) { pwStatus.dataset.tone = 'error'; pwStatus.textContent = error?.code === 'invalid' ? t('auth.err.invalid') : t('auth.err.unavailable'); if (error?.code === 'invalid') setError(pw, 'current', t('auth.err.invalid')); }
      setButtonState(pwSave, 'idle');
    });

    const sup = me.supervisorId ? supervisorBySlug(me.supervisorId) : null;
    render(main, [
      pageTitle('acct.set.title', 'acct.set.text'),
      el('div', { class: 'c-acct-grid' }, [
        block(t('acct.set.profile'), profile, { id: 'set-profile' }),
        el('div', { class: 'l-stack l-stack--16' }, [
          block(t('acct.set.password'), pw, { id: 'set-password' }),
          sup ? block(t('acct.supervisor'), el('div', { class: 'l-stack l-stack--8' }, [rows([[t('acct.supervisor'), el('a', { href: route(`supervisor/${sup.slug}/`) }, t('sup.name.fallback'))]]), el('p', { class: 't-body-sm t-muted' }, t('acct.supervisor.locked'))]), { id: 'set-supervisor' }) : null,
          block(t('acct.set.acceptance'), me.acceptance?.at ? rows([[t('acct.set.acceptedOn'), `${dateShort(me.acceptance.at)}${me.acceptance.terms?.version ? ` · ${t('legal.version')} ${me.acceptance.terms.version}` : ''}`], [t('legal.terms.title'), el('a', { href: route('legal/terms/') }, t('legal.terms.title'))], [t('legal.privacy.title'), el('a', { href: route('legal/privacy/') }, t('legal.privacy.title'))]]) : el('div', { class: 'l-stack l-stack--8' }, [el('p', { class: 't-body-sm t-muted' }, t('acct.set.acceptanceNone')), el('p', { class: 't-body-sm' }, [el('a', { href: route('legal/terms/') }, t('legal.terms.title')), ' · ', el('a', { href: route('legal/privacy/') }, t('legal.privacy.title'))])]), { id: 'set-acceptance' }),
          block(t('acct.set.session'), el('div', { class: 'l-stack l-stack--12' }, [el('p', { class: 't-body-sm t-muted' }, t('acct.set.signOutText')), el('a', { class: 'c-btn c-btn--secondary', href: route('account/sign-out/'), dataset: { action: 'sign-out' } }, [icon('no-logout', { size: 'sm' }), el('span', {}, t('acct.set.signOut'))]), el('p', { class: 't-body-sm t-muted c-acct-inline' }, [icon('no-shield', { size: 'sm' }), t('acct.set.privacy')])]), { id: 'set-session' }),
        ]),
      ]),
    ]);
    return { profile, password: pw };
  } });
}
