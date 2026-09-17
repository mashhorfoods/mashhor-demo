/* ============================================================================
   ACCOUNT / UI / AUTH SCREENS — sign in, sign up, forgot, reset, sign out.

   Forms validate on the client for immediacy; the provider decides. Nothing
   here stores a password; the fields are cleared after every attempt. The
   development notice shows while the development provider is registered.
   ========================================================================= */

import { el, qs, render, uid, setPageHead } from '../../core/dom.js';
import { t, getLocale, setLocale } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon, setButtonState } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { loadAttribution } from '../../core/booking.js';
import { supervisorBySlug } from '../../data/supervisors.js';
import { authProvider, restoreSession, adoptSession, signIn, signUp, signOut, requestReset, resetPassword, nextFrom, AuthError } from '../auth.js';
import { put, isAr } from './shell.js';

const setHead = (key) => setPageHead({ title: t(key), description: t('page.account.description') });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

export const devNotice = () => (authProvider()?.dev ? el('p', { class: 'c-note c-note--warning', role: 'note', dataset: { dev: 'true' } }, [icon('no-alert', { size: 'sm' }), el('span', { class: 'c-note__text' }, [el('strong', {}, `${t('auth.dev.title')}: `), t('auth.dev.text')])]) : null);

/** One labelled field with an error slot; `password` fields get a show/hide toggle. */
export function field({ id, name, labelKey, type = 'text', autocomplete, help, required = true, value = '', dir = null, inputmode = null }) {
  const errId = `${id}-err`;
  const input = el('input', { class: 'c-field__control', id, name, type, value, required, autocomplete, ...(dir ? { dir } : {}), ...(inputmode ? { inputmode } : {}), 'aria-describedby': help ? `${id}-help` : null });
  const toggle = type === 'password' ? el('button', { type: 'button', class: 'c-btn c-btn--tertiary c-btn--sm c-auth__toggle', 'aria-pressed': 'false', 'aria-controls': id, onclick: (e) => { const show = input.type === 'password'; input.type = show ? 'text' : 'password'; e.currentTarget.setAttribute('aria-pressed', String(show)); e.currentTarget.textContent = t(show ? 'auth.hide' : 'auth.show'); } }, t('auth.show')) : null;
  return el('div', { class: 'c-field', dataset: { field: name } }, [
    el('label', { class: 'c-field__label', for: id }, [t(labelKey), required ? el('span', { class: 'c-field__required', 'aria-hidden': 'true' }, '*') : null]),
    toggle ? el('div', { class: 'c-auth__pw' }, [input, toggle]) : input,
    help ? el('p', { class: 'c-field__help', id: `${id}-help` }, t(help)) : null,
    el('p', { class: 'c-field__error', id: errId, role: 'alert', hidden: true }),
  ]);
}
export function setError(form, name, message) {
  const f = qs(`[data-field="${name}"]`, form); if (!f) return null;
  const c = qs('.c-field__control', f); const e = qs('.c-field__error', f);
  if (message) { f.dataset.state = 'error'; c.setAttribute('aria-invalid', 'true'); c.setAttribute('aria-describedby', `${c.getAttribute('aria-describedby') ?? ''} ${e.id}`.trim()); e.hidden = false; e.replaceChildren(icon('no-alert', { size: 'sm' }), el('span', {}, message)); }
  else { delete f.dataset.state; c.removeAttribute('aria-invalid'); e.hidden = true; e.replaceChildren(); }
  return c;
}
export const clearErrors = (form) => form.querySelectorAll('[data-field]').forEach((f) => setError(form, f.dataset.field, null));
export function applyErrors(form, errors, status) {
  clearErrors(form); let first = null;
  for (const [name, message] of Object.entries(errors)) { const c = setError(form, name, message); first ??= c; }
  first?.focus();
  if (status) { status.dataset.tone = 'error'; status.textContent = t('book.status.fix', Object.keys(errors).length); }
  return !!first;
}
const statusLine = () => el('p', { class: 'c-book__status t-body-sm', role: 'status', 'aria-live': 'polite' });
const submitButton = (labelKey) => el('button', { type: 'submit', class: 'c-btn c-btn--primary c-btn--lg c-btn--block' }, [el('span', { class: 'c-btn__label' }, t(labelKey)), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
const authError = (error) => (error instanceof AuthError ? t(`auth.err.${['invalid', 'exists', 'unavailable', 'invalidToken', 'weak'].includes(error.code) ? (error.code === 'weak' ? 'password' : error.code) : 'unavailable'}`) : t('auth.err.unavailable'));
const wrap = (children) => el('div', { class: 'c-auth' }, children);
const devDemoButton = (after) => (authProvider()?.devSignIn ? el('div', { class: 'c-auth__dev' }, [
  el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--block', dataset: { action: 'dev-sign-in' }, onclick: async (e) => { setButtonState(e.currentTarget, 'loading'); try { adoptSession(await authProvider().devSignIn()); after(); } catch { setButtonState(e.currentTarget, 'idle'); } } }, t('auth.dev.demo')),
  el('p', { class: 't-body-sm t-muted' }, t('auth.dev.demoHint')),
]) : null);

/* ---- Sign in ---------------------------------------------------------- */
export async function mountSignIn({ root = document, params = new URLSearchParams(location.search) } = {}) {
  setHead('page.account.signIn');
  const next = nextFrom(params) ?? route('account/');
  const go = () => location.assign(next);
  const { status: session } = await restoreSession();
  if (session === 'customer') { go(); return { redirected: true }; }
  const p = uid('si'); const status = statusLine(); const submit = submitButton('auth.signIn.action');
  const form = el('form', { class: 'c-auth__form l-stack l-stack--16', novalidate: true, dataset: { form: 'sign-in' } }, [
    field({ id: `${p}-email`, name: 'email', labelKey: 'auth.field.email', type: 'email', autocomplete: 'email', dir: 'ltr', inputmode: 'email' }),
    field({ id: `${p}-password`, name: 'password', labelKey: 'auth.field.password', type: 'password', autocomplete: 'current-password', dir: 'ltr' }),
    el('p', { class: 't-body-sm' }, el('a', { href: route('account/forgot-password/') }, t('auth.signIn.forgot'))),
    status, submit,
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form)); const errors = {};
    if (!v.email) errors.email = t('auth.err.required'); else if (!EMAIL.test(v.email)) errors.email = t('auth.err.email');
    if (!v.password) errors.password = t('auth.err.required');
    if (applyErrors(form, errors, status)) return;
    setButtonState(submit, 'loading'); status.dataset.tone = ''; status.textContent = t('auth.status.signingIn');
    try { await signIn({ email: v.email, password: v.password }); form.reset(); go(); }
    catch (error) { setButtonState(submit, 'idle'); form.querySelector('[name=password]').value = ''; status.dataset.tone = 'error'; status.textContent = authError(error); setError(form, 'password', error?.code === 'invalid' ? t('auth.err.invalid') : null); form.querySelector('[name=email]').focus(); }
  });
  put('main', wrap([
    el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('auth.signIn.title')), el('p', { class: 't-body t-muted' }, t('auth.signIn.text')), params.get('next') ? el('p', { class: 't-body-sm t-muted', dataset: { next: 'true' } }, [icon('no-info', { size: 'sm' }), ' ', t('auth.signIn.continueNote')]) : null]),
    session === 'expired' ? el('p', { class: 'c-note c-note--warning', role: 'alert' }, [icon('no-expired', { size: 'sm' }), el('span', { class: 'c-note__text' }, t('auth.guard.expired'))]) : null,
    devNotice(), form,
    el('p', { class: 't-body-sm' }, [t('auth.signIn.noAccount'), ' ', el('a', { href: route('account/sign-up/') + (params.get('next') ? `?next=${encodeURIComponent(next)}` : '') }, t('auth.signIn.create'))]),
    devDemoButton(go),
  ]), root);
  return { form, submit: () => form.requestSubmit() };
}

