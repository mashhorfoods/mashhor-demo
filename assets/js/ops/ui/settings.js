/* OPS / UI / SETTINGS — a staff member's own password change. Role and permissions are provisioned by the
   business, never self-editable here. Stage 15 */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { toast } from '../../components/ui.js';
import { changeOpsPassword } from '../auth.js';
import { mountOpsPortal, pageTitle, block, actionForm, rows } from './shell.js';

export function mountOpsSettings({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'settings', head: 'page.ops.settings', paint: async ({ staff, main }) => {
    const current = el('input', { id: 'ops-pw-current', name: 'current', class: 'c-field__control', type: 'password', autocomplete: 'current-password', required: true });
    const next = el('input', { id: 'ops-pw-next', name: 'next', class: 'c-field__control', type: 'password', autocomplete: 'new-password', required: true });
    const form = actionForm({
      submitLabel: t('acct.set.changePassword'), size: '', stackGap: 16,
      onSubmit: async (fd) => { await changeOpsPassword({ current: fd.get('current'), next: fd.get('next') }); current.value = ''; next.value = ''; toast({ title: t('acct.set.passwordChanged'), variant: 'success', duration: 3000 }); },
      children: [
        el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: 'ops-pw-current' }, t('auth.field.passwordCurrent')), current]),
        el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label', for: 'ops-pw-next' }, t('auth.field.passwordNew')), next]),
      ],
    });
    main.replaceChildren(
      pageTitle('ops.settings.title', 'ops.settings.text'),
      block(t('ops.settings.profile'), rows([[t('acct.field.email'), staff.email], [t('ops.settings.role'), t(`ops.role.${staff.role}`) || staff.role]]), { id: 'ops-settings-profile' }),
      block(t('acct.set.password'), form, { id: 'ops-settings-password' }),
    );
    return { staff };
  } });
}
