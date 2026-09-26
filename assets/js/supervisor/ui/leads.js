/* SUPERVISOR / UI / LEADS — prospects the supervisor is working, and the status they can set. Stage 13
   The status vocabulary (new/contacted/in_progress/converted/closed) is fixed by the backend; the screen offers only
   these five, never invents one. */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { icon } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { statusSelect } from '../../core/portal-ui.js';
import { supervisorData, LEAD_STATUSES } from '../data.js';
import { mountSupervisorPortal, loadRegion, pagedRegion, pageTitle, leadStatusBadge, dateTime } from './shell.js';

export function mountSupervisorLeads({ root = document } = {}) {
  return mountSupervisorPortal({ root, id: 'leads', head: 'page.supervisor.leads', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'leads' } });
    main.replaceChildren(pageTitle('svp.leads.title', 'svp.leads.text'), host);
    const row = (lead) => {
      const select = statusSelect({ statuses: LEAD_STATUSES, current: lead.status, optionKey: (s) => `svp.leads.status.${s}`, labelKey: 'svp.leads.statusLabel', dataset: { leadStatusSelect: lead.id },
        save: (next) => supervisorData.updateLeadStatus(lead.id, next), doneKey: 'svp.leads.updated', failKey: 'svp.leads.updateFailed' });
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
    const region = pagedRegion(host, (q) => supervisorData.leads(q), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-lead', headingLevel: 2, title: t('svp.leads.empty.title'), text: t('svp.leads.empty.text') }),
      paint: (items) => el('div', { class: 'c-acct-list' }, items.map(row)),
    });
    await region.run();
    return { refresh: region.run };
  } });
}