/* ---- Sign up ---------------------------------------------------------- */
export async function mountSignUp({ root = document, params = new URLSearchParams(location.search) } = {}) {
  setHead('page.account.signUp');
  const next = nextFrom(params) ?? route('account/');
  const go = () => location.assign(next);
  const { status: session } = await restoreSession();
  if (session === 'customer') { go(); return { redirected: true }; }
  const attribution = loadAttribution(); const sup = attribution?.supervisor ? supervisorBySlug(attribution.supervisor) : null;
  const p = uid('su'); const status = statusLine(); const submit = submitButton('auth.signUp.action');
  const form = el('form', { class: 'c-auth__form l-stack l-stack--16', novalidate: true, dataset: { form: 'sign-up' } }, [
    field({ id: `${p}-name`, name: 'name', labelKey: 'auth.field.name', autocomplete: 'name' }),
    field({ id: `${p}-email`, name: 'email', labelKey: 'auth.field.email', type: 'email', autocomplete: 'email', dir: 'ltr', inputmode: 'email' }),
    field({ id: `${p}-phone`, name: 'phone', labelKey: 'auth.field.phone', type: 'tel', autocomplete: 'tel', dir: 'ltr', inputmode: 'tel', required: false, help: 'auth.field.phone.help' }),
    field({ id: `${p}-password`, name: 'password', labelKey: 'auth.field.password', type: 'password', autocomplete: 'new-password', dir: 'ltr', help: 'auth.field.password.help' }),
    field({ id: `${p}-confirm`, name: 'confirm', labelKey: 'auth.field.passwordConfirm', type: 'password', autocomplete: 'new-password', dir: 'ltr' }),
    sup ? el('p', { class: 'c-note', role: 'note', dataset: { attributed: sup.slug } }, [icon('no-supervisor', { size: 'sm' }), el('span', { class: 'c-note__text' }, t('auth.signUp.supervisor'))]) : null,
    el('p', { class: 't-body-sm t-muted' }, t('auth.signUp.terms')),
    status, submit,
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form)); const errors = {};
    if (!v.name?.trim()) errors.name = t('auth.err.required');
    if (!v.email) errors.email = t('auth.err.required'); else if (!EMAIL.test(v.email)) errors.email = t('auth.err.email');
    if (v.phone && !PHONE.test(v.phone)) errors.phone = t('auth.err.phone');
    if (!v.password) errors.password = t('auth.err.required'); else if (v.password.length < 8) errors.password = t('auth.err.password');
    if (v.confirm !== v.password) errors.confirm = t('auth.err.confirm');
    if (applyErrors(form, errors, status)) return;
    setButtonState(submit, 'loading'); status.dataset.tone = ''; status.textContent = t('auth.status.creating');
    try { await signUp({ name: v.name, email: v.email, phone: v.phone, password: v.password, locale: getLocale(), supervisorId: sup?.slug ?? null }); form.reset(); go(); }
    catch (error) { setButtonState(submit, 'idle'); form.querySelectorAll('[type=password]').forEach((i) => { i.value = ''; }); status.dataset.tone = 'error'; status.textContent = authError(error); if (error?.code === 'exists') setError(form, 'email', t('auth.err.exists')); form.querySelector('[name=email]').focus(); }
  });
  put('main', wrap([
    el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('auth.signUp.title')), el('p', { class: 't-body t-muted' }, t('auth.signUp.text'))]),
    devNotice(), form,
    el('p', { class: 't-body-sm' }, [t('auth.signUp.haveAccount'), ' ', el('a', { href: route('account/sign-in/') + (params.get('next') ? `?next=${encodeURIComponent(next)}` : '') }, t('auth.signIn.action'))]),
  ]), root);
  return { form, submit: () => form.requestSubmit() };
}

