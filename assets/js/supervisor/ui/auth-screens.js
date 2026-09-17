/* ============================================================================
   SUPERVISOR / UI / AUTH SCREENS — sign in, forgot / reset password, sign
   out. There is no sign-up: supervisor accounts are provisioned by the
   business. Form field/error helpers are the same generic ones the customer
   account screens use (assets/js/account/ui/auth-screens.js) — presentation
   only, no session or customer data crosses between the two systems.
   ========================================================================= */
import { el, render, uid } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon, setButtonState } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { field, applyErrors, setError } from '../../account/ui/auth-screens.js';
import { supervisorAuthProvider, restoreSupervisorSession, adoptSupervisorSession, supervisorSignIn, supervisorSignOut, requestSupervisorReset, resetSupervisorPassword, SupervisorAuthError } from '../auth.js';
import { put, setHead, devNotice } from './shell.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const statusLine = () => el('p', { class: 'c-book__status t-body-sm', role: 'status', 'aria-live': 'polite' });
const submitButton = (labelKey) => el('button', { type: 'submit', class: 'c-btn c-btn--primary c-btn--lg c-btn--block' }, [el('span', { class: 'c-btn__label' }, t(labelKey)), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
const authError = (error) => (error instanceof SupervisorAuthError ? t(`auth.err.${['invalid', 'unavailable', 'invalidToken', 'notConfigured', 'rateLimited'].includes(error.code) ? error.code : 'unavailable'}`) : t('auth.err.unavailable'));
const wrap = (children) => el('div', { class: 'c-auth' }, children);
const safeNext = (value) => { if (!value || /^[a-z]+:|^\/\/|\\|\.\./i.test(value)) return null; return value.startsWith('supervisor/') ? value : null; };

function nextFrom(params) { const n = safeNext(params.get('next')); return n ? route(n) : null; }

/* ---- Sign in ------------------------------------------------------------ */
export async function mountSupervisorSignIn({ root = document, params = new URLSearchParams(location.search) } = {}) {
  setHead('page.supervisor.signIn');
  const next = nextFrom(params) ?? route('supervisor/dashboard/');
  const go = () => location.assign(next);
  const { status: session } = await restoreSupervisorSession();
  if (session === 'supervisor') { go(); return { redirected: true }; }
  const p = uid('svsi'); const status = statusLine(); const submit = submitButton('auth.signIn.action');
  const form = el('form', { class: 'c-auth__form l-stack l-stack--16', novalidate: true, dataset: { form: 'sign-in' } }, [
    field({ id: `${p}-email`, name: 'email', labelKey: 'auth.field.email', type: 'email', autocomplete: 'email', dir: 'ltr', inputmode: 'email' }),
    field({ id: `${p}-password`, name: 'password', labelKey: 'auth.field.password', type: 'password', autocomplete: 'current-password', dir: 'ltr' }),
    el('p', { class: 't-body-sm' }, el('a', { href: route('supervisor/forgot-password/') }, t('auth.signIn.forgot'))),
    status, submit,
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form)); const errors = {};
    if (!v.email) errors.email = t('auth.err.required'); else if (!EMAIL.test(v.email)) errors.email = t('auth.err.email');
    if (!v.password) errors.password = t('auth.err.required');
    if (applyErrors(form, errors, status)) return;
    setButtonState(submit, 'loading'); status.dataset.tone = ''; status.textContent = t('auth.status.signingIn');
    try { await supervisorSignIn({ email: v.email, password: v.password }); form.reset(); go(); }
    catch (error) { setButtonState(submit, 'idle'); form.querySelector('[name=password]').value = ''; status.dataset.tone = 'error'; status.textContent = authError(error); setError(form, 'password', error?.code === 'invalid' ? t('auth.err.invalid') : null); form.querySelector('[name=email]').focus(); }
  });
  const devDemo = supervisorAuthProvider()?.devSignIn ? el('div', { class: 'c-auth__dev' }, [
    el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--block', dataset: { action: 'dev-sign-in' }, onclick: async (e) => { setButtonState(e.currentTarget, 'loading'); try { adoptSupervisorSession(await supervisorAuthProvider().devSignIn()); go(); } catch { setButtonState(e.currentTarget, 'idle'); } } }, t('auth.dev.demo')),
    el('p', { class: 't-body-sm t-muted' }, t('svp.dev.demoHint')),
  ]) : null;
  put('main', wrap([
    el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('svp.auth.signIn.title')), el('p', { class: 't-body t-muted' }, t('svp.auth.signIn.text'))]),
    session === 'expired' ? el('p', { class: 'c-note c-note--warning', role: 'alert' }, [icon('no-expired', { size: 'sm' }), el('span', { class: 'c-note__text' }, t('svp.guard.expired'))]) : null,
    devNotice(), form, devDemo,
  ]), root);
  return { form, submit: () => form.requestSubmit() };
}

