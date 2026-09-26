/* OPS / UI / STAFF — Stage 14. Staff & Permissions: view every staff account, provision a new one, activate or
   deactivate, and grant Operations Staff an explicit subset of permissions. A new hire never receives a password
   here — the backend relies on the existing password-reset flow, exactly as a forgotten password would (§20). Only
   staff.manage holders (admin, implicitly) can reach this screen at all; the backend enforces the same boundary. */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { icon, toast } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, actionForm, block, errorText, busyButton } from './shell.js';

// Must match backend/staff.mjs PERMISSIONS exactly (tests/ops-portal.mjs asserts it): a permission missing here has
// no checkbox, and saving would silently revoke it.
export const OPS_PERMISSIONS = ['booking.view', 'booking.manage', 'booking.status.change', 'booking.assign', 'task.view', 'task.manage', 'document.review', 'supplier.view', 'supplier.manage', 'notification.send', 'notification.manage', 'service.manage', 'workflow.manage', 'report.view', 'audit.view', 'customer.view', 'supervisor.view', 'supervisor.manage', 'payment.view', 'document.view', 'attribution.view', 'staff.manage', 'rules.view', 'rules.manage', 'content.manage'];

export function mountOpsStaff({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'staff', head: 'page.ops.staff', paint: async ({ main, can }) => {
    const host = el('div', { dataset: { region: 'staff' } });

    const createForm = can('staff.manage') ? (() => {
      const email = el('input', { name: 'email', class: 'c-field__control', type: 'email', dir: 'ltr', required: true, 'aria-label': t('ops.staff.create.email'), placeholder: t('ops.staff.create.email') });
      const name = el('input', { name: 'name', class: 'c-field__control', type: 'text', required: true, 'aria-label': t('ops.staff.create.name'), placeholder: t('ops.staff.create.name') });
      const role = el('select', { name: 'role', class: 'c-field__control', 'aria-label': t('ops.staff.create.role') }, [el('option', { value: 'ops' }, t('ops.role.ops')), el('option', { value: 'admin' }, t('ops.role.admin'))]);
      const form = actionForm({
        submitLabel: t('ops.staff.create.action'),
        onSubmit: async (fd, formEl) => {
          await opsData.createStaff({ email: fd.get('email')?.trim(), name: fd.get('name')?.trim(), role: fd.get('role') });
          formEl.reset(); toast({ title: t('ops.staff.created'), variant: 'success', duration: 4000 }); await region.run();
        },
        children: [email, name, role, el('p', { class: 't-body-sm t-muted' }, t('ops.staff.create.note'))],
      });
      return block(t('ops.staff.create.title'), form, { id: 'ops-staff-create' });
    })() : null;

    const row = (staff) => {
      // A failed save says why (toast) and throws on, so the button re-enables for a retry.
      const failed = (error) => { toast({ title: errorText(error?.code), variant: 'error' }); throw error; };
      const activeBtn = busyButton(t(staff.active ? 'ops.staff.deactivate' : 'ops.staff.activate'), staff.active ? 'tertiary' : 'primary', async () => {
        await opsData.setStaffActive(staff.id, !staff.active).catch(failed); toast({ title: t('ops.staff.updated'), variant: 'success', duration: 3000 }); await region.run();
      });

      let permsControl = null;
      if (staff.role === 'ops' && can('staff.manage')) {
        const list = el('ul', { class: 'c-svp-mini-list', role: 'list' }, OPS_PERMISSIONS.map((p) => {
          const checkbox = el('input', { type: 'checkbox', value: p, ...(staff.permissions.includes(p) ? { checked: true } : {}) });
          return el('li', {}, el('label', { class: 'l-cluster l-cluster--8' }, [checkbox, el('span', {}, p)]));
        }));
        const saveBtn = busyButton(t('ops.staff.savePermissions'), 'tertiary', async () => {
          // A permission this screen doesn't offer (a newer backend) is carried over untouched, never revoked by a save.
          const kept = staff.permissions.filter((p) => !OPS_PERMISSIONS.includes(p));
          const chosen = [...kept, ...[...list.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value)];
          // On failure the checkboxes keep what was chosen, so a retry is one click.
          await opsData.setStaffPermissions(staff.id, chosen).catch(failed); staff.permissions = chosen; toast({ title: t('ops.staff.updated'), variant: 'success', duration: 3000 });
        }, { reusable: true });
        permsControl = el('div', { class: 'l-stack l-stack--8' }, [list, saveBtn]);
      }

      return el('article', { class: 'c-card c-svp-lead', dataset: { staff: staff.id } }, [
        el('div', { class: 'c-svp-lead__icon' }, icon('no-shield', { size: 'lg' })),
        el('div', { class: 'c-svp-lead__body' }, [
          el('h3', { class: 'c-acct-booking__title' }, staff.name),
          el('p', { class: 't-body-sm t-muted' }, [el('bdi', { dir: 'ltr' }, staff.email), ' · ', t(`ops.role.${staff.role}`), ' · ', t(staff.active ? 'ops.staff.statusActive' : 'ops.staff.statusInactive')]),
          permsControl,
        ]),
        activeBtn,
      ]);
    };

    main.replaceChildren(pageTitle('ops.staff.title', 'ops.staff.text'), createForm, host);
    const region = loadRegion(host, () => opsData.staffList(), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-shield', headingLevel: 2, title: t('ops.staff.empty.title') }),
      paint: (items) => el('div', { class: 'c-acct-list' }, items.map(row)),
    });
    await region.run();
    return { refresh: region.run };
  } });
}
