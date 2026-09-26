/* ============================================================================
   CORE / PORTAL AUTH SCREENS — sign in, forgot / reset password and sign out
   for the two staff portals (supervisor/ and admin/). There is no sign-up:
   supervisor and staff accounts are provisioned by the business. Each portal
   builds its screens once from its own session functions, error class and
   shell, so no session or data crosses between the portals. The field and
   error helpers are the ones the customer account uses (core/portal-form.js).
   ========================================================================= */
import { el, render, uid } from './dom.js';
import { t } from './i18n.js';
import { route } from '../data/config.js';
import { safeNext } from '../account/auth.js';
import { icon, setButtonState } from '../components/ui.js';
import { stateBlock } from '../components/states.js';
import { field, applyErrors, setError, statusLine, submitButton } from './portal-form.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const wrap = (children) => el('div', { class: 'c-auth' }, children);

/**
 * @param {object} o
 * @param {string}   o.area       the portal's route prefix: 'admin/' | 'supervisor/'
 * @param {string}   o.page       page.* key segment: 'ops' | 'supervisor'
 * @param {string}   o.i18n       the portal's string prefix: 'ops' | 'svp'
 * @param {string}   o.seed       uid seed prefix: 'op' | 'sv'
 * @param {string}   o.entity     the signed-in status restore() answers: 'staff' | 'supervisor'
 * @param {function} o.ErrorClass the portal's auth error class
 * @param {object}   o.auth       { provider, restore, adopt, signIn, signOut, requestReset, resetPassword }
 * @param {object}   o.shell      { put, setHead, devNotice }
 */
