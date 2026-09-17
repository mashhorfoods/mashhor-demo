/* OPS / UI / SETTINGS — a staff member's own password change. Role and permissions are provisioned by the
   business, never self-editable here. Stage 15 */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { icon, toast, setButtonState } from '../../components/ui.js';
import { changeOpsPassword } from '../auth.js';
import { mountOpsPortal, pageTitle, block, errorText, rows } from './shell.js';

export function mountOpsSettings({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'settings', head: 'page.ops.settings', paint: async ({ staff, main }) => {
    const current = el('input', { id: 'ops-pw-current', class: 'c-field__control', type: 'password', autocomplete: 'current-password', required: true });
    const next = el('input', { id: 'ops-pw-next', class: 'c-field__control', type: 'password', autocomplete: 'new-password', required: true });
    const btn = el('button', { type: 'submit', class: 'c-btn c-btn--primary' }, [el('span', { class: 'c-btn__label' }, t('acct.set.changePassword')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
    const err = el('p', { class: 'c-field__error', role: 'alert', hidden: true });
    const form = el('form', { class: 'l-stack l-stack--16', onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true; setButtonState(btn, 'loading');
      try { await changeOpsPassword({ current: current.value, next: next.value }); current.value = ''; next.value = ''; toast({ title: t('acct.set.passwordChanged'), variant: 'success', duration: 3000 }); setButtonState(btn, 'success'); }
      catch (error) { err.hidden = false; err.replaceChildren(icon('no-alert', { size: 'sm' }), el('span', {}, errorText(error?.code))); setButtonState(btn, 'error'); }
      setTimeout(() => setButtonState(btn, 'idle'), 1500);
    } }, [
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: 'ops-pw-current' }, t('auth.field.passwordCurrent')), current]),
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: 'ops-pw-next' }, t('auth.field.passwordNew')), next]),
      err, btn,
    ]);
    main.replaceChildren(
      pageTitle('ops.settings.title', 'ops.settings.text'),
      block(t('ops.settings.profile'), rows([[t('acct.field.email'), staff.email], [t('ops.settings.role'), t(`ops.role.${staff.role}`) || staff.role]]), { id: 'ops-settings-profile' }),
      block(t('acct.set.password'), form, { id: 'ops-settings-password' }),
    );
    return { staff };
  } });
}
