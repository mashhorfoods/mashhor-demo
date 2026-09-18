/* OPS / UI / STAFF — Stage 14. Staff & Permissions: view every staff account, provision a new one, activate or
   deactivate, and grant Operations Staff an explicit subset of permissions. A new hire never receives a password
   here — the backend relies on the existing password-reset flow, exactly as a forgotten password would (§20). Only
   staff.manage holders (admin, implicitly) can reach this screen at all; the backend enforces the same boundary. */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { icon, toast, setButtonState } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, block } from './shell.js';

const OPS_PERMISSIONS = ['booking.view', 'booking.manage', 'booking.status.change', 'booking.assign', 'task.view', 'task.manage', 'document.review', 'supplier.view', 'supplier.manage', 'notification.send', 'notification.manage', 'service.manage', 'workflow.manage', 'report.view', 'audit.view', 'customer.view', 'supervisor.view', 'supervisor.manage', 'payment.view', 'document.view', 'attribution.view', 'staff.manage'];

export function mountOpsStaff({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'staff', head: 'page.ops.staff', paint: async ({ main, can }) => {
    const host = el('div', { dataset: { region: 'staff' } });

    const createForm = can('staff.manage') ? (() => {
      const email = el('input', { name: 'email', class: 'c-field__control', type: 'email', dir: 'ltr', required: true, 'aria-label': t('ops.staff.create.email'), placeholder: t('ops.staff.create.email') });
      const name = el('input', { name: 'name', class: 'c-field__control', type: 'text', required: true, 'aria-label': t('ops.staff.create.name'), placeholder: t('ops.staff.create.name') });
      const role = el('select', { name: 'role', class: 'c-field__control', 'aria-label': t('ops.staff.create.role') }, [el('option', { value: 'ops' }, t('ops.role.ops')), el('option', { value: 'admin' }, t('ops.role.admin'))]);
      const btn = el('button', { type: 'submit', class: 'c-btn c-btn--primary c-btn--sm' }, [el('span', { class: 'c-btn__label' }, t('ops.staff.create.action')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
      const form = el('form', { class: 'l-stack l-stack--8', onsubmit: async (e) => {
        e.preventDefault(); setButtonState(btn, 'loading');
        try { await opsData.createStaff({ email: email.value.trim(), name: name.value.trim(), role: role.value }); form.reset(); setButtonState(btn, 'success'); toast({ title: t('ops.staff.created'), variant: 'success', duration: 4000 }); await region.run(); }
        catch { setButtonState(btn, 'error'); }
        setTimeout(() => setButtonState(btn, 'idle'), 1200);
      } }, [email, name, role, btn, el('p', { class: 't-body-sm t-muted' }, t('ops.staff.create.note'))]);
      return block(t('ops.staff.create.title'), form, { id: 'ops-staff-create' });
    })() : null;

    const row = (staff) => {
      const activeBtn = el('button', { type: 'button', class: `c-btn c-btn--sm ${staff.active ? 'c-btn--tertiary' : 'c-btn--primary'}` }, t(staff.active ? 'ops.staff.deactivate' : 'ops.staff.activate'));
      activeBtn.addEventListener('click', async () => { activeBtn.disabled = true; try { await opsData.setStaffActive(staff.id, !staff.active); toast({ title: t('ops.staff.updated'), variant: 'success', duration: 3000 }); await region.run(); } catch { activeBtn.disabled = false; } });

      let permsControl = null;
      if (staff.role === 'ops' && can('staff.manage')) {
        const list = el('ul', { class: 'c-svp-mini-list', role: 'list' }, OPS_PERMISSIONS.map((p) => {
          const checkbox = el('input', { type: 'checkbox', value: p, ...(staff.permissions.includes(p) ? { checked: true } : {}) });
          return el('li', {}, el('label', { class: 'l-cluster l-cluster--8' }, [checkbox, el('span', {}, p)]));
        }));
        const saveBtn = el('button', { type: 'button', class: 'c-btn c-btn--tertiary c-btn--sm' }, t('ops.staff.savePermissions'));
        saveBtn.addEventListener('click', async () => {
          const chosen = [...list.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value);
          saveBtn.disabled = true; try { await opsData.setStaffPermissions(staff.id, chosen); toast({ title: t('ops.staff.updated'), variant: 'success', duration: 3000 }); } catch { /* keep the checkboxes as chosen; the backend is authoritative on retry */ } saveBtn.disabled = false;
        });
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