export function createPortalAuthScreens({ area, page, i18n, seed, entity, ErrorClass, auth, shell: { put, setHead, devNotice } }) {
  const authError = (error) => (error instanceof ErrorClass ? t(`auth.err.${['invalid', 'unavailable', 'invalidToken', 'notConfigured', 'rateLimited'].includes(error.code) ? error.code : 'unavailable'}`) : t('auth.err.unavailable'));
  // Only a path inside this portal is followed after sign-in (account/auth.js safeNext: no scheme, host or traversal).
  const nextFrom = (params) => safeNext(params.get('next'), area);

  async function mountSignIn({ root = document, params = new URLSearchParams(location.search) } = {}) {
    setHead(`page.${page}.signIn`);
    const next = nextFrom(params) ?? route(`${area}dashboard/`);
    const go = () => location.assign(next);
    const { status: session } = await auth.restore();
    if (session === entity) { go(); return { redirected: true }; }
    const p = uid(`${seed}si`); const status = statusLine(); const submit = submitButton('auth.signIn.action');
    const form = el('form', { class: 'c-auth__form l-stack l-stack--16', novalidate: true, dataset: { form: 'sign-in' } }, [
      field({ id: `${p}-email`, name: 'email', labelKey: 'auth.field.email', type: 'email', autocomplete: 'email', dir: 'ltr', inputmode: 'email' }),
      field({ id: `${p}-password`, name: 'password', labelKey: 'auth.field.password', type: 'password', autocomplete: 'current-password', dir: 'ltr' }),
      el('p', { class: 't-body-sm' }, el('a', { href: route(`${area}forgot-password/`) }, t('auth.signIn.forgot'))),
      status, submit,
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form)); const errors = {};
      if (!v.email) errors.email = t('auth.err.required'); else if (!EMAIL.test(v.email)) errors.email = t('auth.err.email');
      if (!v.password) errors.password = t('auth.err.required');
      if (applyErrors(form, errors, status)) return;
      setButtonState(submit, 'loading'); status.dataset.tone = ''; status.textContent = t('auth.status.signingIn');
      try { await auth.signIn({ email: v.email, password: v.password }); form.reset(); go(); }
      catch (error) { setButtonState(submit, 'idle'); form.querySelector('[name=password]').value = ''; status.dataset.tone = 'error'; status.textContent = authError(error); setError(form, 'password', error?.code === 'invalid' ? t('auth.err.invalid') : null); form.querySelector('[name=email]').focus(); }
    });
    const devDemo = auth.provider()?.devSignIn ? el('div', { class: 'c-auth__dev' }, [
      el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--block', dataset: { action: 'dev-sign-in' }, onclick: async (e) => { setButtonState(e.currentTarget, 'loading'); try { auth.adopt(await auth.provider().devSignIn()); go(); } catch { setButtonState(e.currentTarget, 'idle'); } } }, t('auth.dev.demo')),
      el('p', { class: 't-body-sm t-muted' }, t(`${i18n}.dev.demoHint`)),
    ]) : null;
    put('main', wrap([
      el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t(`${i18n}.auth.signIn.title`)), el('p', { class: 't-body t-muted' }, t(`${i18n}.auth.signIn.text`))]),
      session === 'expired' ? el('p', { class: 'c-note c-note--warning', role: 'alert' }, [icon('no-expired', { size: 'sm' }), el('span', { class: 'c-note__text' }, t(`${i18n}.guard.expired`))]) : null,
      devNotice(), form, devDemo,
    ]), root);
    return { form, submit: () => form.requestSubmit() };
  }

  async function mountForgot({ root = document } = {}) {
    setHead(`page.${page}.forgot`);
    const p = uid(`${seed}fp`); const status = statusLine(); const submit = submitButton('auth.forgot.action');
    const host = el('div', { class: 'l-stack l-stack--16' });
    const form = el('form', { class: 'c-auth__form l-stack l-stack--16', novalidate: true, dataset: { form: 'forgot' } }, [
      field({ id: `${p}-email`, name: 'email', labelKey: 'auth.field.email', type: 'email', autocomplete: 'email', dir: 'ltr', inputmode: 'email' }), status, submit,
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form)); const errors = {};
      if (!v.email) errors.email = t('auth.err.required'); else if (!EMAIL.test(v.email)) errors.email = t('auth.err.email');
      if (applyErrors(form, errors, status)) return;
      setButtonState(submit, 'loading'); status.dataset.tone = ''; status.textContent = t('auth.status.saving');
      try { await auth.requestReset(v.email); render(host, stateBlock({ variant: 'success', iconName: 'no-mail', headingLevel: 2, title: t('auth.forgot.sent.title'), text: t('auth.forgot.sent.text'), actions: [{ label: t('auth.forgot.back'), href: route(`${area}sign-in/`), variant: 'c-btn--primary' }] })); }
      catch (error) { setButtonState(submit, 'idle'); status.dataset.tone = 'error'; status.textContent = authError(error); }
    });
    render(host, [form]);
    put('main', wrap([el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('auth.forgot.title')), el('p', { class: 't-body t-muted' }, t('auth.forgot.text'))]), devNotice(), host]), root);
    return { form };
  }

  async function mountReset({ root = document, params = new URLSearchParams(location.search) } = {}) {
    setHead(`page.${page}.reset`);
    const token = params.get('token');
    const head = el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('auth.reset.title')), el('p', { class: 't-body t-muted' }, t('auth.reset.text'))]);
    if (!token) { put('main', wrap([head, stateBlock({ variant: 'warning', headingLevel: 2, title: t('auth.reset.missing'), actions: [{ label: t('auth.forgot.title'), href: route(`${area}forgot-password/`), variant: 'c-btn--primary' }] })]), root); return { form: null }; }
    const p = uid(`${seed}rp`); const status = statusLine(); const submit = submitButton('auth.reset.action');
    const host = el('div', { class: 'l-stack l-stack--16' });
    const form = el('form', { class: 'c-auth__form l-stack l-stack--16', novalidate: true, dataset: { form: 'reset' } }, [
      field({ id: `${p}-password`, name: 'password', labelKey: 'auth.field.passwordNew', type: 'password', autocomplete: 'new-password', dir: 'ltr', help: 'auth.field.password.help' }),
      field({ id: `${p}-confirm`, name: 'confirm', labelKey: 'auth.field.passwordConfirm', type: 'password', autocomplete: 'new-password', dir: 'ltr' }), status, submit,
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form)); const errors = {};
      if (!v.password) errors.password = t('auth.err.required'); else if (v.password.length < 8) errors.password = t('auth.err.password');
      if (v.confirm !== v.password) errors.confirm = t('auth.err.confirm');
      if (applyErrors(form, errors, status)) return;
      setButtonState(submit, 'loading'); status.dataset.tone = ''; status.textContent = t('auth.status.saving');
      try { await auth.resetPassword({ token, password: v.password }); form.reset(); render(host, stateBlock({ variant: 'success', headingLevel: 2, title: t('auth.reset.done.title'), text: t('auth.reset.done.text'), actions: [{ label: t('auth.signIn.action'), href: route(`${area}sign-in/`), variant: 'c-btn--primary' }] })); }
      catch (error) { setButtonState(submit, 'idle'); form.querySelectorAll('[type=password]').forEach((i) => { i.value = ''; }); status.dataset.tone = 'error'; status.textContent = authError(error); }
    });
    render(host, [form]);
    put('main', wrap([head, devNotice(), host]), root);
    return { form };
  }

  async function mountSignOut({ root = document } = {}) {
    setHead(`page.${page}.signOut`);
    put('main', wrap([el('h1', { class: 't-h1' }, t('auth.signOut.title')), el('p', { class: 't-body t-muted', role: 'status' }, t('auth.signOut.working'))]), root);
    await auth.signOut();
    put('main', wrap([el('h1', { class: 't-h1' }, t('auth.signOut.title')), stateBlock({ variant: 'success', iconName: 'no-logout', headingLevel: 2, title: t('auth.signOut.text'), actions: [{ label: t('auth.signOut.again'), href: route(`${area}sign-in/`), variant: 'c-btn--primary' }, { label: t('auth.signOut.home'), href: route('') }] })]), root);
    return { signedOut: true };
  }

  return { mountSignIn, mountForgot, mountReset, mountSignOut };
}
