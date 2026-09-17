/* SUPERVISOR / UI / LEADS — prospects the supervisor is working, and the status they can set. Stage 13
   The status vocabulary (new/contacted/in_progress/converted/closed) is fixed by the backend; the screen offers only
   these five, never invents one. */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { icon, toast } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { supervisorData, LEAD_STATUSES } from '../data.js';
import { mountSupervisorPortal, loadRegion, pageTitle, leadStatusBadge, dateTime } from './shell.js';

export function mountSupervisorLeads({ root = document } = {}) {
  return mountSupervisorPortal({ root, id: 'leads', head: 'page.supervisor.leads', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'leads' } });
    main.replaceChildren(pageTitle('svp.leads.title', 'svp.leads.text'), host);
    const row = (lead) => {
      const select = el('select', { class: 'c-field__control c-field__control--sm', 'aria-label': t('svp.leads.statusLabel'), dataset: { leadStatusSelect: lead.id } },
        LEAD_STATUSES.map((s) => el('option', { value: s, ...(s === lead.status ? { selected: true } : {}) }, t(`svp.leads.status.${s}`))));
      select.addEventListener('change', async () => {
        const next = select.value; select.disabled = true;
        try { await supervisorData.updateLeadStatus(lead.id, next); toast({ title: t('svp.leads.updated'), variant: 'success', duration: 3000 }); }
        catch { toast({ title: t('svp.leads.updateFailed'), variant: 'warning', duration: 5000 }); select.value = lead.status; }
        select.disabled = false;
      });
      return el('article', { class: 'c-card c-svp-lead', dataset: { lead: lead.id, leadStatus: lead.status } }, [
        el('div', { class: 'c-svp-lead__icon' }, icon('no-lead', { size: 'lg' })),
        el('div', { class: 'c-svp-lead__body' }, [
          el('h3', { class: 'c-acct-booking__title' }, lead.name || lead.contact),
          el('p', { class: 't-body-sm t-muted' }, [el('bdi', { dir: 'ltr' }, lead.contact), ' · ', dateTime(lead.createdAt)]),
          leadStatusBadge(lead.status),
        ]),
        select,
      ]);
    };
    const region = loadRegion(host, async () => (await supervisorData.leads({ page: 1, pageSize: 50 })).items, {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-lead', headingLevel: 2, title: t('svp.leads.empty.title'), text: t('svp.leads.empty.text') }),
      paint: (items) => el('div', { class: 'c-acct-list' }, items.map(row)),
    });
    await region.run();
    return { refresh: region.run };
  } });
}