/* ---- Forgot password ------------------------------------------------------ */
export async function mountSupervisorForgot({ root = document } = {}) {
  setHead('page.supervisor.forgot');
  const p = uid('svfp'); const status = statusLine(); const submit = submitButton('auth.forgot.action');
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
    try { await requestSupervisorReset(v.email); render(host, stateBlock({ variant: 'success', iconName: 'no-mail', headingLevel: 2, title: t('auth.forgot.sent.title'), text: t('auth.forgot.sent.text'), actions: [{ label: t('auth.forgot.back'), href: route('supervisor/sign-in/'), variant: 'c-btn--primary' }] })); }
    catch (error) { setButtonState(submit, 'idle'); status.dataset.tone = 'error'; status.textContent = authError(error); }
  });
  render(host, [form]);
  put('main', wrap([el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('auth.forgot.title')), el('p', { class: 't-body t-muted' }, t('auth.forgot.text'))]), devNotice(), host]), root);
  return { form };
}

/* ---- Reset password ------------------------------------------------------ */
export async function mountSupervisorReset({ root = document, params = new URLSearchParams(location.search) } = {}) {
  setHead('page.supervisor.reset');
  const token = params.get('token');
  const head = el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('auth.reset.title')), el('p', { class: 't-body t-muted' }, t('auth.reset.text'))]);
  if (!token) { put('main', wrap([head, stateBlock({ variant: 'warning', headingLevel: 2, title: t('auth.reset.missing'), actions: [{ label: t('auth.forgot.title'), href: route('supervisor/forgot-password/'), variant: 'c-btn--primary' }] })]), root); return { form: null }; }
  const p = uid('svrp'); const status = statusLine(); const submit = submitButton('auth.reset.action');
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
    try { await resetSupervisorPassword({ token, password: v.password }); form.reset(); render(host, stateBlock({ variant: 'success', headingLevel: 2, title: t('auth.reset.done.title'), text: t('auth.reset.done.text'), actions: [{ label: t('auth.signIn.action'), href: route('supervisor/sign-in/'), variant: 'c-btn--primary' }] })); }
    catch (error) { setButtonState(submit, 'idle'); form.querySelectorAll('[type=password]').forEach((i) => { i.value = ''; }); status.dataset.tone = 'error'; status.textContent = authError(error); }
  });
  render(host, [form]);
  put('main', wrap([head, devNotice(), host]), root);
  return { form };
}

/* ---- Sign out ------------------------------------------------------------ */
export async function mountSupervisorSignOut({ root = document } = {}) {
  setHead('page.supervisor.signOut');
  put('main', wrap([el('h1', { class: 't-h1' }, t('auth.signOut.title')), el('p', { class: 't-body t-muted', role: 'status' }, t('auth.signOut.working'))]), root);
  await supervisorSignOut();
  put('main', wrap([el('h1', { class: 't-h1' }, t('auth.signOut.title')), stateBlock({ variant: 'success', iconName: 'no-logout', headingLevel: 2, title: t('auth.signOut.text'), actions: [{ label: t('auth.signOut.again'), href: route('supervisor/sign-in/'), variant: 'c-btn--primary' }, { label: t('auth.signOut.home'), href: route('') }] })]), root);
  return { signedOut: true };
}