/* ---- Forgot password -------------------------------------------------- */
export async function mountForgot({ root = document } = {}) {
  setHead('page.account.forgot');
  const p = uid('fp'); const status = statusLine(); const submit = submitButton('auth.forgot.action');
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
    try {
      const r = await requestReset(v.email);
      render(host, [stateBlock({ variant: 'success', iconName: 'no-mail', headingLevel: 2, title: t('auth.forgot.sent.title'), text: t('auth.forgot.sent.text'), actions: [{ label: t('auth.forgot.back'), href: route('account/sign-in/'), variant: 'c-btn--primary' }] }),
        r.devLink ? el('p', { class: 'c-note c-note--warning', dataset: { dev: 'true' } }, [icon('no-alert', { size: 'sm' }), el('span', { class: 'c-note__text' }, [t('auth.forgot.devLink'), ' ', el('a', { href: route(r.devLink), dataset: { devReset: '' } }, el('bdi', { dir: 'ltr' }, route(r.devLink)))])]) : null]);
    } catch (error) { setButtonState(submit, 'idle'); status.dataset.tone = 'error'; status.textContent = authError(error); }
  });
  render(host, [form]);
  put('main', wrap([el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('auth.forgot.title')), el('p', { class: 't-body t-muted' }, t('auth.forgot.text'))]), devNotice(), host]), root);
  return { form };
}

/* ---- Reset password --------------------------------------------------- */
export async function mountReset({ root = document, params = new URLSearchParams(location.search) } = {}) {
  setHead('page.account.reset');
  const token = params.get('token');
  const head = el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('auth.reset.title')), el('p', { class: 't-body t-muted' }, t('auth.reset.text'))]);
  if (!token) { put('main', wrap([head, stateBlock({ variant: 'warning', headingLevel: 2, title: t('auth.reset.missing'), actions: [{ label: t('auth.forgot.title'), href: route('account/forgot-password/'), variant: 'c-btn--primary' }] })]), root); return { form: null }; }
  const p = uid('rp'); const status = statusLine(); const submit = submitButton('auth.reset.action');
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
    try { await resetPassword({ token, password: v.password }); form.reset(); render(host, stateBlock({ variant: 'success', headingLevel: 2, title: t('auth.reset.done.title'), text: t('auth.reset.done.text'), actions: [{ label: t('auth.signIn.action'), href: route('account/sign-in/'), variant: 'c-btn--primary' }] })); }
    catch (error) { setButtonState(submit, 'idle'); form.querySelectorAll('[type=password]').forEach((i) => { i.value = ''; }); status.dataset.tone = 'error'; status.textContent = authError(error); }
  });
  render(host, [form]);
  put('main', wrap([head, devNotice(), host]), root);
  return { form };
}

/* ---- Sign out --------------------------------------------------------- */
export async function mountSignOut({ root = document } = {}) {
  setHead('page.account.signOut');
  put('main', wrap([el('h1', { class: 't-h1' }, t('auth.signOut.title')), el('p', { class: 't-body t-muted', role: 'status' }, t('auth.signOut.working'))]), root);
  await signOut();
  put('main', wrap([el('h1', { class: 't-h1' }, t('auth.signOut.title')), stateBlock({ variant: 'success', iconName: 'no-logout', headingLevel: 2, title: t('auth.signOut.text'), actions: [{ label: t('auth.signOut.again'), href: route('account/sign-in/'), variant: 'c-btn--primary' }, { label: t('auth.signOut.home'), href: route('') }] })]), root);
  return { signedOut: true };
}
